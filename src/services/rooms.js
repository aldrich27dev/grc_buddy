import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { MAX_MESSAGE_LENGTH } from '../constants/catalog';

export const WAITING_TTL_MS = 5 * 60 * 1000;
export const ACTIVE_TTL_MS = 10 * 60 * 1000;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_WAITING_ROOMS_TO_SCAN = 25;
const MAX_SEEN_BATCH = 400;

function cleanString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function toRoomProfile(profile, uid) {
  return {
    uid,
    name: cleanString(profile.name, 24),
    course: cleanString(profile.course, 40),
    year: cleanString(profile.year, 20),
    gender: cleanString(profile.gender, 20),
    location: cleanString(profile.location, 40),
  };
}

export function getRole(room, uid) {
  if (!room || !uid) return null;
  if (room.user1?.uid === uid) return 'user1';
  if (room.user2?.uid === uid) return 'user2';
  return null;
}

export function isRoomExpired(room) {
  const expiresAt = room?.expiresAt;
  return !!expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= Date.now();
}

export function getSharedInterests(room) {
  const first = Array.isArray(room?.interests) ? room.interests : [];
  const second = Array.isArray(room?.user2Interests) ? room.user2Interests : [];
  return first.filter((interest) => second.includes(interest));
}

export async function getRoom(roomId) {
  const snapshot = await getDoc(doc(db, 'rooms', roomId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function findWaitingCandidates(interests) {
  // The range filter keeps expired and legacy rooms out of the result set, so
  // stale documents cannot crowd out real candidates on the free plan. It uses
  // the (status, expiresAt) composite index in firestore.indexes.json.
  const snapshot = await getDocs(
    query(
      collection(db, 'rooms'),
      where('status', '==', 'waiting'),
      where('expiresAt', '>', Timestamp.now()),
      orderBy('expiresAt', 'asc'),
      limit(MAX_WAITING_ROOMS_TO_SCAN)
    )
  );
  const now = Date.now();

  return snapshot.docs
    .map((roomDoc) => {
      const data = roomDoc.data();
      const shared = Array.isArray(data.interests)
        ? data.interests.filter((interest) => interests.includes(interest))
        : [];
      return { roomDoc, data, shared };
    })
    .filter(({ data, shared }) => (
      data.status === 'waiting'
      && !data.user2
      && (data.expiresAt?.toMillis?.() ?? 0) > now
      && shared.length > 0
    ))
    .sort((a, b) => b.shared.length - a.shared.length);
}

export async function findOrCreateMatch(profile, uid) {
  const interests = (Array.isArray(profile.interests) ? profile.interests : []).slice(0, 5);
  const candidates = await findWaitingCandidates(interests);

  for (const { roomDoc } of candidates) {
    try {
      const roomId = roomDoc.id;
      // Claim atomically so two users can never join the same waiting room.
      return await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, 'rooms', roomId);
        const snapshot = await transaction.get(roomRef);

        if (!snapshot.exists()) throw new Error('ROOM_GONE');

        const data = snapshot.data();
        if (data.status !== 'waiting' || data.user2) throw new Error('ROOM_TAKEN');
        if (data.user1?.uid === uid) throw new Error('ROOM_SELF');
        if (!data.expiresAt || data.expiresAt.toMillis() <= Date.now()) throw new Error('ROOM_EXPIRED');

        transaction.update(roomRef, {
          user2: toRoomProfile(profile, uid),
          user2Interests: interests,
          status: 'full',
          matchedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
          typing1: false,
          typing2: false,
          lastSeen1: Timestamp.now(),
          lastSeen2: Timestamp.now(),
        });

        return { roomId, role: 'user2' };
      });
    } catch (error) {
      // The room was claimed by someone else, expired, or vanished. Move on to
      // the next candidate, but stop immediately on a real connection or
      // permission problem instead of firing 25 doomed transactions.
      console.warn('Could not claim waiting room, trying the next one.', error);
      if (
        error?.code === 'permission-denied'
        || error?.code === 'unauthenticated'
        || error?.code === 'unavailable'
        || error?.code === 'resource-exhausted'
      ) {
        throw error;
      }
    }
  }

  const roomRef = doc(collection(db, 'rooms'));
  await setDoc(roomRef, {
    user1: toRoomProfile(profile, uid),
    interests,
    user2Interests: [],
    user2: null,
    status: 'waiting',
    typing1: false,
    typing2: false,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + WAITING_TTL_MS),
    lastSeen1: Timestamp.now(),
    endedBy: null,
  });

  return { roomId: roomRef.id, role: 'user1' };
}

export async function extendWaitingRoom(roomId) {
  await runTransaction(db, async (transaction) => {
    const roomRef = doc(db, 'rooms', roomId);
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    // Never shorten the lifetime of a room that was just claimed.
    if (data.status !== 'waiting' || data.user2) return;

    transaction.update(roomRef, {
      expiresAt: Timestamp.fromMillis(Date.now() + WAITING_TTL_MS),
      lastSeen1: Timestamp.now(),
    });
  });
}

export async function heartbeatRoom(roomId, role) {
  const field = role === 'user1' ? 'lastSeen1' : 'lastSeen2';
  await updateDoc(doc(db, 'rooms', roomId), {
    [field]: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + ACTIVE_TTL_MS),
  });
}

export async function leaveRoom(roomId, uid) {
  await runTransaction(db, async (transaction) => {
    const roomRef = doc(db, 'rooms', roomId);
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    const role = getRole(data, uid);
    if (!role) return;

    if (data.status === 'waiting' && role === 'user1') {
      transaction.delete(roomRef);
      return;
    }

    if (data.status !== 'ended') {
      transaction.update(roomRef, {
        status: 'ended',
        endedBy: uid,
        endedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
        typing1: false,
        typing2: false,
      });
    }
  });
}

export async function sendChatMessage({ roomId, uid, profile, text, replyTo }) {
  const cleaned = cleanString(text, MAX_MESSAGE_LENGTH);
  if (!cleaned) throw new Error('EMPTY_MESSAGE');

  await addDoc(collection(db, 'rooms', roomId, 'messages'), {
    text: cleaned,
    senderId: uid,
    senderName: cleanString(profile.name, 24),
    course: cleanString(profile.course, 40),
    createdAt: serverTimestamp(),
    reaction: null,
    seen: false,
    replyTo: replyTo
      ? {
        text: cleanString(replyTo.text, 200),
        senderId: replyTo.senderId || null,
        senderName: cleanString(replyTo.senderName || replyTo.user || 'Buddy', 24),
      }
      : null,
    expiresAt: Timestamp.fromMillis(Date.now() + MESSAGE_TTL_MS),
  });
}

export async function markMessagesSeen(roomId, messageIds) {
  if (!messageIds.length) return;

  for (let start = 0; start < messageIds.length; start += MAX_SEEN_BATCH) {
    const batch = writeBatch(db);
    messageIds.slice(start, start + MAX_SEEN_BATCH).forEach((messageId) => {
      batch.update(doc(db, 'rooms', roomId, 'messages', messageId), { seen: true });
    });
    await batch.commit();
  }
}

export async function setMessageReaction(roomId, messageId, reaction) {
  await updateDoc(doc(db, 'rooms', roomId, 'messages', messageId), {
    reaction: cleanString(reaction, 8),
  });
}
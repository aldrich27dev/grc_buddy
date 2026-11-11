import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  SHOUTOUT_TEXT_MAX,
  SHOUTOUT_TEXT_MIN,
  getShoutoutDuration,
} from '../constants/shoutouts';

const ACTIVE_LIMIT = 10;
const ACTIVE_POLL_MS = 15000;

export function cleanShoutoutText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, SHOUTOUT_TEXT_MAX);
}

export function isActiveShoutout(shoutout, now = Date.now()) {
  const endsAt = shoutout?.endsAt?.toMillis?.();
  return shoutout?.status === 'active' && typeof endsAt === 'number' && endsAt > now;
}

export function getQueueEndsAt(shoutouts, now = Date.now()) {
  return shoutouts.reduce((latestEnd, shoutout) => {
    const endsAt = shoutout?.endsAt?.toMillis?.() ?? 0;
    return endsAt > latestEnd ? endsAt : latestEnd;
  }, now);
}

function toShoutout(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function buildActiveQuery() {
  // Only active, not-yet-expired banners are read. Keeping the list short
  // protects the free Spark read quota.
  return query(
    collection(db, 'shoutouts'),
    where('status', '==', 'active'),
    where('endsAt', '>', Timestamp.now()),
    orderBy('endsAt', 'asc'),
    limit(ACTIVE_LIMIT)
  );
}

function emitShoutouts(snapshot, onChange) {
  onChange(
    snapshot.docs
      .map(toShoutout)
      .filter((shoutout) => isActiveShoutout(shoutout))
  );
}

export function listenActiveShoutouts(onChange, onError) {
  let stopped = false;
  let pollTimer = null;
  const shoutoutsQuery = buildActiveQuery();

  const poll = async () => {
    try {
      const snapshot = await getDocs(buildActiveQuery());
      if (!stopped) emitShoutouts(snapshot, onChange);
    } catch (error) {
      if (!stopped) onError(error);
    }
  };

  const unsubscribe = onSnapshot(
    shoutoutsQuery,
    (snapshot) => {
      if (!stopped) emitShoutouts(snapshot, onChange);
    },
    (error) => {
      // Some emulator versions reject realtime list queries that one-time
      // reads allow. Fall back to a light poll so the banner keeps working.
      console.warn('Shoutout realtime listener unavailable; polling instead:', error?.code || 'unknown');
      if (stopped || pollTimer) return;
      poll();
      pollTimer = setInterval(poll, ACTIVE_POLL_MS);
    }
  );

  return () => {
    stopped = true;
    unsubscribe();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export async function createShoutoutRequest({
  uid,
  profile,
  text,
  durationId,
  requestedStartAt,
}) {
  if (!uid) throw new Error('NOT_SIGNED_IN');

  const cleaned = cleanShoutoutText(text);
  if (cleaned.length < SHOUTOUT_TEXT_MIN) throw new Error('TEXT_TOO_SHORT');

  const duration = getShoutoutDuration(durationId);
  if (!duration) throw new Error('INVALID_DURATION');

  const senderName = String(profile?.name ?? '').trim().slice(0, 24) || 'GRC Student';
  const startMs = Math.max(Date.now(), Number(requestedStartAt) || 0);
  const requestedStart = Timestamp.fromMillis(startMs);
  const requestedEnd = Timestamp.fromMillis(startMs + duration.durationMs);

  const requestRef = await addDoc(collection(db, 'shoutouts'), {
    senderId: uid,
    senderName,
    text: cleaned,
    durationId: duration.id,
    durationLabel: duration.label,
    durationMs: duration.durationMs,
    price: duration.price,
    status: 'pending',
    createdAt: serverTimestamp(),
    requestedStartAt: requestedStart,
    requestedEndAt: requestedEnd,
    startsAt: null,
    endsAt: null,
    approvedAt: null,
  });

  return {
    id: requestRef.id,
    text: cleaned,
    duration,
    price: duration.price,
    requestedStartAt: requestedStart,
    requestedEndAt: requestedEnd,
  };
}

export async function getShoutout(shoutoutId) {
  if (!shoutoutId) return null;
  const snapshot = await getDoc(doc(db, 'shoutouts', shoutoutId));
  return snapshot.exists() ? toShoutout(snapshot) : null;
}

export function getLatestOpenShoutout(shoutouts, now = Date.now()) {
  return shoutouts.find(
    (shoutout) => shoutout.status === 'pending' || isActiveShoutout(shoutout, now)
  ) || null;
}

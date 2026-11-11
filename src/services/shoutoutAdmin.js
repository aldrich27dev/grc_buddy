import {
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
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getQueueEndsAt, isActiveShoutout } from './shoutouts';

const PENDING_LIMIT = 50;
const ACTIVE_LIMIT = 10;

function toShoutout(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function buildActiveQuery() {
  return query(
    collection(db, 'shoutouts'),
    where('status', '==', 'active'),
    where('endsAt', '>', Timestamp.now()),
    orderBy('endsAt', 'asc'),
    limit(ACTIVE_LIMIT)
  );
}

export async function isShoutoutAdmin(uid) {
  if (!uid) return false;
  const snapshot = await getDoc(doc(db, 'admins', uid));
  return snapshot.exists();
}

export function listenPendingShoutouts(onChange, onError) {
  const pendingQuery = query(
    collection(db, 'shoutouts'),
    where('status', '==', 'pending'),
    limit(PENDING_LIMIT)
  );

  return onSnapshot(
    pendingQuery,
    (snapshot) => onChange(snapshot.docs.map(toShoutout)),
    onError
  );
}

export async function fetchActiveShoutouts() {
  const snapshot = await getDocs(buildActiveQuery());
  return snapshot.docs
    .map(toShoutout)
    .filter((shoutout) => isActiveShoutout(shoutout));
}

export async function approveShoutoutRequest(shoutout) {
  const now = Date.now();
  const activeShoutouts = await fetchActiveShoutouts();
  const queueEnd = getQueueEndsAt(activeShoutouts, now);
  const requestedStart = shoutout?.requestedStartAt?.toMillis?.() ?? 0;
  const durationMs = Number(shoutout?.durationMs);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('INVALID_DURATION');
  }

  // Start now, at the requested slot, or after the last active banner —
  // whichever is latest. This keeps one banner visible at a time.
  const startsAtMs = Math.max(now, requestedStart, queueEnd);
  const endsAtMs = startsAtMs + durationMs;

  await updateDoc(doc(db, 'shoutouts', shoutout.id), {
    status: 'active',
    startsAt: Timestamp.fromMillis(startsAtMs),
    endsAt: Timestamp.fromMillis(endsAtMs),
    approvedAt: serverTimestamp(),
  });

  return { startsAt: startsAtMs, endsAt: endsAtMs };
}

export async function rejectShoutoutRequest(shoutoutId) {
  await updateDoc(doc(db, 'shoutouts', shoutoutId), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  });
}

export async function stopShoutout(shoutoutId) {
  await updateDoc(doc(db, 'shoutouts', shoutoutId), {
    status: 'ended',
    endsAt: Timestamp.now(),
    endedAt: serverTimestamp(),
  });
}

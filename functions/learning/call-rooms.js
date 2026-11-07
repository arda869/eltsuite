import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const limited = (value, max = 150) => typeof value === 'string' && value.length > 0 && value.length < max && !value.includes('/');

export async function reserveCallRoom(db, uid, forWhat) {
  if (!uid || !limited(forWhat)) throw new HttpsError('invalid-argument', 'Choose a call to start.');
  const user = (await db.doc(`users/${uid}`).get()).data();
  const teacher = user?.role === 'teacher';
  const learner = user?.role === 'learner';
  if (!teacher && !learner) throw new HttpsError('permission-denied', 'This account cannot start a call.');
  const [kind, id, extra] = forWhat.split(':');
  if (!limited(id) || (extra && !limited(extra))) throw new HttpsError('invalid-argument', 'Choose a call to start.');
  if (kind === 'chat' && !extra) {
    const chat = (await db.doc(`chats/${id}`).get()).data();
    const key = learner ? user.learnerId : uid;
    if (!chat?.members?.includes(key)) throw new HttpsError('permission-denied', 'This conversation is unavailable.');
  } else if (teacher && kind === 'instant' && id === uid && !extra) {
    // The teacher's own instant room.
  } else if (teacher && kind === 'session' && !extra) {
    const session = (await db.doc(`sessions/${id}`).get()).data();
    if (session?.kind !== 'meeting' || (session.owner !== uid && !session.attendees?.includes(uid)))
      throw new HttpsError('permission-denied', 'This meeting is unavailable.');
  } else if (teacher && kind === 'breakout' && extra) {
    const cls = (await db.doc(`classes/${id}`).get()).data();
    if (cls?.teacherId !== uid && cls?.coTeachers?.[uid]?.role !== 'co')
      throw new HttpsError('permission-denied', 'This classroom is unavailable.');
  } else throw new HttpsError('permission-denied', 'This call cannot be started from this account.');

  const account = (await db.doc(`accounts/${uid}`).get()).data();
  if (typeof account?.org === 'string') {
    const org = (await db.doc(`orgs/${account.org}`).get()).data();
    const cap = org?.limits?.callMinutes;
    if (typeof cap === 'number' && cap >= 0 && (org?.usage?.callMinutes ?? 0) >= cap)
      throw new HttpsError('resource-exhausted', 'The organisation has used its call minutes for this month.');
  }

  const hour = Math.floor(Date.now() / 3600000);
  const allowance = db.doc(`callReservationLimits/${uid}_${hour}`);
  const activeRef = db.doc(`callActiveReservations/${uid}`);
  for (let tries = 0; tries < 5; tries++) {
    const free = await db.collection('callRooms').where('state', '==', 'free').limit(10).get();
    if (free.empty) throw new HttpsError('resource-exhausted', 'No call room is free right now. Try again in a few minutes.');
    const pick = free.docs[Math.floor(Math.random() * free.size)];
    const result = await db.runTransaction(async tx => {
      const [room, rate, active] = await Promise.all([tx.get(pick.ref), tx.get(allowance), tx.get(activeRef)]);
      if (room.get('state') !== 'free') return null;
      if ((rate.get('count') ?? 0) >= 30) throw new HttpsError('resource-exhausted', 'Too many calls have been started from this account. Try again later.');
      const rooms = Object.fromEntries(Object.entries(active.get('rooms') ?? {}).filter(([, entry]) => Date.now() - (entry?.at ?? 0) < 8 * 3600000));
      if (Object.keys(rooms).length >= (learner ? 2 : 12))
        throw new HttpsError('resource-exhausted', 'Finish an existing call before starting another.');
      tx.update(pick.ref, { state: 'used', by: uid, usedAt: Date.now(), for: forWhat });
      tx.set(allowance, { count: FieldValue.increment(1), expiresAt: new Date((hour + 2) * 3600000) }, { merge: true });
      tx.set(activeRef, { rooms: { ...rooms, [pick.id]: { at: Date.now(), for: forWhat } } });
      return { url: room.get('url'), name: pick.id };
    });
    if (result) return result;
  }
  throw new HttpsError('resource-exhausted', 'No call room is free right now. Try again in a few minutes.');
}

export async function finishCallRoom(db, uid, roomId) {
  if (!uid || !limited(roomId) || !roomId.startsWith('r-')) throw new HttpsError('invalid-argument', 'Choose a call room.');
  const ref = db.doc(`callRooms/${roomId}`);
  return db.runTransaction(async tx => {
    const room = await tx.get(ref);
    if (!room.exists || room.get('by') !== uid) throw new HttpsError('permission-denied', 'Only the caller who started this room can close it.');
    if (room.get('state') !== 'used') return { finished: true };
    const activeRef = db.doc(`callActiveReservations/${uid}`);
    const active = await tx.get(activeRef);
    const rooms = { ...(active.get('rooms') ?? {}) };
    delete rooms[roomId];
    tx.update(ref, { state: 'finished', finishedAt: Date.now() });
    tx.set(activeRef, { rooms });
    return { finished: true };
  });
}

export const startCallRoom = onCall({ region: 'us-central1', maxInstances: 10 }, req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (req.auth.token?.proxyBy) throw new HttpsError('permission-denied', 'Calls are unavailable in this view.');
  return reserveCallRoom(getFirestore(), req.auth.uid, req.data?.forWhat);
});
export const endCallRoom = onCall({ region: 'us-central1', maxInstances: 10 }, req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return finishCallRoom(getFirestore(), req.auth.uid, req.data?.room);
});

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const KINDS = { view: 'views', download: 'downloads', copy: 'copies' };
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{16,100}$/;

export function validateResourceMetric(data) {
  const activityId = data?.activityId;
  const kind = data?.kind;
  const requestId = data?.requestId;
  if (typeof activityId !== 'string' || !ID.test(activityId) || !Object.hasOwn(KINDS, kind) || typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) {
    throw new HttpsError('invalid-argument', 'Choose a valid activity and usage action.');
  }
  return { activityId, kind, requestId, field: KINDS[kind] };
}

// The client reports only completed actions. No email, name, class name, PDF name or
// lesson content is saved. Individual actor records are private server-only data.
export const recordResourceHubMetric = onCall({ region: 'us-central1', maxInstances: 5 }, async request => {
  if (!request.auth || request.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in as a teacher.');
  const { activityId, kind, requestId, field } = validateResourceMetric(request.data);
  const db = getFirestore();
  const [profile, account] = await Promise.all([db.doc(`users/${request.auth.uid}`).get(), db.doc(`accounts/${request.auth.uid}`).get()]);
  if (!profile.exists || profile.get('role') !== 'teacher' || account.get('suspended') === true) throw new HttpsError('permission-denied', 'Teachers only.');
  if (activityId !== 'otp-002' && !(await db.doc(`resourceHubPublished/${activityId}`).get()).exists) {
    throw new HttpsError('failed-precondition', 'This activity is not published.');
  }
  const summaryRef = db.doc(`resourceHubMetrics/${activityId}`);
  const actorRef = summaryRef.collection('actors').doc(request.auth.uid);
  const eventRef = actorRef.collection('events').doc(requestId);
  const day = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async transaction => {
    const [event, actor] = await Promise.all([transaction.get(eventRef), transaction.get(actorRef)]);
    if (event.exists) return;
    const actorData = actor.data() ?? {};
    const daily = actorData.day === day ? actorData.daily ?? {} : {};
    if ((daily[field] ?? 0) >= 200) throw new HttpsError('resource-exhausted', 'Too many activity actions today.');
    const first = !actorData[field];
    transaction.set(eventRef, { kind, at: FieldValue.serverTimestamp() });
    transaction.set(actorRef, {
      [field]: FieldValue.increment(1),
      day,
      daily: { ...daily, [field]: (daily[field] ?? 0) + 1 },
    }, { mergeFields: [field, 'day', 'daily'] });
    transaction.set(summaryRef, {
      [field]: FieldValue.increment(1),
      ...(first ? { [`unique${field[0].toUpperCase()}${field.slice(1)}`]: FieldValue.increment(1) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { recorded: true };
});

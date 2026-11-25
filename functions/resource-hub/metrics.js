import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// What teachers did with a published resource. Each is counted in total, by day, by organisation
// and once per teacher (unique…).
const KINDS = { view: 'views', download: 'downloads', copy: 'copies', save: 'saves', live: 'lives', adapt: 'adapts' };
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

export async function publishedResourceForMetric(db, activityId) {
  if (activityId === 'otp-002') return true; // The complete built-in kit has no published-edition document.
  let resourceId = '';
  if (activityId.startsWith('lesson-')) resourceId = activityId.slice('lesson-'.length);
  else {
    const claim = await db.doc(`resourceHubNumberClaims/${activityId}`).get();
    resourceId = String(claim.get('resourceId') ?? '');
  }
  if (!resourceId || !ID.test(resourceId)) return false;
  const published = await db.doc(`resourceHubPublished/${resourceId}`).get();
  if (!published.exists) return false;
  const data = published.data() ?? {};
  return data.resourceType === 'lesson'
    ? activityId === `lesson-${resourceId}`
    : activityId === `${data.collectionId}-${String(data.number ?? '').padStart(3, '0')}`;
}

// The client reports only completed actions. No email, name, class name, PDF name or
// lesson content is saved. Individual actor records are private server-only data.
export const recordResourceHubMetric = onCall({ region: 'us-central1', maxInstances: 5 }, async request => {
  if (!request.auth || request.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in as a teacher.');
  const { activityId, kind, requestId, field } = validateResourceMetric(request.data);
  const db = getFirestore();
  const [profile, account] = await Promise.all([db.doc(`users/${request.auth.uid}`).get(), db.doc(`accounts/${request.auth.uid}`).get()]);
  if (!profile.exists || profile.get('role') !== 'teacher' || account.get('suspended') === true) throw new HttpsError('permission-denied', 'Teachers only.');
  if (!(await publishedResourceForMetric(db, activityId))) {
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
    const org = typeof account.get('org') === 'string' && ID.test(account.get('org')) ? account.get('org') : '';
    transaction.set(summaryRef, {
      [field]: FieldValue.increment(1),
      ...(first ? { [`unique${field[0].toUpperCase()}${field.slice(1)}`]: FieldValue.increment(1) } : {}),
      ...(first && !Object.values(KINDS).some(f => actorData[f]) ? { teachers: FieldValue.increment(1) } : {}),
      days: { [day]: { [field]: FieldValue.increment(1) } },
      ...(org ? { orgs: { [org]: { [field]: FieldValue.increment(1) } } } : { orgs: { none: { [field]: FieldValue.increment(1) } } }),
      lastAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { recorded: true };
});

// What teachers search for in the Resource Hub, and how many results they got. Only the words are
// kept, folded to lower case: no name, email or class. A search with no results shows what to make next.
export function searchKey(query) {
  const term = String(query ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (term.length < 3 || /@|\d{5,}/.test(term)) return null; // nothing that looks like an email or a number
  return { term, id: Buffer.from(term).toString('base64url').slice(0, 140) };
}

export const recordResourceHubSearch = onCall({ region: 'us-central1', maxInstances: 5 }, async request => {
  if (!request.auth || request.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in as a teacher.');
  const key = searchKey(request.data?.query);
  const results = Math.max(0, Math.min(9999, Math.floor(Number(request.data?.results) || 0)));
  if (!key) return { recorded: false };
  const db = getFirestore();
  const profile = await db.doc(`users/${request.auth.uid}`).get();
  if (!profile.exists || profile.get('role') !== 'teacher') throw new HttpsError('permission-denied', 'Teachers only.');
  const day = new Date().toISOString().slice(0, 10);
  const actorRef = db.doc(`resourceHubSearchActors/${request.auth.uid}`);
  const termRef = db.doc(`resourceHubSearches/${key.id}`);
  await db.runTransaction(async transaction => {
    const actor = await transaction.get(actorRef);
    const n = actor.get('day') === day ? Number(actor.get('n')) || 0 : 0;
    if (n >= 300) return;
    transaction.set(actorRef, { day, n: n + 1 });
    transaction.set(termRef, {
      term: key.term,
      count: FieldValue.increment(1),
      ...(results === 0 ? { empty: FieldValue.increment(1) } : {}),
      results,
      days: { [day]: FieldValue.increment(1) },
      lastAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { recorded: true };
});

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const validId = value => typeof value === 'string' && value.length > 0 && value.length < 150 && !value.includes('/');

// Keep the activity timeline proportional to this learner's posts, not every post in the class.
export async function learnerDiscussionTimelineFor(db, auth, data) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw new HttpsError('permission-denied', 'This view cannot open learner activity.');
  const { classId, learnerId, learnerUid } = data ?? {};
  if (![classId, learnerId, learnerUid].every(validId)) throw new HttpsError('invalid-argument', 'Choose a learner in a class.');

  const [classSnap, learnerSnap] = await Promise.all([
    db.doc(`classes/${classId}`).get(),
    db.doc(`classes/${classId}/learners/${learnerId}`).get(),
  ]);
  const c = classSnap.data();
  if (!c || (c.teacherId !== auth.uid && !['co', 'viewer'].includes(c.coTeachers?.[auth.uid]?.role))) {
    throw new HttpsError('permission-denied', 'You cannot view this class.');
  }
  if (!learnerSnap.exists || learnerSnap.get('authUid') !== learnerUid) {
    throw new HttpsError('not-found', 'This learner is no longer in the class.');
  }

  const [threads, posts] = await Promise.all([
    db.collection(`classes/${classId}/threads`).where('learnerId', '==', learnerId).get(),
    db.collectionGroup('posts').where('learnerId', '==', learnerId).get(),
  ]);
  const prefix = `classes/${classId}/threads/`;
  const replies = posts.docs.filter(post => post.ref.path.startsWith(prefix) && post.ref.path.split('/').length === 6);
  const otherThreads = [...new Set(replies.map(post => post.ref.parent.parent.path))]
    .filter(path => !threads.docs.some(thread => thread.ref.path === path));
  const titles = new Map(threads.docs.map(thread => [thread.ref.path, String(thread.get('title') ?? '')]));
  if (otherThreads.length) {
    const snaps = await db.getAll(...otherThreads.map(path => db.doc(path)));
    for (const thread of snaps) titles.set(thread.ref.path, String(thread.get('title') ?? 'a discussion'));
  }
  return {
    entries: [
      ...threads.docs.map(thread => ({
        at: Number(thread.get('at') ?? thread.get('lastAt') ?? 0),
        kind: 'post', title: 'Started a discussion', where: titles.get(thread.ref.path) || 'a discussion',
      })),
      ...replies.map(post => ({
        at: Number(post.get('at') ?? 0),
        kind: 'reply', title: 'Replied in a discussion', where: titles.get(post.ref.parent.parent.path) || 'a discussion',
      })),
    ],
  };
}

export const learnerDiscussionTimeline = onCall({ region: 'us-central1', maxInstances: 10 }, req =>
  learnerDiscussionTimelineFor(getFirestore(), req.auth, req.data));

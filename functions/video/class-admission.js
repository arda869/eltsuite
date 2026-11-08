import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

const dailyKey = defineSecret('DAILY_API_KEY');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

// A class link alone does not admit anyone. Only the server can issue a short-lived
// Daily token after checking the signed-in teacher or class member.
export async function issueClassVideoToken(db, uid, classId, key, request = fetch, now = Date.now) {
  if (!validId(uid) || !validId(classId)) throw new HttpsError('invalid-argument', 'Choose a class video room.');
  if (!key) throw new HttpsError('failed-precondition', 'The video room is not ready yet.');
  const [userSnap, classSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`classes/${classId}`).get(),
  ]);
  const user = userSnap.data();
  const klass = classSnap.data();
  if (!klass || klass.status !== 'active' || !validId(klass.video?.room) || !klass.video?.url || klass.video?.paused)
    throw new HttpsError('failed-precondition', 'This class video room is unavailable.');
  const teacher = user?.role === 'teacher' && (klass.teacherId === uid || klass.coTeachers?.[uid]?.role === 'co');
  const learner = user?.role === 'learner' && (await db.doc(`classes/${classId}/members/${uid}`).get()).exists;
  if (!teacher && !learner) throw new HttpsError('permission-denied', 'This class video room is unavailable to this account.');
  const response = await request('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: {
      room_name: klass.video.room,
      exp: Math.floor(now() / 1000) + 10 * 60,
      is_owner: teacher,
      user_id: uid,
      user_name: String(user.displayName || user.name || (teacher ? 'Teacher' : 'Learner')).slice(0, 80),
    } }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.token !== 'string' || !body.token)
    throw new HttpsError('unavailable', 'We couldn’t open the video room. Please try again.');
  return { token: body.token, room: klass.video.room };
}

export const classVideoToken = onCall({ region: 'us-central1', secrets: [dailyKey], maxInstances: 10 }, req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (req.auth.token?.proxyBy) throw new HttpsError('permission-denied', 'Calls are unavailable in this view.');
  return issueClassVideoToken(getFirestore(), req.auth.uid, req.data?.classId, dailyKey.value());
});

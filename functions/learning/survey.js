import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const validId = (id) => typeof id === 'string' && /^[\w-]{1,100}$/.test(id);

// The answer document has a random ID and no identifying fields. Only the server can put it
// beside the per-learner completion record, atomically, so retries and simultaneous taps count once.
export async function saveAnonymousSurvey(db, uid, input) {
  const { classId, surveyId, itemId = '', taskId = '', answers } = input || {};
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to answer this survey.');
  if (!validId(classId) || !validId(surveyId) || (itemId && !validId(itemId)) || (taskId && !validId(taskId))) throw new HttpsError('invalid-argument', 'This survey link is not valid.');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length > 30 || JSON.stringify(answers).length > 12000) throw new HttpsError('invalid-argument', 'Check your answers and try again.');
  const memberRef = db.doc(`classes/${classId}/members/${uid}`);
  const doneRef = db.doc(`classes/${classId}/surveyDone/${surveyId}_${uid}`);
  const responseRef = db.collection(`classes/${classId}/surveyResponses`).doc();
  return db.runTransaction(async (tx) => {
    const [member, done] = await Promise.all([tx.get(memberRef), tx.get(doneRef)]);
    if (!member.exists) throw new HttpsError('permission-denied', 'Join this class before answering its survey.');
    if (done.exists) return { saved: true, alreadyDone: true };
    tx.create(responseRef, { surveyId, itemId, taskId, answers, at: FieldValue.serverTimestamp() });
    tx.create(doneRef, { surveyId, uid, learnerId: member.data()?.learnerId || '', at: FieldValue.serverTimestamp() });
    return { saved: true, alreadyDone: false };
  });
}

export const submitAnonymousSurvey = onCall({ region: 'us-central1', maxInstances: 8 }, async (req) =>
  saveAnonymousSurvey(getFirestore(), req.auth?.uid, req.data));

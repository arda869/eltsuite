import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { canCoach } from './coach-contract.js';

// Conversation history is server-written. Keep renaming and recursive deletion behind the
// same teacher-account check, so a browser never needs write access to coaching turns.
export async function manageCoachConversationRequest(req, db = getFirestore()) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const { action, conversationId } = req.data ?? {};
  if (!['rename', 'delete'].includes(action) || typeof conversationId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(conversationId)) {
    throw new HttpsError('invalid-argument', 'Choose a saved conversation.');
  }
  const uid = req.auth.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get()]);
  if (!canCoach(req.auth, profile.data(), account.data())) throw new HttpsError('permission-denied', 'Sign in with an active teacher account.');
  const ref = db.doc(`teachingCoach/${uid}/conversations/${conversationId}`);
  const saved = await ref.get();
  if (!saved.exists) throw new HttpsError('not-found', 'This conversation is no longer in your history.');
  if (action === 'rename') {
    const title = typeof req.data.title === 'string' ? req.data.title.trim() : '';
    if (!title || title.length > 100) throw new HttpsError('invalid-argument', 'Add a title of up to 100 characters.');
    await ref.update({ title, updatedAt: Date.now() });
    return { ok: true };
  }
  if (saved.get('activeRequest') && saved.get('updatedAt') > Date.now() - 300000) {
    throw new HttpsError('failed-precondition', 'Wait for the current reply before deleting this chat.');
  }
  await db.recursiveDelete(ref);
  return { ok: true };
}

// Callable handlers receive a second response argument from Firebase. Keep the
// injectable Firestore argument inside our own adapter so it cannot be mistaken
// for that response object in production.
export function createManageCoachConversationHandler(dbFactory = getFirestore) {
  return (request) => manageCoachConversationRequest(request, dbFactory());
}

export const manageCoachConversation = onCall({ region: 'us-central1', maxInstances: 2 }, createManageCoachConversationHandler());

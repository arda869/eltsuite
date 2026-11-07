import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export async function deleteConversationFor(db, auth, data) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to delete a chat.');
  const id = String(data?.chatId ?? '');
  if (!id || id.length > 200 || id.includes('/')) throw new HttpsError('invalid-argument', 'Choose a chat to delete.');
  const profile = await db.doc(`users/${auth.uid}`).get();
  const me = profile.get('role') === 'learner' ? profile.get('learnerId') : auth.uid;
  const ref = db.doc(`chats/${id}`);
  const chat = await ref.get();
  if (!chat.exists) return { deleted: true };
  if (!me || chat.get('createdBy') !== me) throw new HttpsError('permission-denied', 'Only the person who started this chat can delete it for everyone.');
  // A parent-only delete leaves messages, answers and media underneath it in Firestore.
  // Recursive deletion keeps those private records in the same lifecycle as the chat.
  await db.recursiveDelete(ref);
  return { deleted: true };
}

export const deleteConversation = onCall({ region: 'us-central1', maxInstances: 5, timeoutSeconds: 120 }, (req) =>
  deleteConversationFor(getFirestore(), req.auth, req.data));

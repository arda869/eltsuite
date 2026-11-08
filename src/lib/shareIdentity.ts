import { doc, getDoc, type Firestore } from 'firebase/firestore';
import type { Person } from './chat';

// Chat contacts use roster IDs; Firestore and Realtime Database permissions use
// Firebase Auth UIDs. Resolve the current roster record before granting access.
export async function permissionUid(db: Firestore, person: Person): Promise<string> {
  if (person.role !== 'learner') return person.key;
  if (person.authUid) return person.authUid;
  if (!person.classId) throw new Error('This learner has no class. Refresh the people list and try again.');
  const learner = await getDoc(doc(db, 'classes', person.classId, 'learners', person.key));
  const uid = learner.data()?.authUid;
  if (typeof uid !== 'string' || !uid) throw new Error('This learner is not ready to receive files. Refresh the people list and try again.');
  return uid;
}

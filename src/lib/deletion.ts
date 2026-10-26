import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc, type DocumentReference } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { removeLearner, type Learner } from './learners';
import type { ClassDoc } from './classes';

export const DELETE_AFTER_DAYS = 30;

// Moves a class to "Recently deleted". It can be restored for 30 days.
export async function softDeleteClass(c: ClassDoc) {
  await updateDoc(doc(db, 'classes', c.id), { status: 'deleted', deletedAt: serverTimestamp() });
}
export async function restoreClass(c: ClassDoc) {
  await updateDoc(doc(db, 'classes', c.id), { status: 'active', deletedAt: null });
}

async function deleteAll(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 20) await Promise.all(refs.slice(i, i + 20).map((r) => deleteDoc(r).catch(() => {})));
}
const docsOf = async (...path: [string, ...string[]]) => (await getDocs(collection(db, ...path))).docs.map((d) => d.ref);

// Removes a class for good: learner accounts, answers, lessons, everything.
export async function purgeClass(c: ClassDoc, onStep?: (s: string) => void) {
  const id = c.id;
  onStep?.('Removing learner accounts');
  const learners = await getDocs(collection(db, 'classes', id, 'learners'));
  for (const l of learners.docs) {
    const pin = ((await getDoc(doc(db, 'classes', id, 'secrets', l.id))).data()?.pin as string) ?? '';
    await removeLearner(c, { id: l.id, ...(l.data() as Omit<Learner, 'id'>) }, pin).catch(() => {});
  }
  onStep?.('Removing lessons');
  const items = await getDocs(collection(db, 'classes', id, 'items'));
  for (const it of items.docs) {
    const tasks = await getDocs(collection(db, 'classes', id, 'items', it.id, 'tasks'));
    for (const t of tasks.docs) {
      await deleteAll([...(await docsOf('classes', id, 'items', it.id, 'tasks', t.id, 'private')), ...(await docsOf('classes', id, 'items', it.id, 'tasks', t.id, 'versions'))]);
    }
    await deleteAll(tasks.docs.map((d) => d.ref));
  }
  await deleteAll(items.docs.map((d) => d.ref));
  onStep?.('Removing answers and activity');
  const boards = await getDocs(collection(db, 'classes', id, 'boards'));
  for (const b of boards.docs) await deleteAll(await docsOf('classes', id, 'boards', b.id, 'posts'));
  const threads = await getDocs(collection(db, 'classes', id, 'threads'));
  for (const t of threads.docs) await deleteAll(await docsOf('classes', id, 'threads', t.id, 'posts'));
  const nb = await getDocs(collection(db, 'classes', id, 'notebook'));
  for (const e of nb.docs) await deleteAll(await docsOf('classes', id, 'notebook', e.id, 'history'));
  for (const sub of ['answers', 'feedback', 'notices', 'picks', 'presence', 'live', 'avatars', 'media', 'topics', 'secrets', 'members', 'boards', 'threads', 'annotations', 'announcements', 'groupSets', 'levelChoices', 'examRuns', 'surveyResponses', 'surveyDone', 'surveyResults', 'notebook', 'myNotes', 'attendance', 'mistakes', 'recaps']) await deleteAll(await docsOf('classes', id, sub));
  await deleteDoc(doc(db, 'classCodes', c.classCode)).catch(() => {});
  await deleteDoc(doc(db, 'classes', id));
}

// Deletes the teacher's account and every class in it.
export async function deleteTeacherAccount(classes: ClassDoc[], onStep?: (s: string) => void) {
  for (const c of classes) {
    onStep?.(`Deleting ${c.name}`);
    await purgeClass(c);
  }
  const u = auth.currentUser;
  if (!u) return;
  await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
  await deleteUser(u);
}

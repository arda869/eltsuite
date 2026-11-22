// Run against a disposable Firestore emulator; notes stay out of learner-readable task rows.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore emulator required');
const env = await initializeTestEnvironment({ projectId: 'demo-file-task-notes', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/owner'), { role: 'teacher' });
    await setDoc(doc(db, 'users/colleague'), { role: 'teacher' });
    await setDoc(doc(db, 'users/learner'), { role: 'learner' });
    await setDoc(doc(db, 'sharedDocs/file'), { owner: 'owner', kind: 'lesson', memberIds: ['colleague', 'learner'], members: { colleague: { role: 'edit' }, learner: { role: 'view' } } });
    await setDoc(doc(db, 'sharedDocs/file/tasks/task'), { title: 'A task' });
    await setDoc(doc(db, 'sharedDocs/file/taskNotes/task'), { text: 'Private answer guidance' });
  });
  const owner = env.authenticatedContext('owner', { email: 'owner@example.com' }).firestore();
  const colleague = env.authenticatedContext('colleague', { email: 'colleague@example.com' }).firestore();
  const learner = env.authenticatedContext('learner', { email: 'learner@learners.lesson-lit.firebaseapp.com' }).firestore();
  const note = db => getDoc(doc(db, 'sharedDocs/file/taskNotes/task'));
  await assertSucceeds(note(owner));
  await assertSucceeds(note(colleague));
  await assertSucceeds(getDoc(doc(learner, 'sharedDocs/file/tasks/task')));
  await assertFails(note(learner));
  await assertFails(setDoc(doc(learner, 'sharedDocs/file/taskNotes/forged'), { text: 'No' }));
  console.log('PASS standalone notes: owner and teacher collaborator read; learner file member cannot read or write.');
} finally {
  await env.cleanup();
}

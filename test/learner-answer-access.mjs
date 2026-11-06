import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('A disposable Firestore emulator is required.');
const env = await initializeTestEnvironment({
  projectId: process.env.ANSWER_TEST_PROJECT || 'demo-ai-access',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'classes', 'lesson'), { teacherId: 'teacher' });
    await setDoc(doc(db, 'classes', 'lesson', 'answers', 'imported_task_part_learner'), {
      taskId: 'imported_task_part', learnerUid: 'learner', responses: {},
    });
  });
  const learner = env.authenticatedContext('learner', { email: 'learner@learners.lesson-lit.firebaseapp.com' }).firestore();
  const other = env.authenticatedContext('other', { email: 'other@learners.lesson-lit.firebaseapp.com' }).firestore();
  const teacher = env.authenticatedContext('teacher', { email: 'teacher@example.com' }).firestore();
  const saved = 'classes/lesson/answers/imported_task_part_learner';
  const notYetAnswered = 'classes/lesson/answers/new_task_part_learner';
  await assertSucceeds(getDoc(doc(learner, saved)));
  await assertSucceeds(getDoc(doc(learner, notYetAnswered)));
  await assertFails(getDoc(doc(other, saved)));
  await assertFails(getDoc(doc(other, notYetAnswered)));
  await assertSucceeds(getDoc(doc(teacher, saved)));
  console.log('Learner answer rules: imported task IDs and unanswered tasks are readable only by the learner or teacher.');
} finally {
  await env.cleanup();
}

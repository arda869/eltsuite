import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('A disposable Firestore emulator is required.');
const env = await initializeTestEnvironment({ projectId: 'demo-survey-access', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'classes', 'class1'), { teacherId: 'teacher' });
    await setDoc(doc(db, 'classes', 'class1', 'members', 'learner'), { learnerId: 'L1' });
    await setDoc(doc(db, 'classes', 'class1', 'surveyResponses', 'random1'), { surveyId: 's1', answers: { q1: 2 } });
    await setDoc(doc(db, 'classes', 'class1', 'surveyDone', 's1_learner'), { surveyId: 's1', uid: 'learner' });
    await setDoc(doc(db, 'classes', 'class1', 'gameAttempts', 'run1_learner'), { learnerUid: 'learner', runId: 'run1', score: 1 });
  });
  const learner = env.authenticatedContext('learner').firestore();
  const teacher = env.authenticatedContext('teacher').firestore();
  const response = doc(learner, 'classes', 'class1', 'surveyResponses', 'anotherRandom');
  await assertFails(setDoc(response, { surveyId: 's1', answers: { q1: 1 } }));
  await assertSucceeds(getDoc(doc(teacher, 'classes', 'class1', 'surveyResponses', 'random1')));
  await assertFails(getDoc(doc(learner, 'classes', 'class1', 'surveyResponses', 'random1')));
  await assertSucceeds(getDoc(doc(learner, 'classes', 'class1', 'surveyDone', 's1_learner')));
  await assertFails(getDoc(doc(teacher, 'classes', 'class1', 'surveyDone', 's1_learner')));
  await assertSucceeds(getDoc(doc(learner, 'classes', 'class1', 'gameAttempts', 'run1_learner')));
  await assertSucceeds(getDoc(doc(teacher, 'classes', 'class1', 'gameAttempts', 'run1_learner')));
  await assertFails(setDoc(doc(learner, 'classes', 'class1', 'gameAttempts', 'forged_learner'), { learnerUid: 'learner', score: 999 }));
  console.log('Anonymous survey responses are server-written and teacher-readable only.');
} finally {
  await env.cleanup();
}

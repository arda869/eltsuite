import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-resource-hub',
  firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
});
const owner = env.authenticatedContext('owner', { email: 'ardanurioglu@gmail.com', email_verified: true }).firestore();
const teacher = env.authenticatedContext('teacher', { email: 'teacher@example.com', email_verified: true }).firestore();
const other = env.authenticatedContext('other', { email: 'other@example.com', email_verified: true }).firestore();
const learner = env.authenticatedContext('learner', { email: 'learner@learners.lesson-lit.firebaseapp.com', email_verified: true }).firestore();
const visitor = env.unauthenticatedContext().firestore();
let checks = 0;
async function yes(label, promise) { await assertSucceeds(promise); checks++; console.log('PASS', label); }
async function no(label, promise) { await assertFails(promise); checks++; console.log('PASS', label); }
try {
  await env.withSecurityRulesDisabled(async admin => {
    const db = admin.firestore();
    for (const uid of ['teacher', 'other']) {
      await setDoc(doc(db, 'users', uid), { role: 'teacher' });
      await setDoc(doc(db, 'accounts', uid), { suspended: false });
    }
    await setDoc(doc(db, 'users', 'learner'), { role: 'learner' });
    await setDoc(doc(db, 'accounts', 'learner'), { suspended: false });
    await setDoc(doc(db, 'resourceHubMetrics', 'edition'), { views: 2, uniqueViews: 1 });
    await setDoc(doc(db, 'resourceHubMetrics', 'edition', 'actors', 'teacher'), { views: 2 });
  });
  await yes('Owner creates private resource draft', setDoc(doc(owner, 'resourceHubDrafts', 'draft'), { title: 'Draft' }));
  await no('Teacher cannot read private resource draft', getDoc(doc(teacher, 'resourceHubDrafts', 'draft')));
  await no('Learner cannot read private resource draft', getDoc(doc(learner, 'resourceHubDrafts', 'draft')));
  await yes('Owner publishes resource edition', setDoc(doc(owner, 'resourceHubPublished', 'edition'), { title: 'Published' }));
  await yes('Teacher reads published resource', getDoc(doc(teacher, 'resourceHubPublished', 'edition')));
  await no('Learner cannot read published resource', getDoc(doc(learner, 'resourceHubPublished', 'edition')));
  await no('Visitor cannot read published resource', getDoc(doc(visitor, 'resourceHubPublished', 'edition')));
  await no('Teacher cannot change published resource', updateDoc(doc(teacher, 'resourceHubPublished', 'edition'), { title: 'Forged' }));
  await yes('Owner updates built-in source pages', setDoc(doc(owner, 'resourceHubStaticOverrides', 'otp-002'), { title: 'Have You Ever…?' }));
  await yes('Teacher reads built-in source pages', getDoc(doc(teacher, 'resourceHubStaticOverrides', 'otp-002')));
  await no('Learner cannot read built-in source pages or answer key', getDoc(doc(learner, 'resourceHubStaticOverrides', 'otp-002')));
  await no('Visitor cannot read built-in source pages', getDoc(doc(visitor, 'resourceHubStaticOverrides', 'otp-002')));
  await no('Teacher cannot update built-in source pages', updateDoc(doc(teacher, 'resourceHubStaticOverrides', 'otp-002'), { title: 'Forged' }));
  await no('Owner cannot create unrelated source overrides', setDoc(doc(owner, 'resourceHubStaticOverrides', 'otp-003'), { title: 'Other' }));
  await yes('Owner saves immutable edition', setDoc(doc(owner, 'resourceHubPublished', 'edition', 'editions', '1'), { title: 'Published' }));
  await no('Owner cannot edit history', updateDoc(doc(owner, 'resourceHubPublished', 'edition', 'editions', '1'), { title: 'Changed' }));
  await yes('Owner creates private collection draft', setDoc(doc(owner, 'resourceHubCollectionsDrafts', 'otp'), { title: 'Off the Page' }));
  await no('Teacher cannot read collection draft', getDoc(doc(teacher, 'resourceHubCollectionsDrafts', 'otp')));
  await yes('Owner publishes collection edition', setDoc(doc(owner, 'resourceHubCollectionsPublished', 'otp'), { title: 'Off the Page' }));
  await yes('Teacher reads published collection', getDoc(doc(teacher, 'resourceHubCollectionsPublished', 'otp')));
  await no('Learner cannot read published collection', getDoc(doc(learner, 'resourceHubCollectionsPublished', 'otp')));
  await yes('Teacher saves own shelves', setDoc(doc(teacher, 'resourceHubUserState', 'teacher'), { savedIds: ['otp-002'] }));
  await yes('Teacher reads own shelves', getDoc(doc(teacher, 'resourceHubUserState', 'teacher')));
  await no('Other teacher cannot read shelves', getDoc(doc(other, 'resourceHubUserState', 'teacher')));
  await no('Learner cannot create shelves', setDoc(doc(learner, 'resourceHubUserState', 'learner'), { savedIds: [] }));
  await yes('Owner reads aggregate activity usage', getDoc(doc(owner, 'resourceHubMetrics', 'edition')));
  await no('Teacher cannot read aggregate activity usage', getDoc(doc(teacher, 'resourceHubMetrics', 'edition')));
  await no('Visitor cannot read aggregate activity usage', getDoc(doc(visitor, 'resourceHubMetrics', 'edition')));
  await no('Owner cannot forge aggregate activity usage', setDoc(doc(owner, 'resourceHubMetrics', 'edition'), { views: 1000 }));
  await no('Teacher cannot forge aggregate activity usage', setDoc(doc(teacher, 'resourceHubMetrics', 'edition'), { views: 1000 }));
  await no('Owner cannot read individual usage records', getDoc(doc(owner, 'resourceHubMetrics', 'edition', 'actors', 'teacher')));
  assert.equal(checks, 31);
  console.log(`${checks} Resource Hub access checks passed`);
} finally { await env.cleanup(); }

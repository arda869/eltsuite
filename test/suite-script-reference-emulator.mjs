// Run only against a disposable Firestore emulator. This uses the real Admin
// SDK transaction path as well as the deployed Firestore rules.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, terminate } from 'firebase/firestore';
import { suiteScriptReferenceService } from '../functions/suitescript/references.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('A disposable Firestore emulator is required.');
const projectId = 'demo-suite-script-rules';
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin } = require('firebase-admin/app');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const admin = adminFirestore(initializeAdmin({ projectId }));
const app = initializeApp({ projectId }, 'suite-script-reference-emulator');
const teacher = getFirestore(app);
connectFirestoreEmulator(teacher, host, Number(port), { mockUserToken: { sub: 'teacher', email: 'teacher@example.test', email_verified: true } });
const learnerApp = initializeApp({ projectId }, 'suite-script-reference-learner');
const learner = getFirestore(learnerApp);
connectFirestoreEmulator(learner, host, Number(port), { mockUserToken: { sub: 'learner', email: 'learner@learners.lesson-lit.firebaseapp.com' } });
const outsiderApp = initializeApp({ projectId }, 'suite-script-reference-outsider');
const outsider = getFirestore(outsiderApp);
connectFirestoreEmulator(outsider, host, Number(port), { mockUserToken: { sub: 'outsider', email: 'outsider@example.test' } });

try {
  await Promise.all([
    admin.doc('users/teacher').set({ role: 'teacher' }),
    admin.doc('users/teacher/archive/recording').set({ kind: 'audio', title: 'First name', home: { classId: 'class-1', mediaId: 'media-1' } }),
    admin.doc('sharedDocs/document').set({ kind: 'doc', owner: 'teacher', memberIds: ['learner'], members: { learner: { role: 'view' } }, classes: { 'class-1': { role: 'view', name: 'Class' } }, docKey: 'stable-doc-key' }),
    admin.doc('classes/class-1').set({ teacherId: 'teacher' }),
    admin.doc('classes/class-1/members/learner').set({ learnerId: 'learner' }),
    admin.doc('classes/class-1/media/copied-image').set({ data: 'data:image/jpeg;base64,AA==', type: 'image/jpeg', size: 1 }),
    admin.doc('classes/class-1/media/copied-pdf').set({ kind: 'pdf', parts: 1, pages: [{ w: 612, h: 792 }], size: 0 }),
    admin.doc('classes/class-1/media/copied-pdf_p0').set({ part: 0, data: 'JVBERg==', size: 4 }),
    admin.doc('sharedDocs/private-image').set({ kind: 'file', owner: 'teacher', memberIds: [], uploadStatus: 'ready', file: { type: 'image/png' } }),
    admin.doc('classes/other-class').set({ teacherId: 'other' }),
  ]);
  const audio = await suiteScriptReferenceService(admin, 'teacher', { action: 'ensure', kind: 'archive', id: 'recording' });
  const collab = await suiteScriptReferenceService(admin, 'teacher', { action: 'ensure', kind: 'sharedDoc', id: 'document' });
  assert.match(audio.id, /^ELTSUITE-(\d{4}-){3}\d{4}$/);
  assert.equal((await admin.doc(`suiteScriptRefs/${audio.id}`).get()).get('sourceId'), 'recording');
  assert.equal((await admin.doc('sharedDocs/document').get()).get('suiteScriptRef'), collab.id);

  await updateDoc(doc(teacher, 'users/teacher/archive/recording'), { title: 'Renamed' });
  assert.equal((await suiteScriptReferenceService(admin, 'teacher', { action: 'ensure', kind: 'archive', id: 'recording' })).id, audio.id);
  assert.equal((await suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'class', classId: 'class-1' } })).sourceId, 'recording');
  assert.equal((await suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: collab.id, destination: { mode: 'class', classId: 'class-1' } })).classRole, 'view');
  await assert.rejects(() => suiteScriptReferenceService(admin, 'learner', { action: 'resolve', id: audio.id, destination: { mode: 'private' } }), { code: 'permission-denied' });
  await assert.rejects(() => suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'class', classId: 'other-class' } }), { code: 'permission-denied' });
  await assert.rejects(() => suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'resourceHub' } }), { code: 'permission-denied' });
  await assert.rejects(() => suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: collab.id, destination: { mode: 'message', recipientIds: ['stranger'] } }), { code: 'permission-denied' });
  for (const id of ['copied-image', 'copied-pdf', 'copied-pdf_p0']) {
    assert.equal((await getDoc(doc(learner, 'classes/class-1/media', id))).exists(), true);
    await assert.rejects(() => getDoc(doc(outsider, 'classes/class-1/media', id)), { code: 'permission-denied' });
  }
  await assert.rejects(() => getDoc(doc(learner, 'sharedDocs/private-image')), { code: 'permission-denied' });
  await assert.rejects(() => updateDoc(doc(teacher, 'users/teacher/archive/recording'), { suiteScriptRef: 'ELTSUITE-0001-0002-0003-0018' }), error => error.code === 'permission-denied');
  await admin.doc('users/teacher/archive/recording').update({ deletedAt: Date.now() });
  await assert.rejects(() => suiteScriptReferenceService(admin, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'private' } }), { code: 'not-found' });
  console.log('PASS real Firestore emulator transactions, destination permissions and immutable references');
} finally {
  await terminate(teacher);
  await terminate(learner);
  await terminate(outsider);
  await deleteApp(app);
  await deleteApp(learnerApp);
  await deleteApp(outsiderApp);
}

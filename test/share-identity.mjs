import { readFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-share-identity';
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const output = 'test/.share-identity-built.mjs';
try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'teacher-uid'), { role: 'teacher' });
    await setDoc(doc(db, 'classes', 'demo'), { teacherId: 'teacher-uid' });
    await setDoc(doc(db, 'classes', 'demo', 'learners', 'roster-id'), { displayName: 'Test learner', authUid: 'learner-auth-uid' });
    await setDoc(doc(db, 'sharedDocs', 'test-doc'), { owner: 'teacher-uid', title: 'Test', kind: 'doc', docKey: 'test-key', members: {}, memberIds: [] });
  });
  await build({ entryPoints: ['src/lib/shareIdentity.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', external: ['firebase/firestore'] });
  const { permissionUid } = await import('./.share-identity-built.mjs');
  const db = env.authenticatedContext('teacher-uid').firestore();
  assert.equal(await permissionUid(db, { key: 'teacher-uid', name: 'Teacher', role: 'teacher' }), 'teacher-uid');
  assert.equal(await assertSucceeds(permissionUid(db, { key: 'roster-id', name: 'Test learner', role: 'learner', classId: 'demo' })), 'learner-auth-uid');
  assert.equal(await permissionUid(db, { key: 'roster-id', name: 'Test learner', role: 'learner', classId: 'demo', authUid: 'learner-auth-uid' }), 'learner-auth-uid');
  await assert.rejects(permissionUid(db, { key: 'missing', name: 'Missing learner', role: 'learner', classId: 'demo' }), /not ready/);
  const learnerDb = env.authenticatedContext('learner-auth-uid', { role: 'learner' }).firestore();
  await assert.rejects(getDoc(doc(learnerDb, 'sharedDocs', 'test-doc')));
  await assertSucceeds(updateDoc(doc(db, 'sharedDocs', 'test-doc'), {
    'members.learner-auth-uid': { role: 'view', kind: 'learner', name: 'Test learner' },
    memberIds: ['learner-auth-uid'],
  }));
  assert.equal((await assertSucceeds(getDoc(doc(learnerDb, 'sharedDocs', 'test-doc')))).data()?.title, 'Test');
  console.log('Learner sharing identity passed: roster ID resolves to Auth UID.');
} finally {
  try { unlinkSync(output); } catch {}
  await env.cleanup();
}

import { readFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection } from 'firebase/firestore';
const projectId = 'demo-ai-access';
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const output = 'test/.file-names-built.mjs';
try {
  await env.withSecurityRulesDisabled(async c => {
    for (const uid of ['teacher', 'other']) await setDoc(doc(c.firestore(), 'users', uid), { role: 'teacher' });
    await setDoc(doc(c.firestore(), 'sharedFolders', 'library'), { owner: 'teacher', name: 'Library', members: { other: { role: 'edit' } }, memberIds: ['other'] });
  });
  const teacher = env.authenticatedContext('teacher', { email: 'teacher@example.com' }).firestore();
  const other = env.authenticatedContext('other', { email: 'other@example.com' }).firestore();
  globalThis.fileTestDb = teacher;
  globalThis.fileTestUid = 'teacher';
  await build({ entryPoints: ['src/lib/fileNames.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', external: ['firebase/firestore'], plugins: [{ name: 'test-session', setup(b) {
    b.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'test-session', namespace: 'test-session' }));
    b.onLoad({ filter: /.*/, namespace: 'test-session' }, () => ({ contents: 'export const db = globalThis.fileTestDb; export const auth = {currentUser: {uid: globalThis.fileTestUid}};', loader: 'js' }));
  } }] });
  const { writeNamedFile } = await import('./.file-names-built.mjs');
  const scope = { owner: 'teacher' };
  const create = async (id) => writeNamedFile(doc(teacher, 'sharedDocs', id), scope, 'Same name', { owner: 'teacher', kind: 'doc', members: {}, memberIds: [] }, true, true);
  console.log('File test: concurrent create');
  const names = await Promise.all(['one', 'two', 'three', 'four'].map(create));
  assert.equal(new Set(names).size, 4, 'simultaneous browser sessions must reserve distinct names');
  console.log('File test: namespace list denial');
  await assertFails(getDocs(collection(teacher, 'fileNamespaces')));
  const ref = doc(teacher, 'sharedDocs', 'one');
  assert.equal((await getDoc(ref)).exists(), true);
  console.log('File test: soft delete');
  await assertSucceeds(updateDoc(ref, { deletedAt: Date.now() }));
  console.log('File test: request purge');
  await assertSucceeds(updateDoc(ref, { purgeRequestedAt: Date.now() }));
  await assertFails(updateDoc(ref, { deletedAt: 0 }));
  await assertFails(updateDoc(ref, { purgingAt: Date.now() }));
  await assertFails(updateDoc(doc(other, 'sharedDocs', 'one'), { deletedAt: 0 }));
  await assertFails(setDoc(doc(other, 'fileNamespaces', 'forged'), { owner: 'teacher', folder: '', path: '', version: 1 }));
  console.log('File test: folder editor');
  await assertSucceeds(setDoc(doc(other, 'fileNamespaces', 'library-lock'), { owner: 'teacher', folder: 'library', path: '', version: 1 }));
  console.log('File rules passed: concurrent names unique, private namespace protected, folder editor allowed, purge cannot be restored or forged.');
} finally {
  delete globalThis.fileTestDb; delete globalThis.fileTestUid;
  try { unlinkSync(output); } catch {}
  await env.cleanup();
}

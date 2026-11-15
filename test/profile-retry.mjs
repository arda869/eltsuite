import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const outputDir = mkdtempSync(join(tmpdir(), 'elt-profile-retry-'));
const output = join(outputDir, 'teacherProfile.mjs');
const pending = [];
globalThis.sessionStorage = { getItem: () => null };
globalThis.profileRead = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));

try {
  await build({
    entryPoints: ['src/lib/teacherProfile.ts'], outfile: output,
    bundle: true, format: 'esm', platform: 'node',
    plugins: [{ name: 'profile-stubs', setup(bundle) {
      for (const path of ['firebase/firestore', './firebase', './learners', './afterSignIn', './codes', './teacherPaths']) {
        bundle.onResolve({ filter: new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path, namespace: 'profile-stubs' }));
      }
      bundle.onLoad({ filter: /.*/, namespace: 'profile-stubs' }, ({ path }) => ({
        contents: {
          'firebase/firestore': `export const doc=(_db,...parts)=>parts.join('/'); export const getDoc=()=>globalThis.profileRead(); export const runTransaction=()=>{throw Error('Unexpected new-account write');}; export const serverTimestamp=()=>null; export const updateDoc=()=>Promise.resolve();`,
          './firebase': 'export const db={}; export const auth={currentUser:null};',
          './learners': 'export const isLearnerEmail=()=>false;',
          './afterSignIn': 'export const AFTER_SIGN_IN="afterSignIn";',
          './codes': 'export const cleanCode=()=>"";export const codeProblem=()=>null;export const forgetCode=()=>{};export const keptCode=()=>"";export const keptName=()=>"";export const spendCode=()=>{};',
          './teacherPaths': 'export const TEACHER_PATHS=[];',
        }[path], loader: 'js',
      }));
    } }],
  });
  const { ensureProfile, retryProfile, withSetupTimeout, profileLoadErrorMessage } = await import(output);
  const user = { uid: 'teacher-retry', email: 'teacher@example.com' };
  const first = ensureProfile(user);
  assert.equal(ensureProfile(user), first, 'ordinary simultaneous profile loads share one request');
  await assert.rejects(withSetupTimeout(first, 5), (error) => error.code === 'deadline-exceeded');
  const second = retryProfile(user);
  assert.notEqual(second, first, 'retry starts a new request after timeout');
  assert.equal(pending.length, 2);
  pending[0].resolve({ exists: () => true, data: () => ({ role: 'teacher', displayName: 'Old read' }) });
  await first;
  assert.equal(ensureProfile(user), second, 'late first result cannot evict the new request');
  pending[1].resolve({ exists: () => true, data: () => ({ role: 'teacher', displayName: 'Current read' }) });
  assert.equal((await second).displayName, 'Current read');

  const denied = ensureProfile(user);
  pending[2].reject(Object.assign(new Error('Denied'), { code: 'permission-denied' }));
  await assert.rejects(denied, (error) => error.code === 'permission-denied');
  assert.match(profileLoadErrorMessage({ code: 'permission-denied' }), /account access/);
  assert.doesNotMatch(profileLoadErrorMessage({ code: 'unavailable' }), /choice/i, 'profile load error does not imply a saved choice');
  const recovered = retryProfile(user);
  pending[3].resolve({ exists: () => true, data: () => ({ role: 'teacher', displayName: 'Recovered' }) });
  assert.equal((await recovered).displayName, 'Recovered');
  console.log('Profile retry passed: hung first read, fresh retry, late result isolation, permission error and recovery.');
} finally {
  rmSync(outputDir, { recursive: true, force: true });
  delete globalThis.profileRead;
  delete globalThis.sessionStorage;
}

// Actual new-account/profile writes under the production Firestore rules, in an emulator only.
import { readFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const deps = process.env.ONBOARDING_TEST_DEPS ? createRequire(process.env.ONBOARDING_TEST_DEPS + '/package.json') : require;
const { build } = deps('esbuild');
const { initializeTestEnvironment, assertFails } = deps('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = deps('firebase/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Disposable Firestore emulator required.');
const env = await initializeTestEnvironment({ projectId: process.env.ONBOARDING_TEST_PROJECT || 'demo-ai-access', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const output = 'test/.onboarding-built.mjs';
const storage = new Map();
globalThis.sessionStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) };
try {
  await build({ entryPoints: ['src/lib/teacherProfile.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', external: ['firebase/firestore', 'react'], plugins: [{ name: 'session', setup(b) {
    b.onResolve({filter: /^firebase\/firestore$/}, () => ({path: deps.resolve('firebase/firestore'), external: true}));
    b.onResolve({filter: /^\.\/firebase$/}, () => ({path: 'firebase', namespace: 'session'}));
    b.onResolve({filter: /^\.\/learners$/}, () => ({path: 'learners', namespace: 'session'}));
    b.onLoad({filter: /.*/, namespace: 'session'}, a => ({contents: a.path === 'firebase' ? 'export const db=globalThis.onboardingDb;export const auth={get currentUser(){return globalThis.onboardingUser}};' : 'export const isLearnerEmail=(email)=>String(email||"").endsWith("@learners.lesson-lit.firebaseapp.com");', loader: 'js'}));
  }}] });
  const admin = async fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
  const as = async (uid, email, code = '') => {
    storage.clear(); if (code) storage.set('ll.inviteCode', code); storage.set('ll.newName', 'New Teacher');
    globalThis.onboardingDb = env.authenticatedContext(uid, { email, email_verified: true }).firestore();
    globalThis.onboardingUser = { uid, email, displayName: '' };
    const api = await import('./.onboarding-built.mjs?user=' + uid);
    return { api, user: globalThis.onboardingUser, db: globalThis.onboardingDb };
  };
  await admin(async db => {
    await setDoc(doc(db, 'inviteCodes', 'ABCD-EF23'), { maxUses: 1, uses: 0, usedBy: {}, expires: 0, by: 'admin' });
    await setDoc(doc(db, 'inviteCodes', 'ORGX-AB23'), { org: 'school', maxUses: 1, uses: 0, usedBy: {}, expires: 0, by: 'admin' });
    await setDoc(doc(db, 'orgs', 'school'), { name: 'School', adminEmails: ['admin@example.com'], teachers: {}, limits: { teachers: 5 } });
    await setDoc(doc(db, 'orgInvites', 'invite'), { org: 'school', email: 'invited@example.com', status: 'pending' });
  });
  const one = await as('fresh-teacher', 'fresh@example.com', 'ABCD-EF23');
  const results = await Promise.all([one.api.ensureProfile(one.user), one.api.ensureProfile(one.user), one.api.ensureProfile(one.user)]);
  assert(results.every(p => p.role === 'teacher'));
  assert.equal((await getDoc(doc(one.db, 'inviteCodes', 'ABCD-EF23'))).data().uses, 1, 'one invitation use despite repeated auth events');
  for (const goal of ['lesson','materials','live','audio','study','team','']) {
    await one.api.saveTeacherGoal(one.user, goal);
    assert.equal((await getDoc(doc(one.db, 'users', one.user.uid))).data().teacherGoal, goal);
  }
  await one.api.ensureProfile(one.user);
  assert.equal((await getDoc(doc(one.db, 'users', one.user.uid))).data().onboarding, 'done', 'loading the profile never resets onboarding');
  assert.equal((await getDoc(doc(one.db, 'users', one.user.uid))).data().displayName, 'New Teacher');
  await assert.rejects(one.api.saveTeacherGoal(one.user, 'unknown'));
  const org = await as('org-teacher', 'org@example.com', 'ORGX-AB23');
  await org.api.ensureProfile(org.user); await org.api.saveTeacherGoal(org.user, 'audio');
  assert.equal((await getDoc(doc(org.db, 'accounts', org.user.uid))).data().org, 'school');
  assert((await getDoc(doc(org.db, 'orgs', 'school'))).data().teachers[org.user.uid]);
  const invited = await as('invited-teacher', 'invited@example.com');
  storage.set('ll.afterSignIn', '/invite/invite');
  await invited.api.ensureProfile(invited.user); await invited.api.saveTeacherGoal(invited.user, 'team');
  const denied = await as('uninvited', 'unknown@example.com');
  await assert.rejects(denied.api.ensureProfile(denied.user), e => e instanceof denied.api.NotInvited);
  assert.equal((await getDoc(doc(denied.db, 'users', denied.user.uid))).exists(), false);
  const exhausted = await as('exhausted', 'exhausted@example.com', 'ABCD-EF23');
  await assert.rejects(exhausted.api.ensureProfile(exhausted.user), e => e instanceof exhausted.api.NotInvited);
  await assertFails(updateDoc(doc(exhausted.db, 'users', one.user.uid), { onboarding: 'done' }));
  await assert.rejects(one.api.withSetupTimeout(new Promise(() => {}), 5), e => e.code === 'deadline-exceeded');
  console.log('Onboarding rules passed: fresh invitation/code/org accounts, one-time setup, all goals and skip, persistent completion, and unauthorised access denied.');
} finally {
  try { unlinkSync(output); } catch {}
  delete globalThis.onboardingDb; delete globalThis.onboardingUser; delete globalThis.sessionStorage;
  await env.cleanup();
}

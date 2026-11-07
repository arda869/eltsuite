// Public requests go through a rate-limited callable. Clients cannot write them directly.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } = require('firebase/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Disposable Firestore emulator required.');
const env = await initializeTestEnvironment({ projectId: process.env.INVITATION_TEST_PROJECT || 'demo-feature-discovery', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
try {
  const guest = env.unauthenticatedContext().firestore();
  const teacher = env.authenticatedContext('teacher', { email: 'teacher@example.com', email_verified: true }).firestore();
  const owner = env.authenticatedContext('owner', { email: 'ardanurioglu@gmail.com', email_verified: true }).firestore();
  const ok = { name: 'Sam Reed', email: 'sam@example.com', place: 'A school in Porto', teaches: 'Adults', note: 'Mostly B1 and B2 classes.', at: serverTimestamp() };

  // Even a well-formed public write must go through the server's rate limiter.
  await assertFails(addDoc(collection(guest, 'invitationRequests'), ok));
  const askedId = 'server-created';
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'invitationRequests', askedId), ok));

  // Only in this shape.
  for (const bad of [
    { ...ok, invited: 'ABCD-EF23' },
    { ...ok, name: '' },
    { ...ok, name: 'x'.repeat(81) },
    { ...ok, email: 'not an email' },
    { ...ok, note: 'x'.repeat(601) },
    { ...ok, at: 12345 },
    { name: 'No email', at: serverTimestamp() },
  ]) await assertFails(addDoc(collection(guest, 'invitationRequests'), bad));

  // Nobody else can read, change or delete them.
  for (const db of [guest, teacher]) {
    await assertFails(getDoc(doc(db, 'invitationRequests', askedId)));
    await assertFails(getDocs(collection(db, 'invitationRequests')));
    await assertFails(updateDoc(doc(db, 'invitationRequests', askedId), { invited: 'ABCD-EF23' }));
    await assertFails(deleteDoc(doc(db, 'invitationRequests', askedId)));
  }
  await assertFails(setDoc(doc(guest, 'invitationRequests', askedId), ok));

  // A super admin reads them, marks one as invited (and nothing else), and deletes one.
  await assertSucceeds(getDocs(collection(owner, 'invitationRequests')));
  await assertSucceeds(updateDoc(doc(owner, 'invitationRequests', askedId), { invited: 'ABCD-EF23', invitedAt: Date.now(), invitedBy: 'Arda' }));
  await assertFails(updateDoc(doc(owner, 'invitationRequests', askedId), { email: 'other@example.com' }));
  await assertSucceeds(deleteDoc(doc(owner, 'invitationRequests', askedId)));
  const inviteCode = { by: 'owner', maxUses: 1, uses: 0, usedBy: {} };
  const accessCode = 'GRNT-AB23';
  const plainCode = 'BASE-AB23';
  await assertSucceeds(setDoc(doc(owner, 'inviteCodes', accessCode), { ...inviteCode, email: 'sam@example.com', plan: 'teacher' }));
  // Editing the invitation changes what the original code grants when redeemed.
  await assertFails(updateDoc(doc(teacher, 'inviteCodes', accessCode), { aiAccess: true }));
  await assertSucceeds(updateDoc(doc(owner, 'inviteCodes', accessCode), { plan: 'free', aiAccess: true, teacherTrainer: true }));
  await assertSucceeds(updateDoc(doc(owner, 'inviteCodes', accessCode), { plan: 'teacher' }));
  await assertSucceeds(setDoc(doc(owner, 'inviteCodes', plainCode), inviteCode));
  await assertFails(setDoc(doc(teacher, 'inviteCodes', 'FAKE-AB23'), { ...inviteCode, by: 'teacher', aiAccess: true }));
  const redeem = (db, uid, code, grant, plan = 'teacher') => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), { role: 'teacher', code });
    batch.update(doc(db, 'inviteCodes', code), { uses: 1, [`usedBy.${uid}`]: { name: uid } });
    if (grant) {
      batch.set(doc(db, 'aiPilot', uid), { enabled: true, updatedBy: 'owner', updatedAt: serverTimestamp() });
      batch.set(doc(db, 'accounts', uid), { code, plan, teacherTrainer: true });
    }
    return batch.commit();
  };
  await assertFails(redeem(teacher, 'teacher', accessCode, true));
  await assertFails(redeem(teacher, 'teacher', plainCode, true));
  await assertSucceeds(redeem(teacher, 'teacher', plainCode, false));
  await assertFails(setDoc(doc(teacher, 'aiPilot', 'teacher'), { enabled: true, updatedBy: 'owner', updatedAt: serverTimestamp() }));
  const invitedTeacher = env.authenticatedContext('sam', { email: 'sam@example.com' }).firestore();
  await assertFails(redeem(invitedTeacher, 'sam', accessCode, true, 'school'));
  await assertSucceeds(redeem(invitedTeacher, 'sam', accessCode, true));
  const aiGrant = await assertSucceeds(getDoc(doc(invitedTeacher, 'aiPilot', 'sam')));
  const trainerGrant = await assertSucceeds(getDoc(doc(invitedTeacher, 'accounts', 'sam')));
  if (!aiGrant.data()?.enabled || !trainerGrant.data()?.teacherTrainer || trainerGrant.data()?.plan !== 'teacher') throw Error('Invitation grants were not applied.');
  console.log('Invitation request rules passed: client writes blocked; only a super admin reads, marks or deletes.');
} finally {
  await env.cleanup();
}

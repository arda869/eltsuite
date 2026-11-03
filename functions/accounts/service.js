import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
const OWNER = 'ardanurioglu@gmail.com';
const lower = value => String(value || '').trim().toLowerCase();
export async function authorizeDeletion(db, auth, target, now = Date.now()) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.proxyBy) throw new HttpsError('permission-denied', 'Leave the preview account before deleting an account.');
  const age = now / 1000 - Number(auth.token.auth_time || 0);
  if (age < 0 || age > 300) throw new HttpsError('failed-precondition', 'Sign out and sign in again before deleting an account. Nothing has been deleted.');
  const email = lower(target.email);
  if (email === OWNER || (email && (await db.doc(`superAdmins/${email}`).get()).exists)) throw new HttpsError('failed-precondition', 'Remove super-admin access before deleting this account. The site owner cannot be deleted.');
  if (auth.uid !== target.uid) {
    const caller = lower(auth.token.email);
    if (caller !== OWNER && !(auth.token.email_verified === true && caller && (await db.doc(`superAdmins/${caller}`).get()).exists)) throw new HttpsError('permission-denied', 'Only super admins can delete another account.');
  }
}
export async function requestDeletion(db, identities, auth, data) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = data?.uid || auth.uid;
  if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new HttpsError('invalid-argument', 'Choose an account.');
  const target = await identities.getUser(uid);
  await authorizeDeletion(db, auth, target);
  const profile = await db.doc(`users/${uid}`).get();
  if (profile.get('role') === 'learner') throw new HttpsError('failed-precondition', 'Remove learner accounts from their class roster.');
  if (data?.confirmation !== 'DELETE') throw new HttpsError('invalid-argument', 'Type DELETE to confirm.');
  const orgs = await db.collection('orgs').where('adminEmails', 'array-contains', lower(target.email)).get();
  if (orgs.docs.some(o => (o.get('adminEmails') || []).length <= 1)) throw new HttpsError('failed-precondition', 'Assign another organisation admin before deleting this account. Nothing has been deleted.');
  const job = db.doc(`accountDeletions/${uid}`);
  await db.runTransaction(async tx => {
    const current = await tx.get(job);
    if (current.exists && current.get('status') !== 'complete') return;
    const organisations = orgs.empty ? [] : await tx.getAll(...orgs.docs.map(o => o.ref));
    if (organisations.some(o => o.exists && (o.get('adminEmails') || []).filter(e => e !== lower(target.email)).length === 0)) throw new HttpsError('failed-precondition', 'Assign another organisation admin first. Nothing has been deleted.');
    for (const org of organisations) if (org.exists) tx.update(org.ref, { adminEmails: FieldValue.arrayRemove(lower(target.email)) });
    tx.set(job, { uid, email: target.email || '', requestedBy: auth.uid, requestedAt: FieldValue.serverTimestamp(), status: 'pending' });
    tx.set(db.doc(`accounts/${uid}`), { suspended: true, deletionRequested: true }, { merge: true });
  });
  return { accepted: true };
}
const ignoreMissing = async fn => { try { await fn(); } catch(e) { if(e.code !== 'auth/user-not-found') throw e; } };
// A lease and durable job let a scheduled retry resume partial cleanup without relying on an open tab.
export async function processDeletion(db, identities, realtime, uid) {
  const job = db.doc(`accountDeletions/${uid}`);
  const claimed = await db.runTransaction(async tx => {
    const s = await tx.get(job);
    if (!s.exists || s.get('status') === 'complete' || Number(s.get('leaseUntil') || 0) > Date.now()) return false;
    tx.update(job, { leaseUntil: Date.now() + 600000, status: 'pending' }); return true;
  });
  if (!claimed) return;
  // recursiveDelete may remove the parent before a child batch fails. Keep each
  // path durably until success, so an orphaned subtree is still discoverable.
  const purge = async ref => {
    const marker = job.collection('cleanupPaths').doc(Buffer.from(ref.path).toString('base64url'));
    await marker.set({ path: ref.path });
    await db.recursiveDelete(ref);
    await marker.delete();
  };
  try {
    await ignoreMissing(() => identities.updateUser(uid, { disabled: true }));
    await ignoreMissing(() => identities.revokeRefreshTokens(uid));
    for (const pending of (await job.collection('cleanupPaths').get()).docs) await purge(db.doc(pending.get('path')));
    const classes = await db.collection('classes').where('teacherId', '==', uid).get();
    for (const c of classes.docs) {
      for (const learner of (await c.ref.collection('learners').get()).docs) {
        const learnerUid = learner.get('authUid');
        if (learnerUid && learnerUid !== uid) {
          const p = await db.doc(`users/${learnerUid}`).get();
          // Never delete a teacher attending a training course, or an unrelated identity.
          if (p.get('role') === 'learner' && p.get('classId') === c.id) {
            await ignoreMissing(() => identities.deleteUser(learnerUid));
            await purge(p.ref);
          }
        }
      }
      for (const root of ['sessions', 'classOwners', 'classTeachers']) await realtime.ref(`${root}/${c.id}`).remove();
      if (c.get('classCode')) await db.doc(`classCodes/${c.get('classCode')}`).delete();
      await purge(c.ref);
    }
    for (const collection of ['sharedDocs', 'sharedFolders', 'videoAssets', 'classroomObservations', 'observationCoachPackets', 'linguisticsInvestigations', 'linguisticsCoachPackets', 'linguisticsEmbeds', 'shares', 'sessions']) {
      for (const item of (await db.collection(collection).where('owner', '==', uid).get()).docs) {
        if (item.get('docKey')) await realtime.ref('collab/' + item.get('docKey').replace(/[.#$[\]]/g, '_')).remove();
        await purge(item.ref);
      }
    }
    for (const collection of ['teacherSfx', 'teacherSounds', 'faces']) for (const row of (await db.collection(collection).where('by', '==', uid).get()).docs) await purge(row.ref);
    const email = lower((await job.get()).get('email'));
    for (const org of (await db.collection('orgs').get()).docs) {
      if (org.get('teachers')?.[uid] || org.get('adminEmails')?.includes(email)) {
        await org.ref.update(new FieldPath('teachers', uid), FieldValue.delete(), 'adminEmails', FieldValue.arrayRemove(email));
      }
    }
    for (const c of (await db.collection('classes').where('teacherIds', 'array-contains', uid).get()).docs) {
      await c.ref.update(new FieldPath('coTeachers', uid), FieldValue.delete(), 'teacherIds', FieldValue.arrayRemove(uid));
      await realtime.ref(`classTeachers/${c.id}/${uid}`).remove();
    }
    for (const root of ['users', 'teachingCoach', 'featureDiscovery', 'teacherProfiles', 'usage', 'aiAllowances', 'aiFeatureUsage', 'aiPilot', 'photos', 'zones']) await purge(db.doc(`${root}/${uid}`));
    for (const token of (await db.collection('pushTokens').where('key', '==', uid).get()).docs) await token.ref.delete();
    await realtime.ref(`presence/${uid}`).remove();
    await ignoreMissing(() => identities.deleteUser(uid));
    // Retain a suspension tombstone so already-issued tokens cannot reopen teacher features.
    await db.doc(`accounts/${uid}`).set({ suspended: true, deleted: true });
    await job.update({ status: 'complete', leaseUntil: 0, completedAt: FieldValue.serverTimestamp(), email: FieldValue.delete(), lastError: FieldValue.delete() });
  } catch(e) {
    await job.update({ leaseUntil: 0, lastError: 'Cleanup needs retry', lastAttemptAt: FieldValue.serverTimestamp() });
    throw e;
  }
}

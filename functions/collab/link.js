import { randomBytes, timingSafeEqual } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { syncSharedDocumentAccess } from './access.js';

const RTDB = 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app';
const token = () => randomBytes(32).toString('base64url');
export const documentLinkPolicy = org => org?.policy?.docLinks === 'org' || (!org?.policy?.docLinks && org?.outside === 'org') ? 'org' : 'anyone';
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
export const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function removeLinkVisitors(data, keep = () => false) {
  const members = { ...(data.members ?? {}) };
  const removed = new Set();
  for (const [uid, member] of Object.entries(members)) if (member?.linkOnly === true && !keep(uid)) {
    delete members[uid];
    removed.add(uid);
  }
  return { members, memberIds: (data.memberIds ?? []).filter(uid => !removed.has(uid)), removed: removed.size };
}

async function sync(db, id) {
  await syncSharedDocumentAccess(db, getDatabase(undefined, RTDB), id);
}

// The owner creates or revokes a link. A changed scope receives a fresh token, and
// access granted solely by the old link is removed before the new link is usable.
export const setSharedDocumentLink = onCall({ region: 'us-central1', maxInstances: 10 }, async req => {
  const uid = req.auth?.uid, id = req.data?.docId, mode = req.data?.mode;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!safeId(id) || !['off', 'org', 'anyone'].includes(mode)) throw new HttpsError('invalid-argument', 'Choose a document and who may use its link.');
  const db = getFirestore(), ref = db.doc(`sharedDocs/${id}`);
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('owner') !== uid || snap.get('kind') !== 'doc' || snap.get('deletedAt')) throw new HttpsError('permission-denied', 'Only the document owner can change its link.');
    const account = await tx.get(db.doc(`accounts/${uid}`));
    const orgId = account.get('org');
    const org = typeof orgId === 'string' && orgId ? await tx.get(db.doc(`orgs/${orgId}`)) : null;
    if (mode === 'org' && (!org?.exists || !org.get('teachers')?.[uid])) throw new HttpsError('failed-precondition', 'You need to belong to an organisation to use an organisation link.');
    if (mode === 'anyone' && org?.exists && documentLinkPolicy(org.data()) === 'org') throw new HttpsError('permission-denied', 'Your organisation limits document links to its teachers.');
    const current = snap.data();
    if (current.link?.mode === mode && current.link?.orgId === (orgId || null)) return current.link;
    const { members, memberIds } = removeLinkVisitors(current);
    const link = mode === 'off' ? null : { mode, token: token(), orgId: orgId || null, orgName: org?.get('name') || '', updatedAt: Date.now() };
    tx.update(ref, { link, members, memberIds });
    return link;
  });
  await sync(db, id);
  return { link: result };
});

// Possession of the unguessable URL is checked by the server, then the visitor
// receives read-only membership. The existing Firestore and Realtime rules apply.
export const openSharedDocumentLink = onCall({ region: 'us-central1', maxInstances: 20 }, async req => {
  const uid = req.auth?.uid, id = req.data?.docId, supplied = req.data?.token;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to open this document.');
  if (!safeId(id) || typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{30,100}$/.test(supplied)) throw new HttpsError('invalid-argument', 'This document link is incomplete.');
  const db = getFirestore(), ref = db.doc(`sharedDocs/${id}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('kind') !== 'doc' || snap.get('deletedAt')) throw new HttpsError('not-found', 'This document link is no longer available.');
    const data = snap.data(), link = data.link;
    if (!link || !sameToken(link.token, supplied) || !['org', 'anyone'].includes(link.mode)) throw new HttpsError('permission-denied', 'This document link is no longer available.');
    const ownerAccount = await tx.get(db.doc(`accounts/${data.owner}`));
    const ownerOrgId = ownerAccount.get('org') || null;
    if ((link.orgId || null) !== ownerOrgId) throw new HttpsError('permission-denied', 'This document link needs to be updated by its owner.');
    const org = ownerOrgId ? await tx.get(db.doc(`orgs/${ownerOrgId}`)) : null;
    if (link.mode === 'anyone' && org?.exists && documentLinkPolicy(org.data()) === 'org') throw new HttpsError('permission-denied', 'This document link is limited by its organisation.');
    if (link.mode === 'org') {
      const visitorAccount = await tx.get(db.doc(`accounts/${uid}`));
      if (!org?.exists || visitorAccount.get('org') !== ownerOrgId || !org.get('teachers')?.[uid]) throw new HttpsError('permission-denied', `Only teachers in ${link.orgName || 'this organisation'} can open this link.`);
    }
    if (data.owner === uid || data.members?.[uid]) return;
    const profile = await tx.get(db.doc(`users/${uid}`));
    if (!profile.exists || !['teacher', 'learner'].includes(profile.get('role'))) throw new HttpsError('permission-denied', 'Finish signing in to ELT Suite before opening this link.');
    const name = String(profile.get('displayName') || req.auth.token.name || req.auth.token.email || 'Link visitor').slice(0, 100);
    tx.update(ref, new FieldPath('members', uid), { role: 'view', name, kind: profile.get('role'), linkOnly: true }, 'memberIds', FieldValue.arrayUnion(uid));
  });
  await sync(db, id);
  return { opened: true };
});

// Changing an organisation's rule or removing a teacher also removes access
// previously granted through its links. Explicit person shares remain intact.
export const organisationDocumentLinksChanged = onDocumentWritten({ document: 'orgs/{orgId}', region: 'us-central1', maxInstances: 5 }, async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (after && before && documentLinkPolicy(before) === documentLinkPolicy(after) && JSON.stringify(before.teachers ?? {}) === JSON.stringify(after.teachers ?? {})) return;
  const db = getFirestore(), id = event.params.orgId;
  const docs = await db.collection('sharedDocs').where('link.orgId', '==', id).get();
  for (const row of docs.docs) {
    const changed = await db.runTransaction(async tx => {
      const snap = await tx.get(row.ref);
      if (!snap.exists) return false;
      const data = snap.data();
      if (data.link?.orgId !== id) return false;
      const limited = after && documentLinkPolicy(after) === 'org' && data.link.mode === 'anyone';
      const next = removeLinkVisitors(data, uid => !!after && !limited && (data.link.mode !== 'org' || !!after.teachers?.[uid]));
      if (!limited && !next.removed && after) return false;
      tx.update(row.ref, { members: next.members, memberIds: next.memberIds, ...(!after ? { link: null } : limited ? { link: { ...data.link, mode: 'org', token: token(), updatedAt: Date.now() } } : {}) });
      return true;
    });
    if (changed) await sync(db, row.id);
  }
});

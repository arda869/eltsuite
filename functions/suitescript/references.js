import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { suiteScriptId, validSuiteScriptId } from './id.js';

const safeKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const denied = () => new HttpsError('permission-denied', 'This item is unavailable here. Reselect it from My Files.');
const missing = () => new HttpsError('not-found', 'This item is unavailable here. Reselect it from My Files.');

function itemRef(db, uid, kind, id) {
  if (!safeKey(id) || !['archive', 'sharedDoc'].includes(kind)) throw new HttpsError('invalid-argument', 'Choose an item from My Files.');
  return kind === 'archive' ? db.doc(`users/${uid}/archive/${id}`) : db.doc(`sharedDocs/${id}`);
}
function canRead(uid, kind, item) {
  if (kind === 'archive') return true; // archive path is always this user's private path
  return item.owner === uid || item.memberIds?.includes(uid);
}
async function checkAudience(db, uid, kind, item, destination) {
  const mode = destination?.mode ?? 'private';
  if (mode === 'private') return;
  if (mode === 'class') {
    const id = destination?.classId;
    if (!safeKey(id)) throw denied();
    const snap = await db.doc(`classes/${id}`).get();
    if (!snap.exists) throw denied();
    const room = snap.data();
    if (room.teacherId !== uid && room.coTeachers?.[uid]?.role !== 'co') throw denied();
    // An archive upload must be copied into the class media collection by the
    // existing media flow. A reusable shared document must already be shared
    // with the class; an ID itself never grants class access.
    if (kind === 'sharedDoc' && !item.classes?.[id]) throw denied();
    return;
  }
  if (mode === 'message') {
    const recipients = destination?.recipientIds;
    if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100 || !recipients.every(safeKey)) throw denied();
    if (kind === 'archive' || !recipients.every(id => id === item.owner || item.memberIds?.includes(id))) throw denied();
    return;
  }
  throw denied();
}

export async function suiteScriptReferenceService(db, uid, request) {
  const action = request?.action;
  if (action === 'ensure') {
    const kind = request.kind, id = request.id;
    const ref = itemRef(db, uid, kind, id);
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = suiteScriptId();
      const registry = db.doc(`suiteScriptRefs/${candidate}`);
      const result = await db.runTransaction(async tx => {
        const [snap, reserved] = await Promise.all([tx.get(ref), tx.get(registry)]);
        if (!snap.exists || snap.get('deletedAt') || snap.get('purgeRequestedAt')) throw missing();
        const item = snap.data();
        if (!canRead(uid, kind, item)) throw denied();
        if (item.suiteScriptRef) {
          if (!validSuiteScriptId(item.suiteScriptRef)) throw new HttpsError('failed-precondition', 'This item has an invalid SuiteScript reference. Contact support.');
          const existing = await tx.get(db.doc(`suiteScriptRefs/${item.suiteScriptRef}`));
          const record = existing.data();
          if (!existing.exists || record.kind !== kind || record.sourceId !== id || record.owner !== (kind === 'archive' ? uid : item.owner)) throw new HttpsError('failed-precondition', 'This item’s SuiteScript reference is inconsistent. Contact support.');
          return { id: item.suiteScriptRef, collision: false };
        }
        if (reserved.exists) return { collision: true };
        tx.create(registry, { kind, sourceId: id, owner: kind === 'archive' ? uid : item.owner, createdAt: FieldValue.serverTimestamp() });
        tx.update(ref, { suiteScriptRef: candidate });
        return { id: candidate, collision: false };
      });
      if (!result.collision) return { id: result.id };
    }
    throw new HttpsError('resource-exhausted', 'Could not allocate a reference. Try again.');
  }
  if (action === 'resolve') {
    const id = request.id;
    if (!validSuiteScriptId(id)) throw new HttpsError('invalid-argument', 'Reference has a missing digit or invalid checksum. Reselect the item.');
    const registry = await db.doc(`suiteScriptRefs/${id}`).get();
    if (!registry.exists) throw missing();
    const record = registry.data();
    const ref = record.kind === 'archive' ? db.doc(`users/${record.owner}/archive/${record.sourceId}`) : db.doc(`sharedDocs/${record.sourceId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.get('deletedAt') || snap.get('purgeRequestedAt') || snap.get('suiteScriptRef') !== id) throw missing();
    const item = snap.data();
    if (record.kind === 'archive' ? record.owner !== uid : !canRead(uid, record.kind, item)) throw denied();
    await checkAudience(db, uid, record.kind, item, request.destination);
    return { id, kind: record.kind, sourceId: record.sourceId, owner: record.owner, itemType: item.kind ?? 'file', ...(record.kind === 'archive' ? { home: item.home ?? null, copies: item.copies ?? {} } : { docKey: item.docKey ?? '', mime: item.file?.type ?? '' }) };
  }
  throw new HttpsError('invalid-argument', 'Choose a reference action.');
}

export const suiteScriptReference = onCall({ region: 'us-central1', maxInstances: 10 }, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return suiteScriptReferenceService(getFirestore(), request.auth.uid, request.data ?? {});
});

export const indexSuiteScriptSharedDoc = onDocumentCreated({ document: 'sharedDocs/{id}', region: 'us-central1', maxInstances: 5 }, async event => {
  const item = event.data?.data();
  if (!item?.owner) return;
  await suiteScriptReferenceService(getFirestore(), item.owner, { action: 'ensure', kind: 'sharedDoc', id: event.params.id });
});

export const indexSuiteScriptArchive = onDocumentCreated({ document: 'users/{uid}/archive/{id}', region: 'us-central1', maxInstances: 5 }, async event => {
  if (!event.data?.exists) return;
  await suiteScriptReferenceService(getFirestore(), event.params.uid, { action: 'ensure', kind: 'archive', id: event.params.id });
});

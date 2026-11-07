import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const RTDB = 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app';
const safeKey = key => typeof key === 'string' && /^[A-Za-z0-9_~-]{1,150}$/.test(key);
const add = (map, uid) => { if (uid && safeKey(uid)) map[uid] = true; };
const empty = () => ({ read: {}, edit: {}, comment: {}, peer: {}, flags: {} });

function grant(access, uid, role) {
  add(access.read, uid);
  if (role === 'edit' || role === 'suggest') add(access.edit, uid);
  if (role !== 'view') add(access.comment, uid);
}

export async function sharedDocumentAccess(db, data) {
  const access = empty();
  if (!data || data.deletedAt || data.purgingAt || data.purgeRequestedAt) return access;
  grant(access, data.owner, 'edit');
  add(access.flags, data.owner);
  for (const [uid, member] of Object.entries(data.members ?? {})) {
    if (['edit', 'suggest', 'comment', 'view'].includes(member?.role)) grant(access, uid, member.role);
  }
  for (const [classId, classGrant] of Object.entries(data.classes ?? {})) {
    if (!safeKey(classId) || !['edit', 'suggest', 'comment', 'view'].includes(classGrant?.role)) continue;
    const cls = await db.doc(`classes/${classId}`).get();
    if (!cls.exists) continue;
    const c = cls.data();
    grant(access, c.teacherId, 'edit');
    for (const [uid, teacher] of Object.entries(c.coTeachers ?? {})) {
      if (teacher?.role === 'co') grant(access, uid, 'edit');
      else if (teacher?.role === 'viewer') grant(access, uid, 'view');
    }
    const members = await cls.ref.collection('members').get();
    for (const member of members.docs) grant(access, member.id, classGrant.role);
  }
  return access;
}

// Claim the document revision in the index first. A newer event can then see every key
// claimed by an older event and revoke keys that no longer belong to the document.
async function writeAccess(realtime, baseKey, entries, revision) {
  const version = revision || Date.now();
  const indexRef = realtime.ref(`collabAccessIndex/${baseKey}`);
  let previous = {};
  const claimed = await indexRef.transaction(current => {
    if (current?.version > version) return undefined;
    previous = current?.keys ?? {};
    return { keys: Object.fromEntries(Object.keys(entries).map(key => [key, true])), version };
  });
  if (claimed?.committed === false) return { skipped: true };
  const keys = new Set([...Object.keys(previous), ...Object.keys(entries)]);
  for (const key of keys) {
    const access = entries[key] ?? empty();
    await realtime.ref(`collabAccess/${key}`).transaction(current =>
      current?.version > version ? undefined : { ...access, version });
  }
  return { keys: Object.keys(entries).length };
}

export async function syncSharedDocumentAccess(db, realtime, docId, changedAt = 0) {
  const snapshot = await db.doc(`sharedDocs/${docId}`).get();
  if (!snapshot.exists) return { skipped: true };
  const data = snapshot.data();
  if (!safeKey(data.docKey)) return { skipped: true };
  const access = await sharedDocumentAccess(db, data);
  const entries = { [data.docKey]: access };
  if (!data.deletedAt && !data.purgingAt && !data.purgeRequestedAt) {
    for (const classId of Object.keys(data.classes ?? {})) {
      if (!safeKey(classId)) continue;
      const registry = await db.doc(`classes/${classId}/collabs/${data.docKey}`).get();
      if (!registry.exists) continue;
      const inline = await inlineDocumentAccess(db, classId, { ...registry.data(), docKey: data.docKey });
      for (const [key, grants] of Object.entries(inline)) {
        if (!entries[key]) entries[key] = grants;
        else for (const capability of Object.keys(access)) Object.assign(entries[key][capability], grants[capability] ?? {});
      }
    }
  }
  return writeAccess(realtime, data.docKey, entries, Math.max(changedAt, snapshot.updateTime?.toMillis?.() ?? 0));
}

const teacherIds = c => [c.teacherId, ...Object.entries(c.coTeachers ?? {}).filter(([, t]) => t?.role === 'co').map(([uid]) => uid)].filter(Boolean);
const withTeachers = (access, teachers) => { for (const uid of teachers) { grant(access, uid, 'edit'); add(access.flags, uid); } return access; };
const memberId = member => member.get('learnerId') || member.id;

export async function inlineDocumentAccess(db, classId, registry) {
  const cls = await db.doc(`classes/${classId}`).get();
  if (!cls.exists || !registry) return {};
  const c = cls.data();
  const teachers = teacherIds(c);
  const members = (await cls.ref.collection('members').get()).docs;
  const sets = (await cls.ref.collection('groupSets').orderBy('createdAt').get()).docs;
  const set = sets.find(s => s.id === registry.groupSet) ?? sets[0];
  const groups = set?.get('groups') ?? [];
  const base = registry.docKey;
  if (!safeKey(base)) return {};
  const modes = Array.isArray(registry.modes) ? registry.modes : ['edit'];
  const learnerRole = modes.includes('edit') ? 'edit' : modes.includes('suggest') ? 'suggest' : modes.includes('comment') ? 'comment' : 'view';
  const access = withTeachers(empty(), teachers);
  const entries = { [base]: access };
  const template = withTeachers(empty(), teachers);
  entries[`${base}~t`] = template;
  for (const uid of teachers) entries[`${base}~p${uid}`] = withTeachers(empty(), [uid]);
  if (registry.scope === 'class') {
    for (const member of members) grant(access, member.id, learnerRole);
  } else if (registry.scope === 'group') {
    const assigned = new Set();
    for (const group of groups) {
      if (!safeKey(group.id)) continue;
      const groupAccess = withTeachers(empty(), teachers);
      for (const member of members) if ((group.members ?? []).includes(memberId(member))) {
        grant(groupAccess, member.id, learnerRole);
        assigned.add(member.id);
      }
      entries[`${base}~g${group.id}`] = groupAccess;
    }
    for (const member of members) if (!assigned.has(member.id)) {
      const key = `${base}~l${memberId(member)}`;
      if (safeKey(key)) entries[key] = withTeachers(empty(), teachers);
      if (entries[key]) grant(entries[key], member.id, learnerRole);
    }
  } else if (registry.scope === 'solo') {
    for (const member of members) {
      const id = memberId(member);
      const key = `${base}~l${id}`;
      if (!safeKey(key)) continue;
      const own = withTeachers(empty(), teachers);
      grant(own, member.id, learnerRole);
      add(own.flags, member.id);
      const group = groups.find(g => (g.members ?? []).includes(id));
      for (const peer of members) {
        if (peer.id !== member.id && (group?.members ?? []).includes(memberId(peer))) add(own.peer, peer.id);
      }
      entries[key] = own;
    }
  }
  return entries;
}

export async function syncInlineDocumentAccess(db, realtime, classId, baseKey, changedAt = 0) {
  if (!safeKey(classId) || !safeKey(baseKey)) return { skipped: true };
  const snap = await db.doc(`classes/${classId}/collabs/${baseKey}`).get();
  const registry = snap.exists ? { ...snap.data(), docKey: baseKey } : null;
  if (registry?.fileDoc) return syncSharedDocumentAccess(db, realtime, registry.fileDoc, changedAt);
  const linked = await db.collection('sharedDocs').where('docKey', '==', baseKey).limit(1).get();
  if (!linked.empty) return syncSharedDocumentAccess(db, realtime, linked.docs[0].id, changedAt);
  const entries = await inlineDocumentAccess(db, classId, registry);
  return writeAccess(realtime, baseKey, entries, Math.max(changedAt, snap.updateTime?.toMillis?.() ?? 0));
}

export async function refreshClassDocumentAccess(db, realtime, classId, changedAt = 0) {
  const cls = await db.doc(`classes/${classId}`).get();
  const registry = await cls.ref.collection('collabs').get();
  for (const entry of registry.docs) await syncInlineDocumentAccess(db, realtime, classId, entry.id, changedAt);
  const shared = await db.collection('sharedDocs').where(`classes.${classId}.role`, 'in', ['edit', 'suggest', 'comment', 'view']).get();
  for (const file of shared.docs) await syncSharedDocumentAccess(db, realtime, file.id, changedAt);
}

export const sharedDocumentAccessChanged = onDocumentWritten({ document: 'sharedDocs/{docId}', region: 'us-central1', maxInstances: 10, retry: true }, async event => {
  const beforeKey = event.data?.before.get('docKey');
  const afterKey = event.data?.after.get('docKey');
  const db = getFirestore(), realtime = getDatabase(undefined, RTDB);
  const changedAt = Date.parse(event.time ?? '') || Date.now();
  if (safeKey(beforeKey) && beforeKey !== afterKey) await writeAccess(realtime, beforeKey, {}, changedAt);
  if (event.data?.after.exists) await syncSharedDocumentAccess(db, realtime, event.params.docId, changedAt);
});

export const inlineDocumentAccessChanged = onDocumentWritten({ document: 'classes/{classId}/collabs/{baseKey}', region: 'us-central1', maxInstances: 10, retry: true }, event =>
  syncInlineDocumentAccess(getFirestore(), getDatabase(undefined, RTDB), event.params.classId, event.params.baseKey, Date.parse(event.time ?? '') || Date.now()));

export const sharedClassMemberAccessChanged = onDocumentWritten({ document: 'classes/{classId}/members/{uid}', region: 'us-central1', maxInstances: 10, retry: true }, event =>
  refreshClassDocumentAccess(getFirestore(), getDatabase(undefined, RTDB), event.params.classId, Date.parse(event.time ?? '') || Date.now()));

export const sharedClassGroupsChanged = onDocumentWritten({ document: 'classes/{classId}/groupSets/{setId}', region: 'us-central1', maxInstances: 10, retry: true }, event =>
  refreshClassDocumentAccess(getFirestore(), getDatabase(undefined, RTDB), event.params.classId, Date.parse(event.time ?? '') || Date.now()));

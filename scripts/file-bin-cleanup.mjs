// Shared by scheduled storage accounting and tests. Metadata remains until all payloads are gone.
export const BIN_RETENTION_MS = 30 * 864e5;
export const dueForPurge = (data, now = Date.now()) => Number.isFinite(data.deletedAt) && data.deletedAt > 0 && (data.deletedAt <= now - BIN_RETENTION_MS || (Number.isFinite(data.purgeRequestedAt) && data.purgeRequestedAt > 0));
export async function purgeFileBin(db, rtdb, now = Date.now()) {
  let removed = 0;
  const claim = (ref) => db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || !dueForPurge(s.data(), now)) return null;
    tx.update(ref, { purgingAt: now });
    return s.data();
  });
  const purge = async (row, media = false) => {
    const data = await claim(row.ref);
    if (!data) return;
    try {
      if (media) {
        const places = new Map(Object.entries(data.copies || {}));
        if (data.home) places.set(data.home.classId, data.home.mediaId);
        for (const [space, id] of places) {
          const head = space.startsWith('user:') ? db.collection('users').doc(space.slice(5)).collection('media').doc(id) : db.collection('classes').doc(space).collection('media').doc(id);
          const m = await head.get();
          const parts = Number(m.data()?.parts) || 0;
          for (let k = 0; k < parts; k++) await head.parent.doc(`${id}_p${k}`).delete();
          await head.delete();
        }
      } else if (data.docKey) {
        await rtdb.ref('collab/' + data.docKey.replace(/[.#$[\]]/g, '_')).remove();
      }
      await db.recursiveDelete(row.ref);
      removed++;
    } catch (e) {
      // Keep the tombstone and payload metadata so the next scheduled run can retry.
      console.error(`Recycle bin cleanup failed for ${row.ref.path}: ${e.message}`);
      throw e;
    }
  };
  const failures = [];
  const attempt = async (row, media = false) => { try { await purge(row, media); } catch (e) { failures.push(e); } };
  const docs = await db.collection('sharedDocs').where('deletedAt', '>', 0).get();
  for (const row of docs.docs) if (dueForPurge(row.data(), now)) await attempt(row);
  for (const user of (await db.collection('users').select().get()).docs) {
    const items = await user.ref.collection('archive').where('deletedAt', '>', 0).get();
    for (const row of items.docs) if (dueForPurge(row.data(), now)) await attempt(row, true);
  }
  if (failures.length) throw new Error(`Recycle bin cleanup left ${failures.length} files for retry: ${failures[0].message}`);
  return removed;
}

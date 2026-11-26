// Dry run by default. After deploying the functions, run with --apply to give
// existing active My Files items permanent SuiteScript IDs. Resumable/idempotent.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { suiteScriptReferenceService } from '../suitescript/references.js';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const apply = process.argv.includes('--apply');
const counts = { scanned: 0, assigned: 0, existing: 0, skipped: 0, errors: 0 };

async function visit(query, kind, ownerOf) {
  let cursor;
  for (;;) {
    let page = query.orderBy('__name__').limit(100);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) break;
    for (const item of snap.docs) {
      counts.scanned++;
      const data = item.data();
      const owner = ownerOf(item, data);
      if (!owner || data.deletedAt || data.purgeRequestedAt || data.purgingAt) { counts.skipped++; continue; }
      if (data.suiteScriptRef) { counts.existing++; continue; }
      if (!apply) { counts.assigned++; continue; }
      try { await suiteScriptReferenceService(db, owner, { action: 'ensure', kind, id: item.id }); counts.assigned++; }
      catch (error) { counts.errors++; console.error(kind, item.ref.path, error?.code ?? error?.message); }
    }
    cursor = snap.docs.at(-1);
    if (snap.size < 100) break;
  }
}

await visit(db.collection('sharedDocs'), 'sharedDoc', (_item, data) => data.owner);
await visit(db.collectionGroup('archive'), 'archive', item => item.ref.parent.parent?.parent?.id === 'users' ? item.ref.parent.parent.id : null);
console.log(JSON.stringify({ dryRun: !apply, ...counts }));
if (counts.errors) process.exitCode = 1;

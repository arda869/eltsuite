// Removes Slides and Storyboards from ELT Suite's data, now that the apps are gone.
//
//   node scripts/remove-slides-storyboards.mjs            what it would delete (changes nothing)
//   node scripts/remove-slides-storyboards.mjs --confirm  deletes it. This can't be undone.
//
// It deletes:
// - Slides files and storyboards in My Files (sharedDocs of kind slides or storyboard, and Designer
//   files that are storyboards), with everything under them and their live text (collab/ in the
//   Realtime Database).
// - Shared slides and storyboards inside lessons: the element is taken out of each task, and the
//   class's slides (classes/{id}/collabs of kind slides) with their live text, for every group and
//   learner.
// - Shares of slides between colleagues (shares whose src.docKind is slides).
// Run it with the deploy key (GOOGLE_APPLICATION_CREDENTIALS), like the other scripts. The space
// each teacher uses is recounted by scripts/space.mjs on its next run.
import { createRequire } from 'node:module';
const deps = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = deps('firebase-admin/app');
const { getFirestore } = deps('firebase-admin/firestore');
const { getDatabase } = deps('firebase-admin/database');

const CONFIRM = process.argv.includes('--confirm');
const SUMMARY_ONLY = process.env.CLEANUP_SUMMARY_ONLY === '1';
initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit', databaseURL: 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app' });
const db = getFirestore();
const rtdb = getDatabase();
const safeKey = (k) => String(k).replace(/[.#$[\]]/g, '_');
const tally = { files: 0, lessonsChanged: 0, elements: 0, classDecks: 0, liveTexts: 0, shares: 0 };

// Every live text for a document key: the key itself and its versions per group, learner,
// preview and template (key~g…, key~l…, key~p…, key~t).
async function removeLive(docKey) {
  if (!docKey) return;
  const base = safeKey(docKey);
  const snap = await rtdb.ref('collab').orderByKey().startAt(base).endAt(base + '').once('value');
  const keys = Object.keys(snap.val() ?? {}).filter((k) => k === base || k.startsWith(base + '~'));
  tally.liveTexts += keys.length;
  if (CONFIRM) for (const k of keys) await rtdb.ref('collab/' + k).remove();
}

// 1. Files.
const fileQueries = [
  db.collection('sharedDocs').where('kind', '==', 'slides').get(),
  db.collection('sharedDocs').where('kind', '==', 'storyboard').get(),
  db.collection('sharedDocs').where('designType', '==', 'storyboard').get(),
];
const files = new Map();
for (const q of await Promise.all(fileQueries)) for (const d of q.docs) files.set(d.id, d);
for (const d of files.values()) {
  tally.files++;
  if (!SUMMARY_ONLY) console.log(`file  ${d.id}  ${d.get('kind')}${d.get('designType') ? '/' + d.get('designType') : ''}  “${d.get('title') ?? ''}”  owner ${d.get('owner')}`);
  await removeLive(d.get('docKey'));
  if (CONFIRM) await db.recursiveDelete(d.ref);
}

// 2. Inside lessons: take the elements out of each task's content.
const drop = (n) => n?.type === 'storyboard' || (n?.type === 'collab' && n.attrs?.kind === 'slides');
function strip(node, found) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return node;
  const kept = [];
  for (const c of node.content) {
    if (drop(c)) { found.push(c); continue; }
    kept.push(strip(c, found));
  }
  return { ...node, content: kept.length ? kept : node.type === 'doc' ? [{ type: 'paragraph' }] : kept };
}
const classes = await db.collection('classes').select().get();
for (const c of classes.docs) {
  const items = await c.ref.collection('items').select().get();
  for (const it of items.docs) {
    const tasks = await it.ref.collection('tasks').get();
    for (const t of tasks.docs) {
      const content = t.get('content');
      if (!content) continue;
      const found = [];
      const next = strip(content, found);
      if (!found.length) continue;
      tally.lessonsChanged++;
      tally.elements += found.length;
      if (!SUMMARY_ONLY) console.log(`lesson  classes/${c.id}/items/${it.id}/tasks/${t.id}  ${found.length} element(s)`);
      for (const n of found) if (n.type === 'collab') await removeLive(n.attrs?.docKey);
      if (CONFIRM) await t.ref.update({ content: next });
    }
  }
  const decks = await c.ref.collection('collabs').where('kind', '==', 'slides').get();
  for (const d of decks.docs) {
    tally.classDecks++;
    await removeLive(d.id);
    if (CONFIRM) await d.ref.delete();
  }
}

// 3. Shares of slides between colleagues.
const shares = await db.collection('shares').where('src.docKind', '==', 'slides').get();
for (const s of shares.docs) {
  tally.shares++;
  if (CONFIRM) await db.recursiveDelete(s.ref);
}

console.log(`\n${CONFIRM ? 'Deleted' : 'Would delete'}: ${tally.files} files, ${tally.elements} elements in ${tally.lessonsChanged} tasks, ${tally.classDecks} class decks, ${tally.liveTexts} live texts, ${tally.shares} shares.`);
if (!CONFIRM) console.log('Nothing was changed. Run again with --confirm to delete. This can’t be undone.');

// Support tickets, for the person (or Claude) working on them. Runs from GitHub Actions
// (.github/workflows/tickets.yml) with the deploy key.
//
//   node tickets.mjs export <dir>                 every ticket not done yet, screenshots and all, as
//                                                 files: <dir>/README.md lists them, <dir>/<id>/ holds one
//   node tickets.mjs answer <id> <status> <text>  adds an answer from "ELT Suite support" and, when
//                                                 <status> is open, doing or done, moves the ticket there
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const [mode, ...args] = process.argv.slice(2);
const STATUS = { open: 'Open', doing: 'Being worked on', done: 'Done' };
const KIND = { bug: 'Something is wrong', change: 'A change or new idea', question: 'A question' };
const URGENCY = { low: 'When there is time', normal: 'Soon', urgent: 'Urgent' };
const when = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');

if (mode === 'answer') {
  const [id, status, ...words] = args;
  const text = words.join(' ').trim();
  const ref = db.collection('tickets').doc(id ?? '');
  const t = await ref.get();
  if (!id || !t.exists) {
    console.error(`::error::No ticket ${id}`);
    process.exit(1);
  }
  const move = STATUS[status] && status !== t.data().status ? status : undefined;
  if (!text && !move) {
    console.log('Nothing to say and nothing to move.');
    process.exit(0);
  }
  const at = Date.now();
  await ref.collection('notes').doc(`${at}-support`).set({ by: 'support', byName: 'ELT Suite support', text, at, ...(move ? { status: move } : {}) });
  await ref.update({ notes: FieldValue.increment(1), updatedAt: at, ...(move ? { status: move } : {}) });
  console.log(`Answered ${id}${move ? `, now ${STATUS[move]}` : ''}.`);
  process.exit(0);
}

if (mode !== 'export' || !args[0]) {
  console.error('Use: node tickets.mjs export <dir> | answer <id> <status> <text>');
  process.exit(1);
}
const out = args[0];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const all = (await db.collection('tickets').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const live = all.filter((t) => t.status !== 'done').sort((a, b) => (a.urgency === 'urgent') - (b.urgency === 'urgent') || a.at - b.at).reverse();
const done = all.filter((t) => t.status === 'done').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);

const ext = (data) => (data.startsWith('data:image/png') ? 'png' : data.startsWith('data:image/webp') ? 'webp' : 'jpg');
const saveShot = (dir, name, data) => {
  const file = `${name}.${ext(data)}`;
  writeFileSync(join(dir, file), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  return file;
};

for (const t of live) {
  const dir = join(out, t.id);
  mkdirSync(dir, { recursive: true });
  const [shots, notes] = await Promise.all([t.shots ? db.collection('tickets').doc(t.id).collection('shots').get() : null, db.collection('tickets').doc(t.id).collection('notes').get()]);
  const pics = (shots?.docs ?? []).map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at);
  const said = notes.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at);
  let n = 0;
  const shotLines = (noteId) =>
    pics
      .filter((p) => (p.note ?? null) === noteId)
      .map((p) => `![Screenshot ${++n}](${saveShot(dir, `shot-${String(n).padStart(2, '0')}`, p.data)})`)
      .join('\n\n');
  const md = [
    `# ${t.title}`,
    '',
    `- **Ticket:** ${t.id}`,
    `- **Status:** ${STATUS[t.status] ?? t.status}`,
    `- **Kind:** ${KIND[t.kind] ?? t.kind ?? ''}`,
    `- **How soon:** ${URGENCY[t.urgency] ?? t.urgency ?? ''}`,
    `- **Where:** ${t.where || 'Not said'}`,
    `- **From:** ${t.byName} <${t.byEmail ?? ''}>${t.orgName ? `, ${t.orgName}` : ''}`,
    `- **Opened:** ${when(t.at)}`,
    '',
    '## What they wrote',
    '',
    t.body || '_(nothing written: see the screenshots)_',
    '',
    shotLines(null),
    '',
    '## Conversation',
    '',
    ...(said.length
      ? said.map((x) => [`### ${x.byName}, ${when(x.at)}${x.status ? ` (moved to ${STATUS[x.status]})` : ''}`, '', x.text || '', '', shotLines(x.id), ''].join('\n'))
      : ['_No answers yet._']),
  ].join('\n');
  writeFileSync(join(dir, 'ticket.md'), md.replace(/\n{3,}/g, '\n\n') + '\n');
}

const row = (t, link) => `| ${link ? `[${t.id}](${t.id}/ticket.md)` : t.id} | ${String(t.title).replace(/\|/g, '/')} | ${STATUS[t.status] ?? t.status} | ${URGENCY[t.urgency] ?? ''} | ${t.byName}${t.orgName ? `, ${t.orgName}` : ''} | ${t.shots ?? 0} | ${when(t.updatedAt)} |`;
const head = '| Ticket | Title | Status | How soon | From | Screenshots | Updated |\n|---|---|---|---|---|---|---|';
writeFileSync(
  join(out, 'README.md'),
  [
    '# Support tickets',
    '',
    'Copied from ELT Suite by scripts/tickets.mjs. Each ticket not done yet has a folder with ticket.md and its screenshots.',
    'To answer one, run the "Support tickets" workflow with the ticket id, a status and a note.',
    '',
    `## Not done yet (${live.length})`,
    '',
    live.length ? head + '\n' + live.map((t) => row(t, true)).join('\n') : '_None._',
    '',
    `## Done lately (${done.length})`,
    '',
    done.length ? head + '\n' + done.map((t) => row(t, false)).join('\n') : '_None._',
    '',
  ].join('\n'),
);
console.log(`${live.length} tickets not done yet, ${done.length} done lately.`);

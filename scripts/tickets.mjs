// Support tickets and conversations with Claude, for Claude's scheduled run (see CLAUDE.md), which
// copies them into the "ELT Suite support" Google Sheet and Drive folder and works on them. Runs from
// GitHub Actions (.github/workflows/tickets.yml) with the deploy key.
//
//   node tickets.mjs export <dir>                 tickets not done yet (and the last 30 done) and the
//                                                 conversations with Claude, screenshots and all:
//                                                 <dir>/index.json for Claude, <dir>/README.md for people,
//                                                 <dir>/<ticket id>/ and <dir>/threads/<id>/ with the files
//   node tickets.mjs answer <id> <status> <text>  adds an answer from "ELT Suite support" to a ticket and,
//                                                 when <status> is open, doing or done, moves it there
//   node tickets.mjs reply <thread> <pr> <text>   Claude's answer in a conversation (Super Admin → Claude),
//                                                 with the pull request, if any
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

if (mode === 'reply') {
  const [id, pr, ...words] = args;
  const text = words.join(' ').trim();
  const ref = db.collection('claudeThreads').doc(id ?? '');
  if (!id || !text || !(await ref.get()).exists) {
    console.error(`::error::No conversation ${id}, or nothing to say`);
    process.exit(1);
  }
  const at = Date.now();
  await ref.collection('messages').doc(`${at}-claude`).set({ role: 'claude', by: 'claude', byName: 'Claude', text: text.slice(0, 20000), at });
  await ref.update({ state: 'answered', seen: false, updatedAt: at, ...(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(pr ?? '') ? { pr } : {}) });
  console.log(`Answered conversation ${id}.`);
  process.exit(0);
}

if (mode !== 'export' || !args[0]) {
  console.error('Use: node tickets.mjs export <dir> | answer <id> <status> <text> | reply <thread> <pr> <text>');
  process.exit(1);
}
const out = args[0];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const ext = (data) => (data.startsWith('data:image/png') ? 'png' : data.startsWith('data:image/webp') ? 'webp' : 'jpg');
const saveShot = (dir, name, data) => {
  mkdirSync(dir, { recursive: true });
  const file = `${name}.${ext(data)}`;
  writeFileSync(join(dir, file), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  return file;
};
const sub = async (ref, name) => (await ref.collection(name).get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.at - b.at);

// ------------------------------------------------------------------ tickets
const all = (await db.collection('tickets').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const live = all.filter((t) => t.status !== 'done').sort((a, b) => (a.urgency === 'urgent') - (b.urgency === 'urgent') || a.at - b.at).reverse();
const done = all.filter((t) => t.status === 'done').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
const index = { exportedAt: Date.now(), tickets: [], threads: [] };

for (const t of [...live, ...done]) {
  const isLive = t.status !== 'done';
  const dir = join(out, t.id);
  const ref = db.collection('tickets').doc(t.id);
  const [pics, said] = isLive ? await Promise.all([t.shots ? sub(ref, 'shots') : [], sub(ref, 'notes')]) : [[], []];
  let n = 0;
  const files = [];
  const shotLines = (noteId) =>
    pics
      .filter((p) => (p.note ?? null) === noteId)
      .map((p) => {
        const f = saveShot(dir, `shot-${String(++n).padStart(2, '0')}`, p.data);
        files.push(`${t.id}/${f}`);
        return `![Screenshot ${n}](${f})`;
      })
      .join('\n\n');
  if (isLive) {
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
      ...(t.escalated ? [`- **Handed to Claude:** by ${t.escalated.byName}, ${when(t.escalated.at)} (conversation ${t.escalated.thread})`] : []),
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
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ticket.md'), md.replace(/\n{3,}/g, '\n\n') + '\n');
  }
  index.tickets.push({
    id: t.id,
    title: t.title,
    status: t.status,
    kind: KIND[t.kind] ?? t.kind ?? '',
    urgency: URGENCY[t.urgency] ?? t.urgency ?? '',
    where: t.where || '',
    from: t.byName,
    fromEmail: t.byEmail ?? '',
    org: t.orgName ?? '',
    opened: when(t.at),
    updated: when(t.updatedAt),
    updatedAt: t.updatedAt ?? t.at,
    body: t.body ?? '',
    answers: said.length,
    lastAnswer: said.length ? `${said[said.length - 1].byName}: ${said[said.length - 1].text ?? ''}`.slice(0, 500) : '',
    claudeThread: t.escalated?.thread ?? '',
    file: isLive ? `${t.id}/ticket.md` : '',
    screenshots: files,
  });
}

// ------------------------------------------------------------------ conversations with Claude
const threads = (await db.collection('claudeThreads').get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
for (const th of threads) {
  const ref = db.collection('claudeThreads').doc(th.id);
  const [msgs, pics] = await Promise.all([sub(ref, 'messages'), sub(ref, 'shots')]);
  const dir = join(out, 'threads', th.id);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const files = [];
  const lines = [`# ${th.title}`, '', `Conversation ${th.id}, started by ${th.byName}, ${when(th.at)}.${th.ticket ? ` About support ticket ${th.ticket}.` : ''}${th.pr ? ` Pull request: ${th.pr}` : ''}`, ''];
  for (const m of msgs) {
    lines.push(`## ${m.role === 'claude' ? 'Claude' : `${m.byName} (super admin)`}, ${when(m.at)}`, '', m.text || '', '');
    for (const s of pics.filter((x) => x.msg === m.id)) {
      const f = saveShot(dir, `shot-${String(++n).padStart(2, '0')}`, s.data);
      files.push(`threads/${th.id}/${f}`);
      lines.push(`![Screenshot](${f})`, '');
    }
  }
  writeFileSync(join(dir, 'thread.md'), lines.join('\n'));
  const last = msgs[msgs.length - 1];
  index.threads.push({
    id: th.id,
    title: th.title,
    from: th.byName,
    ticket: th.ticket ?? '',
    // waiting: the last word is a super admin's, and Claude has not answered it yet
    waiting: th.state === 'waiting' || th.state === 'working' || (!!last && last.role !== 'claude'),
    started: when(th.at),
    updated: when(th.updatedAt),
    updatedAt: th.updatedAt,
    pr: th.pr ?? '',
    lastMessage: last ? `${last.role === 'claude' ? 'Claude' : last.byName}: ${last.text ?? ''}`.slice(0, 500) : '',
    file: `threads/${th.id}/thread.md`,
    screenshots: files,
  });
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));

const row = (t, link) => `| ${link ? `[${t.id}](${t.id}/ticket.md)` : t.id} | ${String(t.title).replace(/\|/g, '/')} | ${STATUS[t.status] ?? t.status} | ${URGENCY[t.urgency] ?? ''} | ${t.byName}${t.orgName ? `, ${t.orgName}` : ''} | ${t.shots ?? 0} | ${when(t.updatedAt)} |`;
const head = '| Ticket | Title | Status | How soon | From | Screenshots | Updated |\n|---|---|---|---|---|---|---|';
const waiting = index.threads.filter((t) => t.waiting);
writeFileSync(
  join(out, 'README.md'),
  [
    '# Support tickets and conversations with Claude',
    '',
    'Copied from ELT Suite by scripts/tickets.mjs. index.json has everything below for Claude; each ticket not done yet has a folder with ticket.md and its screenshots, and each conversation a folder under threads/.',
    '',
    `## Tickets not done yet (${live.length})`,
    '',
    live.length ? head + '\n' + live.map((t) => row(t, true)).join('\n') : '_None._',
    '',
    `## Tickets done lately (${done.length})`,
    '',
    done.length ? head + '\n' + done.map((t) => row(t, false)).join('\n') : '_None._',
    '',
    `## Conversations waiting for Claude (${waiting.length})`,
    '',
    waiting.length ? waiting.map((t) => `- [${t.title}](${t.file}) from ${t.from}, ${t.updated}`).join('\n') : '_None._',
    '',
  ].join('\n'),
);
console.log(`${live.length} tickets not done yet, ${done.length} done lately, ${waiting.length} conversations waiting for Claude.`);

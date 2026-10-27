// Email for classes (runs every 15 minutes with the other notifications):
// 1. Announcements a teacher also sends by email go to the learners who added an email.
// 2. Replies to those emails (when IMAP_URL is set) arrive in the app as messages to the teacher.
// 3. When the teacher answers in the app, the learner gets the answer by email.
// Needs: GOOGLE_APPLICATION_CREDENTIALS, SMTP_URL, MAIL_FROM. For replies: IMAP_URL (the mailbox
// replies go to, imaps://user:password@host:993) and MAIL_REPLY (that mailbox's address).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

const SMTP = process.env.SMTP_URL;
if (!SMTP) {
  console.log('No SMTP_URL secret: class emails are off until it is added.');
  process.exit(0);
}
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
const REPLY = process.env.MAIL_REPLY || '';
const IMAP = process.env.IMAP_URL || '';
const SITE = 'https://eltsuite.com';
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const mail = nodemailer.createTransport(SMTP);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const now = Date.now();

// ------------------------------------------------------------------ the email body from the editor

function inline(nodes = []) {
  return nodes
    .map((n) => {
      if (n.type === 'text') {
        let t = esc(n.text);
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') t = `<b>${t}</b>`;
          else if (m.type === 'italic') t = `<i>${t}</i>`;
          else if (m.type === 'underline') t = `<u>${t}</u>`;
          else if (m.type === 'strike') t = `<s>${t}</s>`;
          else if (m.type === 'highlight') t = `<span style="background:${esc(m.attrs?.color || '#fff3a8')}">${t}</span>`;
          else if (m.type === 'textStyle' && m.attrs?.color) t = `<span style="color:${esc(m.attrs.color)}">${t}</span>`;
          else if (m.type === 'link' && /^https?:/.test(m.attrs?.href ?? '')) t = `<a href="${esc(m.attrs.href)}" style="color:#b8744e">${t}</a>`;
          // Pronunciation marks, as near as email allows.
          else if (m.type === 'sstress') t = m.attrs?.l === 'weak' ? `<span style="font-size:.85em;opacity:.7">${t}</span>` : m.attrs?.l === 'main' ? `<b style="font-size:1.25em;text-transform:uppercase;color:#b8744e">${t}</b>` : `<b style="text-transform:uppercase">${t}</b>`;
          else if (m.type === 'inton') t = `${t}<sup style="color:#b8744e">${{ rise: '↗', fall: '↘', fallrise: '↘↗', risefall: '↗↘', level: '→' }[m.attrs?.t] ?? ''}</sup>`;
          else if (m.type === 'speechSound') t = m.attrs?.k === 'drop' ? `<s style="opacity:.6">${t}</s>` : m.attrs?.k === 'schwa' ? `${t}<sup style="color:#b8744e">ə</sup>` : `<s>${t}</s><sup style="color:#b8744e">/${esc(m.attrs?.to ?? '')}/</sup>`;
          else if (m.type === 'glabel') t = `<span style="background:#f6ece5;border-radius:3px;padding:0 2px">${t}</span><sup style="color:#b8744e;font-weight:700"> ${esc(m.attrs?.text ?? '')}</sup>`;
        }
        return t;
      }
      const a = n.attrs ?? {};
      if (n.type === 'hardBreak') return '<br>';
      if (n.type === 'ipa') return `<span style="font-family:'Doulos SIL','Charis SIL','Lucida Sans Unicode',Arial,sans-serif;color:#6b5a4e">${a.showAccent ? `<small>${a.accent === 'GA' ? 'US' : 'UK'}</small> ` : ''}/${esc(a.text)}/</span>`;
      if (n.type === 'stress') {
        const syl = Array.isArray(a.syllables) ? a.syllables : [];
        return syl
          .map((s, i) => (i === Number(a.stressed) ? (a.style === 'bold' ? `<b>${esc(s)}</b>` : a.style === 'big' ? `<b style="font-size:1.2em">${esc(s.toUpperCase())}</b>` : `<span style="border:1.5px solid #2b2a28;border-radius:3px;padding:0 2px">${esc(s)}</span>`) : esc(s)))
          .join(a.style === 'box' ? '' : '·');
      }
      if (n.type === 'phonChart') return '<i style="color:#8a847d">[the phonemic chart, in ELT Suite]</i>';
      if (n.type === 'phonCard') return '<i style="color:#8a847d">[a sound card, in ELT Suite]</i>';
      if (n.type === 'plink') return `<span style="color:#b8744e">${a.k === 'pause' ? ' | ' : a.k === 'stop' ? ' || ' : ['j', 'w', 'r'].includes(a.k) ? `‿/${a.k}/‿` : '‿'}</span>`;
      if (n.type === 'subst') return `<span style="display:inline-block;vertical-align:middle;border-left:2px solid #b8744e;border-right:2px solid #b8744e;padding:0 8px;line-height:1.3">${(a.options ?? []).map(esc).join('<br>')}</span>`;
      if (n.type === 'mention') return `<b>@${esc(a.label ?? a.id ?? '')}</b>`;
      if (n.type === 'icon' || n.type === 'sym') return esc(a.text ?? '');
      return inline(n.content);
    })
    .join('');
}
function block(n) {
  const kids = (n.content ?? []).map(block).join('');
  switch (n.type) {
    case 'doc':
      return kids;
    case 'paragraph':
      return `<p style="margin:0 0 12px;font:15px/1.6 Georgia,serif;color:#2b2a28">${inline(n.content) || '&nbsp;'}</p>`;
    case 'heading':
      return `<h3 style="margin:18px 0 8px;font:600 18px Georgia,serif;color:#2b2a28">${inline(n.content)}</h3>`;
    case 'bulletList':
      return `<ul style="margin:0 0 12px;padding-left:22px">${kids}</ul>`;
    case 'orderedList':
      return `<ol style="margin:0 0 12px;padding-left:22px">${kids}</ol>`;
    case 'listItem':
      return `<li style="font:15px/1.6 Georgia,serif;color:#2b2a28">${(n.content ?? []).map((c) => (c.type === 'paragraph' ? inline(c.content) : block(c))).join('')}</li>`;
    case 'blockquote':
      return `<blockquote style="margin:0 0 12px;padding:2px 14px;border-left:3px solid #d9b59f;color:#5d5852">${kids}</blockquote>`;
    case 'textBox':
      return `<div style="margin:0 0 12px;padding:12px 16px;border-radius:10px;background:#f4efe9">${kids}</div>`;
    case 'table':
      return `<table style="border-collapse:collapse;margin:0 0 12px">${kids}</table>`;
    case 'tableRow':
      return `<tr>${kids}</tr>`;
    case 'tableCell':
    case 'tableHeader':
      return `<td style="border:1px solid #ddd5cc;padding:6px 10px;font:14px Arial,sans-serif">${(n.content ?? []).map((c) => (c.type === 'paragraph' ? inline(c.content) : block(c))).join('')}</td>`;
    case 'dialogue':
      return `<div style="margin:0 0 12px">${kids}</div>`;
    case 'dialogueLine':
      return `<p style="margin:0 0 6px;font:15px/1.6 Georgia,serif"><b style="font-family:Arial,sans-serif">${esc(n.attrs?.who ?? '')}</b> ${inline(n.content)}</p>`;
    case 'horizontalRule':
      return '<hr style="border:0;border-top:1px solid #e5ded6;margin:16px 0">';
    default:
      return kids;
  }
}
const frame = (title, inner, foot) => `<div style="max-width:600px;margin:0 auto;padding:26px 24px;font-family:Arial,sans-serif;color:#2b2a28;background:#fffdfb">
  <div style="font:600 14px Georgia,serif;color:#b8744e;margin-bottom:14px">ELT Suite</div>
  ${title ? `<div style="font:600 20px Georgia,serif;margin:0 0 14px">${esc(title)}</div>` : ''}
  ${inner}
  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #eee6de;font:12px/1.5 Arial,sans-serif;color:#8a847d">${foot}</div>
</div>`;

// A thread token in the reply address (and the subject), so a reply finds its way back.
async function thread(info) {
  const token = crypto.randomBytes(6).toString('hex');
  await db.collection('mailThreads').doc(token).set({ ...info, at: now });
  return token;
}
const replyTo = (token) => (REPLY ? REPLY.replace('@', `+${token}@`) : undefined);

// ------------------------------------------------------------------ 1. announcements by email

const out = await db.collection('outbox').where('state', '==', 'waiting').get();
for (const o of out.docs) {
  const d = o.data();
  if ((d.sendAt ?? 0) > now) continue;
  try {
    const a = (await db.doc(`classes/${d.classId}/announcements/${d.annId}`).get()).data();
    if (!a?.email) {
      await o.ref.update({ state: 'skipped' });
      continue;
    }
    const cls = (await db.doc(`classes/${d.classId}`).get()).data() ?? {};
    const users = await db.collection('users').where('classId', '==', d.classId).get();
    const to = a.to === 'all' ? null : new Set(a.to ?? []);
    let sent = 0;
    for (const u of users.docs) {
      const x = u.data();
      if (x.role !== 'learner' || !x.contactEmail || (to && !to.has(x.learnerId))) continue;
      const token = await thread({ classId: d.classId, teacher: a.email.byUid, teacherName: a.email.byName, learnerId: x.learnerId, learnerName: x.displayName ?? '', learnerUid: u.id, subject: a.email.subject });
      await mail.sendMail({
        from: FROM,
        to: x.contactEmail,
        replyTo: replyTo(token),
        subject: `${a.email.subject} [#${token}]`,
        html: frame(a.email.subject, block(a.email.content ?? { type: 'doc' }), `From ${esc(a.email.byName)} · ${esc(cls.name ?? 'your class')}. ${REPLY ? 'Reply to this email and your teacher gets it in ELT Suite.' : `Open <a href="${SITE}" style="color:#b8744e">ELT Suite</a> to reply.`}`),
      });
      sent++;
    }
    await o.ref.update({ state: 'sent', sent, sentAt: now });
    console.log(`Announcement ${d.annId}: emailed ${sent}.`);
  } catch (e) {
    console.error('Announcement email failed', d.annId, e?.message);
    await o.ref.update({ state: (d.tries ?? 0) >= 3 ? 'failed' : 'waiting', tries: FieldValue.increment(1) }).catch(() => {});
  }
}

// ------------------------------------------------------------------ 2. replies into the app

const dmId = (a, b) => 'dm_' + [a, b].sort().join('_');
async function postReply(t, text) {
  const id = dmId(t.teacher, t.learnerId);
  const ref = db.collection('chats').doc(id);
  const snap = await ref.get();
  const at = Date.now();
  if (!snap.exists) await ref.set({ members: [t.teacher, t.learnerId], names: { [t.teacher]: t.teacherName, [t.learnerId]: t.learnerName }, roles: { [t.teacher]: 'teacher', [t.learnerId]: 'learner' }, classId: t.classId, kind: 'dm', createdBy: t.learnerId, at, lastAt: at, seen: {} });
  await ref.collection('msgs').add({ by: t.learnerId, name: t.learnerName, role: 'learner', at, text, content: { type: 'doc', content: text.split(/\n{2,}/).map((p) => ({ type: 'paragraph', content: p.trim() ? [{ type: 'text', text: p.trim() }] : [] })) }, viaEmail: true, mentions: [] });
  await ref.update({ lastAt: at, last: { text: text.slice(0, 140), name: t.learnerName, by: t.learnerId, mentions: [] }, emailThread: true, [`seen.${t.learnerId}`]: at, [`mailed.${t.learnerId}`]: at });
}
// The new part of a reply, without the quoted email under it.
function fresh(textBody) {
  const lines = String(textBody ?? '').replace(/\r/g, '').split('\n');
  const outLines = [];
  for (const l of lines) {
    if (/^>/.test(l) || /^On .+wrote:\s*$/i.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From:\s/.test(l) || /^Sent from my /i.test(l)) break;
    outLines.push(l);
  }
  return outLines.join('\n').trim().slice(0, 4000);
}
if (IMAP) {
  try {
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');
    const u = new URL(IMAP);
    const client = new ImapFlow({ host: u.hostname, port: Number(u.port) || 993, secure: u.protocol !== 'imap:', auth: { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const m of client.fetch({ seen: false }, { source: true, uid: true })) {
        const p = await simpleParser(m.source);
        const where = [p.to?.text ?? '', p.headers.get('delivered-to') ?? '', p.subject ?? ''].join(' ');
        const token = /\+([0-9a-f]{12})@/.exec(where)?.[1] ?? /\[#([0-9a-f]{12})\]/.exec(where)?.[1];
        const t = token ? (await db.collection('mailThreads').doc(token).get()).data() : null;
        if (t) {
          const text = fresh(p.text);
          if (text) await postReply(t, text);
          console.log('Reply from', t.learnerName);
        }
        await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (e) {
    console.error('Reading replies failed:', e?.message);
  }
}

// ------------------------------------------------------------------ 3. the teacher's answers by email

const threads = await db.collection('chats').where('emailThread', '==', true).get();
for (const c of threads.docs) {
  const d = c.data();
  const learner = d.members.find((k) => d.roles?.[k] === 'learner');
  const teacher = d.members.find((k) => d.roles?.[k] === 'teacher');
  if (!learner || !teacher || d.last?.by !== teacher) continue;
  const since = Math.max(d.mailed?.[learner] ?? 0, d.seen?.[learner] ?? 0);
  if (since >= d.lastAt) continue;
  const us = await db.collection('users').where('learnerId', '==', learner).limit(1).get();
  const lu = us.docs[0];
  const email = lu?.data().contactEmail;
  if (!email) continue;
  const msgs = await c.ref.collection('msgs').where('at', '>', since).orderBy('at').limit(10).get();
  const list = msgs.docs.map((m) => m.data()).filter((m) => m.by === teacher && !m.deleted);
  if (!list.length) continue;
  const token = await thread({ classId: d.classId, teacher, teacherName: d.names?.[teacher] ?? 'Your teacher', learnerId: learner, learnerName: d.names?.[learner] ?? '', learnerUid: lu.id, subject: 'Your teacher replied' });
  const name = (d.names?.[teacher] ?? 'Your teacher').split(' ')[0];
  await mail.sendMail({
    from: FROM,
    to: email,
    replyTo: replyTo(token),
    subject: `${name} replied to you [#${token}]`,
    html: frame(`${name} replied to you`, list.map((m) => (m.content ? block(m.content) : `<p style="font:15px/1.6 Georgia,serif">${esc(m.text)}</p>`)).join(''), `${REPLY ? 'Reply to this email to answer, or open' : 'Open'} <a href="${SITE}/messages?c=${c.id}" style="color:#b8744e">the chat in ELT Suite</a>.`),
  });
  await c.ref.update({ [`mailed.${learner}`]: Date.now() });
  console.log('Emailed a reply to', d.names?.[learner]);
}

// ------------------------------------------------------------------ 4. invitations to an organisation
// A new teacher gets a link to finish making their account; a teacher who already has one gets an
// invitation to join, with what the organisation's admins can set and see.

const ADMIN_CAN = [
  'which apps you have, and how much space',
  'whether you create your own classes, or they create them for you',
  'class settings for learners: emails, and how names show',
  'whether you can add colleagues from outside the organisation',
  'which shared folders you can view or change',
  'your job title, and whether you are a teacher trainer',
];
const ADMIN_SEE = 'Your name, email, job title and the profile you write, if they ask for one, and the class lists of your classes. Not your lessons, files or messages, unless you share them.';
const invites = await db.collection('orgInvites').where('status', '==', 'pending').get();
const { getAuth } = await import('firebase-admin/auth');
for (const i of invites.docs) {
  const d = i.data();
  if (d.mailed) continue;
  try {
    const existing = await getAuth().getUserByEmail(d.email).then(() => true).catch(() => false);
    const link = `${SITE}/invite/${i.id}`;
    const first = (d.name || '').split(' ')[0];
    const btn = (t) => `<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:${esc(d.color || '#b8744e')};color:#fff;text-decoration:none;font:600 15px Arial,sans-serif;padding:11px 20px;border-radius:9px">${t}</a></p>`;
    const can = `<p style="margin:14px 0 6px;font:600 14px Arial,sans-serif">In ${esc(d.orgName)}, its admins can set</p><ul style="margin:0 0 12px;padding-left:20px;font:14px/1.6 Arial,sans-serif;color:#3b3935">${ADMIN_CAN.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p style="margin:0 0 6px;font:600 14px Arial,sans-serif">What they see</p><p style="margin:0 0 12px;font:14px/1.6 Arial,sans-serif;color:#3b3935">${esc(ADMIN_SEE)} The teachers in ${esc(d.orgName)} become your colleagues.</p>`;
    const intro = existing
      ? `<p style="font:15px/1.6 Georgia,serif">${first ? `Hello ${esc(first)}, ` : ''}${esc(d.byName || 'An admin')} would like you to join <b>${esc(d.orgName)}</b> in ELT Suite${d.admin ? ', as a teacher and one of its admins' : ''}. Your account, classes and files stay yours. You can say no.</p>${btn('See the invitation')}${can}`
      : `<p style="font:15px/1.6 Georgia,serif">${first ? `Hello ${esc(first)}, ` : ''}${esc(d.byName || 'An admin')} has made a place for you at <b>${esc(d.orgName)}</b> in ELT Suite${d.admin ? ', as a teacher and one of its admins' : ''}, for planning lessons and teaching your classes. Choose a password, or use Google, to finish your account.</p>${btn('Finish your account')}${can}`;
    await mail.sendMail({
      from: FROM,
      to: d.email,
      subject: existing ? `Join ${d.orgName} in ELT Suite` : `Your ELT Suite account at ${d.orgName}`,
      html: frame(existing ? `An invitation from ${d.orgName}` : `Welcome to ${d.orgName}`, intro, `You get this because an admin of ${esc(d.orgName)} added ${esc(d.email)}. Not expecting it? Ignore this email.`),
    });
    await i.ref.update({ mailed: Date.now(), existing });
    console.log('Invitation emailed for', d.orgName);
  } catch (e) {
    console.error('Invitation email failed', i.id, e?.message);
  }
}

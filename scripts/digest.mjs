// Emails each teacher who asked for it a short summary of messages that have waited unread
// longer than they chose. Runs every 15 minutes from GitHub Actions.
// Needs: GOOGLE_APPLICATION_CREDENTIALS (the deploy key) and SMTP_URL (an email account),
// for example smtps://user:app-password@smtp.gmail.com:465. MAIL_FROM is optional.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';

const SMTP = process.env.SMTP_URL;
if (!SMTP) {
  console.log('No SMTP_URL secret: email summaries are off until it is added.');
  process.exit(0);
}
initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const mail = nodemailer.createTransport(SMTP);
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
const SITE = 'https://eltsuite.com';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const now = Date.now();

const users = await db.collection('users').where('msgPrefs.email', '==', true).get();
for (const u of users.docs) {
  // Learners are in chats by their learner id, and give their own email (their sign-in email is not a real one).
  const learner = u.data().role === 'learner';
  const uid = learner ? u.data().learnerId : u.id;
  if (!uid) continue;
  const after = Number(u.data().msgPrefs?.after ?? 60) * 60000;
  const chats = await db.collection('chats').where('members', 'array-contains', uid).get();
  const waiting = chats.docs.filter((c) => {
    const d = c.data();
    if (learner && d.emailThread) return false; // the mail job sends these right away
    return d.last && d.last.by !== uid && (d.seen?.[uid] ?? 0) < d.lastAt && now - d.lastAt >= after && (d.digested?.[uid] ?? 0) < d.lastAt;
  });
  if (!waiting.length) continue;
  let email = String(u.data().contactEmail ?? '');
  if (!email && !learner) {
    try {
      email = (await getAuth().getUser(u.id)).email ?? '';
    } catch {
      continue;
    }
  }
  if (!email) continue;
  const parts = [];
  let total = 0;
  for (const c of waiting) {
    const d = c.data();
    const since = d.seen?.[uid] ?? 0;
    const msgs = await c.ref.collection('msgs').where('at', '>', since).orderBy('at', 'desc').limit(5).get();
    const list = msgs.docs.map((m) => m.data()).filter((m) => m.by !== uid && !m.deleted).reverse();
    total += list.length;
    const title = d.kind === 'group' ? d.title || 'Group' : d.names?.[d.members.find((k) => k !== uid)] ?? 'A chat';
    parts.push(`<div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#f7f5f2">
      <div style="font:600 15px Georgia,serif;color:#2b2a28;margin-bottom:6px">${esc(title)}</div>
      ${list.map((m) => `<div style="font:14px/1.45 Arial,sans-serif;color:#3d3a36;margin:4px 0"><b>${esc((m.name || '').split(' ')[0])}:</b> ${esc((m.text || (m.share ? 'Shared “' + m.share.title + '”' : 'Sent a task element')).slice(0, 200))}</div>`).join('')}
      <a href="${SITE}/messages?c=${c.id}" style="display:inline-block;margin-top:8px;font:600 13px Arial,sans-serif;color:#b8744e">Open the chat</a>
    </div>`);
  }
  const n = Math.max(total, waiting.length);
  await mail.sendMail({
    from: FROM,
    to: email,
    subject: `${n} unread ${n === 1 ? 'message' : 'messages'} on ELT Suite`,
    html: `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#2b2a28">
      <div style="font:600 22px Georgia,serif;margin-bottom:4px">Messages waiting for you</div>
      <div style="font:13px Arial,sans-serif;color:#8a847d;margin-bottom:18px">You asked for a summary when messages stay unread.</div>
      ${parts.join('')}
      <div style="font:12px Arial,sans-serif;color:#8a847d">Change this in Messages, under the bell.</div></div>`,
  });
  for (const c of waiting) await c.ref.update({ [`digested.${uid}`]: c.data().lastAt });
  console.log(`Sent a summary of ${waiting.length} chats.`);
}

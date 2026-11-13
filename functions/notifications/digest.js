import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';
import { frame, pad, h1, small, esc } from './email-layout.js';

const SITE = 'https://eltsuite.com';
const FALLBACK_FROM = 'ELT Suite <hello@eltsuite.com>';

// Cloud Scheduler runs this independently of GitHub Actions, whose scheduled runs can arrive late.
export const sendUnreadMessageSummaries = onSchedule({
  schedule: 'every 15 minutes',
  region: 'us-central1',
  maxInstances: 1,
  timeoutSeconds: 540,
  secrets: ['SMTP_URL', 'MAIL_FROM'],
}, async () => {
  const smtp = process.env.SMTP_URL;
  if (!smtp) throw new Error('SMTP_URL is not bound to the scheduled email function.');
  const db = getFirestore();
  const mail = nodemailer.createTransport(smtp);
  await mail.verify();
  console.log('Scheduled email transport authenticated.');
  const from = process.env.MAIL_FROM || FALLBACK_FROM;
  const learn = await fetch('https://learn.eltsuite.com/version.json', { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? 'https://learn.eltsuite.com' : SITE), () => SITE);
  const now = Date.now();
  const users = await db.collection('users').where('msgPrefs.email', '==', true).get();

  for (const user of users.docs) {
    const profile = user.data();
    const learner = profile.role === 'learner';
    const uid = learner ? profile.learnerId : user.id;
    if (!uid) continue;
    const after = Number(profile.msgPrefs?.after ?? 15) * 60000;
    const chats = await db.collection('chats').where('members', 'array-contains', uid).get();
    const waiting = chats.docs.filter((chat) => {
      const data = chat.data();
      if (learner && data.emailThread) return false;
      return data.last && data.last.by !== uid && (data.seen?.[uid] ?? 0) < data.lastAt
        && now - data.lastAt >= after && (data.digested?.[uid] ?? 0) < data.lastAt;
    });
    if (!waiting.length) continue;

    const parts = [];
    let total = 0;
    for (const chat of waiting) {
      const data = chat.data();
      const since = data.seen?.[uid] ?? 0;
      const messages = await chat.ref.collection('msgs').where('at', '>', since).orderBy('at', 'desc').limit(5).get();
      const list = messages.docs.map((message) => message.data()).filter((message) => message.by !== uid && !message.deleted).reverse();
      total += list.length;
      const title = data.kind === 'group' ? data.title || 'Group' : data.names?.[data.members.find((key) => key !== uid)] ?? 'A chat';
      parts.push(`<div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#f7f5f2">
        <div style="font:600 15px Georgia,serif;color:#2b2a28;margin-bottom:6px">${esc(title)}</div>
        ${list.map((message) => `<div style="font:14px/1.45 Arial,sans-serif;color:#3d3a36;margin:4px 0"><b>${esc((message.name || '').split(' ')[0])}:</b> ${esc((message.text || (message.share ? 'Shared “' + message.share.title + '”' : 'Sent a task element')).slice(0, 200))}</div>`).join('')}
        <a href="${learner ? learn : SITE}/messages?c=${chat.id}" style="display:inline-block;margin-top:8px;font:600 13px Arial,sans-serif;color:#b8744e">Open the chat</a>
      </div>`);
    }

    // Preferences may change while the messages are loaded. Check immediately before sending.
    const latest = await user.ref.get();
    if (latest.data()?.msgPrefs?.email !== true) continue;
    let email = String(latest.data()?.contactEmail ?? '');
    if (!email && !learner) {
      try { email = (await getAuth().getUser(user.id)).email ?? ''; }
      catch { continue; }
    }
    if (!email) continue;
    const count = Math.max(total, waiting.length);
    try {
      await mail.sendMail({
        from,
        to: email,
        subject: `${count} unread ${count === 1 ? 'message' : 'messages'} on ELT Suite`,
        html: frame({ title: 'Messages waiting for you', body: pad(h1('Messages waiting for you') + small('New messages have been waiting unread.') + parts.join('')), footer: `Change or turn off these emails in <a href="${learner ? learn : SITE}/settings">Settings</a>.` }),
      });
    } catch (error) {
      console.error('Could not send one unread-message summary.', error?.code ?? 'unknown');
      continue;
    }
    for (const chat of waiting) {
      try { await chat.ref.update({ [`digested.${uid}`]: chat.data().lastAt }); }
      catch { console.error('Could not record one sent unread-message summary.'); }
    }
    console.log(`Sent a summary of ${waiting.length} chats.`);
  }
});

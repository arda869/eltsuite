// Teacher's Companion reminders: when an experiment's "look again" day comes, the teacher gets a
// notification on their devices and, if they want one, an email. Inside ELT Suite it already shows on
// the Companion's front page. Runs every 15 minutes from GitHub Actions with the deploy key.
// Each delivery channel has its own date marker, so a failed email can be retried without
// sending the successful push again (and vice versa). Teachers choose in Settings.
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { sendDevices } from '../functions/push-delivery.js';
import { frame, pad, h1, p, small, button, esc, SITE } from './email-layout.mjs';

const app = initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const now = Date.now();
const SMTP = process.env.SMTP_URL;
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
// Older than this and the moment has passed: mark it without sending.
const STALE = 7 * 864e5;

let pushed = 0, mailed = 0, failures = 0;
let db, mail;
try {
db = getFirestore(app);
const fcm = getMessaging();
mail = SMTP ? (await import('nodemailer')).default.createTransport(SMTP) : null;
const teachers = await db.collection('teachingCoach').listDocuments();
for (const t of teachers) {
  const uid = t.id;
  const due = (await t.collection('inquiries').where('reviewAt', '<=', now).get()).docs
    .filter((d) => { const x = d.data(); return x.status !== 'done' && typeof x.reviewAt === 'number' && x.remindedFor !== x.reviewAt; });
  if (!due.length) continue;
  const fresh = due.filter((d) => now - d.data().reviewAt < STALE);
  for (const d of due) if (!fresh.includes(d)) await d.ref.update({ remindedFor: d.data().reviewAt });
  if (!fresh.length) continue;
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  if (user.role && user.role !== 'teacher') continue;
  const want = { push: user.companionRemind?.push !== false, email: user.companionRemind?.email !== false };
  const pushDue = want.push ? fresh.filter((d) => d.data().remindedPushFor !== d.data().reviewAt) : [];
  const emailDue = want.email ? fresh.filter((d) => d.data().remindedEmailFor !== d.data().reviewAt) : [];
  const pushMarked = new Set();
  const emailMarked = new Set();
  if (pushDue.length) {
    const devices = (await db.collection('pushTokens').where('key', '==', uid).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    if (devices.length) {
      const one = pushDue.length === 1 ? pushDue[0].data() : null;
      const r = await sendDevices(devices, {
        title: 'Time to look again',
        body: (one ? `How is “${one.title || 'your experiment'}” going? Note what you’ve seen.` : `${pushDue.length} experiments are ready for you to look at again.`).slice(0, 180),
        link: '/coach?s=try', tag: 'companion-try',
      }, 86400, { send: (m) => fcm.send(m), remove: (id) => db.collection('pushTokens').doc(id).delete() });
      failures += r.failed;
      if (r.complete) {
        for (const d of pushDue) { await d.ref.update({ remindedPushFor: d.data().reviewAt }); pushMarked.add(d.id); }
        pushed++;
      }
    }
  }
  if (emailDue.length && mail) {
    let to = String(user.contactEmail ?? '');
    if (!to) { try { to = (await getAuth().getUser(uid)).email ?? ''; } catch { to = ''; } }
    if (to) {
      const items = emailDue.map((d) => d.data()).map((x) => `<li style="margin:0 0 8px"><b>${esc(x.title || 'Your experiment')}</b>${x.intervention ? `<br><span style="color:#696969">${esc(x.intervention.slice(0, 160))}</span>` : ''}</li>`).join('');
      try {
        await mail.sendMail({
          from: FROM, to,
          subject: emailDue.length === 1 ? `Time to look again: ${emailDue[0].data().title || 'your experiment'}` : `${emailDue.length} experiments to look at again`,
          html: frame({
            title: 'Time to look again',
            body: pad(h1('Time to look again') + p(emailDue.length === 1 ? 'You asked us to remind you about this experiment today.' : 'You asked us to remind you about these experiments.') + `<ul style="margin:0 0 14px 18px;padding:0;font:16px/1.5 Georgia,serif">${items}</ul>` + p('Write down what you’ve noticed while it’s fresh. The Companion can help you make sense of it.') + button(`${SITE}/coach?s=try`, 'Open your experiments') + small('Only you can see your experiments.')),
            footer: `Change or turn off these reminders in <a href="${SITE}/settings#set-teacher-s-companion">Settings</a>.`,
          }),
        });
        for (const d of emailDue) { await d.ref.update({ remindedEmailFor: d.data().reviewAt }); emailMarked.add(d.id); }
        mailed++;
      } catch (e) { console.error('A Companion reminder email could not be sent:', e?.message ?? e); failures++; }
    }
  }
  for (const d of fresh) {
    const x = d.data();
    const pushDone = !want.push || x.remindedPushFor === x.reviewAt || pushMarked.has(d.id);
    const emailDone = !want.email || x.remindedEmailFor === x.reviewAt || emailMarked.has(d.id);
    if (pushDone && emailDone) await d.ref.update({ remindedFor: x.reviewAt });
  }
}
console.log(`Companion reminders: ${pushed} teachers notified on their devices, ${mailed} by email.`);
if (failures) { console.error(`${failures} Companion reminders failed; they stay due for the next run.`); process.exitCode = 1; }
} finally {
  try { mail?.close?.(); } finally {
    try { await db?.terminate(); } finally { await deleteApp(app); }
  }
}

// Teacher's Companion reminders: when an experiment's "look again" day comes, the teacher gets a
// notification on their devices and, if they want one, an email. Inside ELT Suite it already shows on
// the Companion's front page. Runs every 15 minutes from GitHub Actions with the deploy key.
// Each reminder is sent once for each date: `remindedFor` keeps the date it was sent for, so choosing
// a new date brings a new reminder. Teachers choose in Settings (users/{uid}.companionRemind).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { sendDevices } from '../functions/push-delivery.js';
import { frame, pad, h1, p, small, button, esc, SITE } from './email-layout.mjs';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const fcm = getMessaging();
const now = Date.now();
const SMTP = process.env.SMTP_URL;
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
const mail = SMTP ? (await import('nodemailer')).default.createTransport(SMTP) : null;
// Older than this and the moment has passed: mark it without sending.
const STALE = 7 * 864e5;

let pushed = 0, mailed = 0, failures = 0;
const teachers = await db.collection('teachingCoach').listDocuments();
for (const t of teachers) {
  const uid = t.id;
  const due = (await t.collection('inquiries').where('reviewAt', '<=', now).get()).docs
    .filter((d) => { const x = d.data(); return x.status !== 'done' && typeof x.reviewAt === 'number' && x.remindedFor !== x.reviewAt; });
  if (!due.length) continue;
  const fresh = due.filter((d) => now - d.data().reviewAt < STALE);
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  if (user.role && user.role !== 'teacher') continue;
  const want = { push: user.companionRemind?.push !== false, email: user.companionRemind?.email !== false };
  let tried = false, through = false;
  if (fresh.length && want.push) {
    const devices = (await db.collection('pushTokens').where('key', '==', uid).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    if (devices.length) {
      const one = fresh.length === 1 ? fresh[0].data() : null;
      const r = await sendDevices(devices, {
        title: 'Time to look again',
        body: (one ? `How is “${one.title || 'your experiment'}” going? Note what you’ve seen.` : `${fresh.length} experiments are ready for you to look at again.`).slice(0, 180),
        link: '/coach?s=try', tag: 'companion-try',
      }, 86400, { send: (m) => fcm.send(m), remove: (id) => db.collection('pushTokens').doc(id).delete() });
      tried = true; failures += r.failed;
      if (r.accepted > 0) { pushed++; through = true; }
    }
  }
  if (fresh.length && want.email && mail) {
    let to = String(user.contactEmail ?? '');
    if (!to) { try { to = (await getAuth().getUser(uid)).email ?? ''; } catch { to = ''; } }
    if (to) {
      const items = fresh.map((d) => d.data()).map((x) => `<li style="margin:0 0 8px"><b>${esc(x.title || 'Your experiment')}</b>${x.intervention ? `<br><span style="color:#696969">${esc(x.intervention.slice(0, 160))}</span>` : ''}</li>`).join('');
      try {
        await mail.sendMail({
          from: FROM, to,
          subject: fresh.length === 1 ? `Time to look again: ${fresh[0].data().title || 'your experiment'}` : `${fresh.length} experiments to look at again`,
          html: frame({
            title: 'Time to look again',
            body: pad(h1('Time to look again') + p(fresh.length === 1 ? 'You asked us to remind you about this experiment today.' : 'You asked us to remind you about these experiments.') + `<ul style="margin:0 0 14px 18px;padding:0;font:16px/1.5 Georgia,serif">${items}</ul>` + p('Write down what you’ve noticed while it’s fresh. The Companion can help you make sense of it.') + button(`${SITE}/coach?s=try`, 'Open your experiments') + small('Only you can see your experiments.')),
            footer: `Change or turn off these reminders in <a href="${SITE}/settings#set-teacher-s-companion">Settings</a>.`,
          }),
        });
        mailed++; through = true;
      } catch (e) { console.error('A Companion reminder email could not be sent:', e?.message ?? e); failures++; }
      tried = true;
    }
  }
  // Mark them sent (or past, or with nowhere to send) so each date reminds once. If every way we
  // tried failed, it stays due for the next run.
  if (!tried || through) for (const d of due) await d.ref.update({ remindedFor: d.data().reviewAt });
}
console.log(`Companion reminders: ${pushed} teachers notified on their devices, ${mailed} by email.`);
if (failures) { console.error(`${failures} Companion reminders failed; they stay due for the next run.`); process.exitCode = 1; }

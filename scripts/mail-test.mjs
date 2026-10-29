// Sends one test email through the SMTP_URL secret, to check the email set-up works.
// Run from the "Test email" workflow. TO is who gets it.
import nodemailer from 'nodemailer';

const SMTP = process.env.SMTP_URL;
const TO = process.env.TO;
if (!SMTP) {
  console.log('::error::There is no SMTP_URL secret in GitHub yet.');
  process.exit(1);
}
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
const mail = nodemailer.createTransport(SMTP);
try {
  await mail.verify();
  console.log('Signed in to the email service.');
  const info = await mail.sendMail({
    from: FROM,
    to: TO,
    subject: 'ELT Suite test email',
    text: 'This is a test from ELT Suite. If you can read it, email is working.',
    html: '<p style="font:15px/1.6 Georgia,serif;color:#2b2a28">This is a test from ELT Suite.</p><p style="font:15px/1.6 Georgia,serif;color:#2b2a28">If you can read it, email is working.</p>',
    headers: { 'X-PM-Message-Stream': 'outbound' },
  });
  console.log(`Sent from ${FROM} to ${TO}: ${info.response}`);
} catch (e) {
  console.log(`::error::The test email wasn't sent: ${String(e?.response || e?.message || e).replace(/smtp:\/\/[^@]*@/g, 'smtp://…@')}`);
  process.exit(1);
}

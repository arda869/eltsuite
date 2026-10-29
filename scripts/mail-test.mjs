// Sends one test email through Postmark, to check the email set-up works. Uses the token in the
// SMTP_URL secret with Postmark's own API, which says straight away if the email was refused.
// Run from the "Test email" workflow. TO is who gets it.
import { sample } from './email-sample.mjs';
const SMTP = process.env.SMTP_URL;
const TO = process.env.TO;
if (!SMTP) {
  console.log('::error::There is no SMTP_URL secret in GitHub yet.');
  process.exit(1);
}
const token = decodeURIComponent(new URL(SMTP).username);
const FROM = process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>';
const res = await fetch('https://api.postmarkapp.com/email', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
  body: JSON.stringify({
    From: FROM,
    To: TO,
    Subject: sample.subject,
    TextBody: sample.text,
    HtmlBody: sample.html,
    MessageStream: 'outbound',
  }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || out.ErrorCode) {
  console.log(`::error::Postmark refused the test email (${out.ErrorCode ?? res.status}): ${out.Message ?? res.statusText}`);
  process.exit(1);
}
console.log(`::notice::Sent from ${FROM} to ${TO}. Postmark: ${out.Message}`);

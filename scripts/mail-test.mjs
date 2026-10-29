// Sends one test email through Postmark, to check the email set-up works. Uses the token in the
// SMTP_URL secret with Postmark's own API, which says straight away if the email was refused.
// Run from the "Test email" workflow. TO is who gets it.
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
    Subject: 'ELT Suite test email',
    TextBody: 'This is a test from ELT Suite. If you can read it, email is working.',
    HtmlBody: '<p style="font:15px/1.6 Georgia,serif;color:#2b2a28">This is a test from ELT Suite.</p><p style="font:15px/1.6 Georgia,serif;color:#2b2a28">If you can read it, email is working.</p>',
    MessageStream: 'outbound',
  }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok || out.ErrorCode) {
  console.log(`::error::Postmark refused the test email (${out.ErrorCode ?? res.status}): ${out.Message ?? res.statusText}`);
  process.exit(1);
}
console.log(`::notice::Sent from ${FROM} to ${TO}. Postmark: ${out.Message}`);

import assert from 'node:assert/strict';
import { organisationInvitation, codeInvitation } from '../scripts/invitation-emails.mjs';
const d = { name: 'Mina Chan', email: 'mina@example.test', byName: 'Alex Lee', orgName: 'Example Academy', admin: true };
for (const existing of [false, true]) {
  const mail = organisationInvitation(d, 'invite/123', existing);
  assert.ok(mail.html.includes('/email/logo.png'));
  assert.ok(mail.html.includes('/invite/invite%2F123'));
  assert.ok(mail.html.indexOf('class="btn"') < mail.html.indexOf('About Example Academy'));
  assert.ok(mail.text.includes('lessons, files and messages stay yours'));
  assert.ok(mail.text.includes('Hello Mina,'));
  assert.ok(mail.subject.includes(existing ? 'would like you to join them' : 'your place at'));
  assert.ok(mail.html.includes(existing ? 'See the invitation' : 'Create my account'));
}
const malicious = organisationInvitation({ ...d, name: '<img src=x>', orgName: '<script>alert(1)</script>', email: '\" onclick=\"alert(1)' }, 'safe', false);
assert.ok(!malicious.html.includes('<script>'));
assert.ok(malicious.html.includes('&lt;script&gt;'));
const code = codeInvitation({ ...d, expires: Date.UTC(2026, 10, 1) }, 'ABCD&EF23');
assert.ok(code.html.includes('?code=ABCD%26EF23'));
assert.ok(code.html.includes('ABCD&amp;EF23'));
assert.ok(code.text.includes('1 November 2026'));
assert.ok(code.subject.endsWith('at Example Academy'));
assert.ok(codeInvitation({ email: 'test@example.test' }, 'SAMPLE').text.includes('Hello,'));
assert.ok(!organisationInvitation({ ...d, orgName: 'A\r\nB' }, 'safe', true).subject.includes('\n'));
console.log('Invitation template checks passed (no emails sent).');

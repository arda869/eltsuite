import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliverPendingInvitations, pendingCodeInvitation } from '../functions/notifications/invitation-delivery-logic.js';

assert.deepEqual(
  JSON.parse(readFileSync(new URL('../functions/notifications/invitation-copy.json', import.meta.url))),
  JSON.parse(readFileSync(new URL('../scripts/invitation-copy.json', import.meta.url))),
  'The public and email invitation copy must stay in sync',
);

const rows = {
  orgInvites: new Map([
    ['org-new', { status: 'pending', email: 'new@example.test', name: 'Mina', orgName: 'Test Pilots', byName: 'Alex' }],
    ['org-mailed', { status: 'pending', email: 'old@example.test', mailed: 123 }],
    ['org-cancelled', { status: 'declined', email: 'cancelled@example.test' }],
  ]),
  inviteCodes: new Map([
    ['WELCOME1', { email: 'code@example.test', name: 'Sam', maxUses: 1, uses: 0 }],
    ['OFF', { email: 'off@example.test', off: true }],
    ['USED', { email: 'used@example.test', uses: 1, maxUses: 1 }],
    ['EXPIRED', { email: 'expired@example.test', expires: 1 }],
  ]),
};
const refs = (name) => [...rows[name]].map(([id, data]) => ({
  id,
  data: () => data,
  ref: {
    id,
    data: () => data,
    async update(change) { Object.assign(data, change); },
  },
}));
const db = {
  collection(name) {
    return {
      where(field, op, value) {
        assert.deepEqual([field, op, value], ['status', '==', 'pending']);
        return { async get() { return { docs: refs(name).filter((row) => row.data().status === 'pending') }; } };
      },
      async get() { return { docs: refs(name) }; },
    };
  },
  async runTransaction(run) {
    return run({
      async get(ref) { return { data: ref.data }; },
      update(ref, change) { Object.assign(ref.data(), change); },
    });
  },
};
const sent = [];
const mail = { async sendMail(message) { sent.push(message); } };
const auth = {
  async getUserByEmail(email) {
    assert.equal(email, 'new@example.test');
    throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
  },
};
const args = { db, auth, mail, from: 'ELT Suite <hello@eltsuite.com>', now: 1_000_000 };
assert.deepEqual(await deliverPendingInvitations(args), { organisations: 1, codes: 1, errors: 0 });
assert.deepEqual(sent.map((item) => item.to), ['new@example.test', 'code@example.test']);
assert.match(sent[0].text, /Test Pilots’ admins/);
assert.equal(rows.orgInvites.get('org-new').existing, false);
assert.ok(rows.orgInvites.get('org-new').mailed);
assert.ok(rows.inviteCodes.get('WELCOME1').mailed);
assert.deepEqual(await deliverPendingInvitations(args), { organisations: 0, codes: 0, errors: 0 });
assert.equal(sent.length, 2, 'a later scheduled run must not send the same invitations again');
assert.equal(pendingCodeInvitation({ email: 'later@example.test', expires: 1_000_000 }, 1_000_000), true);

rows.inviteCodes.set('RETRY', { email: 'retry@example.test' });
let failOnce = true;
const flakyMail = { async sendMail(message) {
  if (message.to === 'retry@example.test' && failOnce) { failOnce = false; throw new Error('temporary SMTP failure'); }
  sent.push(message);
} };
const first = await deliverPendingInvitations({ ...args, mail: flakyMail });
assert.equal(first.errors, 1);
assert.equal(rows.inviteCodes.get('RETRY').mailClaimedAt, 0, 'failed mail must release its claim');
const second = await deliverPendingInvitations({ ...args, mail: flakyMail });
assert.equal(second.codes, 1, 'failed mail is retried on the next run');
assert.equal(sent.at(-1).to, 'retry@example.test');

// Cloud Scheduler and the GitHub fallback can both inspect the same queued invite.
// The second sender must leave a claimed invite alone while the first SMTP call waits.
rows.orgInvites.set('overlap', { status: 'pending', email: 'overlap@example.test', orgName: 'Test Pilots' });
let startSend;
let finishSend;
const sending = new Promise((resolve) => { startSend = resolve; });
const hold = new Promise((resolve) => { finishSend = resolve; });
const overlapMail = { async sendMail(message) {
  if (message.to === 'overlap@example.test') {
    startSend();
    await hold;
  }
  sent.push(message);
} };
const overlapAuth = { async getUserByEmail() { throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' }); } };
const firstSender = deliverPendingInvitations({ ...args, auth: overlapAuth, mail: overlapMail });
await sending;
const overlappingSender = await deliverPendingInvitations({ ...args, auth: overlapAuth, mail: overlapMail });
assert.equal(overlappingSender.organisations, 0, 'the second sender must respect the first sender’s Firestore claim');
finishSend();
assert.equal((await firstSender).organisations, 1);
assert.equal(sent.filter((item) => item.to === 'overlap@example.test').length, 1);
console.log('Scheduled invitation delivery checks passed (mail mocked; no real email sent).');

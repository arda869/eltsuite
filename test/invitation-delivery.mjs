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
let failMailedUpdateFor = '';
const refs = (name) => [...rows[name]].map(([id, data]) => ({
  id,
  data: () => data,
  ref: {
    id,
    data: () => data,
    async update(change) {
      if (id === failMailedUpdateFor && 'mailed' in change) throw new Error('Firestore write failed after SMTP accepted');
      Object.assign(data, change);
    },
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
assert.deepEqual(await deliverPendingInvitations(args), { organisations: 1, codes: 1, errors: 0, needsReview: 0 });
assert.deepEqual(sent.map((item) => item.to), ['new@example.test', 'code@example.test']);
assert.match(sent[0].text, /Test Pilots’ admins/);
assert.equal(rows.orgInvites.get('org-new').existing, false);
assert.ok(rows.orgInvites.get('org-new').mailed);
assert.ok(rows.inviteCodes.get('WELCOME1').mailed);
assert.deepEqual(await deliverPendingInvitations(args), { organisations: 0, codes: 0, errors: 0, needsReview: 0 });
assert.equal(sent.length, 2, 'a later scheduled run must not send the same invitations again');
assert.equal(pendingCodeInvitation({ email: 'later@example.test', expires: 1_000_000 }, 1_000_000), true);

// A failure before SMTP is safe to retry automatically.
rows.orgInvites.set('PREPARE', { status: 'pending', email: 'prepare@example.test', orgName: 'Test Pilots' });
let prepareFails = true;
const flakyAuth = { async getUserByEmail() {
  if (prepareFails) { prepareFails = false; throw Object.assign(new Error('Auth unavailable'), { code: 'auth/internal-error' }); }
  throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
} };
const first = await deliverPendingInvitations({ ...args, auth: flakyAuth });
assert.equal(first.errors, 1);
assert.equal(first.needsReview, 0);
assert.equal(rows.orgInvites.get('PREPARE').mailClaimedAt, 0, 'pre-send failure must release its claim');
const second = await deliverPendingInvitations({ ...args, auth: flakyAuth });
assert.equal(second.organisations, 1, 'pre-send failure is retried on the next run');
assert.equal(sent.at(-1).to, 'prepare@example.test');

// SMTP accepted the invitation, but Firestore did not record it. Even after the
// former ten-minute lease, the scheduler must hold it for manual reconciliation.
rows.inviteCodes.set('AMBIGUOUS', { email: 'ambiguous@example.test' });
failMailedUpdateFor = 'AMBIGUOUS';
const uncertain = await deliverPendingInvitations(args);
assert.equal(uncertain.errors, 1);
assert.equal(uncertain.needsReview, 1);
assert.equal(sent.filter(item => item.to === 'ambiguous@example.test').length, 1);
assert.ok(rows.inviteCodes.get('AMBIGUOUS').mailClaimId, 'the ambiguous claim must remain held');
failMailedUpdateFor = '';
const later = await deliverPendingInvitations({ ...args, now: args.now + 11 * 60 * 1000 });
assert.equal(later.needsReview, 1, 'the held invitation must appear in the review count');
assert.equal(sent.filter(item => item.to === 'ambiguous@example.test').length, 1, 'the uncertain invitation must not be sent again');

// A transport error can happen after SMTP accepted DATA, so it is also held.
rows.inviteCodes.set('TRANSPORT', { email: 'transport@example.test' });
const uncertainMail = { async sendMail(message) {
  if (message.to === 'transport@example.test') throw new Error('connection dropped after DATA');
  sent.push(message);
} };
const transport = await deliverPendingInvitations({ ...args, mail: uncertainMail });
assert.equal(transport.errors, 1);
assert.equal(transport.needsReview, 1, 'the current transport failure needs review immediately');
assert.ok(rows.inviteCodes.get('TRANSPORT').mailClaimId);
assert.equal((await deliverPendingInvitations({ ...args, now: args.now + 11 * 60 * 1000 })).needsReview, 2, 'both held invitations need review after ten minutes');

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

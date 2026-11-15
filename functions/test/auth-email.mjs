import assert from 'node:assert/strict';
import test from 'node:test';
import { authEmailMessage, deliverAuthEmailJob, parseAuthEmailRequest, queueAuthEmail } from '../accounts/auth-email-logic.js';

function fakeDb() {
  const docs = new Map();
  let nextId = 0;
  const ref = path => ({
    path,
    delete: async () => docs.delete(path),
    update: async data => docs.set(path, { ...docs.get(path), ...data }),
  });
  const snap = path => ({
    exists: docs.has(path),
    get: key => docs.get(path)?.[key],
  });
  const db = {
    docs,
    doc: ref,
    collection: name => ({ doc: () => ref(`${name}/job${++nextId}`) }),
    runTransaction: async task => task({
      get: async item => snap(item.path),
      set: (item, data) => docs.set(item.path, data),
      create: (item, data) => {
        assert.equal(docs.has(item.path), false);
        docs.set(item.path, data);
      },
      update: (item, data) => docs.set(item.path, { ...docs.get(item.path), ...data }),
      delete: item => docs.delete(item.path),
    }),
  };
  return db;
}

const jobs = db => [...db.docs.entries()].filter(([path]) => path.startsWith('authEmailJobs/'));

test('requests validate the address and type without looking up an account', async () => {
  assert.deepEqual(parseAuthEmailRequest({ kind: 'reset', email: ' Teacher@Example.com ' }), { kind: 'reset', email: 'teacher@example.com' });
  assert.throws(() => parseAuthEmailRequest({ kind: 'link', email: 'wrong address' }));
  assert.throws(() => parseAuthEmailRequest({ kind: 'verify', email: 'teacher@example.com' }));
  const db = fakeDb();
  assert.deepEqual(await queueAuthEmail(db, { kind: 'reset', email: 'nobody@example.com' }, '127.0.0.1', 1_800_000), { accepted: true });
  assert.equal(jobs(db).length, 1);
  assert.equal(jobs(db)[0][1].email, 'nobody@example.com');
  assert.equal([...db.docs.keys()].some(path => path.includes('nobody@example.com')), false);
});

test('an address reaches its hourly limit with the same public response', async () => {
  const db = fakeDb();
  const data = { kind: 'link', email: 'teacher@example.com' };
  const replies = [];
  for (let i = 0; i < 4; i += 1) replies.push(await queueAuthEmail(db, data, '127.0.0.1', 1_800_000));
  assert.deepEqual(replies, Array(4).fill({ accepted: true }));
  assert.equal(jobs(db).length, 3);
  await queueAuthEmail(db, data, '127.0.0.1', 5_400_000);
  assert.equal(jobs(db).length, 4, 'the next hourly window can send again');
});

test('the email has ELT Suite branding, an action button and a visible fallback link', () => {
  const url = 'https://example.com/action?code=a&mode=reset';
  const reset = authEmailMessage('reset', url);
  assert.equal(reset.subject, 'Reset your ELT Suite password');
  assert.match(reset.html, /We received a request to reset your ELT Suite password/);
  assert.match(reset.html, /If you didn’t request this, you can ignore this email/);
  assert.match(reset.html, /Reset password/);
  assert.match(reset.html, /code=a&amp;mode=reset/);
  assert.match(reset.text, /If the button doesn’t work, open this link: https:\/\/example.com/);
  const link = authEmailMessage('link', url, new Date('2026-11-15T12:34:00Z'));
  assert.equal(link.subject, 'Sign in to ELT Suite · 2026-11-15 12:34 UTC');
  assert.match(link.html, /Sign in/);
});

test('the worker sends a reset link once and removes the short-lived job', async () => {
  const db = fakeDb();
  await queueAuthEmail(db, { kind: 'reset', email: 'teacher@example.com' }, '127.0.0.1');
  const jobRef = db.doc(jobs(db)[0][0]);
  const sent = [];
  let generated = 0;
  const auth = {
    getUserByEmail: async () => ({ disabled: false }),
    generatePasswordResetLink: async () => { generated += 1; return 'https://example.com/reset?token=secret'; },
  };
  const request = { db, auth, jobRef, send: async mail => sent.push(mail) };
  assert.equal(await deliverAuthEmailJob(request), 'sent');
  assert.equal(await deliverAuthEmailJob(request), 'not-due-or-complete');
  assert.equal(generated, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'teacher@example.com');
  assert.equal(jobs(db).length, 0);
  assert.equal([...db.docs.values()].some(data => JSON.stringify(data).includes('token=secret')), false);
});

test('an unknown address gets no link, and sign-in links retain the existing return page', async () => {
  const db = fakeDb();
  await queueAuthEmail(db, { kind: 'link', email: 'nobody@example.com' }, '127.0.0.1');
  let generated = 0;
  let sent = 0;
  const missing = {
    getUserByEmail: async () => { throw { code: 'auth/user-not-found' }; },
    generateSignInWithEmailLink: async () => { generated += 1; },
  };
  assert.equal(await deliverAuthEmailJob({ db, auth: missing, jobRef: db.doc(jobs(db)[0][0]), send: async () => { sent += 1; } }), 'unknown-address');
  assert.equal(generated, 0);
  assert.equal(sent, 0);
  await queueAuthEmail(db, { kind: 'link', email: 'teacher@example.com' }, '127.0.0.1');
  const auth = {
    getUserByEmail: async () => ({ disabled: false }),
    generateSignInWithEmailLink: async (email, settings) => {
      assert.equal(email, 'teacher@example.com');
      assert.deepEqual(settings, { url: 'https://eltsuite.com/auth/link', handleCodeInApp: true });
      return 'https://example.com/signin?token=secret';
    },
  };
  const messages = [];
  assert.equal(await deliverAuthEmailJob({ db, auth, jobRef: db.doc(jobs(db)[0][0]), send: async message => messages.push(message) }), 'sent');
  assert.equal(messages.length, 1);
  assert.match(messages[0].subject, /Sign in to ELT Suite/);
  assert.equal(jobs(db).length, 0);
});

test('a transient SMTP failure is retried later without saving a link or sending concurrently', async () => {
  const db = fakeDb();
  await queueAuthEmail(db, { kind: 'reset', email: 'teacher@example.com' }, '127.0.0.1');
  const jobRef = db.doc(jobs(db)[0][0]);
  let sends = 0;
  const options = {
    db, jobRef,
    auth: { getUserByEmail: async () => ({ disabled: false }), generatePasswordResetLink: async () => 'https://example.com/reset?token=secret' },
    send: async () => { sends += 1; if (sends === 1) throw new Error('SMTP failure'); },
  };
  assert.equal(await deliverAuthEmailJob(options), 'retry-scheduled');
  assert.equal(jobs(db)[0][1].status, 'retry');
  assert.equal(jobs(db)[0][1].attempts, 1);
  assert.equal(await deliverAuthEmailJob(options), 'not-due-or-complete');
  assert.equal(sends, 1);
  assert.equal(await deliverAuthEmailJob({ ...options, now: new Date(jobs(db)[0][1].nextAttemptAt.getTime() + 1) }), 'sent');
  assert.equal(sends, 2);
  assert.equal(jobs(db).length, 0);
  assert.equal([...db.docs.values()].some(data => JSON.stringify(data).includes('token=secret')), false);
});

test('two overlapping workers claim one job only once', async () => {
  const db = fakeDb();
  await queueAuthEmail(db, { kind: 'link', email: 'teacher@example.com' }, '127.0.0.1');
  const jobRef = db.doc(jobs(db)[0][0]);
  let beginSend;
  const sending = new Promise(resolve => { beginSend = resolve; });
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let sends = 0;
  const options = {
    db, jobRef,
    auth: { getUserByEmail: async () => ({ disabled: false }), generateSignInWithEmailLink: async () => 'https://example.com/signin' },
    send: async () => { sends += 1; beginSend(); await waiting; },
  };
  const first = deliverAuthEmailJob(options);
  await sending;
  assert.equal(await deliverAuthEmailJob(options), 'not-due-or-complete');
  release();
  assert.equal(await first, 'sent');
  assert.equal(sends, 1);
});

test('failed jobs stop after three attempts', async () => {
  const db = fakeDb();
  await queueAuthEmail(db, { kind: 'reset', email: 'teacher@example.com' }, '127.0.0.1');
  const jobRef = db.doc(jobs(db)[0][0]);
  const options = {
    db, jobRef,
    auth: { getUserByEmail: async () => ({ disabled: false }), generatePasswordResetLink: async () => 'https://example.com/reset' },
    send: async () => { throw new Error('SMTP failure'); },
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const now = attempt === 1 ? new Date() : new Date(jobs(db)[0][1].nextAttemptAt.getTime() + 1);
    assert.equal(await deliverAuthEmailJob({ ...options, now }), attempt === 3 ? 'failed-after-retries' : 'retry-scheduled');
  }
  assert.equal(jobs(db).length, 0);
});

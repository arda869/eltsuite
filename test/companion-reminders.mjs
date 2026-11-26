// Runs the real scheduled entry point with emulated Firebase, push and mail boundaries.
// It checks retry markers and that Admin/Firestore/mail close on every invocation.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'elt-companion-'));
const file = join(dir, 'fixture.json');
const entry = join(dir, 'companion.mjs');
const now = Date.now();
const fixture = {
  inquiry: { id: 'exp1', title: 'Try pair work', reviewAt: now - 1000, status: 'trying' },
  user: { role: 'teacher', contactEmail: 'teacher@example.test', companionRemind: { push: true, email: true } },
  devices: [{ id: 'device1', key: 'teacher1' }],
  events: [],
};
writeFileSync(file, JSON.stringify(fixture));
const modules = {
  'firebase-admin/app': `
    import { readFileSync, writeFileSync } from 'node:fs';
    const path = process.env.COMPANION_FIXTURE;
    globalThis.fixture = () => JSON.parse(readFileSync(path, 'utf8'));
    globalThis.change = fn => { const x = globalThis.fixture(); fn(x); writeFileSync(path, JSON.stringify(x)); };
    globalThis.event = name => globalThis.change(x => x.events.push(name));
    export const applicationDefault = () => ({});
    export const initializeApp = () => (globalThis.event('app:init'), {});
    export const deleteApp = async () => globalThis.event('app:close');
  `,
  'firebase-admin/firestore': `
    const inquiry = () => ({ id: 'exp1', data: () => globalThis.fixture().inquiry,
      ref: { update: async patch => globalThis.change(x => Object.assign(x.inquiry, patch)) } });
    export const getFirestore = () => ({
      collection: name => name === 'teachingCoach' ? { listDocuments: async () => [{ id: 'teacher1', collection: () => ({ where: () => ({ get: async () => ({ docs: [inquiry()] }) }) }) }] }
        : name === 'users' ? { doc: () => ({ get: async () => ({ data: () => globalThis.fixture().user }) }) }
        : { where: () => ({ get: async () => ({ docs: globalThis.fixture().devices.map(d => ({ id: d.id, data: () => d })) }) }), doc: () => ({ delete: async () => {} }) },
      terminate: async () => globalThis.event('db:close'),
    });
  `,
  'firebase-admin/auth': `export const getAuth = () => ({ getUser: async () => ({ email: 'teacher@example.test' }) });`,
  'firebase-admin/messaging': `export const getMessaging = () => ({ send: async () => 'sent' });`,
  'nodemailer': `export default { createTransport: () => { if (process.env.COMPANION_FAIL_INIT === '1') throw Error('emulated transport setup failure'); return ({
    sendMail: async () => { globalThis.event('email:attempt'); if (process.env.COMPANION_FAIL_MAIL === '1') throw Error('emulated mail outage'); },
    close: () => globalThis.event('mail:close')
  }); } };`,
  'push-delivery': `export const sendDevices = async () => { globalThis.event('push:attempt'); return { complete: true, failed: 0 }; };`,
};
try {
  await build({ entryPoints: [new URL('../scripts/companion.mjs', import.meta.url).pathname], outfile: entry, bundle: true,
    format: 'esm', platform: 'node', target: 'node20', plugins: [{ name: 'emulated-services', setup(b) {
      b.onResolve({ filter: /^(firebase-admin\/(app|firestore|auth|messaging)|nodemailer)$/ }, args => ({ path: args.path, namespace: 'fake' }));
      b.onResolve({ filter: /push-delivery\.js$/ }, () => ({ path: 'push-delivery', namespace: 'fake' }));
      b.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: modules[args.path], loader: 'js' }));
    } }] });
  const run = (fail, initFailure = false) => {
    const r = spawnSync(process.execPath, [entry], { env: { ...process.env, COMPANION_FIXTURE: file, COMPANION_FAIL_MAIL: fail ? '1' : '0', COMPANION_FAIL_INIT: initFailure ? '1' : '0', SMTP_URL: 'smtp://test' }, encoding: 'utf8', timeout: 15000 });
    const x = JSON.parse(readFileSync(file, 'utf8'));
    if (r.error) throw r.error;
    return { r, x };
  };
  const first = run(true);
  if (first.r.status !== 1 || first.x.inquiry.remindedPushFor !== fixture.inquiry.reviewAt || first.x.inquiry.remindedEmailFor || first.x.inquiry.remindedFor) throw Error('Failed mail did not leave only email due: ' + first.r.stderr);
  const second = run(false);
  if (second.r.status !== 0 || second.x.inquiry.remindedEmailFor !== fixture.inquiry.reviewAt || second.x.inquiry.remindedFor !== fixture.inquiry.reviewAt) throw Error('Email retry did not finish reminder: ' + second.r.stderr);
  const third = run(false);
  const count = (runResult, name) => runResult.x.events.filter(x => x === name).length;
  if (third.r.status !== 0 || count(third, 'push:attempt') !== 1 || count(third, 'email:attempt') !== 2) throw Error('A completed reminder was resent');
  for (const name of ['db:close', 'app:close', 'mail:close']) if (count(third, name) !== 3) throw Error(name + ' was not closed after every run');
  const fourth = run(false, true);
  if (fourth.r.status === 0 || count(fourth, 'db:close') !== 4 || count(fourth, 'app:close') !== 4 || count(fourth, 'mail:close') !== 3) throw Error('Transport setup failure left Admin or Firestore open');
  console.log('Companion scheduler: retry and idempotency pass; resources close even when transport setup fails.');
} finally { rmSync(dir, { recursive: true, force: true }); }

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sendDevices, webpushFor } from '../functions/push-delivery.js';

const data = { title: 'Test', body: 'Test notification', link: '/messages?c=test', tag: 'test' };
const devices = [{ id: 'a', token: 'private-token-a', origin: 'https://learn.eltsuite.com' }, { id: 'b', token: 'private-token-b' }];
let sent = [], removed = [], logs = [];
let result = await sendDevices(devices, data, 60, {
  send: async m => { sent.push(m); if (m.token.endsWith('b')) throw { code: 'messaging/server-unavailable', message: 'private-token-b' }; },
  remove: async id => removed.push(id), log: m => logs.push(m),
});
assert.equal(result.complete, false, 'partial delivery must remain retryable');
assert.equal(result.accepted, 1);
assert.equal(result.failed, 1);
assert.ok(!logs.join().includes('private-token'));
assert.equal(sent[0].webpush.fcmOptions.link, 'https://learn.eltsuite.com/messages?c=test');
result = await sendDevices(devices, data, 60, { send: async m => { if (m.token.endsWith('b')) throw { errorInfo: { code: 'messaging/registration-token-not-registered' } }; }, remove: async id => removed.push(id) });
assert.equal(result.complete, true);
assert.deepEqual(removed, ['b']);
assert.equal((await sendDevices([], data, 60, { send: async () => {}, remove: async () => {} })).complete, false);
for (const link of ['//evil.example', '/\\evil.example', 'https://evil.example']) assert.equal(webpushFor({ ...data, link }, 60, 'https://evil.example').fcmOptions.link, 'https://eltsuite.com/');

// Run the actual client module with controlled platform/Firebase boundaries.
const pushSource = ts.transpileModule(readFileSync(new URL('../src/lib/push.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function client({ saved = true, permission = 'granted', failSave = false, failToken = false, marker = false, wanted = false, off = false, subscription = true } = {}) {
  const storage = new Map();
  if (marker) storage.set('ll.push', 'private-token');
  if (wanted) storage.set('ll.push.wanted', '1');
  if (off) storage.set('ll.push.disabled', '1');
  const calls = []; let registered = saved; let fail = failSave;
  const reg = { active: { state: 'activated' }, pushManager: { getSubscription: async () => subscription ? {} : null } };
  const firestore = {
    doc: (_db, collection, id) => ({ collection, id }), serverTimestamp: () => 1,
    setDoc: async () => { calls.push('save'); if (fail) throw { code: 'permission-denied', message: 'private-token must not appear' }; registered = true; },
    getDocFromServer: async () => ({ exists: () => registered, data: () => ({ uid: 'u' }) }),
    updateDoc: async (_ref, value) => { calls.push({ diagnostic: value }); },
    deleteDoc: async () => { registered = false; calls.push('delete-record'); },
  };
  const notification = { permission, requestPermission: () => { calls.push('permission'); notification.permission = 'granted'; return Promise.resolve('granted'); } };
  const messaging = { isSupported: async () => { calls.push('supported'); return true; }, getMessaging: () => ({}), getToken: async () => { calls.push('token'); if (failToken) throw { code: 'messaging/token-subscribe-failed', message: 'private-token' }; return 'private-token'; }, deleteToken: async () => { calls.push('delete-token'); } };
  const module = { exports: {} };
  vm.runInNewContext(pushSource, {
    exports: module.exports, require: name => name === 'firebase/messaging' ? messaging : name === 'firebase/firestore' ? firestore : {},
    window: { Notification: notification, matchMedia: () => ({ matches: true }) }, Notification: notification,
    navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 1, serviceWorker: { register: async () => { calls.push('register'); return reg; }, getRegistration: async () => reg } },
    location: { origin: 'https://learn.eltsuite.com', protocol: 'https:' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    setTimeout, clearTimeout, console,
  });
  return { api: module.exports, storage, calls, recover: () => { fail = false; } };
}
let c = client({ permission: 'default', saved: false, failSave: true });
const enabling = c.api.enablePush('u', 'learner', 'learner', 'class');
assert.equal(c.calls[0], 'permission', 'permission must be requested synchronously from the click');
await assert.rejects(enabling, /save/);
assert.equal(c.storage.has('ll.push'), false);
assert.equal(c.storage.get('ll.push.wanted'), '1', 'failed first registration retains consent to retry');
assert.equal(c.api.lastPushDiagnostic().code, 'permission-denied');
assert.ok(!c.storage.get('ll.push.last').includes('private-token'));
assert.equal(await c.api.pushState('u'), 'repair');
c.recover(); await c.api.renewPush('u', 'learner', 'learner', 'class');
assert.equal(await c.api.pushState('u'), 'on');
assert.equal(c.calls.filter(x => x === 'permission').length, 1, 'renewal must not prompt');
await c.api.disablePush();
const callCount = c.calls.length;
await c.api.renewPush('u', 'learner', 'learner', 'class');
assert.equal(c.calls.length, callCount, 'explicit off must not renew');
assert.equal(await c.api.pushState('u'), 'off');
c = client({ marker: true, saved: false }); assert.equal(await c.api.pushState('u'), 'repair', 'local token alone is not proof of registration');
c = client({ marker: true, subscription: false }); assert.equal(await c.api.pushState('u'), 'repair');
c = client({ saved: false }); await c.api.renewPush('u','u','teacher'); assert.equal(c.calls.length, 0, 'legacy explicit off (no marker) must not silently resubscribe');
c = client({ failToken: true }); await assert.rejects(c.api.enablePush('u','u','teacher'), /token/); assert.equal(c.api.lastPushDiagnostic().step, 'token');

// Exercise actual worker callbacks, including returned notification lifetime and click routing.
const handlers = {}, ordering = [], shown = [], opened = [];
let background;
const worker = {
  location: { origin: 'https://learn.eltsuite.com' },
  addEventListener: (name, fn) => { handlers[name] = fn; ordering.push(name); },
  registration: { showNotification: (...args) => { shown.push(args); return Promise.resolve('shown'); } },
  clients: { matchAll: async () => [], openWindow: async url => opened.push(url), claim: async () => {} }, skipWaiting: () => {},
};
vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url),'utf8'), { self: worker, URL, importScripts: () => ordering.push('import'), firebase: { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: fn => { background = fn; } }) } });
assert.equal(ordering[0], 'notificationclick');
assert.equal(await background({ data }), 'shown', 'worker must return notification promise');
background({ notification: { title: 'FCM already displays this' } }); assert.equal(shown.length, 1);
let waiting;
handlers.notificationclick({ stopImmediatePropagation() {}, notification: { close() {}, data: { FCM_MSG: { data: { link: '/messages?c=test' } } } }, waitUntil: p => { waiting = p; } });
await waiting; assert.equal(opened[0], 'https://learn.eltsuite.com/messages?c=test');
handlers.notificationclick({ stopImmediatePropagation() {}, notification: { close() {}, data: { link: 'https://evil.example/' } }, waitUntil: p => { waiting = p; } });
await waiting; assert.equal(opened[1], 'https://learn.eltsuite.com/');
console.log('Push registration, repair, consent, delivery retry, privacy and service-worker tests passed.');

// Integration: acknowledgement decisions in both production callers, not just the helper.
const functionSource = ts.transpileModule(readFileSync(new URL('../functions/index.js', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true } }).outputText;
for (const fails of [true, false]) {
  const updates = [];
  const token = { id: 't', get: key => ({ key: 'recipient', token: 'test-token' })[key], data: () => ({ key: 'recipient', token: 'test-token' }) };
  const db = { collection: () => ({ where: () => ({ get: async () => ({ docs: [token] }) }), doc: () => ({ delete: async () => {} }) }) };
  const fcm = { send: async () => { if (fails) throw { code: 'messaging/server-unavailable' }; return 'accepted'; } };
  const exports = {};
  vm.runInNewContext(functionSource, { exports, console: { warn() {}, log() {} }, require: name => {
    if (name === 'firebase-functions/v2/https') return { onCall: (_o, fn) => fn };
    if (name === 'firebase-functions/v2/firestore') return { onDocumentUpdated: (_o, fn) => fn, onDocumentWritten: (_o, fn) => fn };
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return { getFirestore: () => db };
    if (name === 'firebase-admin/messaging') return { getMessaging: () => fcm };
    if (name === './push-delivery.js') return { sendDevices: (a,b,c,d) => sendDevices(a,b,c,{ ...d, log() {} }) };
    return {};
  } });
  await exports.pushNewMessage({ params: { chatId: 'chat' }, data: { before: { data: () => ({ lastAt: 1 }) }, after: { data: () => ({ lastAt: 2, last: { by: 'sender', text: 'Hello' }, members: ['sender','recipient'] }), ref: { update: async p => updates.push(p) } } } });
  assert.equal(updates.length, fails ? 0 : 1, 'real-time sender must not acknowledge failure');
  if (!fails) assert.equal(updates[0]['pushed.recipient'], 2);
}
const scriptSource = readFileSync(new URL('../scripts/push.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
for (const fails of [true,false]) {
  const updates=[];
  const chat={ id:'chat', data:()=>({lastAt:Date.now(),last:{by:'sender',text:'Hi'},members:['recipient']}),ref:{update:async p=>updates.push(['chat',p])} };
  const announcement={id:'ann',data:()=>({sendAt:Date.now()-1000,to:'all',text:'Hello'}),ref:{update:async p=>updates.push(['announcement',p])}};
  const cls={id:'class',data:()=>({name:'Test class'}),ref:{collection:()=>({where:()=>({get:async()=>({docs:[announcement]})})})}};
  const db={collection:name=> name==='pushTokens'?{get:async()=>({docs:[{id:'t',data:()=>({token:'test-token',key:'recipient',role:'learner',classId:'class'})}]}),doc:()=>({delete:async()=>{}})}:name==='chats'?{where:()=>({get:async()=>({docs:[chat]})})}:{get:async()=>({docs:[cls]})}};
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('initializeApp','applicationDefault','getFirestore','getMessaging','sendDevices','console','process',scriptSource);
  await run(()=>{},()=>({}),()=>db,()=>({send:async()=>{if(fails)throw{code:'messaging/server-unavailable'};return 'accepted';}}),(a,b,c,d)=>sendDevices(a,b,c,{...d,log(){}}),{log(){},error(){}},{exit(){throw new Error('Unexpected exit');}});
  assert.equal(updates.length,fails?0:2,'scheduled sender must leave failed chat and announcement eligible');
}
console.log('Real-time and scheduled sender acknowledgement integration tests passed.');

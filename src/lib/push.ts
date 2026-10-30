import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { app, db } from './firebase';

// Public web-push certificate from this Firebase project; never a server credential.
export const VAPID_KEY = 'BG4WQX_uXyVf6qWOCgViDjVnWgzIub0Ko31AL_FPy0kPO9sOXcq5yohlNV36fPqwkX1qe7KNydWm-ZEM7nQwpjc';
export type PushState = 'unsupported' | 'install-first' | 'not-ready' | 'denied' | 'off' | 'on' | 'repair' | 'unavailable';
type Stage = 'permission' | 'service worker' | 'token' | 'save' | 'saved';
export type PushDiagnostic = { step: Stage; code: string; at: number };
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ON = 'll.push';
const OFF = 'll.push.disabled';
const WANT = 'll.push.wanted';
const DIAGNOSTIC = 'll.push.last';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage may be unavailable */ } };
// Never expose provider messages: these may contain a subscription endpoint or token.
const safeCode = (e: unknown) => {
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'string' && /^[a-z0-9/-]{1,100}$/i.test(code) ? code : 'unknown';
};
export function lastPushDiagnostic(): PushDiagnostic | null {
  try { return JSON.parse(read(DIAGNOSTIC) ?? 'null'); } catch { return null; }
}
function deadline<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('Notification setup timed out'), { code: 'push/timeout' })), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
const note = (uid: string, step: Stage, code = '') => {
  const diagnostic = { step, code, at: Date.now() };
  write(DIAGNOSTIC, JSON.stringify(diagnostic));
  // A failed profile write must not mask the original sign-up error.
  void updateDoc(doc(db, 'users', uid), { [`pushLog.${(isIos() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'computer') + (isStandalone() ? '-app' : '-browser')}`]: { ...diagnostic, err: code } }).catch(() => {});
};
export function pushErrorText(error: unknown): string {
  const step = error instanceof PushSetupError ? error.step : lastPushDiagnostic()?.step;
  const code = error instanceof PushSetupError ? error.code : safeCode(error);
  if (code === 'push/install-first') return 'Open ELT Suite from its home-screen icon, then turn on notifications here.';
  if (code === 'push/unsupported') return 'This browser cannot receive notifications. On an iPhone or iPad, use iOS 16.4 or later and open ELT Suite from its home-screen icon.';
  if (step === 'permission') return 'Notifications are not allowed for this app. Allow them in your device’s notification settings, then try again.';
  if (step === 'service worker') return 'The notification service could not start. Check your connection, close and reopen this app, then try again.';
  if (step === 'save') return code === 'permission-denied' ? 'We could not register this device with your account. Sign in again, then choose Repair notifications. Your work is safe.' : 'We could not save this device’s notification settings. Check your connection and try again.';
  return 'We could not connect this device to the notification service. Check your connection and try again. If it still fails, share the setup code below with support.';
}
class PushSetupError extends Error {
  constructor(readonly step: Stage, readonly code: string) { super(`Notification setup: ${step} (${code})`); }
}

export async function pushState(uid?: string): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (!VAPID_KEY) return 'not-ready';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted' || read(OFF) === '1') return 'off';
  const token = read(ON);
  if (!token) return 'repair';
  try {
    const reg = await deadline(navigator.serviceWorker.getRegistration('/'));
    if (!reg || !(await deadline(reg.pushManager.getSubscription()))) return 'repair';
    if (!uid) return 'repair';
    const saved = await deadline(getDocFromServer(doc(db, 'pushTokens', token)), 8000);
    return saved.exists() && saved.data().uid === uid ? 'on' : 'repair';
  } catch (e) {
    return safeCode(e) === 'permission-denied' ? 'repair' : 'unavailable';
  }
}

// Wait for this registration, rather than an unrelated service worker's ready promise.
function activated(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active?.state === 'activated') return Promise.resolve();
  const worker = reg.installing ?? reg.waiting ?? reg.active;
  if (!worker) return Promise.reject(Object.assign(new Error('No service worker'), { code: 'push/no-worker' }));
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => { clearTimeout(timer); worker.removeEventListener('statechange', check); error ? reject(error) : resolve(); };
    const check = () => {
      if (worker.state === 'activated') done();
      else if (worker.state === 'redundant') done(Object.assign(new Error('Service worker failed'), { code: 'push/worker-failed' }));
    };
    const timer = setTimeout(() => done(Object.assign(new Error('Service worker timed out'), { code: 'push/timeout' })), 15000);
    worker.addEventListener('statechange', check);
    check();
  });
}
async function registerDevice(uid: string, key: string, role: string, classId: string) {
  let step: Stage = 'service worker';
  try {
    const reg = await deadline(navigator.serviceWorker.register('/sw.js', { scope: '/' }));
    await activated(reg);
    step = 'token';
    const token = await deadline(getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }));
    if (!token) throw Object.assign(new Error('No token returned'), { code: 'push/no-token' });
    step = 'save';
    await deadline(setDoc(doc(db, 'pushTokens', token), { token, uid, key, role, classId, origin: location.origin, at: serverTimestamp(), device: navigator.userAgent.slice(0, 160) }));
    const old = read(ON);
    write(ON, token);
    write(OFF, null);
    note(uid, 'saved');
    if (old && old !== token) void deleteDoc(doc(db, 'pushTokens', old)).catch(() => {});
    return true;
  } catch (e) {
    const code = safeCode(e);
    note(uid, step, code);
    throw new PushSetupError(step, code);
  }
}
let registering: Promise<boolean> | null = null;
let registeringFor = '';
function registerOnce(uid: string, key: string, role: string, classId: string): Promise<boolean> {
  const identity = uid + ':' + key;
  if (registering && registeringFor !== identity) return registering.catch(() => false).then(() => registerOnce(uid, key, role, classId));
  if (!registering) { registeringFor = identity; registering = registerDevice(uid, key, role, classId).finally(() => { registering = null; }); }
  return registering;
}
export async function enablePush(uid: string, key: string, role: string, classId = '') {
  // Request permission directly from the button gesture, before any async capability checks.
  try {
    if (isIos() && !isStandalone()) throw new PushSetupError('permission', 'push/install-first');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new PushSetupError('permission', 'push/unsupported');
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') { note(uid, 'permission', permission); return false; }
    if (!(await isSupported())) throw new PushSetupError('permission', 'push/unsupported');
  } catch (e) {
    const code = e instanceof PushSetupError ? e.code : safeCode(e);
    note(uid, 'permission', code);
    throw new PushSetupError('permission', code);
  }
  write(WANT, '1');
  write(OFF, null);
  return registerOnce(uid, key, role, classId);
}

// Recover failed first saves as well as expired tokens, without prompting for permission.
export async function renewPush(uid: string, key: string, role: string, classId = '') {
  if ((!read(ON) && read(WANT) !== '1') || read(OFF) === '1' || !('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator) || (isIos() && !isStandalone())) return;
  if (!(await isSupported().catch(() => false))) return;
  await registerOnce(uid, key, role, classId).catch(() => {}); // safe diagnostics were saved above
}
export async function disablePush() {
  // Serialize with renewal so an in-flight registration cannot turn notifications back on.
  await registering?.catch(() => {});
  const token = read(ON);
  if (token) await deleteDoc(doc(db, 'pushTokens', token));
  await deleteToken(getMessaging(app));
  write(ON, null);
  write(OFF, '1');
  write(WANT, null);
}
export function startServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

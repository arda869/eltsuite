import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';

// Notifications on phones and computers (web push). On an iPhone or iPad they work once
// ELT Suite is on the home screen; elsewhere, in the browser too.
// The public key of the project's web push certificate (Firebase console › Cloud Messaging).
export const VAPID_KEY = 'BG4WQX_uXyVf6qWOCgViDjVnWgzIub0Ko31AL_FPy0kPO9sOXcq5yohlNV36fPqwkX1qe7KNydWm-ZEM7nQwpjc';

export type PushState = 'unsupported' | 'install-first' | 'not-ready' | 'denied' | 'off' | 'on';
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ON = 'll.push';

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (!VAPID_KEY) return 'not-ready';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return Notification.permission === 'granted' && localStorage.getItem(ON) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush(uid: string, key: string, role: string, classId = '') {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) return false;
  await setDoc(doc(db, 'pushTokens', token), { token, uid, key, role, classId, at: serverTimestamp(), device: navigator.userAgent.slice(0, 160) });
  try {
    localStorage.setItem(ON, token);
  } catch {
    /* fine */
  }
  return true;
}

export async function disablePush() {
  let token = '';
  try {
    token = localStorage.getItem(ON) ?? '';
    localStorage.removeItem(ON);
  } catch {
    /* fine */
  }
  if (token) await deleteDoc(doc(db, 'pushTokens', token)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
}

// Keep the service worker registered for an installed app, so it opens fast and can be found again.
export function startServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

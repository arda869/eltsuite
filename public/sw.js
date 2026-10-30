/* ELT Suite on the home screen: shows notifications that arrive while the app is closed,
   and opens the right page when one is tapped. */
// Register before Firebase so its click handler cannot override the app's routing.
self.addEventListener('notificationclick', (e) => {
  e.stopImmediatePropagation();
  e.notification.close();
  const data = e.notification.data || {};
  const message = data.FCM_MSG || {};
  const target = data.link || message.data?.link || message.fcmOptions?.link || '/';
  let link = self.location.origin + '/';
  try {
    const url = new URL(target, self.location.origin);
    if (url.origin === self.location.origin) link = url.href;
  } catch { /* malformed links open the app home */ }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    for (const client of list) {
      if (!('focus' in client) || new URL(client.url).origin !== self.location.origin) continue;
      try { return await (await client.navigate(link) || client).focus(); }
      catch { /* try another window, or open a new one */ }
    }
    return self.clients.openWindow(link);
  }));
});

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA6LrMXl-ND4MGzVjnQs5wQ_50Oa6BywAs',
  authDomain: 'lesson-lit.firebaseapp.com',
  projectId: 'lesson-lit',
  messagingSenderId: '954464859210',
  appId: '1:954464859210:web:1eda470d1c6fef65a462b3',
});
const messaging = firebase.messaging();

// Messages sent with data only are drawn here; ones with a notification part are shown by Firebase.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const d = payload.data || {};
  // Calls stay on screen until answered or dismissed, and buzz harder on phones that can.
  const call = d.call === '1';
  return self.registration.showNotification(d.title || 'ELT Suite', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, renotify: call, requireInteraction: call, vibrate: call ? [400, 200, 400, 200, 400, 200, 400] : undefined, data: { link: d.link || '/' } });
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

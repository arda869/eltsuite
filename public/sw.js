/* Lesson Lit on the home screen: shows notifications that arrive while the app is closed,
   and opens the right page when one is tapped. */
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
  self.registration.showNotification(d.title || 'Lesson Lit', { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, data: { link: d.link || '/' } });
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link))) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.navigate(link).then((w) => (w || c).focus()).catch(() => c.focus());
      return self.clients.openWindow(link);
    }),
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

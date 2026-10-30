// Shared by the Firestore triggers and scheduled backup. FCM acceptance is not proof
// the device displayed a notification. Never acknowledge a transient send failure.
const ORIGINS = new Set(['https://eltsuite.com', 'https://learn.eltsuite.com']);
export const pushErrorCode = (error) => {
  const code = error?.errorInfo?.code ?? error?.code;
  return typeof code === 'string' && /^[a-z0-9/-]{1,100}$/i.test(code) ? code : 'unknown';
};
export function webpushFor(data, ttl, origin) {
  const site = ORIGINS.has(origin) ? origin : 'https://eltsuite.com';
  const path = typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//') && !data.link.includes('\\') ? data.link : '/';
  const call = data.call === '1';
  return {
    headers: { Urgency: 'high', TTL: String(ttl) },
    notification: { title: data.title, body: data.body, icon: site + '/icons/icon-192.png', badge: site + '/icons/icon-192.png', tag: data.tag, renotify: call, requireInteraction: call, ...(call ? { vibrate: [400, 200, 400, 200, 400, 200, 400] } : {}) },
    fcmOptions: { link: site + path },
  };
}
export async function sendDevices(devices, data, ttl, { send, remove, log = console.warn }) {
  let accepted = 0;
  let failed = 0;
  let removed = 0;
  for (const device of devices) {
    try {
      await send({ token: device.token, data, webpush: webpushFor(data, ttl, device.origin) });
      accepted++;
    } catch (error) {
      const code = pushErrorCode(error);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) {
        try { await remove(device.id); removed++; }
        catch { failed++; log('Push device cleanup failed; will retry.'); }
      } else {
        failed++;
        // Codes only: provider messages can contain device tokens or personal data.
        log('Push send failed: ' + code);
      }
    }
  }
  return { accepted, failed, removed, complete: accepted > 0 && failed === 0 };
}

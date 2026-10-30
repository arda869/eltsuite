# Phone push verification

## What changed

- Registration requests permission directly from a button gesture. Service-worker activation, token creation and server storage have bounded waits and safe stage/code diagnostics.
- A granted permission alone no longer means “on”: the client checks its push subscription and server token record for the signed-in account. Missing registration offers Repair notifications; an unavailable server is distinguished from a missing record.
- A failed first registration records explicit intent, allowing later visits to retry without another permission prompt. Explicit opt-out (including legacy devices with no saved token/intent) is respected.
- The real-time and scheduled senders acknowledge a recipient only when at least one device was accepted by FCM and no device had a transient failure. Invalid tokens are removed; failures remain eligible for the scheduled retry within its existing lookback window. Partial failures can repeat delivery to successful devices; the notification tag replaces the same chat notification. This is at-least-once handling, not exactly-once delivery.
- New registrations record their origin so learner-app links stay on learn.eltsuite.com. Older registrations keep the existing eltsuite.com fallback until renewed.
- The service worker installs its click handler before Firebase and returns the notification promise for data-only messages.

## Automated verification

Run `node test/push-notifications.mjs` and `npm run build`. The regression checks exercise the actual client, worker, real-time handler and scheduled script using controlled Firebase/browser boundaries. These checks do not send notifications and do not prove device delivery.

## Production evidence still required

1. On the affected phone, open the installed ELT Suite icon, sign in, and open Settings → App and notifications. Tap Turn on notifications or Repair notifications. If it fails, report only the displayed setup stage and code; never share a device token or subscription endpoint.
2. With authorised Firebase Console access, confirm `users/{uid}.pushLog` reaches `saved` and the matching `pushTokens` record exists. Check project `lesson-lit`: the configured public VAPID key must match Cloud Messaging → Web Push certificates, and the FCM Registration API must be enabled. Do not rotate keys speculatively.
3. Close/background the installed app. From a separate test account, send a new unread message. Verify a phone notification arrives, then tap it and confirm it opens the correct chat in the correct installed origin. Test teacher and learner accounts separately.
4. If registration succeeds but delivery fails, inspect `pushNewMessage` logs for safe FCM error codes and the scheduled Notifications and email summaries job. A green scheduled job alone is not delivery evidence; it may report no registered devices.

For iOS/iPadOS, the installed home-screen app and iOS 16.4 or later are required. Permission must originate from a user interaction. Focus/notification settings can affect presentation, so record those settings when testing.

References: https://webkit.org/blog/13878/ and https://firebase.google.com/docs/cloud-messaging/web/get-started and https://firebase.google.com/docs/cloud-messaging/web/receive-messages

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { deliverAuthEmailJob, parseAuthEmailRequest, queueAuthEmail } from './auth-email-logic.js';

// Keep the account lookup in the background worker. The callable gives the same
// answer for an existing address, an unknown address and an address at its limit.
export const requestAccountEmail = onCall({ region: 'us-central1', maxInstances: 10 }, async req => {
  try {
    parseAuthEmailRequest(req.data);
  } catch {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  try {
    const ip = req.rawRequest?.ip || req.rawRequest?.socket?.remoteAddress || 'unknown';
    return await queueAuthEmail(getFirestore(), req.data, ip);
  } catch (error) {
    console.error('Could not queue an account email:', error?.code || 'unknown');
    throw new HttpsError('unavailable', 'We couldn’t send that link just now. Try again in a moment.');
  }
});

export const deliverAccountEmail = onDocumentCreated({
  document: 'authEmailJobs/{jobId}',
  region: 'us-central1',
  maxInstances: 2,
  concurrency: 10,
  timeoutSeconds: 120,
  secrets: ['SMTP_URL', 'MAIL_FROM'],
}, async event => {
  if (!event.data) return;
  const smtp = process.env.SMTP_URL;
  if (!smtp) {
    console.error('Account email SMTP secret is not bound.');
    return;
  }
  const mail = nodemailer.createTransport(smtp);
  try {
    await mail.verify();
    const result = await deliverAuthEmailJob({
      db: getFirestore(),
      auth: getAuth(),
      jobRef: event.data.ref,
      send: message => mail.sendMail({ from: process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>', ...message }),
    });
    console.log('Account email delivery:', result);
  } catch (error) {
    // Never log a generated action link, an address or an SMTP diagnostic that
    // could contain either. A new request can be made if this attempt failed.
    console.error('Account email delivery failed:', error?.code || 'unknown');
  } finally {
    mail.close();
  }
});

// The creation event is fast, while this sweep picks up transient SMTP/Auth
// failures and jobs stranded by a worker restart. The transaction in
// deliverAuthEmailJob prevents concurrent sends of the same job.
export const retryAccountEmails = onSchedule({
  schedule: '* * * * *',
  region: 'us-central1',
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 540,
  secrets: ['SMTP_URL', 'MAIL_FROM'],
}, async () => {
  const db = getFirestore();
  const due = await db.collection('authEmailJobs').where('nextAttemptAt', '<=', new Date()).limit(100).get();
  if (due.empty) return;
  const smtp = process.env.SMTP_URL;
  if (!smtp) {
    console.error('Account email SMTP secret is not bound.');
    return;
  }
  const mail = nodemailer.createTransport(smtp);
  try {
    await mail.verify();
    const result = { sent: 0, retried: 0, skipped: 0 };
    for (let start = 0; start < due.size; start += 10) {
      const batch = due.docs.slice(start, start + 10);
      await Promise.all(batch.map(async job => {
        try {
          const state = await deliverAuthEmailJob({
            db,
            auth: getAuth(),
            jobRef: job.ref,
            send: message => mail.sendMail({ from: process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>', ...message }),
          });
          if (state === 'sent') result.sent += 1;
          else if (state === 'retry-scheduled') result.retried += 1;
          else result.skipped += 1;
        } catch (error) {
          console.error('Account email retry failed:', error?.code || 'unknown');
        }
      }));
    }
    console.log('Account email retry sweep:', result);
  } catch (error) {
    console.error('Account email retry sweep failed:', error?.code || 'unknown');
  } finally {
    mail.close();
  }
});

// Firestore expiry fields need an active TTL policy or an explicit cleanup.
// This small daily sweep bounds stored rate counters and undelivered jobs.
export const cleanAccountEmailJobs = onSchedule({
  schedule: '0 3 * * *',
  timeZone: 'Etc/UTC',
  region: 'us-central1',
  maxInstances: 1,
}, async () => {
  const db = getFirestore();
  let removed = 0;
  for (const collectionName of ['authEmailJobs', 'authEmailRateLimits']) {
    for (let page = 0; page < 30; page += 1) {
      const expired = await db.collection(collectionName).where('expiresAt', '<=', new Date()).limit(400).get();
      if (expired.empty) break;
      const batch = db.batch();
      expired.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      removed += expired.size;
      if (expired.size < 400) break;
    }
  }
  console.log('Expired account email records removed:', removed);
});

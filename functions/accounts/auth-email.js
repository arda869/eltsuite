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
    const result = await deliverAuthEmailJob({
      db: getFirestore(),
      auth: getAuth(),
      jobRef: event.data.ref,
      send: async message => {
        await mail.verify();
        await mail.sendMail({ from: process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>', ...message });
      },
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
    for (let page = 0; page < 10; page += 1) {
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

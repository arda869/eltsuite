import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';
import { deliverPendingInvitations } from './invitation-delivery-logic.js';

// GitHub's scheduled workflow can arrive late, so invitations use Cloud Scheduler.
export const sendPendingInvitations = onSchedule({
  schedule: 'every 5 minutes',
  region: 'us-central1',
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 540,
  secrets: ['SMTP_URL', 'MAIL_FROM'],
}, async () => {
  const smtp = process.env.SMTP_URL;
  if (!smtp) throw new Error('SMTP_URL is not bound to the scheduled invitation function.');
  const mail = nodemailer.createTransport(smtp);
  await mail.verify();
  const result = await deliverPendingInvitations({
    db: getFirestore(),
    auth: getAuth(),
    mail,
    from: process.env.MAIL_FROM || 'ELT Suite <hello@eltsuite.com>',
  });
  console.log('Invitation delivery:', result);
});

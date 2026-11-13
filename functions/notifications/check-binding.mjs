import { applicationDefault } from 'firebase-admin/app';

const credential = applicationDefault();
const { access_token: token } = await credential.getAccessToken();
const name = 'projects/lesson-lit/locations/us-central1/functions/sendUnreadMessageSummaries';
const response = await fetch(`https://cloudfunctions.googleapis.com/v2/${name}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) throw new Error(`Could not check the deployed email function (${response.status}).`);
const fn = await response.json();
const bound = new Set((fn.serviceConfig?.secretEnvironmentVariables ?? []).map((secret) => secret.key));
if (fn.state !== 'ACTIVE' || !bound.has('SMTP_URL') || !bound.has('MAIL_FROM')) {
  throw new Error('The scheduled email function is not active with both mail secrets bound.');
}
console.log('Scheduled email function is active with SMTP_URL and MAIL_FROM bound.');

const jobName = 'projects/lesson-lit/locations/us-central1/jobs/firebase-schedule-sendUnreadMessageSummaries-us-central1';
const jobResponse = await fetch(`https://cloudscheduler.googleapis.com/v1/${jobName}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!jobResponse.ok) throw new Error(`Could not check the email schedule (${jobResponse.status}).`);
const job = await jobResponse.json();
if (job.state !== 'ENABLED' || !['every 15 minutes', '*/15 * * * *'].includes(job.schedule)) {
  throw new Error('The email schedule is not enabled at 15-minute intervals.');
}
console.log('Cloud Scheduler email job is enabled at 15-minute intervals.');

// Deployment metadata only: never retrieve or print secret values.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

const name = 'projects/lesson-lit/locations/us-central1/functions/sendUnreadMessageSummaries';
const { data: fn } = await client.request({ url: `https://cloudfunctions.googleapis.com/v2/${name}` });
const bound = new Set((fn.serviceConfig?.secretEnvironmentVariables ?? []).map((secret) => secret.key));
if (fn.state !== 'ACTIVE' || !bound.has('SMTP_URL') || !bound.has('MAIL_FROM')) {
  throw new Error('The scheduled email function is not active with both mail secrets bound.');
}
console.log('Scheduled email function is active with SMTP_URL and MAIL_FROM bound.');

const jobName = 'projects/lesson-lit/locations/us-central1/jobs/firebase-schedule-sendUnreadMessageSummaries-us-central1';
const { data: job } = await client.request({ url: `https://cloudscheduler.googleapis.com/v1/${jobName}` });
if (job.state !== 'ENABLED' || !['every 15 minutes', '*/15 * * * *'].includes(job.schedule)) {
  throw new Error('The email schedule is not enabled at 15-minute intervals.');
}
console.log('Cloud Scheduler email job is enabled at 15-minute intervals.');

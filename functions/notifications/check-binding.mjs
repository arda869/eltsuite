// Deployment metadata only: never retrieve or print secret values.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

for (const [functionName, interval, validSchedules] of [
  ['sendUnreadMessageSummaries', '15-minute', ['every 15 minutes', '*/15 * * * *']],
  ['sendPendingInvitations', '5-minute', ['every 5 minutes', '*/5 * * * *']],
]) {
  const name = `projects/lesson-lit/locations/us-central1/functions/${functionName}`;
  const { data: fn } = await client.request({ url: `https://cloudfunctions.googleapis.com/v2/${name}` });
  const bound = new Set((fn.serviceConfig?.secretEnvironmentVariables ?? []).map((secret) => secret.key));
  if (fn.state !== 'ACTIVE' || !bound.has('SMTP_URL') || !bound.has('MAIL_FROM')) {
    throw new Error(`${functionName} is not active with both mail secrets bound.`);
  }
  console.log(`${functionName} is active with SMTP_URL and MAIL_FROM bound.`);

  const jobName = `projects/lesson-lit/locations/us-central1/jobs/firebase-schedule-${functionName}-us-central1`;
  const { data: job } = await client.request({ url: `https://cloudscheduler.googleapis.com/v1/${jobName}` });
  if (job.state !== 'ENABLED' || !validSchedules.includes(job.schedule)) {
    throw new Error(`${functionName} is not enabled at ${interval} intervals.`);
  }
  console.log(`${functionName} Cloud Scheduler job is enabled at ${interval} intervals.`);
}

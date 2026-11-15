// Read deployment metadata and known log markers only. Never print log payloads,
// message content, contact details, credentials, or target URLs.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');
const project = 'lesson-lit';
const region = 'us-central1';
const functionName = 'sendUnreadMessageSummaries';
const jobId = `firebase-schedule-${functionName}-${region}`;
const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
// Cloud Functions and Scheduler GET endpoints require this OAuth scope. Every
// request below is still a GET or the Logging API's read-only entries:list.
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();

const time = (value) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const code = (value) => Number.isInteger(value) && value >= 0 && value <= 599 ? value : null;
const httpError = (error) => ({ available: false, httpStatus: code(Number(error?.response?.status)) });
const logs = async (filter, pageSize) => {
  const { data } = await client.request({
    method: 'POST',
    url: 'https://logging.googleapis.com/v2/entries:list',
    data: { resourceNames: [`projects/${project}`], filter, orderBy: 'timestamp desc', pageSize },
  });
  return data.entries ?? [];
};

const report = { checkedAt: new Date().toISOString(), project, function: functionName, lookbackHours: 48 };

try {
  const { data: fn } = await client.request({
    url: `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions/${functionName}`,
  });
  const bindings = new Set((fn.serviceConfig?.secretEnvironmentVariables ?? []).map((item) => item.key));
  report.deployment = {
    state: fn.state === 'ACTIVE' ? 'ACTIVE' : 'NOT_ACTIVE',
    smtpBound: bindings.has('SMTP_URL'),
    fromBound: bindings.has('MAIL_FROM'),
  };
} catch (error) {
  report.deployment = httpError(error);
}

try {
  const { data: job } = await client.request({
    url: `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs/${jobId}`,
  });
  report.scheduler = {
    state: job.state === 'ENABLED' ? 'ENABLED' : 'NOT_ENABLED',
    every15Minutes: ['every 15 minutes', '*/15 * * * *'].includes(job.schedule),
    lastAttemptAt: time(job.lastAttemptTime),
    lastAttemptStatusCode: code(job.status?.code),
    nextScheduledAt: time(job.scheduleTime),
  };
} catch (error) {
  report.scheduler = httpError(error);
}

try {
  const entries = await logs(
    `resource.type="cloud_scheduler_job" AND resource.labels.job_id="${jobId}" AND timestamp>="${since}"`,
    40,
  );
  report.schedulerAttempts = entries.map((entry) => {
    const kind = String(entry.jsonPayload?.['@type'] ?? entry.protoPayload?.['@type'] ?? '');
    const phase = kind.endsWith('.AttemptStarted') ? 'started' : kind.endsWith('.AttemptFinished') ? 'finished' : 'other';
    const statusCode = code(entry.jsonPayload?.status?.code ?? entry.protoPayload?.status?.code);
    return {
      at: time(entry.timestamp),
      phase,
      outcome: phase === 'finished' ? statusCode === 0 ? 'success' : statusCode !== null || entry.severity === 'ERROR' ? 'failed' : 'unknown' : null,
      statusCode,
    };
  }).filter((entry) => entry.at && entry.phase !== 'other').slice(0, 12);
} catch (error) {
  report.schedulerAttempts = httpError(error);
}

try {
  const entries = await logs(
    `timestamp>="${since}" AND ((resource.type="cloud_run_revision" AND resource.labels.service_name="sendunreadmessagesummaries") OR (resource.type="cloud_function" AND resource.labels.function_name="${functionName}"))`,
    200,
  );
  const marker = (entry) => {
    const message = String(entry.textPayload ?? entry.jsonPayload?.message ?? '');
    if (message.includes('Scheduled email transport authenticated.')) return 'transport_authenticated';
    if (message.includes('Sent a summary of')) return 'summary_sent';
    if (message.includes('Could not send one unread-message summary.')) return 'summary_send_failed';
    if (message.includes('Could not record one sent unread-message summary.')) return 'sent_marker_failed';
    if (message.includes('Could not clear completed unread-message backlog.')) return 'backlog_clear_failed';
    if (message.includes('Could not record handled messages without email.')) return 'handled_marker_failed';
    if (message.includes('SMTP_URL is not bound to the scheduled email function.')) return 'smtp_binding_missing';
    return ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'].includes(entry.severity) ? 'other_function_error' : null;
  };
  report.functionMarkers = entries.map((entry) => ({ at: time(entry.timestamp), marker: marker(entry) }))
    .filter((entry) => entry.at && entry.marker).slice(0, 20);
  report.functionLogsTruncated = entries.length === 200;
} catch (error) {
  report.functionMarkers = httpError(error);
}

console.log(JSON.stringify(report, null, 2));

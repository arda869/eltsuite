// Read deployment metadata and known log markers only. Never print log payloads,
// message content, contact details, credentials, or target URLs.
import { createRequire } from 'node:module';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { collectSummaryBatch, digestCursor, mayHaveEligibleMessage } from './digest-logic.js';

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
initializeApp({ credential: applicationDefault(), projectId: project });

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
    lastAttemptStatusReported: Object.hasOwn(job, 'status'),
    lastAttemptStatusCode: Object.hasOwn(job, 'status') ? code(job.status?.code ?? 0) : null,
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

// Aggregate the current state using the same eligibility logic as the scheduled
// function. This cannot reconstruct the database just before an earlier run:
// its own digest markers or a teacher reading a chat may have changed since.
try {
  const db = getFirestore();
  const users = await db.collection('users').where('msgPrefs.email', '==', true).get();
  const lastAttempt = report.scheduler?.lastAttemptAt;
  const asOf = lastAttempt ? Date.parse(lastAttempt) : Date.now();
  const counts = {
    snapshotAt: new Date().toISOString(),
    evaluatedAt: new Date(asOf).toISOString(),
    historicalStateAvailable: false,
    optedInProfiles: users.size,
    teacherProfiles: 0,
    learnerProfiles: 0,
    profilesWithContact: 0,
    teacherProfilesWithContact: 0,
    learnerProfilesWithContact: 0,
    contactLookupUnavailable: 0,
    chatsWithUnreadHint: 0,
    chatsWithEligibleUnreadMessages: 0,
    teacherEligibleUnreadChats: 0,
    learnerEligibleUnreadChats: 0,
    eligibleUnreadMessages: 0,
    oldestSampledEligibleAgeMinutes: null,
  };
  for (const user of users.docs) {
    const profile = user.data();
    const learner = profile.role === 'learner';
    if (learner) counts.learnerProfiles += 1;
    else counts.teacherProfiles += 1;
    let hasContact = Boolean(String(profile.contactEmail ?? '').trim());
    if (!hasContact && !learner) {
      try { hasContact = Boolean((await getAuth().getUser(user.id)).email); }
      catch { counts.contactLookupUnavailable += 1; }
    }
    if (hasContact) {
      counts.profilesWithContact += 1;
      if (learner) counts.learnerProfilesWithContact += 1;
      else counts.teacherProfilesWithContact += 1;
    }
    const uid = learner ? profile.learnerId : user.id;
    if (!uid || !hasContact) continue;
    const delay = Number(profile.msgPrefs?.after ?? 15) * 60_000;
    if (!Number.isFinite(delay) || delay < 0) continue;
    const cutoff = asOf - delay;
    const chats = await db.collection('chats').where('members', 'array-contains', uid).get();
    for (const chat of chats.docs) {
      const data = chat.data();
      if ((learner && data.emailThread) || !mayHaveEligibleMessage(data, uid, cutoff)) continue;
      counts.chatsWithUnreadHint += 1;
      const cursor = digestCursor(data, uid);
      const base = chat.ref.collection('msgs').where('at', '<=', cutoff)
        .orderBy('at', 'asc').orderBy(FieldPath.documentId(), 'asc');
      let source = base.where('at', cursor.ids ? '>=' : '>', cursor.at);
      const resume = data.digestedPending?.[uid] === true ? data.digestedScanAfter?.[uid] : null;
      if (resume && Number.isFinite(Number(resume.at)) && typeof resume.id === 'string') {
        source = source.startAfter(Number(resume.at), resume.id);
      }
      const batch = await collectSummaryBatch(source, cursor, cutoff, uid);
      if (!batch.count) continue;
      counts.chatsWithEligibleUnreadMessages += 1;
      if (learner) counts.learnerEligibleUnreadChats += 1;
      else counts.teacherEligibleUnreadChats += 1;
      counts.eligibleUnreadMessages += batch.count;
      for (const message of batch.preview) {
        const age = Math.floor((asOf - Number(message.at)) / 60_000);
        if (Number.isFinite(age) && age >= 0) {
          counts.oldestSampledEligibleAgeMinutes = Math.max(counts.oldestSampledEligibleAgeMinutes ?? 0, age);
        }
      }
    }
  }
  report.eligibilitySnapshot = counts;
} catch (error) {
  report.eligibilitySnapshot = httpError(error);
}

console.log(JSON.stringify(report, null, 2));

import test from 'node:test';
import assert from 'node:assert/strict';
import { isAbandonedJob, RUNNING_JOB_MAX_AGE_MS } from '../../functions/ai/jobs.js';
test('an interrupted job becomes recoverable only after the callable limit plus grace', () => {
  const start = 1_000_000;
  for (const elapsed of [0, 180000, 420000, RUNNING_JOB_MAX_AGE_MS - 1]) assert.equal(isAbandonedJob('running', start, start + elapsed), false);
  assert.equal(isAbandonedJob('running', start, start + RUNNING_JOB_MAX_AGE_MS), true);
  assert.equal(isAbandonedJob('running', start, start + 86400000), true);
});
test('completed jobs remain idempotent and missing or future timestamps fail closed', () => {
  for (const status of ['completed', 'failed', undefined]) assert.equal(isAbandonedJob(status, 1000, 1_000_000), false);
  for (const stamp of [undefined, null, NaN, Infinity, '1000', 0, -1, 2_000_000]) assert.equal(isAbandonedJob('running', stamp, 1_000_000), false);
});

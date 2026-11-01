// Callable execution is capped at 540 seconds. Add a full minute of grace before
// treating an interrupted invocation as abandoned. Never restart it automatically.
export const RUNNING_JOB_MAX_AGE_MS = 600_000;
export function isAbandonedJob(status, createdAtMs, now = Date.now()) {
  return status === 'running' && Number.isFinite(createdAtMs) && createdAtMs > 0
    && now - createdAtMs >= RUNNING_JOB_MAX_AGE_MS;
}

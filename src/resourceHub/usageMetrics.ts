import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../lib/firebase';

export type ResourceMetricKind = 'view' | 'download' | 'copy';
type PendingMetric = { activityId: string; kind: ResourceMetricKind; requestId: string };
const endpoint = httpsCallable<PendingMetric, { recorded: boolean }>(getFunctions(app, 'us-central1'), 'recordResourceHubMetric');
const key = (uid: string) => `rh.metrics.pending.${uid}`;
let flushing = false;
const memory = new Map<string, PendingMetric[]>();

const read = (uid: string): PendingMetric[] => {
  try {
    const stored = localStorage.getItem(key(uid));
    if (stored === null) return memory.get(uid) ?? [];
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value.filter(item => item && typeof item.activityId === 'string' && typeof item.requestId === 'string' && ['view', 'download', 'copy'].includes(item.kind)) : [];
  } catch { return memory.get(uid) ?? []; }
};
const write = (uid: string, pending: PendingMetric[]) => {
  const bounded = pending.slice(-100);
  memory.set(uid, bounded);
  try { localStorage.setItem(key(uid), JSON.stringify(bounded)); } catch { /* Private browsing keeps the queue in memory. */ }
};

export async function flushResourceMetrics() {
  const uid = auth.currentUser?.uid;
  if (!uid || flushing || !navigator.onLine) return;
  flushing = true;
  try {
    while (true) {
      const metric = read(uid)[0];
      if (!metric) break;
      if (auth.currentUser?.uid !== uid) break;
      try { await endpoint(metric); }
      catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'functions/failed-precondition' && code !== 'functions/invalid-argument') break;
      } // Keep transient failures and the same request ID for a later retry.
      write(uid, read(uid).filter(item => item.requestId !== metric.requestId));
    }
  } finally { flushing = false; }
}

export function recordResourceMetric(activityId: string, kind: ResourceMetricKind, requestId: string = crypto.randomUUID()) {
  const uid = auth.currentUser?.uid;
  if (!uid || !/^[A-Za-z0-9_-]{1,100}$/.test(activityId)) return;
  const pending = read(uid);
  if (!pending.some(item => item.requestId === requestId)) write(uid, [...pending, { activityId, kind, requestId }]);
  void flushResourceMetrics();
}

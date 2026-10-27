import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { CallLog, LogPerson } from './callEngine';

// Call history: the attendance records the call engine keeps (callLogs), read by the teachers in
// each record's readers. Rooms shows the latest few; its history view, more; one call, in detail.

export type LogDoc = CallLog & { id: string };

// The record is saved about once a minute, so one saved in the last few minutes is a call still on.
const LIVE_MS = 3 * 60000;
export const isLive = (l: CallLog, now = Date.now()) => l.endedAt == null && now - l.savedAt < LIVE_MS;
// When the call ended: its end, or now while it is on, or its last save if it closed without one.
export const endOf = (l: CallLog, now = Date.now()) => l.endedAt ?? (isLive(l, now) ? now : l.savedAt);

// Newest first. The ordered query needs a composite index (readers, startedAt desc); until it
// exists, the records are read without order and sorted here.
export function useCallLogs(uid?: string, max = 20) {
  const [list, setList] = useState<LogDoc[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    let off: (() => void) | null = null;
    const take = (docs: { id: string; data: () => unknown }[]) =>
      setList(
        docs
          .map((d) => ({ ...(d.data() as CallLog), id: d.id }))
          .sort((a, b) => b.startedAt - a.startedAt)
          .slice(0, max),
      );
    const plain = () => (off = onSnapshot(query(collection(db, 'callLogs'), where('readers', 'array-contains', uid), limit(300)), (s) => take(s.docs), () => setList([])));
    off = onSnapshot(
      query(collection(db, 'callLogs'), where('readers', 'array-contains', uid), orderBy('startedAt', 'desc'), limit(max)),
      (s) => take(s.docs),
      () => {
        off?.();
        plain();
      },
    );
    return () => off?.();
  }, [uid, max]);
  return list;
}

// Time inside a set of spans, and the parts of an interval that fall inside them.
type Iv = [number, number];
const overlap = (a: Iv[], b: Iv[]) => {
  let t = 0;
  for (const [x1, x2] of a) for (const [y1, y2] of b) t += Math.max(0, Math.min(x2, y2) - Math.max(x1, y1));
  return t;
};
// The intervals when a mark list was on, ending at the next change or at `end`.
export function onIntervals(marks: [number, boolean][] | undefined, end: number): Iv[] {
  // Only the changes: a mark that repeats the state before it is dropped.
  const m = [...(marks ?? [])].sort((a, b) => a[0] - b[0]).filter((x, i, all) => i === 0 || x[1] !== all[i - 1][1]);
  const out: Iv[] = [];
  m.forEach(([at, on], i) => {
    if (!on) return;
    const to = i + 1 < m.length ? m[i + 1][0] : end;
    if (to > at) out.push([at, to]);
  });
  return out;
}

export type PersonSummary = {
  key: string;
  name: string;
  role: LogPerson['role'];
  spans: Iv[];
  first: number;
  last: number;
  open: boolean; // still in the call
  inMs: number;
  joins: number;
  micMs: number | null;
  camMs: number | null;
  mic: Iv[];
  cam: Iv[];
};

export function summarise(l: CallLog, now = Date.now()): { start: number; end: number; live: boolean; people: PersonSummary[] } {
  const live = isLive(l, now);
  const end = endOf(l, now);
  const people = Object.entries(l.people ?? {}).map(([key, p]): PersonSummary => {
    const spans: Iv[] = (p.spans ?? []).map((s) => [s.in, Math.max(s.in, s.out ?? end)] as Iv).sort((a, b) => a[0] - b[0]);
    const open = live && (p.spans ?? []).some((s) => s.out == null);
    const last = spans.length ? Math.max(...spans.map((s) => s[1])) : l.startedAt;
    const mic = l.media ? onIntervals(p.mic, last) : [];
    const cam = l.media ? onIntervals(p.cam, last) : [];
    return {
      key,
      name: p.name || 'Someone',
      role: p.role,
      spans,
      first: spans[0]?.[0] ?? l.startedAt,
      last,
      open,
      inMs: spans.reduce((t, [a, b]) => t + (b - a), 0),
      joins: spans.length,
      micMs: l.media ? overlap(mic, spans) : null,
      camMs: l.media ? overlap(cam, spans) : null,
      mic,
      cam,
    };
  });
  const order = { teacher: 0, learner: 1, guest: 2 };
  people.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  return { start: l.startedAt, end, live, people };
}

export const minsOf = (ms: number) => Math.round(ms / 60000);
export function durText(ms: number) {
  const m = minsOf(ms);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// Attendance as a CSV file for a spreadsheet: one row a person.
export function attendanceCsv(l: CallLog, now = Date.now()) {
  const { people } = summarise(l, now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Name', 'Role', 'First joined', 'Last left', 'Minutes in the call', 'Times joined', ...(l.media ? ['Minutes with microphone on', 'Minutes with camera on'] : [])];
  const rows = people.map((p) => [p.name, p.role, when(p.first), p.open ? 'Still in' : when(p.last), minsOf(p.inMs), p.joins, ...(l.media ? [minsOf(p.micMs ?? 0), minsOf(p.camMs ?? 0)] : [])]);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// One record, for a call opened by its link (?call=…) before the list has it.
export function useCallLog(id?: string | null) {
  const [l, setL] = useState<LogDoc | null | undefined>(undefined);
  useEffect(() => {
    setL(undefined);
    if (!id) return;
    return onSnapshot(doc(db, 'callLogs', id), (s) => setL(s.exists() ? { ...(s.data() as CallLog), id: s.id } : null), () => setL(null));
  }, [id]);
  return l;
}

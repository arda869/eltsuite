import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { updateItem } from './classes';
import { localZone, validZone } from './tz';
import { eachTime, isSeries, type Repeat } from './repeat';

// Timetable: the classes, meetings and one-to-ones a teacher has, with their times. A class
// session uses the class's own video room, so its link is there from the start; a meeting gets
// a room the moment someone starts it. Weekly sessions are kept once, with how many weeks.

export type SessionKind = 'class' | 'meeting';
export type Session = {
  id: string;
  owner: string;
  ownerName: string;
  kind: SessionKind;
  title: string;
  classId?: string | null;
  itemId?: string | null; // the lesson to teach
  start: number; // the first time, ms
  mins: number;
  tz?: string; // the time zone a weekly session keeps its time in (IANA name)
  weeks?: number; // before repeat: weekly, this many times in all (1 = once)
  repeat?: Repeat | null; // how it repeats (lib/repeat.ts); none: once
  // A meeting's guests from outside: emailed a link and a calendar invitation (scripts/mail.mjs),
  // and again when it changes. h: what the last email said; gone: taken off, to be told.
  guests?: Guest[];
  gone?: Guest[];
  hasGuests?: boolean;
  cancelled?: number; // taken out, with guests still to be told; the mail job then deletes it
  online: boolean;
  video?: { kind: 'eltsuite' | 'meet' | 'teams' | 'zoom' | 'link'; url?: string; by?: string } | null; // online in another tool (lib/meetings.ts)
  place?: string; // in person: where
  attendees?: string[]; // meeting: colleagues' uids
  names?: Record<string, string>;
  notes?: string;
  skip?: number[]; // weeks (0-based) taken out of a weekly session
  live?: { url: string; room: string; at: number; by: string; byName: string } | null;
  gcal?: Record<string, { id: string; h: string; at?: number } | null>; // each teacher's Google Calendar event (see lib/gcal.ts)
  guest?: string; // a meeting's link for people without ELT Suite: callLinks/<code>, pointed at the room when it starts
  at?: number;
};
export type Guest = { email: string; name?: string; h?: string; sent?: number };
export type Occurrence = { s: Session; start: number; end: number; week: number }; // week: the time's number in its series
export { isSeries };

const col = collection(db, 'sessions');

export async function addSession(s: Omit<Session, 'id'>) {
  const ref = await addDoc(col, JSON.parse(JSON.stringify({ tz: localZone(), ...s, at: Date.now() })));
  // The lesson shows its time on the class page and the learners' home too.
  if (s.classId && s.itemId) await updateItem(s.classId, s.itemId, { schedule: { at: s.start } }).catch(() => {});
  return ref.id;
}
export async function saveSession(s: Session) {
  // gcal is each teacher's own, written only by lib/gcal.ts.
  const { id, gcal: _g, ...rest } = s;
  await updateDoc(doc(col, id), JSON.parse(JSON.stringify(rest)));
  if (s.classId && s.itemId) await updateItem(s.classId, s.itemId, { schedule: { at: s.start } }).catch(() => {});
}
// With guests, they are told first: the mail job sends them the cancellation, then deletes it.
export const removeSession = (s: Session) => (s.guests?.length ? updateDoc(doc(col, s.id), { cancelled: Date.now() }) : deleteDoc(doc(col, s.id)));
// A session made before time zones were kept gets its owner's, once.
export const setSessionZone = (s: Session, tz: string) => updateDoc(doc(col, s.id), { tz });
// Undo for a session taken out: back, as it was, with the same id.
export function restoreSession(s: Session) {
  const { id, gcal: _g, ...rest } = s;
  return setDoc(doc(col, id), JSON.parse(JSON.stringify({ ...rest, cancelled: null })));
}
export const skipWeek = (s: Session, week: number) => updateDoc(doc(col, s.id), { skip: [...new Set([...(s.skip ?? []), week])] });
export const setSessionLive = (s: Session, live: Session['live']) => updateDoc(doc(col, s.id), { live });

// Every time a session happens between two moments. Each week is at the same wall-clock time
// in the session's own time zone, so a weekly class does not drift when the clocks change.
export const zoneOf = (s: Pick<Session, 'tz'>) => (s.tz && validZone(s.tz) ? s.tz : localZone());
export function occurrences(list: Session[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const s of list) {
    if (s.cancelled) continue;
    const len = s.mins * 60000;
    const tz = zoneOf(s);
    eachTime(
      s,
      tz,
      (w, start) => {
        if (start > to) return false;
        if (start + len < from || s.skip?.includes(w)) return;
        out.push({ s, start, end: start + len, week: w });
      },
      from - len,
    );
  }
  return out.sort((a, b) => a.start - b.start);
}
// On now, or starting within the next minutes: the time to start or join.
export const isNow = (o: Occurrence, early = 10) => Date.now() >= o.start - early * 60000 && Date.now() <= o.end;

// A teacher's sessions: their own, their classes', and meetings they were invited to.
export function useTeacherSessions(uid?: string, classIds: string[] = []) {
  const [parts, setParts] = useState<Record<string, Session[]>>({});
  const key = classIds.slice().sort().join(',');
  useEffect(() => {
    if (!uid) return;
    const offs: Unsubscribe[] = [];
    const on = (name: string, q: ReturnType<typeof query>) =>
      offs.push(onSnapshot(q, (s) => setParts((p) => ({ ...p, [name]: s.docs.map((d) => ({ ...(d.data() as Omit<Session, 'id'>), id: d.id })) })), () => setParts((p) => ({ ...p, [name]: [] }))));
    on('own', query(col, where('owner', '==', uid)));
    on('invited', query(col, where('attendees', 'array-contains', uid)));
    const ids = key ? key.split(',') : [];
    // One listener per class, so the security rules can check each class.
    for (const id of ids) on('c:' + id, query(col, where('classId', '==', id)));
    return () => offs.forEach((o) => o());
  }, [uid, key]);
  return useMemo(() => {
    const m = new Map<string, Session>();
    Object.values(parts).flat().forEach((s) => m.set(s.id, s));
    return [...m.values()].filter((s) => !s.cancelled);
  }, [parts]);
}
// A learner's: their class's sessions.
export function useClassSessions(classId?: string) {
  const [list, setList] = useState<Session[]>([]);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(
      query(col, where('classId', '==', classId)),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as Omit<Session, 'id'>), id: d.id })).filter((x) => !x.cancelled)),
      () => setList([]),
    );
  }, [classId]);
  return list;
}

export const dayKey = (t: number) => new Date(t).toDateString();
export const timeText = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export function whenText(t: number) {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const day = d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${timeText(t)}`;
}

// Each teacher's time zone, kept on their profile and in zones/{uid}, which colleagues can read
// (so a meeting can show "12:00 PM for Sam, London"). Written only when it changes.
export function saveMyZone(uid: string) {
  const tz = localZone();
  const key = `${uid}:${tz}`;
  try {
    if (localStorage.getItem('ll.tz.saved') === key) return;
  } catch {
    /* private window */
  }
  void Promise.all([updateDoc(doc(db, 'users', uid), { tz }), setDoc(doc(db, 'zones', uid), { tz, at: Date.now() })])
    .then(() => {
      try {
        localStorage.setItem('ll.tz.saved', key);
      } catch {
        /* private window */
      }
    })
    .catch(() => {});
}
const zoneCache = new Map<string, Promise<string | null>>();
export function useZones(uids: string[]) {
  const [z, setZ] = useState<Record<string, string>>({});
  const key = [...new Set(uids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    const ids = key.split(',');
    void Promise.all(
      ids.map((id) => {
        if (!zoneCache.has(id)) zoneCache.set(id, getDoc(doc(db, 'zones', id)).then((d) => (d.exists() && validZone(d.data().tz) ? String(d.data().tz) : null), () => null));
        return zoneCache.get(id)!.then((tz) => [id, tz] as const);
      }),
    ).then((all) => live && setZ(Object.fromEntries(all.filter(([, tz]) => tz)) as Record<string, string>));
    return () => {
      live = false;
    };
  }, [key]);
  return z;
}

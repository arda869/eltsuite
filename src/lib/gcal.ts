import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { zoneOf, type Session } from './sessions';
import { toFields } from './tz';
import { rrule, timeAt } from './repeat';

// Google Calendar, from the browser alone (there is no server): Google Identity Services gives an
// access token for calendar.events, kept in memory only, and the Calendar API v3 is called
// directly. Each teacher's sessions go to their own primary calendar, one event per session, a
// weekly session as one repeating event (RRULE with COUNT, EXDATE for the weeks taken out).
//
// Event ids are made from the session and the teacher, so the same session is never added twice,
// even from two devices; each teacher's id is also kept on the session, in gcal.<uid>, with a
// fingerprint of what was sent, so a change made anywhere is sent again when they are here.

export const SITE = 'https://eltsuite.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// The OAuth Client ID (public, not a secret). It can also be set by the owner in Settings.
export const GOOGLE_CLIENT_ID = '';

export type GcalSetting = { on: boolean; email?: string; epoch?: number };
export type GcalMark = { id: string; h: string; at?: number };

// ------------------------------------------------------------------ the setting, per teacher
export function useGcalSetting(uid?: string) {
  const [s, setS] = useState<GcalSetting | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (d) => setS(((d.data()?.calendar as { google?: GcalSetting } | undefined)?.google ?? { on: false }) as GcalSetting),
      () => setS({ on: false }),
    );
  }, [uid]);
  return s;
}
export const saveGcalSetting = (uid: string, g: GcalSetting) => updateDoc(doc(db, 'users', uid), { 'calendar.google': JSON.parse(JSON.stringify(g)) });

// ------------------------------------------------------------------ the Client ID
let clientId: string | null = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID || null;
let idAsked: Promise<string | null> | null = null;
export function googleClientId(): Promise<string | null> {
  if (clientId) return Promise.resolve(clientId);
  idAsked ??= getDoc(doc(db, 'admin', 'google'))
    .then((d) => (clientId = String(d.data()?.clientId ?? '').trim() || null))
    .catch(() => null);
  return idAsked;
}
export function setGoogleClientIdLocal(id: string) {
  clientId = id.trim() || null;
  idAsked = null;
  client = null;
}

// ------------------------------------------------------------------ Google Identity Services
type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string; hint?: string; login_hint?: string }) => void };
type Gis = { accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }) => TokenClient; revoke: (t: string, done?: () => void) => void } } };
const gis = () => (window as unknown as { google?: Gis }).google;
let loading: Promise<void> | null = null;
function loadGis() {
  if (gis()?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => ((loading = null), rej(new Error('Google sign-in didn’t load. Check your connection and try again.')));
    document.head.appendChild(s);
  });
  return loading;
}
let client: TokenClient | null = null;
let token: { value: string; exp: number } | null = null;
let waiting: { res: (t: string) => void; rej: (e: Error) => void }[] = [];
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());
export const hasToken = () => !!token && token.exp > Date.now() + 60_000;
export class GcalError extends Error {}
const settle = (r: TokenResponse) => {
  const w = waiting;
  waiting = [];
  if (r.access_token) {
    token = { value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 };
    w.forEach((x) => x.res(r.access_token!));
  } else {
    const denied = r.error === 'access_denied';
    const e = new GcalError(denied ? 'Google didn’t let ELT Suite in. While Google is still checking the app, only people added as test users can connect.' : r.error === 'popup_closed' ? 'The Google window was closed before it finished.' : 'We couldn’t connect Google Calendar. Try again.');
    w.forEach((x) => x.rej(e));
  }
  ping();
};
// Get ready ahead of time, so asking for a token can happen straight away on a click.
export async function prepareGoogle() {
  const id = await googleClientId();
  if (!id) return false;
  await loadGis();
  client ??= gis()!.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: settle, error_callback: (e) => settle({ error: e.type === 'popup_closed' ? 'popup_closed' : e.type ?? 'error' }) });
  return true;
}
export const googleReady = () => !!client;
// Ask Google for a token. Call it from a click: browsers only open Google's window then. With
// consent already given, the window closes by itself at once.
export function askToken(o: { consent?: boolean; hint?: string } = {}): Promise<string> {
  if (hasToken()) return Promise.resolve(token!.value);
  if (!client) return Promise.reject(new GcalError('Google Calendar isn’t set up for ELT Suite yet.'));
  const p = new Promise<string>((res, rej) => waiting.push({ res, rej }));
  if (waiting.length === 1) client.requestAccessToken({ prompt: o.consent ? 'consent' : '', ...(o.hint ? { hint: o.hint, login_hint: o.hint } : {}) });
  return p;
}
export function forgetToken() {
  if (token) gis()?.accounts.oauth2.revoke(token.value);
  token = null;
  ping();
}
export function useTokenState() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return hasToken();
}

// ------------------------------------------------------------------ the Calendar API
async function call(method: string, url: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  if (!hasToken()) throw new GcalError('no token');
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token!.value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) {
    token = null;
    ping();
    throw new GcalError('no token');
  }
  const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, data };
}

// The event id for a session in a teacher's calendar: base32hex (a-v, 0-9), the same every time.
export async function eventId(sessionId: string, uid: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`eltsuite:${sessionId}:${uid}`)));
  return 'elt' + [...b.slice(0, 20)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const stamp = (t: number, tz: string) => {
  const f = toFields(t, tz);
  return `${f.date.replace(/-/g, '')}T${f.time.replace(':', '')}00`;
};

export type EventExtras = { video?: { url: string; label: string } | null; conference?: Record<string, unknown> | null; className?: string; lessonTitle?: string };
// What a session looks like in Google Calendar.
export function eventFor(s: Session, x: EventExtras = {}) {
  const tz = zoneOf(s);
  const start = toFields(s.start, tz);
  const end = toFields(s.start + s.mins * 60000, tz);
  const rule = rrule(s, tz);
  const skips = rule ? (s.skip ?? []).map((w) => timeAt(s, tz, w)).filter((t): t is number => t !== null).sort((a, b) => a - b) : [];
  const who = s.kind === 'meeting' ? [s.ownerName, ...(s.attendees ?? []).map((a) => s.names?.[a] ?? '')].filter(Boolean) : [];
  const lines = [
    s.kind === 'class' ? `Class: ${x.className ?? ''}`.trim() : who.length ? `Meeting with ${who.join(', ')}` : 'Meeting',
    x.lessonTitle ? `Lesson: ${x.lessonTitle}` : '',
    x.video ? `${x.video.label}: ${x.video.url}` : '',
    !s.online && s.place ? `Where: ${s.place}` : '',
    s.notes ? `\n${s.notes}` : '',
    `\nOpen in ELT Suite: ${SITE}/timetable?day=${toFields(s.start, tz).date}`,
  ].filter(Boolean);
  return {
    summary: s.title || 'Untitled',
    description: lines.join('\n'),
    location: !s.online && s.place ? s.place : x.video?.url ?? '',
    start: { dateTime: `${start.date}T${start.time}:00`, timeZone: tz },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: tz },
    ...(rule ? { recurrence: [rule, ...(skips.length ? [`EXDATE;TZID=${tz}:${skips.map((t) => stamp(t, tz)).join(',')}`] : [])] } : {}),
    source: { title: 'ELT Suite', url: `${SITE}/timetable` },
    extendedProperties: { private: { eltsuite: '1', session: s.id } },
    status: 'confirmed',
    ...(x.conference ? { conferenceData: x.conference } : {}),
  };
}
export const fingerprint = (body: unknown, epoch = 0) => hash(JSON.stringify(body) + ':' + epoch);

// Put one session in the calendar, or bring it up to date. Returns the event, as Google has it.
export async function putEvent(s: Session, uid: string, body: ReturnType<typeof eventFor>, mark?: GcalMark | null) {
  const id = mark?.id || (await eventId(s.id, uid));
  const q = body.conferenceData ? '?conferenceDataVersion=1' : '';
  // New: add it (with its own id; if it is there already, from another device, change it).
  // Known: change it (if it was deleted in Google Calendar since, add it again).
  let r = mark?.id ? await call('PUT', `${API}/${id}${q}`, { ...body, id }) : await call('POST', `${API}${q}`, { ...body, id });
  if (r.status === 404) r = await call('POST', `${API}${q}`, { ...body, id });
  if (r.status === 409) r = await call('PUT', `${API}/${id}${q}`, { ...body, id });
  if (r.status >= 300) throw new GcalError(String((r.data.error as { message?: string } | undefined)?.message ?? 'Google Calendar said no.'));
  return { id, event: r.data };
}
export async function deleteEvent(id: string) {
  const r = await call('DELETE', `${API}/${id}`);
  return r.status < 300 || r.status === 404 || r.status === 410;
}
// Every event ELT Suite has put in this calendar, with the session it is for.
export async function ourEvents() {
  const out: { id: string; session: string; status: string }[] = [];
  let page = '';
  let summary = '';
  for (let i = 0; i < 10; i++) {
    const r = await call('GET', `${API}?privateExtendedProperty=${encodeURIComponent('eltsuite=1')}&maxResults=2500&showDeleted=false&fields=summary,nextPageToken,items(id,status,extendedProperties)${page ? '&pageToken=' + page : ''}`);
    if (r.status >= 300) break;
    summary ||= String(r.data.summary ?? '');
    for (const e of (r.data.items as { id: string; status: string; extendedProperties?: { private?: Record<string, string> } }[] | undefined) ?? []) out.push({ id: e.id, session: e.extendedProperties?.private?.session ?? '', status: e.status });
    page = String(r.data.nextPageToken ?? '');
    if (!page) break;
  }
  return { events: out, calendar: summary };
}
// Gone, or no longer this teacher's to see.
const gone = (sid: string) =>
  getDoc(doc(db, 'sessions', sid)).then(
    (x) => !x.exists(),
    (err: { code?: string }) => err?.code === 'permission-denied',
  );
const mark = (sid: string, uid: string, m: GcalMark | null) => updateDoc(doc(db, 'sessions', sid), { [`gcal.${uid}`]: m });

// ------------------------------------------------------------------ keeping it up to date
export type SyncState = { state: 'off' | 'idle' | 'busy' | 'waiting' | 'error' | 'unset'; waiting: number; error?: string; email?: string };
type Item = { s: Session; extras: EventExtras };
// While the timetable is open: what changed goes to Google Calendar; sessions that are gone, or
// that this teacher is no longer part of, come out of it.
export function useGcalSync(uid: string, items: Item[], setting: GcalSetting | null): SyncState & { wake: () => void } {
  const live = useTokenState();
  const [state, setState] = useState<SyncState>({ state: 'off', waiting: 0 });
  const busy = useRef(false);
  const again = useRef(false);
  const swept = useRef(0);
  const seen = useRef<Set<string> | null>(null);
  const latest = useRef(items);
  latest.current = items;
  const on = !!setting?.on;
  const epoch = setting?.epoch ?? 0;
  useEffect(() => {
    if (on) void prepareGoogle().then((ok) => !ok && setState({ state: 'unset', waiting: 0 }));
  }, [on]);
  const todo = () =>
    latest.current
      .map((it) => ({ ...it, body: eventFor(it.s, it.extras) }))
      .map((it) => ({ ...it, h: fingerprint(it.body, epoch), mark: it.s.gcal?.[uid] ?? null }))
      .filter((it) => !it.mark || it.mark.h !== it.h)
      // Another device may be sending it right now.
      .filter((it) => !(it.mark && !it.mark.id && (it.mark.at ?? 0) > Date.now() - 60_000));
  const run = async () => {
    if (!on || !uid) return;
    if (busy.current) return void (again.current = true);
    const list = todo();
    if (!hasToken()) return setState((x) => ({ ...x, state: list.length ? 'waiting' : x.state === 'unset' ? 'unset' : 'idle', waiting: list.length }));
    busy.current = true;
    setState({ state: 'busy', waiting: list.length, email: setting?.email });
    let error = '';
    try {
      for (const it of list) {
        await mark(it.s.id, uid, { id: it.mark?.id ?? '', h: it.mark?.h ?? '', at: Date.now() }).catch(() => {});
        try {
          const r = await putEvent(it.s, uid, it.body, it.mark);
          await mark(it.s.id, uid, { id: r.id, h: it.h });
          // A Google Meet asked for: its link goes on the session, for the learners and the others.
          const meet = String(r.event.hangoutLink ?? '');
          if (it.extras.conference && meet.startsWith('https://')) await updateDoc(doc(db, 'sessions', it.s.id), { 'video.url': meet }).catch(() => {});
        } catch (e) {
          await mark(it.s.id, uid, it.mark).catch(() => {});
          throw e;
        }
      }
      // A session that has just left the timetable: out of the calendar too, if it is gone.
      const now = new Set(latest.current.map((it) => it.s.id));
      for (const sid of seen.current ?? []) if (!now.has(sid) && (await gone(sid))) await deleteEvent(await eventId(sid, uid));
      seen.current = now;
      // Now and then, take out the events whose session has gone.
      if (Date.now() - swept.current > 10 * 60_000) {
        swept.current = Date.now();
        const mine = new Set(latest.current.map((it) => it.s.id));
        const { events, calendar } = await ourEvents();
        if (calendar && setting && calendar !== setting.email && calendar.includes('@')) void saveGcalSetting(uid, { ...setting, email: calendar }).catch(() => {});
        for (const e of events) if (e.session && !mine.has(e.session) && (await gone(e.session))) await deleteEvent(e.id);
      }
    } catch (e) {
      error = e instanceof GcalError && e.message !== 'no token' ? e.message : e instanceof Error && e.message !== 'no token' ? 'We couldn’t update Google Calendar.' : '';
    } finally {
      busy.current = false;
    }
    const left = todo().length;
    setState({ state: error ? 'error' : left && !hasToken() ? 'waiting' : 'idle', waiting: left, error, email: setting?.email });
    if (again.current) {
      again.current = false;
      void run();
    }
  };
  const key = items.map((it) => it.s.id + ':' + fingerprint(eventFor(it.s, it.extras), epoch) + ':' + (it.s.gcal?.[uid]?.h ?? '')).join('|');
  useEffect(() => {
    if (!on) return setState({ state: 'off', waiting: 0 });
    const t = window.setTimeout(() => void run(), 800);
    return () => window.clearTimeout(t);
  }, [key, on, live, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  // From a click: get a token if there is none (Google's window closes by itself), then send.
  const wake = () => {
    if (!on) return;
    if (hasToken()) return void run();
    if (!googleReady()) return;
    askToken({ hint: setting?.email }).then(
      () => void run(),
      (e: Error) => setState((x) => ({ ...x, state: 'error', error: e.message })),
    );
  };
  return { ...state, wake };
}
// Take every ELT Suite event out of this teacher's calendar (when they turn it off).
export async function removeAll() {
  const { events } = await ourEvents();
  for (const e of events) await deleteEvent(e.id);
  return events.length;
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { useTeacherClasses } from '../lib/coteach';
import { useClassDetails } from './TeacherHome';
import { theme } from '../lib/themes';
import { addSession, isNow, occurrences, removeSession, restoreSession, saveMyZone, saveSession, setSessionLive, setSessionZone, skipWeek, useTeacherSessions, whenText, zoneOf, type Occurrence, type Session, type SessionKind } from '../lib/sessions';
import { fromFields, localZone, shiftInZone } from '../lib/tz';
import { useGcalSetting, useGcalSync } from '../lib/gcal';
import { external, joinUrl, useVideoPrefs, videoLabel } from '../lib/meetings';
import { callStartError, openCall, pointGuestLink, takeRoom } from '../lib/calls';
import { joinClassVideo } from '../components/VideoCall';
import { useDirectory } from '../lib/directory';
import { tell } from '../lib/ask';
import { IconBtn, UiIcon } from '../components/UiIcon';
import type { ClassDoc } from '../lib/classes';
import { addMonths, monthStart, niceStart, shortDay, span, spanTitle, startOfDay, step, VIEWS, type View } from './timetable/dates';
import { TimeGrid, type GridEv } from './timetable/TimeGrid';
import { MonthGrid } from './timetable/MonthGrid';
import { MiniMonth, Schedule } from './timetable/Schedule';
import { MoreList, QuickCreate, SessionPop } from './timetable/Cards';
import { SessionDialog } from './timetable/SessionDialog';
import { Pop, ScopeAsk, Shortcuts, ToastBar, type Anchor, type ScopeReq, type Toast } from './timetable/Pop';
import './timetable.css';

// Timetable: classes and meetings by day, week, month or as a list. Class sessions open the
// lesson and the class's video room; meetings get a call room when they start, and everyone
// invited is called. It works like a calendar: drag to add, drag to move, keys to get about.

// Starting, or joining, a session.
export async function startSession(o: Occurrence, c: ClassDoc | undefined, me: { uid: string; name: string }, go: (to: string) => void) {
  const s = o.s;
  // In Google Meet, Teams, Zoom or another tool: that opens in its own tab (the lesson here).
  const link = joinUrl(s);
  if (link) {
    window.open(link, '_blank', 'noopener');
    if (s.kind === 'class' && s.classId) go(s.itemId ? `/class/${s.classId}/lesson/${s.itemId}?teach=1` : `/class/${s.classId}`);
    return;
  }
  if (external(s)) return void tell('The link for this session is not ready yet. It is made when the session is saved, or for Google Meet when Google Calendar is connected.');
  if (s.kind === 'class' && s.classId) {
    if (s.online && c) await joinClassVideo(c, true);
    go(s.itemId ? `/class/${s.classId}/lesson/${s.itemId}?teach=1` : `/class/${s.classId}`);
    return;
  }
  if (s.live && Date.now() - s.live.at < 8 * 3600e3) return openCall({ url: s.live.url, title: s.title, kind: 'video', sessionId: s.id, sub: 'Meeting' });
  try {
    const r = await takeRoom('session:' + s.id);
    await setSessionLive(s, { url: r.url, room: r.name, at: Date.now(), by: me.uid, byName: me.name });
    if (s.guest) void pointGuestLink(s.guest, r.url);
    openCall({ url: r.url, title: s.title, kind: 'video', sessionId: s.id, sub: 'Meeting' });
  } catch (e) {
    void tell(callStartError(e, 'The meeting could not be started. Please try again.'));
  }
}

// Kept on this device: the view, the side panel, which calendars are hidden, the last class.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem('ll.ttb.' + k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem('ll.ttb.' + k, v);
    } catch {
      /* private window */
    }
  },
};
const NARROW = '(max-width: 700px)';
const narrowNow = () => window.matchMedia(NARROW).matches;
function useNarrow() {
  const [n, setN] = useState(narrowNow);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setN(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return n;
}
const copyOf = (s: Session): Omit<Session, 'id'> => {
  const { id: _id, at: _at, gcal: _g, ...rest } = s;
  return { ...rest, live: null, skip: [] };
};

export function TimetablePage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const me = useMemo(() => ({ uid, name: user?.displayName || 'Teacher' }), [uid, user?.displayName]);
  const navigate = useNavigate();
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const sessions = useTeacherSessions(uid, active.map((c) => c.id));
  const { items } = useClassDetails(active.map((c) => c.id));
  const dirx = useDirectory();
  const colleagues = dirx?.groups.find((g) => g.id === 'colleagues')?.people ?? [];

  // eltsuite.com/timetable?day=2026-10-29 (the link in Google Calendar) opens that day.
  const [params] = useSearchParams();
  const linked = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? startOfDay(fromFields(params.get('day')!, '12:00', localZone())) : null;
  const [view, setViewNow] = useState<View>(() => (linked ? 'day' : narrowNow() ? (store.get('view') === 'schedule' ? 'schedule' : 'day') : (store.get('view') as View) || 'week'));
  const [anchor, setAnchor] = useState(() => linked ?? startOfDay(Date.now()));
  const [dir, setDir] = useState(0);
  const [side, setSide] = useState(() => store.get('side') !== '0');
  const [drawer, setDrawer] = useState(false);
  const [hidden, setHidden] = useState<string[]>(() => (store.get('hidden') ?? '').split(',').filter(Boolean));
  const [lastClass, setLastClass] = useState(() => store.get('class'));
  const [pending, setPending] = useState<{ start: number; end: number; at: Anchor; title?: string } | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const [hold, setHold] = useState<{ key: string; start: number; mins: number } | null>(null);
  const [picked, setPicked] = useState<{ ev: GridEv; at: Anchor } | null>(null);
  const [more, setMore] = useState<{ day: number; list: GridEv[]; at: Anchor } | null>(null);
  const [editing, setEditing] = useState<Partial<Session> | null>(null);
  const [help, setHelp] = useState(false);
  const [scope, setScope] = useState<ScopeReq | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const narrow = useNarrow();
  // Phones show a day, or the schedule: weeks and months need a bigger screen.
  useEffect(() => {
    if (narrow && (view === 'week' || view === 'month')) setViewNow('day');
  }, [narrow, view]);
  // The teacher's time zone; and sessions from before time zones were kept get theirs, once.
  useEffect(() => void (uid && saveMyZone(uid)), [uid]);
  const zoned = useRef(new Set<string>());
  useEffect(() => {
    for (const s of sessions) if (s.owner === uid && !s.tz && !zoned.current.has(s.id)) (zoned.current.add(s.id), void setSessionZone(s, localZone()).catch(() => {}));
  }, [sessions, uid]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const cls = (id?: string | null) => active.find((c) => c.id === id);
  // Google Calendar: everything in this timetable, kept up to date while it is open.
  const gset = useGcalSetting(uid);
  const vprefs = useVideoPrefs(uid);
  const lessonOf = (s: Session) => (s.itemId ? (items[s.classId ?? ''] ?? []).find((i) => i.id === s.itemId)?.title : undefined);
  const sync = useGcalSync(
    uid,
    sessions.map((s) => {
      const c = cls(s.classId);
      const link = joinUrl(s);
      const meet = s.online && s.video?.kind === 'meet' && s.video.by === uid && !s.video.url;
      return {
        s,
        extras: {
          className: c?.name,
          lessonTitle: lessonOf(s),
          video: link ? { url: link, label: videoLabel(s.video?.kind) } : s.kind === 'class' && s.online && !external(s) && c?.video?.url ? { url: c.video.url, label: 'Class video room' } : null,
          conference: meet ? { createRequest: { requestId: `elt-${s.id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } : null,
        },
      };
    }),
    gset,
  );
  const mine = (o: Occurrence) => o.s.owner === uid || !!cls(o.s.classId);
  const colorOf = (o: Occurrence) => (o.s.kind === 'class' ? theme(cls(o.s.classId)?.themeColor).accent : 'var(--ink)');
  const subOf = (o: Occurrence) => (o.s.kind === 'class' ? cls(o.s.classId)?.name ?? '' : (o.s.attendees ?? []).length ? `Meeting with ${[o.s.owner !== uid ? o.s.ownerName : '', ...(o.s.attendees ?? []).filter((a) => a !== uid).map((a) => o.s.names?.[a] ?? 'a colleague')].filter(Boolean).join(', ')}` : 'Meeting');
  const shown = (o: Occurrence) => !hidden.includes(o.s.kind === 'meeting' ? 'meetings' : o.s.classId ?? '');

  const { from, to, days } = span(view, anchor);
  // Lessons with a time but no session yet show too, lightly.
  const loneIn = (a: number, b: number): Occurrence[] =>
    active.flatMap((c) =>
      (items[c.id] ?? [])
        .filter((i) => i.type === 'lesson' && i.schedule?.at && i.schedule.at >= a && i.schedule.at < b && !sessions.some((s) => s.itemId === i.id))
        .map((i) => ({ s: { id: 'i:' + i.id, owner: uid, ownerName: '', kind: 'class' as SessionKind, title: i.title, classId: c.id, itemId: i.id, start: i.schedule!.at, mins: 60, online: !!c.video?.url } as Session, start: i.schedule!.at, end: i.schedule!.at + 3600e3, week: 0 })),
    );
  const all = [...occurrences(sessions, from, to), ...loneIn(from, to)].filter(shown);
  const evs: GridEv[] = all.map((o) => ({ o, color: colorOf(o), sub: subOf(o), edit: mine(o), key: o.s.id + ':' + o.week }));
  const pickedKey = picked?.ev.key ?? null;
  const next = occurrences(sessions, Date.now() - 3 * 3600e3, Date.now() + 14 * 864e5).find((o) => o.end > Date.now());
  // Dots in the small month: which days have something on.
  const busyDays = useMemo(() => {
    const a = addMonths(monthStart(anchor), -2);
    return new Set(occurrences(sessions, a, addMonths(a, 5)).map((o) => startOfDay(o.start)));
  }, [sessions, anchor]);

  const closeAll = () => (setPending(null), setPicked(null), setMore(null));
  const go = (d: number) => (closeAll(), setDir(d), setAnchor((a) => step(view, a, d)));
  const jump = (d: number) => (closeAll(), setDir(d === anchor ? 0 : d > anchor ? 1 : -1), setAnchor(startOfDay(d)), narrowNow() && setDrawer(false));
  const setView = (v: View) => (closeAll(), setDir(0), setViewNow(v), store.set('view', v));
  const toggleSide = () => (narrowNow() ? setDrawer((x) => !x) : setSide((x) => (store.set('side', x ? '0' : '1'), !x)));
  const toggleHidden = (k: string) => setHidden((h) => {
    const n = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    store.set('hidden', n.join(','));
    return n;
  });
  const say = (text: string, undo?: Toast['undo']) => setToast({ id: Date.now(), text, undo: undo && (() => (sync.wake(), undo())) });
  const fresh = (): Partial<Session> => ({ kind: active.length ? 'class' : 'meeting', start: niceStart(anchor), mins: 60, weeks: 1, online: true, classId: (lastClass && cls(lastClass) ? lastClass : active[0]?.id) ?? null });
  const askScope = (verb: string, ev: GridEv) => new Promise<'one' | 'all' | null>((resolve) => setScope({ verb, title: ev.o.s.title || 'Untitled', day: shortDay(ev.o.start), resolve }));
  const edit = (ev: GridEv) => {
    closeAll();
    const s = ev.o.s;
    setEditing(s.id.startsWith('i:') ? { kind: 'class', classId: s.classId, itemId: s.itemId, title: s.title, start: ev.o.start, mins: 60, weeks: 1, online: s.online } : s);
  };

  // Moving a session, or making it longer or shorter. A weekly one asks: this one, or every week?
  const change = async (ev: GridEv, start: number, mins: number) => {
    sync.wake();
    closeAll();
    const o = ev.o;
    const s = o.s;
    const moved = start !== o.start;
    const done = moved ? `Moved to ${whenText(start)}` : `Now ${mins} minutes`;
    try {
      if (s.id.startsWith('i:')) {
        const id = await addSession({ owner: uid, ownerName: me.name, kind: 'class', title: s.title, classId: s.classId, itemId: s.itemId, start, mins, weeks: 1, online: s.online, live: null });
        return say(done, () => removeSession({ id } as Session));
      }
      let which: 'one' | 'all' = 'all';
      if ((s.weeks ?? 1) > 1) {
        setHold({ key: ev.key, start, mins });
        const r = await askScope(moved ? 'Move' : 'Change', ev);
        if (!r) return setHold(null);
        which = r;
      }
      if (which === 'all') {
        await saveSession({ ...s, start: shiftInZone(s.start, o.start, start, zoneOf(s)), mins });
        say((s.weeks ?? 1) > 1 ? done + ', every week' : done, () => saveSession(s));
      } else {
        await skipWeek(s, o.week);
        const id = await addSession({ ...copyOf(s), start, mins, weeks: 1 });
        say(done + ', this time only', async () => (await removeSession({ id } as Session), await saveSession(s)));
      }
    } catch (e) {
      console.error(e);
      void tell('It could not be changed. Please try again.');
    } finally {
      setHold(null);
    }
  };
  // Taking a session out: at once, with Undo. A weekly one asks which.
  const takeOut = async (ev: GridEv) => {
    const s = ev.o.s;
    if (!ev.edit || s.id.startsWith('i:')) return;
    sync.wake();
    closeAll();
    try {
      if ((s.weeks ?? 1) > 1) {
        const r = await askScope('Take out', ev);
        if (!r) return;
        if (r === 'one') {
          await skipWeek(s, ev.o.week);
          return say(`Took out ${shortDay(ev.o.start)}`, () => saveSession(s));
        }
      }
      await removeSession(s);
      say(`Took out “${s.title}”`, () => restoreSession(s).catch(() => tell('It could not be put back.')));
    } catch (e) {
      console.error(e);
      void tell('It could not be taken out. Please try again.');
    }
  };

  // Keyboard shortcuts, as in Google Calendar.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement ? !['checkbox', 'radio', 'button'].includes(t.type) : !!t.closest?.('textarea, select, [contenteditable="true"], .sel-list');
    if (typing || editing || scope || help || document.querySelector('.scrim, .sel-list')) return;
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-occ]')?.dataset.occ;
    const target = picked?.ev ?? evs.find((x) => x.key === focused);
    const k = e.key;
    const act: Record<string, () => void> = {
      '?': () => (closeAll(), setHelp(true)),
      t: () => jump(startOfDay(Date.now())),
      j: () => go(1),
      n: () => go(1),
      k: () => go(-1),
      p: () => go(-1),
      c: () => (closeAll(), setEditing(fresh())),
      ...Object.fromEntries(VIEWS.map((v) => [v.key, () => setView(v.k)])),
      ...(target ? { e: () => target.edit && edit(target), Delete: () => void takeOut(target), Backspace: () => void takeOut(target) } : {}),
      // Inside a card, the card handles Escape itself (an open drop-down closes first).
      ...((pending || picked || more) && !t.closest?.('.ttb-pop') ? { Escape: closeAll } : {}),
    };
    const f = act[k] ?? act[k.toLowerCase()];
    if (!f || (k.length === 1 && k !== k.toLowerCase() && k !== '?')) return;
    e.preventDefault();
    f();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onCreate = (start: number, end: number, at: Anchor) => (setPicked(null), setMore(null), setPending({ start, end, at }));
  const onPick = (ev: GridEv, at: Anchor) => (setPending(null), setMore(null), setPicked(picked?.ev.key === ev.key ? null : { ev, at }));
  const today = startOfDay(Date.now());
  const ps = picked?.ev.o.s;
  return (
    <div className={'shell ttb-shell' + (side ? '' : ' no-side')}>
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <h1 className="ttb-sr">Timetable</h1>
      <main className={'ttb' + (drawer ? ' drawer' : '')}>
        <aside className="ttb-side" aria-label="Days and calendars">
          <button type="button" className="ttb-new" onClick={() => (closeAll(), setDrawer(false), setEditing(fresh()))}>
            <UiIcon name="plus" size={20} />
            New
          </button>
          <MiniMonth anchor={anchor} from={view === "day" || view === "week" ? from : 0} to={view === "day" || view === "week" ? to : 0} busy={(d) => busyDays.has(d)} onPick={(d) => jump(d)} />
          {next && (
            <div className="ttb-next" style={{ ['--ev' as string]: colorOf(next) } as CSSProperties}>
              <span className="ttb-side-h">{isNow(next) || next.s.live ? 'On now' : 'Up next'}</span>
              <button type="button" className="ttb-next-b" onClick={() => jump(startOfDay(next.start))}>
                <i aria-hidden="true" />
                <span>
                  <b>{next.s.title}</b>
                  <span className="hint">{whenText(next.start)}</span>
                </span>
              </button>
              {(isNow(next) || !!next.s.live) && (next.s.online || next.s.kind === 'class') && (
                <button type="button" className="btn primary small-btn" onClick={() => void startSession(next, cls(next.s.classId), me, navigate)}>
                  {next.s.kind === 'class' ? (next.s.itemId ? 'Start teaching' : 'Open the class') : next.s.live ? 'Join' : 'Start now'}
                </button>
              )}
            </div>
          )}
          <div className="ttb-cals">
            <span className="ttb-side-h">Show</span>
            {active.map((c) => (
              <label key={c.id} className="ttb-cal" style={{ ['--ev' as string]: theme(c.themeColor).accent } as CSSProperties}>
                <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => toggleHidden(c.id)} />
                <i aria-hidden="true" />
                <span>{c.name}</span>
              </label>
            ))}
            <label className="ttb-cal" style={{ ['--ev' as string]: 'var(--ink)' } as CSSProperties}>
              <input type="checkbox" checked={!hidden.includes('meetings')} onChange={() => toggleHidden('meetings')} />
              <i aria-hidden="true" />
              <span>Meetings</span>
            </label>
          </div>
          <GcalStatus sync={sync} />
        </aside>
        {drawer && <div className="ttb-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <section className="ttb-main" aria-label="Timetable">
          <header className="ttb-bar">
            <IconBtn icon="calendar" label={narrow ? 'Days and calendars' : side ? 'Hide the side panel' : 'Show the side panel'} onClick={toggleSide} className="ttb-sidebtn" aria-expanded={narrow ? drawer : side} />
            <button type="button" className={'btn small-btn ttb-today' + (anchor === today && view !== 'month' ? ' on' : '')} onClick={() => jump(today)} data-tip={`${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} (t)`}>
              Today
            </button>
            <span className="ttb-arrows">
              <button type="button" className="ttb-arrow" aria-label={`The ${view === 'schedule' ? 'weeks' : view} before`} data-tip={`The ${view === 'schedule' ? 'weeks' : view} before (k)`} onClick={() => go(-1)}>
                <UiIcon name="prev" size={16} />
              </button>
              <button type="button" className="ttb-arrow" aria-label={`The ${view === 'schedule' ? 'weeks' : view} after`} data-tip={`The ${view === 'schedule' ? 'weeks' : view} after (j)`} onClick={() => go(1)}>
                <UiIcon name="next" size={16} />
              </button>
            </span>
            <h2 className="ttb-title" aria-live="polite">
              {spanTitle(view, anchor, narrow)}
            </h2>
            <span className="ttb-bar-r">
              <span className="seg ttb-views" role="radiogroup" aria-label="View">
                {VIEWS.filter((v) => !narrow || v.k === 'day' || v.k === 'schedule').map((v) => (
                  <button key={v.k} type="button" role="radio" aria-checked={view === v.k} className={view === v.k ? 'on' : ''} onClick={() => setView(v.k)} data-tip={`${v.label} (${v.key})`}>
                    {v.label}
                  </button>
                ))}
              </span>
              <IconBtn icon="help" label="Keyboard shortcuts (?)" onClick={() => setHelp(true)} className="ttb-keysbtn" />
            </span>
          </header>
          <div className="ttb-view" key={view}>
            {view === 'day' || view === 'week' ? (
              <TimeGrid days={days} evs={evs} reveal={reveal} pending={pending} hold={hold} picked={pickedKey} dir={dir} onCreate={onCreate} onPick={onPick} onChange={(ev, s, m) => void change(ev, s, m)} onDay={(d) => (jump(d), setView('day'))} />
            ) : view === 'month' ? (
              <MonthGrid days={days} month={monthStart(anchor)} evs={evs} hold={hold} picked={pickedKey} dir={dir} onDay={(d) => (jump(d), setView('day'))} onCreate={(d, at) => { const st = niceStart(d); onCreate(st, st + 3600e3, at); }} onPick={onPick} onMore={(day, list, at) => (setPicked(null), setPending(null), setMore({ day, list, at }))} onMove={(ev, st) => void change(ev, st, Math.round((ev.o.end - ev.o.start) / 60000))} />
            ) : (
              <Schedule from={from} to={to} evs={evs} picked={pickedKey} dir={dir} onPick={onPick} onDay={(d) => (jump(d), setView('day'))} />
            )}
          </div>
        </section>
        <button type="button" className="ttb-fab" aria-label="New" onClick={() => (closeAll(), setEditing(fresh()))}>
          <UiIcon name="plus" size={24} />
        </button>
      </main>
      {pending && (
        <Pop key={pending.start + ':' + pending.end} at={pending.at} label="Add to the timetable" onClose={() => setPending(null)} width={340} className="ttb-pop-quick">
          <QuickCreate
            start={pending.start}
            end={pending.end}
            classes={active}
            colleagues={colleagues}
            lastClass={lastClass}
            me={me}
            prefs={vprefs}
            onDone={(t, c) => {
              sync.wake();
              setPending(null);
              if (c) (setLastClass(c), store.set('class', c));
              if (t) say(`Added “${t}”`);
            }}
            onMore={(init) => {
              setPending(null);
              setEditing(init);
            }}
            onTitle={(title) => setPending((p) => (p ? { ...p, title } : p))}
          />
        </Pop>
      )}
      {picked && ps && (
        <Pop key={picked.ev.key} at={picked.at} label={ps.title || 'Session'} onClose={() => setPicked(null)} width={380}>
          <SessionPop
            o={picked.ev.o}
            c={cls(ps.classId)}
            uid={uid}
            lessonTitle={ps.itemId ? (items[ps.classId ?? ''] ?? []).find((i) => i.id === ps.itemId)?.title : undefined}
            mine={picked.ev.edit}
            onClose={() => setPicked(null)}
            onStart={() => (setPicked(null), void startSession(picked.ev.o, cls(ps.classId), me, navigate))}
            onEdit={() => edit(picked.ev)}
            onDelete={() => void takeOut(picked.ev)}
          />
        </Pop>
      )}
      {more && (
        <Pop at={more.at} label={`Sessions on ${shortDay(more.day)}`} onClose={() => setMore(null)} width={280}>
          <MoreList day={more.day} list={more.list} onPick={(ev, at) => (setMore(null), setPicked({ ev, at }))} />
        </Pop>
      )}
      {editing && (
        <SessionDialog
          init={editing}
          classes={active}
          items={items}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={(t, st) => {
            sync.wake();
            if (st < from || st >= to) jump(startOfDay(st));
            setReveal(st);
            if (editing.classId) (setLastClass(editing.classId), store.set('class', editing.classId));
            say(editing.id ? `Saved “${t}”` : `Added “${t}”`);
          }}
        />
      )}
      {scope && <ScopeAsk req={scope} onDone={() => setScope(null)} />}
      {help && <Shortcuts onClose={() => setHelp(false)} />}
      {toast && <ToastBar toast={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// Where Google Calendar stands, at the foot of the side.
function GcalStatus({ sync }: { sync: ReturnType<typeof useGcalSync> }) {
  if (sync.state === 'unset') return null;
  if (sync.state === 'off')
    return (
      <Link to="/settings#set-calendar" className="ttb-gcal off">
        <UiIcon name="calendar" size={15} /> Add to Google Calendar
      </Link>
    );
  const text = sync.state === 'busy' ? 'Updating Google Calendar…' : sync.state === 'waiting' ? `${sync.waiting} ${sync.waiting === 1 ? 'change' : 'changes'} for Google Calendar` : sync.state === 'error' ? sync.error || 'Google Calendar could not be updated.' : 'Google Calendar is up to date';
  return (
    <div className={'ttb-gcal ' + sync.state} role="status">
      <i aria-hidden="true" />
      <span>
        {text}
        {sync.email && sync.state === 'idle' && <span className="hint">{sync.email}</span>}
      </span>
      {(sync.state === 'waiting' || sync.state === 'error') && (
        <button type="button" className="btn small-btn" onClick={sync.wake}>
          {sync.state === 'error' ? 'Try again' : 'Send now'}
        </button>
      )}
    </div>
  );
}

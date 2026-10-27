import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { useTeacherClasses } from '../lib/coteach';
import { useClassDetails } from './TeacherHome';
import { theme } from '../lib/themes';
import { addSession, isNow, occurrences, removeSession, saveSession, setSessionLive, skipWeek, timeText, useTeacherSessions, whenText, type Occurrence, type Session, type SessionKind } from '../lib/sessions';
import { NoRoomError, openCall, takeRoom } from '../lib/calls';
import { joinClassVideo } from '../components/VideoCall';
import { Select, MultiSelect } from '../components/Select';
import { useDirectory } from '../lib/directory';
import { ask, tell } from '../lib/ask';
import { UiIcon } from '../components/UiIcon';
import type { ClassDoc } from '../lib/classes';

// Timetable: the week's classes and meetings. Class sessions open the lesson and the class's
// video room; meetings get a call room when they start, and everyone invited is called.

const HOUR = 52;
const DAY = 864e5;
const mondayOf = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};
const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
const pad = (n: number) => String(n).padStart(2, '0');
const dateIn = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeIn = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Starting, or joining, a session.
export async function startSession(o: Occurrence, c: ClassDoc | undefined, me: { uid: string; name: string }, go: (to: string) => void) {
  const s = o.s;
  if (s.kind === 'class' && s.classId) {
    if (s.online && c) await joinClassVideo(c, true);
    go(s.itemId ? `/class/${s.classId}/lesson/${s.itemId}?teach=1` : `/class/${s.classId}`);
    return;
  }
  if (s.live && Date.now() - s.live.at < 8 * 3600e3) return openCall({ url: s.live.url, title: s.title, kind: 'video', sessionId: s.id, sub: 'Meeting' });
  try {
    const r = await takeRoom('session:' + s.id);
    await setSessionLive(s, { url: r.url, room: r.name, at: Date.now(), by: me.uid, byName: me.name });
    openCall({ url: r.url, title: s.title, kind: 'video', sessionId: s.id, sub: 'Meeting' });
  } catch (e) {
    void tell(e instanceof NoRoomError ? e.message : 'The meeting could not be started. Please try again.');
  }
}

export function TimetablePage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const me = { uid, name: user?.displayName || 'Teacher' };
  const navigate = useNavigate();
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const sessions = useTeacherSessions(uid, active.map((c) => c.id));
  const { items } = useClassDetails(active.map((c) => c.id));
  const [week, setWeek] = useState(() => mondayOf(Date.now()));
  const [editing, setEditing] = useState<Partial<Session> | null>(null);
  const [picked, setPicked] = useState<Occurrence | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const occ = occurrences(sessions, week, addDays(week, 7));
  // Lessons with a time but no session yet show too, lightly.
  const lone = active.flatMap((c) =>
    (items[c.id] ?? [])
      .filter((i) => i.type === 'lesson' && i.schedule?.at && i.schedule.at >= week && i.schedule.at < addDays(week, 7) && !sessions.some((s) => s.itemId === i.id))
      .map((i) => ({ s: { id: 'i:' + i.id, owner: uid, ownerName: '', kind: 'class' as SessionKind, title: i.title, classId: c.id, itemId: i.id, start: i.schedule!.at, mins: 60, online: !!c.video?.url } as Session, start: i.schedule!.at, end: i.schedule!.at + 3600e3, week: 0 })),
  );
  const all = [...occ, ...lone];
  const nowLine = Date.now() >= week && Date.now() < addDays(week, 7) ? Date.now() : 0;
  const hours = all.map((o) => new Date(o.start).getHours());
  const ends = all.map((o) => Math.min(24, Math.ceil((new Date(o.start).getHours() * 60 + new Date(o.start).getMinutes() + (o.end - o.start) / 60000) / 60)));
  const from = Math.min(7, ...hours);
  const to = Math.max(22, ...ends, nowLine ? Math.min(24, new Date().getHours() + 1) : 0);
  const cls = (id?: string | null) => active.find((c) => c.id === id);
  const next = occurrences(sessions, Date.now() - 3 * 3600e3, Date.now() + 14 * DAY).find((o) => o.end > Date.now());
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    grid.current?.scrollTo({ top: Math.max(0, (new Date().getHours() - from - 1) * HOUR) });
  }, [from]);
  const newAt = (t: number) => setEditing({ kind: 'class', start: t, mins: 60, weeks: 1, online: true, classId: active[0]?.id ?? null });
  return (
    <div className="shell ttb-shell">
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <main className="ttb">
        <header className="ttb-head">
          <div>
            <h1 className="page-title">Timetable</h1>
            <span className="hint">{next ? `Next: ${next.s.title}, ${whenText(next.start)}` : 'Nothing coming up. Add a class or a meeting.'}</span>
          </div>
          <span className="ttb-nav">
            <button type="button" className="btn small-btn" onClick={() => setWeek(mondayOf(Date.now()))}>
              This week
            </button>
            <button type="button" className="icon-btn" aria-label="The week before" onClick={() => setWeek(addDays(week, -7))}>
              <UiIcon name="prev" size={16} />
            </button>
            <b>
              {new Date(week).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {new Date(addDays(week, 6)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </b>
            <button type="button" className="icon-btn" aria-label="The week after" onClick={() => setWeek(addDays(week, 7))}>
              <UiIcon name="next" size={16} />
            </button>
            <button type="button" className="btn primary" onClick={() => newAt(nextHour())}>
              + New
            </button>
          </span>
        </header>
        <div className="ttb-week" ref={grid}>
          <div className="ttb-days" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
            <span />
            {days.map((d) => (
              <span key={d} className={'ttb-day' + (new Date(d).toDateString() === new Date().toDateString() ? ' today' : '')}>
                <b>{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</b>
                <i>{new Date(d).getDate()}</i>
              </span>
            ))}
          </div>
          <div className="ttb-body" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`, height: (to - from) * HOUR }}>
            <span className="ttb-hours">
              {Array.from({ length: to - from }, (_, i) => (
                <span key={i} style={{ top: i * HOUR }}>
                  {timeText(new Date(2020, 0, 1, from + i).getTime())}
                </span>
              ))}
            </span>
            {days.map((d) => (
              <div
                key={d}
                className="ttb-col"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.ttb-ev')) return;
                  const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
                  const mins = Math.floor((y / HOUR) * 2) * 30;
                  newAt(d + (from * 60 + mins) * 60000);
                }}
              >
                {Array.from({ length: to - from }, (_, i) => (
                  <span key={i} className="ttb-line" style={{ top: i * HOUR }} />
                ))}
                {lanes(all.filter((o) => new Date(o.start).toDateString() === new Date(d).toDateString())).map(({ o, lane, of }) => {
                    const st = new Date(o.start);
                    const top = ((st.getHours() - from) * 60 + st.getMinutes()) * (HOUR / 60);
                    const h = Math.max(22, ((o.end - o.start) / 60000) * (HOUR / 60) - 2);
                    const c = cls(o.s.classId);
                    const col = o.s.kind === 'class' ? theme(c?.themeColor).accent : 'var(--ink)';
                    const live = !!o.s.live || isNow(o, 0);
                    return (
                      <button key={o.s.id + o.week} type="button" className={'ttb-ev' + (o.s.id.startsWith('i:') ? ' lone' : '') + (live ? ' now' : '')} style={{ top, height: h, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)`, right: 'auto', ['--ev' as string]: col }} onClick={() => setPicked(o)}>
                        <b>{o.s.title || 'Untitled'}</b>
                        <span>
                          {timeText(o.start)}
                          {o.s.kind === 'class' && c ? ` · ${c.name}` : o.s.kind === 'meeting' ? ' · Meeting' : ''}
                        </span>
                        {o.s.online && <UiIcon name="video" size={12} />}
                      </button>
                    );
                  })}
                {nowLine && new Date(nowLine).toDateString() === new Date(d).toDateString() && <span className="ttb-now" style={{ top: ((new Date().getHours() - from) * 60 + new Date().getMinutes()) * (HOUR / 60) }} />}
              </div>
            ))}
          </div>
        </div>
        <TtList all={all} cls={cls} onPick={setPicked} />
      </main>
      {picked && (
        <SessionCard
          o={picked}
          c={cls(picked.s.classId)}
          lessonTitle={picked.s.itemId ? (items[picked.s.classId ?? ''] ?? []).find((i) => i.id === picked.s.itemId)?.title : undefined}
          mine={picked.s.owner === uid || !!cls(picked.s.classId)}
          onClose={() => setPicked(null)}
          onStart={() => (setPicked(null), void startSession(picked, cls(picked.s.classId), me, navigate))}
          onEdit={() => (setPicked(null), setEditing(picked.s.id.startsWith('i:') ? { kind: 'class', classId: picked.s.classId, itemId: picked.s.itemId, title: picked.s.title, start: picked.start, mins: 60, weeks: 1, online: picked.s.online } : picked.s))}
          onDelete={async () => {
            const s = picked.s;
            setPicked(null);
            if ((s.weeks ?? 1) > 1) {
              const all = await ask(`Take out every week of “${s.title}”? Choose No to take out only ${whenText(picked.start)}.`);
              if (all) await removeSession(s);
              else await skipWeek(s, picked.week);
            } else if (await ask(`Take “${s.title}” out of the timetable?`)) await removeSession(s);
          }}
        />
      )}
      {editing && <SessionDialog init={editing} classes={active} items={items} me={me} onClose={() => setEditing(null)} />}
    </div>
  );
}
// Sessions at the same time sit side by side.
function lanes(list: Occurrence[]) {
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { o: Occurrence; lane: number; of: number }[] = [];
  let cluster: { o: Occurrence; lane: number; of: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const n = Math.max(1, ends.length);
    cluster.forEach((x) => (x.of = n));
    out.push(...cluster);
    cluster = [];
    ends = [];
  };
  for (const o of sorted) {
    if (o.start >= clusterEnd && cluster.length) flush();
    let lane = ends.findIndex((e) => e <= o.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = o.end;
    cluster.push({ o, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, o.end);
  }
  flush();
  return out;
}
const nextHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime() + 3600e3;
};

// On a phone: the week as a list.
function TtList({ all, cls, onPick }: { all: Occurrence[]; cls: (id?: string | null) => ClassDoc | undefined; onPick: (o: Occurrence) => void }) {
  const byDay = new Map<string, Occurrence[]>();
  [...all].sort((a, b) => a.start - b.start).forEach((o) => byDay.set(new Date(o.start).toDateString(), [...(byDay.get(new Date(o.start).toDateString()) ?? []), o]));
  return (
    <div className="ttb-list">
      {!all.length && <p className="hint">Nothing this week.</p>}
      {[...byDay.entries()].map(([d, list]) => (
        <section key={d}>
          <h2>{new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {list.map((o) => (
            <button key={o.s.id + o.week} type="button" className="ttb-li" style={{ ['--ev' as string]: o.s.kind === 'class' ? theme(cls(o.s.classId)?.themeColor).accent : 'var(--ink)' }} onClick={() => onPick(o)}>
              <span className="ttb-li-t">{timeText(o.start)}</span>
              <span>
                <b>{o.s.title}</b>
                <span className="hint">{o.s.kind === 'class' ? cls(o.s.classId)?.name : 'Meeting'}</span>
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function SessionCard({ o, c, lessonTitle, mine, onClose, onStart, onEdit, onDelete }: { o: Occurrence; c?: ClassDoc; lessonTitle?: string; mine: boolean; onClose: () => void; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const s = o.s;
  const now = isNow(o) || !!s.live;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ttb-card" role="dialog" aria-label={s.title} style={{ ['--ev' as string]: s.kind === 'class' ? theme(c?.themeColor).accent : 'var(--ink)' }}>
        <span className="ttb-card-k">{s.kind === 'class' ? c?.name ?? 'Class' : 'Meeting'}</span>
        <h2>{s.title || 'Untitled'}</h2>
        <span className="ttb-card-when">
          {whenText(o.start)} – {timeText(o.end)}
          {(s.weeks ?? 1) > 1 && <span className="hint"> · every week, {s.weeks} times</span>}
        </span>
        <ul className="ttb-facts">
          {lessonTitle && (
            <li>
              <UiIcon name="task" size={15} /> Lesson: {lessonTitle}
            </li>
          )}
          <li>
            <UiIcon name={s.online ? 'video' : 'classes'} size={15} />
            {s.online ? (s.kind === 'class' ? (c?.video?.url ? 'Online, in the class video room' : 'Online: the class video room is on its way') : s.live ? `On now: ${s.live.byName} started it` : 'Online: the room opens when it starts') : s.place || 'In person'}
          </li>
          {s.kind === 'meeting' && !!s.attendees?.length && (
            <li>
              <UiIcon name="person" size={15} /> {[s.ownerName, ...s.attendees.map((a) => s.names?.[a] ?? 'Colleague')].join(', ')}
            </li>
          )}
          {s.notes && <li className="ttb-notes">{s.notes}</li>}
        </ul>
        <div className="row-between">
          <span className="ttb-card-acts">
            {mine && (
              <button type="button" className="btn small-btn" onClick={onEdit}>
                Edit
              </button>
            )}
            {mine && !s.id.startsWith('i:') && (
              <button type="button" className="btn link small" onClick={onDelete}>
                Take out
              </button>
            )}
          </span>
          {(s.online || s.kind === 'class') && (
            <button type="button" className={'btn ' + (now ? 'primary' : '')} onClick={onStart}>
              {s.kind === 'class' ? (s.itemId ? 'Start teaching' : 'Open the class') : s.live ? 'Join' : 'Start now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const MINS = [30, 45, 60, 75, 90, 120, 180];
function SessionDialog({ init, classes, items, me, onClose }: { init: Partial<Session>; classes: ClassDoc[]; items: Record<string, { id: string; title: string; type: string }[]>; me: { uid: string; name: string }; onClose: () => void }) {
  const dir = useDirectory();
  const colleagues = dir?.groups.find((g) => g.id === 'colleagues')?.people ?? [];
  const [s, setS] = useState<Partial<Session>>({ kind: 'class', mins: 60, weeks: 1, online: true, ...init });
  const [date, setDate] = useState(dateIn(init.start ?? nextHour()));
  const [time, setTime] = useState(timeIn(init.start ?? nextHour()));
  const [repeat, setRepeat] = useState((init.weeks ?? 1) > 1);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Session>) => setS((x) => ({ ...x, ...p }));
  const c = classes.find((x) => x.id === s.classId);
  const lessons = (items[s.classId ?? ''] ?? []).filter((i) => i.type === 'lesson');
  const title = s.title?.trim() || (s.kind === 'class' ? lessons.find((l) => l.id === s.itemId)?.title || c?.name || '' : '');
  const ok = !!title && !!date && !!time && (s.kind === 'meeting' || !!c);
  const save = async () => {
    setBusy(true);
    const start = new Date(`${date}T${time}`).getTime();
    const base = { ...s, title, start, weeks: repeat ? Math.max(2, s.weeks ?? 2) : 1, classId: s.kind === 'class' ? s.classId : null, itemId: s.kind === 'class' ? s.itemId ?? null : null, attendees: s.kind === 'meeting' ? s.attendees ?? [] : [], names: Object.fromEntries(colleagues.filter((p) => (s.attendees ?? []).includes(p.key)).map((p) => [p.key, p.name])) };
    try {
      if (s.id) await saveSession(base as Session);
      else await addSession({ ...base, owner: me.uid, ownerName: me.name, live: null } as Omit<Session, 'id'>);
      onClose();
    } catch (e) {
      console.error(e);
      void tell('It could not be saved. Please try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog ttb-dialog" role="dialog" aria-label={s.id ? 'Change the session' : 'A new session'} onSubmit={(e) => (e.preventDefault(), ok && void save())}>
        <h2>{s.id ? 'Change the session' : 'Add to the timetable'}</h2>
        <span className="seg" role="radiogroup" aria-label="What">
          {(
            [
              ['class', 'A class'],
              ['meeting', 'A meeting'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={s.kind === k} className={s.kind === k ? 'on' : ''} onClick={() => set({ kind: k, online: k === 'meeting' ? true : s.online })}>
              {l}
            </button>
          ))}
        </span>
        {s.kind === 'class' ? (
          <>
            <div className="field">
              <span>Class</span>
              <Select label="Class" value={s.classId ?? ''} options={classes.map((x) => ({ v: x.id, label: x.name }))} onChange={(v) => set({ classId: v, itemId: null })} placeholder="Choose a class" />
            </div>
            <div className="field">
              <span>Lesson to teach</span>
              <Select label="Lesson" value={s.itemId ?? ''} options={[{ v: '', label: 'Choose later' }, ...lessons.map((l) => ({ v: l.id, label: l.title }))]} onChange={(v) => set({ itemId: v || null })} />
              <span className="hint">With a lesson, Start teaching opens it live, and learners see its time.</span>
            </div>
          </>
        ) : (
          <div className="field">
            <span>Who</span>
            <MultiSelect label="Colleagues" value={s.attendees ?? []} options={colleagues.map((p) => ({ v: p.key, label: p.name }))} onChange={(v) => set({ attendees: v })} all="Nobody yet" foot="" />
            <span className="hint">They see it in their timetable, and are called when it starts.</span>
          </div>
        )}
        <label className="field">
          <span>Title{s.kind === 'class' ? ' (optional)' : ''}</span>
          <input value={s.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={s.kind === 'class' ? title || 'The lesson or class name' : 'For example: Team planning'} maxLength={90} />
        </label>
        <div className="ttb-when">
          <label className="field">
            <span>Day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Starts</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <div className="field">
            <span>How long</span>
            <Select label="How long" value={String(s.mins ?? 60)} options={MINS.map((m) => ({ v: String(m), label: m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m > 60 ? 's' : ''}` }))} onChange={(v) => set({ mins: Number(v) })} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Every week, at this time
          {repeat && (
            <span className="ttb-weeks">
              for <input type="number" min={2} max={52} value={s.weeks && s.weeks > 1 ? s.weeks : 10} onChange={(e) => set({ weeks: Math.max(2, Math.min(52, Number(e.target.value) || 2)) })} aria-label="How many weeks" /> weeks
            </span>
          )}
        </label>
        <div className="field">
          <span>Where</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Where">
            <button type="button" role="radio" aria-checked={!!s.online} className={s.online ? 'on' : ''} onClick={() => set({ online: true })}>
              Online
            </button>
            <button type="button" role="radio" aria-checked={!s.online} className={!s.online ? 'on' : ''} onClick={() => set({ online: false })}>
              In person
            </button>
          </span>
          {s.online ? (
            <span className="hint">{s.kind === 'class' ? (c?.video?.url ? 'In the class video room. Learners join from their home page; no link to send.' : 'In the class video room, which is made within a few minutes of the class.') : 'A video room opens when it starts. No link to send.'}</span>
          ) : (
            <input value={s.place ?? ''} onChange={(e) => set({ place: e.target.value })} placeholder="Room 4, or the address" aria-label="Where" />
          )}
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={s.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ok || busy}>
            {busy ? 'Saving…' : s.id ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

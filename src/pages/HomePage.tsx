import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isNow, occurrences, saveMyZone, useTeacherSessions } from '../lib/sessions';
import { startSession } from './TimetablePage';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { useTeacherClasses } from '../lib/coteach';
import { useClassDetails } from './TeacherHome';
import { theme } from '../lib/themes';
import { classDates, classPhase } from '../lib/classes';
import { isLive } from '../lib/live';
import { useMyDocs, newSharedDoc, KIND_LABEL, type DocKind } from '../lib/sharedDocs';
import { useChats, unreadIn } from '../lib/chat';
import { useHandIns } from '../lib/classFiles';
import { useMyOrg } from '../lib/admin';
import { APP_MARKS, AppGlyph } from '../components/AppGrid';
import { FILE_MARKS } from '../components/FileMarks';
import { GetStarted } from '../start/GetStarted';
import { HUB_ACTIVITIES, collectionFor } from '../resourceHub/catalog';
import { usePublishedHubResources } from '../resourceHub/usePublishedHubResources';

// The first screen of ELT Suite: today, the classes, what is new, and a way into everything.

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const t = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  return same(d, today) ? `Today, ${t}` : same(d, tomorrow) ? `Tomorrow, ${t}` : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
};
const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

// One look for everything you can make: the colour and symbol it has across ELT Suite.
const MAKE: { label: string; colour: string; glyph: string; make?: DocKind; to?: string }[] = [
  { label: 'Lesson', colour: '#c8764a', glyph: FILE_MARKS.lesson, make: 'lesson' },
  { label: 'Document', colour: '#2f6f9f', glyph: APP_MARKS.collab, make: 'doc' },
  { label: 'Flashcards', colour: '#8a4f9e', glyph: FILE_MARKS.flash, make: 'flash' },
  { label: 'Reading Journal', colour: '#3c7c8c', glyph: APP_MARKS.reading, make: 'pd' },
  { label: 'Recording', colour: '#a8473a', glyph: APP_MARKS.recordings, to: '/studio/sound/new' },
  { label: 'Design', colour: '#6d5bd0', glyph: APP_MARKS.design, to: '/design' },
  { label: 'PDF', colour: '#a6463a', glyph: APP_MARKS.pdf, to: '/pdf' },
];

export function HomePage() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  // The teacher's time zone, so colleagues see meeting times on their clock too.
  useEffect(() => void (uid && saveMyZone(uid)), [uid]);
  const name = (profile?.displayName || user?.displayName || '').split(' ')[0];
  const org = useMyOrg();
  const { classes, error: classesError, retry: retryClasses } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const { items, live } = useClassDetails(active.map((c) => c.id));
  const docs = useMyDocs(uid);
  const chats = useChats(uid);
  const hand = useHandIns(uid);
  const hub = usePublishedHubResources();

  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const unread = (chats ?? []).filter((c) => unreadIn(c, uid));
  const lessons = Object.values(items).reduce((n, list) => n + list.filter((item) => item.type === 'lesson').length, 0);
  const sessions = useTeacherSessions(uid, active.map((c) => c.id));
  const coming = useMemo(
    () =>
      active
        .flatMap((c) => (items[c.id] ?? []).filter((i) => i.schedule?.at && i.schedule.at > Date.now() - 3600e3).map((i) => ({ c, i, at: i.schedule!.at })))
        .filter(({ i }) => !sessions.some((x) => x.itemId === i.id))
        .sort((a, b) => a.at - b.at)
        .slice(0, 4),
    [active, items, sessions],
  );
  const upcoming = occurrences(sessions, Date.now() - 3 * 3600e3, Date.now() + 7 * 864e5).filter((o) => o.end > Date.now()).slice(0, 4);
  const navigate = useNavigate();
  const due = useMemo(
    () =>
      active
        .flatMap((c) => (items[c.id] ?? []).filter((i) => i.due && i.due > Date.now() - 864e5 && !i.hidden).map((i) => ({ c, i, at: i.due! })))
        .sort((a, b) => a.at - b.at)
        .slice(0, 3),
    [active, items],
  );
  const recent = useMemo(() => [...(docs.mine ?? []), ...(docs.withMe ?? [])].sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)).slice(0, 6), [docs.mine, docs.withMe]);
  const handIns = useMemo(() => [...(hand ?? [])].sort((a, b) => b.at - a.at).slice(0, 4), [hand]);
  const liveNow = active.filter((c) => isLive(live[c.id] ?? null));
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const make = async (k: DocKind) => {
    if (!user) return;
    const w = window.open('about:blank', '_blank');
    const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, k);
    if (w) w.location.href = `/doc/${id}`;
    else window.location.href = `/doc/${id}`;
  };

  // What needs the teacher now: unread chats, work handed in, homework due soon.
  const needs = [
    ...unread.slice(0, 4).map((c) => ({ key: 'c' + c.id, icon: 'message', title: c.title || c.members.filter((m) => m !== uid).map((m) => c.names[m]).join(', ') || 'Chat', sub: c.last ? `${c.last.name.split(' ')[0]}: ${c.last.text}` : 'New message', at: c.lastAt, to: `/messages?c=${c.id}`, verb: 'Reply' })),
    ...handIns.map((h) => ({ key: 'h' + h.classId + h.id, icon: 'upload', title: `${h.learner} handed in ${h.name}`, sub: h.className, at: h.at, to: `/class/${h.classId}`, verb: 'Look' })),
    ...due.filter(({ at }) => at < Date.now() + 2 * 864e5).map(({ c, i, at }) => ({ key: 'd' + c.id + i.id, icon: 'timer', title: `${i.title} is due ${when(at).replace(/, .*$/, '').toLowerCase()}`, sub: `${c.name} · homework`, at: 0, to: `/class/${c.id}/lesson/${i.id}`, verb: 'Open' })),
  ];
  const next = upcoming[0];
  const nextClass = next ? active.find((x) => x.id === next.s.classId) : undefined;
  const hubPicks = useMemo(() => {
    const seen = new Set<string>();
    return [...(hub.items ?? []), ...HUB_ACTIVITIES.filter((a) => a.status === 'ready')].filter((a) => !seen.has(a.id) && seen.add(a.id)).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)).slice(0, 3);
  }, [hub.items]);

  return (
    <div className="shell hm-shell">
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <main className="hm hm2 hm3">
        <section className="hm-hero" aria-label="Today">
          <div className="hm-hero-text">
            <span className="hm-date">{date}{org ? ` · ${org.name}` : ''}</span>
            <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
            <p>
              {liveNow.length
                ? `${liveNow.map((c) => c.name).join(' and ')} ${liveNow.length === 1 ? 'is' : 'are'} live now.`
                : needs.length
                  ? `${needs.length} ${needs.length === 1 ? 'thing needs' : 'things need'} you today.`
                  : classes === null || chats === null
                    ? 'One moment…'
                    : 'Everything is quiet. A good moment to plan.'}
            </p>
          </div>
          <div className="hm-next">
            {liveNow[0] ? (
              <Link to={`/class/${liveNow[0].id}`} className="hm-next-card live" style={{ ['--cc' as string]: theme(liveNow[0].themeColor).accent }}>
                <span className="hm-next-k"><span className="hm-pulse" aria-hidden="true" /> Live now</span>
                <b>{liveNow[0].name}</b>
                <span className="hint">Your learners are in the lesson.</span>
                <span className="btn primary">Join</span>
              </Link>
            ) : next ? (
              <div className="hm-next-card" style={{ ['--cc' as string]: next.s.kind === 'class' ? theme(nextClass?.themeColor).accent : 'var(--ink)' }}>
                <span className="hm-next-k">{isNow(next) ? 'Now' : 'Next'}</span>
                <b>{next.s.title}</b>
                <span className="hint">{when(next.start)} · {next.s.kind === 'class' ? `${nextClass?.name ?? 'Class'}${next.s.online ? ' · online' : ''}` : 'Meeting'}</span>
                {(next.s.online || next.s.kind === 'class') && <button type="button" className={'btn' + (isNow(next) ? ' primary' : '')} onClick={() => void startSession(next, nextClass, { uid, name: user?.displayName || 'Teacher' }, navigate)}>{isNow(next) ? 'Start' : 'Open'}</button>}
              </div>
            ) : coming[0] ? (
              <Link to={`/class/${coming[0].c.id}/lesson/${coming[0].i.id}`} className="hm-next-card" style={{ ['--cc' as string]: theme(coming[0].c.themeColor).accent }}>
                <span className="hm-next-k">Next</span>
                <b>{coming[0].i.title}</b>
                <span className="hint">{when(coming[0].at)} · {coming[0].c.name}</span>
                <span className="btn">Open the lesson</span>
              </Link>
            ) : (
              <div className="hm-next-card quiet">
                <span className="hm-next-k">Nothing scheduled</span>
                <b>Plan your next lesson</b>
                <span className="hint">Set a time on a lesson, or add classes to your timetable, and the next one shows here.</span>
                <button type="button" className="btn" onClick={() => void make('lesson')}>Make a lesson</button>
              </div>
            )}
          </div>
        </section>

        <GetStarted auto={{
          class: (classes?.length ?? 0) > 0,
          learners: learners > 0,
          lesson: lessons > 0,
          doc: (docs.mine ?? []).some((d) => d.kind === 'doc'),
          design: (docs.mine ?? []).some((d) => d.kind === 'design'),
        }} />
        <div className="hm-grid2">
          <div className="hm-col">
            <section className="hm-card" aria-labelledby="hm-classes">
              <header>
                <h2 id="hm-classes">Your classes</h2>
                <Link to="/classes" className="hm-more">All classes</Link>
              </header>
              {classesError && classes === null ? (
                <p className="hm-empty" role="alert">{classesError} <button type="button" className="btn link" onClick={retryClasses}>Try again</button></p>
              ) : classes === null ? (
                <p className="hm-empty" role="status">One moment…</p>
              ) : active.length ? (
                <div className="hm-classes">
                  {active.slice(0, 6).map((c) => {
                    const n = items[c.id]?.filter((item) => item.type === 'lesson').length;
                    return (
                      <Link key={c.id} to={`/class/${c.id}`} className="hm-class" style={{ ['--cc' as string]: theme(c.themeColor).accent }}>
                        <span className="hm-class-band" aria-hidden="true">{isLive(live[c.id] ?? null) && <span className="hm-live-pill">Live</span>}</span>
                        <b>{c.name}</b>
                        <span className="hint">{c.level} · {c.learnerCount ?? 0} {(c.learnerCount ?? 0) === 1 ? 'learner' : 'learners'} · {n === undefined ? '…' : `${n} ${n === 1 ? 'lesson' : 'lessons'}`}</span>
                        {classDates(c) && <span className={'hm-dates ph-' + classPhase(c)}>{classPhase(c) === 'soon' ? 'Starts soon · ' : classPhase(c) === 'done' ? 'Finished · ' : ''}{classDates(c)}</span>}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="hm-empty">No classes yet. <Link to="/classes">Make your first class</Link> and share its code. Your learners appear as they join.</p>
              )}
            </section>

            <section className="hm-card" aria-labelledby="hm-files">
              <header>
                <h2 id="hm-files">Jump back in</h2>
                <Link to="/archive" className="hm-more">My Files</Link>
              </header>
              {docs.mine === null || docs.withMe === null ? <p className="hm-empty" role="status">One moment…</p> : recent.length ? (
                <div className="hm-files">
                  {recent.map((d) => (
                    <a key={d.id} href={`/doc/${d.id}`} target="_blank" rel="noopener" className="hm-file">
                      <FileIcon kind={d.kind as FileKind} sub={d.ltype} size={34} label={false} />
                      <span>
                        <b>{d.title}</b>
                        <span className="hint">{KIND_LABEL[d.kind]}{d.updatedAt?.toMillis ? ` · ${ago(d.updatedAt.toMillis())}` : ''}{d.owner !== uid ? ` · ${d.ownerName}` : ''}</span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="hm-empty">Documents, slides, flashcards and lessons you make or open show here.</p>
              )}
            </section>
          </div>

          <aside className="hm-col">
            <section className="hm-card" aria-labelledby="hm-needs">
              <header>
                <h2 id="hm-needs">Needs you</h2>
                {needs.length > 0 && <span className="hm-count">{needs.length}</span>}
              </header>
              {chats === null ? <p className="hm-empty" role="status">One moment…</p> : needs.length ? (
                <ul className="hm-needs">
                  {needs.map((x) => (
                    <li key={x.key}>
                      <Link to={x.to}>
                        <span className="hm-needs-ic" aria-hidden="true"><UiIcon name={x.icon} size={15} /></span>
                        <span><b>{x.title}</b><span className="hint">{x.sub}</span></span>
                        <span className="hm-ago">{x.at ? ago(x.at) : x.verb}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hm-empty hm-done"><UiIcon name="check" size={16} /> You’re up to date. New messages, work handed in and homework due soon show here.</p>
              )}
            </section>

            <section className="hm-card" aria-labelledby="hm-new">
              <header><h2 id="hm-new">Make something</h2></header>
              <div className="hm-make">
                {MAKE.map((m) => {
                  const inner = <><span className="app-logo" style={{ width: 34, height: 34, ['--app' as string]: m.colour }} aria-hidden="true"><AppGlyph glyph={m.glyph} size={17} strokeWidth={2} /></span><b>{m.label}</b></>;
                  return m.make ? <button key={m.label} type="button" className="hm-make-it" onClick={() => void make(m.make!)}>{inner}</button> : <Link key={m.label} to={m.to!} className="hm-make-it">{inner}</Link>;
                })}
              </div>
            </section>

            {hubPicks.length > 0 && (
              <section className="hm-card" aria-labelledby="hm-hub">
                <header>
                  <h2 id="hm-hub">New in the Resource Hub</h2>
                  <Link to="/resource-hub" className="hm-more">Explore</Link>
                </header>
                <ul className="hm-hub">
                  {hubPicks.map((a) => (
                    <li key={a.id}>
                      <Link to={`/resource-hub?activity=${encodeURIComponent(a.id)}`}>
                        <img src={collectionFor(a.collectionId)?.cover} alt="" />
                        <span><b>{a.title}</b><span className="hint">{[a.level, `${a.minutes} min`, a.interaction].filter(Boolean).join(' · ')}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

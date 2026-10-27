import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { useTeacherClasses } from '../lib/coteach';
import { chatTitle, isSelf, openChat, useChats, type Chat, type Person } from '../lib/chat';
import { callLinkUrl, callOn, makeCallLink, NoRoomError, openCall, startChatCall, takeRoom, useOpenCall, type CallKind, type ChatCall } from '../lib/calls';
import { joinClassVideo } from '../components/VideoCall';
import { dayKey, isNow, occurrences, timeText, useTeacherSessions, whenText, type Occurrence } from '../lib/sessions';
import { startSession } from './TimetablePage';
import { theme } from '../lib/themes';
import { tell } from '../lib/ask';
import { UiIcon } from '../components/UiIcon';
import { PersonFace } from '../components/avatars';
import { useDirectory, whoLine, type Directory } from '../lib/directory';
import { CallPair, Face } from './roomsParts';
import { CallDetail, HistoryRow, HistoryView } from './RoomsHistory';
import { useCallLogs } from '../lib/callHistory';
import './rooms.css';

// Rooms: the next thing to join, a call to anyone in one click, recent calls, the rest of the
// day, and each class's own video room.

const DAY = 864e5;
const callOf = (c: Chat) => (c as Chat & { call?: ChatCall }).call ?? null;
const otherIn = (c: Chat, me: string) => c.members.find((k) => k !== me) ?? '';
const joinable = (o: Occurrence) => o.s.online || o.s.kind === 'class';
const sameOcc = (a?: Occurrence, b?: Occurrence) => !!a && !!b && a.s.id === b.s.id && a.week === b.week;
const minsText = (m: number) => (m < 1 ? 'a moment' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

// The time, kept fresh, for countdowns.
function useClock(every = 30000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return t;
}

export function RoomsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const navigate = useNavigate();
  const open = useOpenCall();
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const chats = useChats(uid);
  const dir = useDirectory();
  const sessions = useTeacherSessions(uid, active.map((c) => c.id));
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState('');
  const now = useClock();
  // The page, its call history (?history), or one call (?call=…).
  const [params] = useSearchParams();
  const callId = params.get('call');
  const view = callId ? 'call' : params.has('history') ? 'history' : 'home';
  const logs = useCallLogs(uid, view === 'home' ? 20 : 100);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, callId]);
  const me: Person = dir?.me ?? { key: uid, name: user?.displayName || 'Teacher', role: 'teacher' };
  const meName = user?.displayName || 'Teacher';
  const onNow = (chats ?? []).filter((c) => callOn(c)).sort((a, b) => callOn(b)!.at - callOn(a)!.at);
  const today = occurrences(sessions, now - 3 * 3600e3, now + DAY).filter((o) => o.end > now);
  const classOf = (id?: string | null) => active.find((x) => x.id === id);
  const instant = async () => {
    setBusy(true);
    try {
      const r = await takeRoom('instant:' + uid);
      // The link people get is ours: eltsuite.com/call/<code>.
      const title = `${(user?.displayName || 'Teacher').split(' ')[0]}’s call`;
      const code = await makeCallLink({ url: r.url, title, kind: 'video', byName: user?.displayName || 'Teacher' });
      setLink(callLinkUrl(code));
      openCall({ url: r.url, title, kind: 'video', sub: 'Anyone with the link can join', code });
    } catch (e) {
      void tell(e instanceof NoRoomError ? e.message : 'The call could not be started. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // What comes first: a class or meeting on now, then a call on now, then the next session.
  const nowSession = today.find((o) => joinable(o) && isNow(o));
  const heroCall = nowSession ? undefined : onNow[0];
  const heroSession = nowSession ?? (heroCall ? undefined : today.find(joinable));
  const alsoOn = onNow.filter((c) => c.id !== heroCall?.id);
  const later = today.filter((o) => !sameOcc(o, heroSession));
  const mid = alsoOn.length > 0 || later.length > 0;
  const recent = (chats ?? [])
    .filter((c) => !isSelf(c) && !callOn(c) && (callOf(c)?.at ?? 0) > now - 30 * DAY)
    .sort((a, b) => callOf(b)!.at - callOf(a)!.at)
    .slice(0, 5);
  const history = (logs ?? []).slice(0, 5);
  const hasHistory = history.length > 0 || recent.length > 0;

  const start = (o: Occurrence) => void startSession(o, classOf(o.s.classId), { uid, name: meName }, navigate);
  const joinChat = (c: Chat) => {
    const k = callOn(c);
    if (k) openCall({ url: k.url, title: chatTitle(c, uid), kind: k.kind, chatId: c.id, code: k.code });
  };
  // A call in a chat, or with one person: their chat is made the first time.
  const call = async (key: string, kind: CallKind, c?: Chat, p?: Person) => {
    if (calling) return;
    setCalling(key);
    try {
      let chat = c;
      if (!chat && p) {
        const id = await openChat(me, [p]);
        chat = (chats ?? []).find((x) => x.id === id) ?? { id, kind: 'dm', members: [me.key, p.key], names: { [me.key]: me.name, [p.key]: p.name }, roles: { [me.key]: me.role, [p.key]: p.role }, classId: p.classId ?? null, createdBy: me.key, at: Date.now(), lastAt: Date.now() };
      }
      if (!chat) return;
      const k = await startChatCall(chat, me, kind);
      openCall({ url: k.url, title: chatTitle(chat, me.key), kind: k.kind, chatId: chat.id, code: k.code });
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
    } catch (e) {
      void tell(e instanceof NoRoomError ? e.message : 'The call could not be started. Please try again.');
    } finally {
      setCalling('');
    }
  };
  const ctx = { uid, chats, classes: classes ?? [], dir, calling, onCall: (key: string, kind: CallKind, c?: Chat) => void call(key, kind, c) };
  const copy = () => {
    void navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="shell rm-shell">
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <main className={'rm' + (view === 'home' ? '' : ' rm-sub')}>
        {view === 'history' && <HistoryView logs={logs} ctx={ctx} now={now} />}
        {view === 'call' && <CallDetail id={callId!} logs={logs} ctx={ctx} now={now} />}
        {view === 'home' && (
          <>
            <header className="rm-head">
              <span className="rm-head-t">
                <h1 className="rm-title">Rooms</h1>
                <span className="rm-date">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </span>
              <span className="rm-acts">
                <Link className="btn" to="/timetable">
                  <UiIcon name="calendar" size={16} /> Timetable
                </Link>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void instant()}>
                  <UiIcon name="video" size={16} /> Start a call now
                </button>
              </span>
            </header>

            {/* Rows that line up: what to join beside who to call, then the rest of the day beside recent calls. */}
            <div className="rm-grid">
              <div className="rm-stack rm-top">
                {link && (
                  <div className="rm-link" role="status">
                    <span className="rm-link-ic" aria-hidden="true">
                      <UiIcon name="link" size={18} />
                    </span>
                    <span className="rm-link-t">
                      <b>Your call’s link</b>
                      <span className="hint">Anyone with it can join, for the next few hours.</span>
                    </span>
                    <span className="rm-link-acts">
                      <button type="button" className="btn small-btn" onClick={copy}>
                        <UiIcon name="copyall" size={14} /> {copied ? 'Copied' : 'Copy the link'}
                      </button>
                      {canShare && (
                        <button type="button" className="btn small-btn" onClick={() => void navigator.share({ url: link, title: 'Join my call' }).catch(() => {})}>
                          Share
                        </button>
                      )}
                      <button type="button" className="btn small-btn rm-ghost" onClick={() => setLink('')}>
                        Hide
                      </button>
                    </span>
                    <code>{link}</code>
                  </div>
                )}

                <Hero
                  session={heroSession}
                  call={heroCall}
                  now={now}
                  uid={uid}
                  cls={classOf(heroSession?.s.classId)}
                  inSession={!!heroSession && open?.sessionId === heroSession.s.id}
                  inCall={!!heroCall && open?.chatId === heroCall.id}
                  onStart={start}
                  onJoin={joinChat}
                />
              </div>

              <CallSomeone me={me} dir={dir} chats={chats} calling={calling} onCall={call} onJoin={joinChat} />

              {mid && (
                <div className={'rm-stack rm-mid' + (hasHistory ? '' : ' rm-span')}>
                  {alsoOn.length > 0 && (
                    <section className="rm-card rm-on" aria-labelledby="rm-on-h">
                      <div className="rm-card-h">
                        <h2 id="rm-on-h">Also on now</h2>
                      </div>
                      <ul className="rm-list">
                        {alsoOn.map((c) => {
                          const k = callOn(c)!;
                          const inIt = open?.chatId === c.id;
                          return (
                            <li key={c.id} className="rm-row">
                              <Face c={c} me={uid} />
                              <span className="rm-row-t">
                                <b>{chatTitle(c, uid)}</b>
                                <span className="hint">
                                  {k.byName} started a {k.kind} call at {timeText(k.at)}
                                </span>
                              </span>
                              <button type="button" className="btn small-btn primary" disabled={inIt} onClick={() => joinChat(c)}>
                                {inIt ? 'You are in it' : 'Join'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {later.length > 0 && (
                    <section className="rm-card rm-later" aria-labelledby="rm-later-h">
                      <div className="rm-card-h">
                        <h2 id="rm-later-h">Coming up</h2>
                        <Link className="rm-more" to="/timetable">
                          The week
                        </Link>
                      </div>
                      <ol className="rm-agenda">
                        {later.slice(0, 6).map((o) => {
                          const c = classOf(o.s.classId);
                          const color = o.s.kind === 'class' ? theme(c?.themeColor).accent : 'var(--soft)';
                          const where = o.s.online ? 'Online' : o.s.place?.trim() || 'In person';
                          return (
                            <li key={o.s.id + o.week} className="rm-ag">
                              <span className="rm-ag-time">
                                <b>{timeText(o.start)}</b>
                                <span>{dayKey(o.start) === dayKey(now) ? (isNow(o, 0) ? 'Now' : 'Today') : 'Tomorrow'}</span>
                              </span>
                              <span className="rm-ag-bar" style={{ background: color }} aria-hidden="true" />
                              <span className="rm-row-t">
                                <b>{o.s.title}</b>
                                <span className="hint">
                                  {c ? c.name : 'Meeting'} · {where}
                                </span>
                              </span>
                              {joinable(o) && (
                                <button type="button" className={'btn small-btn' + (isNow(o) ? ' primary' : '')} onClick={() => start(o)} aria-label={`${o.s.kind === 'class' ? 'Start' : o.s.live ? 'Join' : 'Start'} ${o.s.title}`}>
                                  {o.s.kind === 'class' ? 'Start' : o.s.live ? 'Join' : 'Start'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  )}
                </div>
              )}

              {hasHistory && (
                <section className={'rm-card rm-recent' + (mid ? '' : ' rm-span')} aria-labelledby="rm-recent-h">
                  <div className="rm-card-h">
                    <h2 id="rm-recent-h">Call history</h2>
                    {history.length > 0 && (
                      <Link className="rm-more" to="/rooms?history">
                        See all
                      </Link>
                    )}
                  </div>
                  <ul className="rm-list">
                    {history.length > 0
                      ? history.map((l) => <HistoryRow key={l.id} l={l} ctx={ctx} now={now} />)
                      : recent.map((c) => {
                          const k = callOf(c)!;
                          const title = chatTitle(c, uid);
                          return (
                            <li key={c.id} className="rm-row">
                              <Face c={c} me={uid} />
                              <span className="rm-row-t">
                                <b>{title}</b>
                                <span className="hint">
                                  {k.kind === 'video' ? 'Video' : 'Audio'} · {whenText(k.at)}
                                  {k.by === uid ? '' : ` · from ${k.byName.split(' ')[0]}`}
                                </span>
                              </span>
                              <CallPair name={title} busy={!!calling} onCall={(kind) => void call(c.id, kind, c)} again />
                            </li>
                          );
                        })}
                  </ul>
                </section>
              )}
            </div>

            <section className="rm-card rm-rooms" aria-labelledby="rm-rooms-h">
              <div className="rm-card-h">
                <h2 id="rm-rooms-h">Class video rooms</h2>
                <span className="hint">Learners join from their home page, or from the lesson when you teach live.</span>
              </div>
              {active.length ? (
                <div className="rm-classes">
                  {active.map((c) => {
                    const ready = !!c.video?.url;
                    const inIt = open?.classId === c.id;
                    const next = today.find((o) => o.s.classId === c.id);
                    const n = c.learnerCount ?? 0;
                    return (
                      <div key={c.id} className={'rm-class' + (inIt ? ' on' : '')} style={{ ['--ev' as string]: theme(c.themeColor).accent } as CSSProperties}>
                        <span className="rm-class-ic" aria-hidden="true">
                          <UiIcon name="video" size={18} />
                        </span>
                        <span className="rm-class-t">
                          <b>{c.name}</b>
                          <span className="hint">{ready ? [`${n} ${n === 1 ? 'learner' : 'learners'}`, next ? (isNow(next, 0) ? 'on now' : `next ${dayKey(next.start) === dayKey(now) ? 'at' : 'tomorrow,'} ${timeText(next.start)}`) : ''].filter(Boolean).join(' · ') : 'Setting up the room'}</span>
                        </span>
                        <button type="button" className="btn small-btn" disabled={!ready || inIt} onClick={() => void joinClassVideo(c, true)} aria-label={inIt ? `In the room of ${c.name}` : `Open the room of ${c.name}`}>
                          {inIt ? 'In it' : 'Open'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rm-none">
                  No classes yet. <Link to="/classes">Make a class</Link> and it gets its own room.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// The next thing to join, large.
function Hero({ session: o, call: c, now, uid, cls, inSession, inCall, onStart, onJoin }: { session?: Occurrence; call?: Chat; now: number; uid: string; cls?: { name: string; themeColor?: string }; inSession: boolean; inCall: boolean; onStart: (o: Occurrence) => void; onJoin: (c: Chat) => void }) {
  if (c) {
    const k = callOn(c)!;
    const faces = c.members.filter((m) => m !== uid).slice(0, 4);
    return (
      <section className="rm-hero is-call" aria-labelledby="rm-hero-t">
        <HeroArt />
        <span className="rm-hero-main">
          <span className="rm-kicker">
            <span className="vc-live" aria-hidden="true" /> On now
          </span>
          <h2 id="rm-hero-t" className="rm-hero-title">
            {chatTitle(c, uid)}
          </h2>
          <span className="rm-hero-meta">
            {k.byName} started {k.kind === 'video' ? 'a video' : 'an audio'} call at {timeText(k.at)}
          </span>
          <span className="rm-hero-acts">
            <button type="button" className="btn primary rm-go" disabled={inCall} onClick={() => onJoin(c)}>
              <UiIcon name={k.kind === 'video' ? 'video' : 'phone'} size={18} /> {inCall ? 'You are in it' : 'Join the call'}
            </button>
          </span>
        </span>
        <span className="rm-hero-side rm-faces" aria-hidden="true">
          {faces.map((m) => (
            <PersonFace key={m} id={m} name={c.names[m]} size={52} />
          ))}
        </span>
      </section>
    );
  }
  if (o) {
    const started = now >= o.start;
    const mins = Math.round((o.start - now) / 60000);
    const kicker = started ? 'On now' : mins <= 10 ? `Starting in ${minsText(mins)}` : `Next, in ${minsText(mins)}`;
    const color = o.s.kind === 'class' ? theme(cls?.themeColor).accent : undefined;
    const what = o.s.kind === 'class' ? (cls?.name ?? 'Class') : o.s.names ? `Meeting with ${Object.values(o.s.names).filter(Boolean).slice(0, 3).join(', ')}` : 'Meeting';
    const label = inSession ? 'You are in it' : o.s.kind === 'class' ? (o.s.online ? 'Start the class' : 'Open the lesson') : o.s.live ? 'Join the meeting' : 'Start the meeting';
    return (
      <section className={'rm-hero is-session' + (started ? ' is-now' : '')} style={color ? ({ ['--ev' as string]: color } as CSSProperties) : undefined} aria-labelledby="rm-hero-t">
        <HeroArt />
        <span className="rm-hero-main">
          <span className="rm-kicker">
            {started && <span className="vc-live" aria-hidden="true" />} {kicker}
          </span>
          <h2 id="rm-hero-t" className="rm-hero-title">
            {o.s.title}
          </h2>
          <span className="rm-hero-meta">
            {whenText(o.start)} to {timeText(o.end)} · {what} · {o.s.online ? 'Online' : o.s.place?.trim() || 'In person'}
          </span>
          <span className="rm-hero-acts">
            <button type="button" className="btn primary rm-go" disabled={inSession} onClick={() => onStart(o)}>
              <UiIcon name={o.s.online ? 'video' : 'present'} size={18} /> {label}
            </button>
          </span>
        </span>
        <span className="rm-hero-side rm-clock" aria-hidden="true">
          <b>{timeText(o.start)}</b>
          <span>to {timeText(o.end)}</span>
        </span>
      </section>
    );
  }
  return (
    <section className="rm-hero is-empty" aria-labelledby="rm-hero-t">
      <HeroArt />
      <span className="rm-hero-main">
        <span className="rm-kicker">Next 24 hours</span>
        <h2 id="rm-hero-t" className="rm-hero-title">
          Nothing to join
        </h2>
        <span className="rm-hero-meta">No classes or online meetings in your timetable. Call someone, or start a call and send the link.</span>
        <span className="rm-hero-acts">
          <Link className="btn rm-go" to="/timetable">
            <UiIcon name="calendar" size={18} /> Plan in the timetable
          </Link>
        </span>
      </span>
    </section>
  );
}

const HeroArt = () => (
  <span className="rm-hero-art" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);

type Entry = { key: string; name: string; sub: string; faceId?: string; group?: boolean; teacher?: boolean; chat?: Chat; person?: Person };

// Call someone: recent chats first; search finds colleagues, learners and groups.
function CallSomeone({ me, dir, chats, calling, onCall, onJoin }: { me: Person; dir: Directory | null; chats: Chat[] | null; calling: string; onCall: (key: string, kind: CallKind, c?: Chat, p?: Person) => Promise<void>; onJoin: (c: Chat) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const fromChat = (c: Chat): Entry => {
    const o = otherIn(c, me.key);
    const group = c.kind === 'group';
    return { key: c.id, name: chatTitle(c, me.key), sub: group ? `Group · ${c.members.length} people` : whoLine(dir, o, c.roles?.[o]), faceId: group ? undefined : o, group, teacher: !group && c.roles?.[o] === 'teacher', chat: c };
  };
  const dmOf = (p: Person) => (chats ?? []).find((c) => c.id === 'dm_' + [me.key, p.key].sort().join('_'));
  const people = useMemo(() => {
    const seen = new Set<string>([me.key]);
    const out: Person[] = [];
    for (const g of dir?.groups ?? []) for (const p of g.people) if (!seen.has(p.key)) (seen.add(p.key), out.push(p));
    return out;
  }, [dir, me.key]);
  const fromPerson = (p: Person): Entry => ({ key: p.key, name: p.name, sub: whoLine(dir, p.key, p.role), faceId: p.key, teacher: p.role === 'teacher', chat: dmOf(p), person: p });

  let label = 'Recent chats';
  let list: Entry[];
  if (term) {
    const hit = (s: string) => s.toLowerCase().split(/\s+/).some((w) => w.startsWith(term)) || s.toLowerCase().includes(term);
    const first = (s: string) => (s.toLowerCase().startsWith(term) ? 0 : 1);
    const ps = people.filter((p) => hit(p.name)).sort((a, b) => first(a.name) - first(b.name) || a.name.localeCompare(b.name));
    const gs = (chats ?? []).filter((c) => c.kind === 'group' && hit(chatTitle(c, me.key)));
    list = [...ps.map(fromPerson), ...gs.map(fromChat)].slice(0, 8);
    label = list.length ? 'Results' : '';
  } else {
    const rec = (chats ?? []).filter((c) => !isSelf(c)).slice(0, 5);
    list = rec.map(fromChat);
    if (!list.length) {
      list = people.slice(0, 6).map(fromPerson);
      label = 'People you can call';
    }
  }

  return (
    <section className="rm-card rm-call" aria-labelledby="rm-call-h">
      <div className="rm-card-h">
        <h2 id="rm-call-h">Call someone</h2>
        <span className="hint">Audio or video, in one click.</span>
      </div>
      <label className="rm-search">
        <UiIcon name="search" size={16} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search colleagues and learners" aria-label="Search people to call" />
      </label>
      {label && <span className="rm-label">{label}</span>}
      {list.length > 0 ? (
        <ul className="rm-list">
          {list.map((e) => {
            const on = e.chat ? callOn(e.chat) : null;
            return (
              <li key={e.key} className={'rm-row' + (calling === e.key ? ' busy' : '')}>
                {e.group ? (
                  <span className="rm-face rm-group" aria-hidden="true">
                    <UiIcon name="groups" size={18} />
                  </span>
                ) : (
                  <PersonFace id={e.faceId} name={e.name} size={38} status={e.teacher} className="rm-face" />
                )}
                <span className="rm-row-t">
                  <b>{e.name}</b>
                  <span className="hint">{calling === e.key ? 'Calling…' : e.sub}</span>
                </span>
                {on ? (
                  <button type="button" className="btn small-btn primary" onClick={() => onJoin(e.chat!)} aria-label={`Join the call with ${e.name}`}>
                    <span className="vc-live" aria-hidden="true" /> Join
                  </button>
                ) : (
                  <CallPair name={e.name} busy={!!calling} onCall={(kind) => void onCall(e.key, kind, e.chat, e.person)} />
                )}
              </li>
            );
          })}
        </ul>
      ) : term ? (
        <p className="rm-none">No one called “{q.trim()}” in your classes or colleagues.</p>
      ) : !dir ? (
        <p className="rm-none">Finding the people you work with…</p>
      ) : (
        <p className="rm-none">
          No one to call yet. Add learners to a class, or <Link to="/colleagues">invite a colleague</Link>.
        </p>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { useTeacherClasses } from '../lib/coteach';
import { chatTitle, useChats } from '../lib/chat';
import { callOn, NoRoomError, openCall, takeRoom, useOpenCall } from '../lib/calls';
import { joinClassVideo } from '../components/VideoCall';
import { isNow, occurrences, timeText, useTeacherSessions, whenText } from '../lib/sessions';
import { startSession } from './TimetablePage';
import { theme } from '../lib/themes';
import { tell } from '../lib/ask';
import { UiIcon } from '../components/UiIcon';

// Rooms: calls on now, a call to start at once, the classes' video rooms, and today's sessions.
export function RoomsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const navigate = useNavigate();
  const open = useOpenCall();
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const chats = useChats(uid);
  const sessions = useTeacherSessions(uid, active.map((c) => c.id));
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const onNow = (chats ?? []).filter((c) => callOn(c));
  const today = occurrences(sessions, Date.now() - 3 * 3600e3, Date.now() + 864e5).filter((o) => o.end > Date.now());
  const instant = async () => {
    setBusy(true);
    try {
      const r = await takeRoom('instant:' + uid);
      setLink(r.url);
      openCall({ url: r.url, title: 'Your call', kind: 'video', sub: 'Anyone with the link can join' });
    } catch (e) {
      void tell(e instanceof NoRoomError ? e.message : 'The call could not be started. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="shell rm-shell">
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <main className="rm">
        <header className="rm-hero">
          <div>
            <h1 className="page-title">Rooms</h1>
            <span className="hint">Audio and video calls. Call anyone from a chat, teach in your class’s video room, or start a call now and send the link.</span>
          </div>
          <span className="rm-acts">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void instant()}>
              <UiIcon name="video" size={16} /> Start a call now
            </button>
            <Link className="btn" to="/timetable">
              <UiIcon name="calendar" size={16} /> Timetable
            </Link>
          </span>
        </header>
        {link && (
          <div className="rm-link">
            <span>
              <b>Your call’s link</b>
              <span className="hint">Anyone with it can join, for the next few hours.</span>
            </span>
            <code>{link}</code>
            <button type="button" className="btn small-btn" onClick={() => (void navigator.clipboard?.writeText(link), setCopied(true), window.setTimeout(() => setCopied(false), 1400))}>
              {copied ? 'Copied' : 'Copy the link'}
            </button>
          </div>
        )}
        <div className="rm-grid">
          <section className="rm-card">
            <h2>On now</h2>
            {!onNow.length && <p className="hint">No calls right now. Start one from a chat: the phone and camera buttons at its top.</p>}
            {onNow.map((c) => {
              const k = callOn(c)!;
              return (
                <div key={c.id} className="rm-row">
                  <span className="vc-live" aria-hidden="true" />
                  <span className="rm-row-t">
                    <b>{chatTitle(c, uid)}</b>
                    <span className="hint">
                      {k.byName} started a {k.kind} call at {timeText(k.at)}
                    </span>
                  </span>
                  <button type="button" className="btn small-btn" disabled={open?.chatId === c.id} onClick={() => openCall({ url: k.url, title: chatTitle(c, uid), kind: k.kind, chatId: c.id })}>
                    {open?.chatId === c.id ? 'You are in it' : 'Join'}
                  </button>
                </div>
              );
            })}
          </section>
          <section className="rm-card">
            <h2>Today</h2>
            {!today.length && <p className="hint">Nothing in your timetable for the next day.</p>}
            {today.slice(0, 6).map((o) => {
              const c = active.find((x) => x.id === o.s.classId);
              return (
                <div key={o.s.id + o.week} className="rm-row">
                  <span className="rm-dot" style={{ background: o.s.kind === 'class' ? theme(c?.themeColor).accent : 'var(--ink)' }} />
                  <span className="rm-row-t">
                    <b>{o.s.title}</b>
                    <span className="hint">
                      {whenText(o.start)}
                      {c ? ` · ${c.name}` : ' · Meeting'}
                    </span>
                  </span>
                  {(o.s.online || o.s.kind === 'class') && (
                    <button type="button" className={'btn small-btn' + (isNow(o) ? ' primary' : '')} onClick={() => void startSession(o, c, { uid, name: user?.displayName || 'Teacher' }, navigate)}>
                      {o.s.kind === 'class' ? 'Start' : o.s.live ? 'Join' : 'Start'}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
          <section className="rm-card rm-wide">
            <h2>Class video rooms</h2>
            <p className="hint">Each class has its own room. Learners join it from their home page, and from the lesson when you teach live.</p>
            <div className="rm-classes">
              {active.map((c) => (
                <div key={c.id} className="rm-class" style={{ ['--ev' as string]: theme(c.themeColor).accent }}>
                  <span className="rm-class-t">
                    <b>{c.name}</b>
                    <span className="hint">{c.video?.url ? `${c.learnerCount ?? 0} learners` : 'Room on its way'}</span>
                  </span>
                  <button type="button" className="btn small-btn" disabled={!c.video?.url || open?.classId === c.id} onClick={() => void joinClassVideo(c, true)}>
                    <UiIcon name="video" size={14} /> {open?.classId === c.id ? 'In it' : 'Open'}
                  </button>
                </div>
              ))}
              {!active.length && <p className="hint">No classes yet.</p>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

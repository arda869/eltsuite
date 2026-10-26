import { ThemeChoice } from '../lib/theme';
import { useEffect, useMemo, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { AnnouncementBoard } from '../components/AnnouncementBoard';
import { useMyRecaps } from '../lib/recap';
import { useMistakes } from '../lib/mistakes';
import { useNotebook } from '../lib/notebook';
import { PhoneMessagesLink } from '../components/ChatDock';
import { LearnerNav } from './ColleaguesPage';
import { useUnread } from '../lib/chat';
import { AppSetupDialog } from '../components/AppSetup';
import { CoverArt } from '../components/Covers';
import { isProxyTab } from '../lib/proxy';
import { MySecretDialog } from '../components/MySecretDialog';
import { isUnread, readSeen, useThreads } from '../lib/discussion';
import type { ClassDoc, Item, Topic } from '../lib/classes';
import { theme } from '../lib/themes';
import { isLive, liveRef, type LiveState } from '../lib/live';
import { usePresenceBeat } from '../lib/presence';
import { Wordmark } from '../components/Wordmark';
import { initials } from '../components/TopBar';
import { NoticeToasts } from '../components/NoticeToasts';
import { AnnouncementCards } from '../components/LiveExtras';
import { Avatar } from '../components/avatars';
import { LiveWho } from '../components/LiveWho';
import { AvatarPicker } from '../components/AvatarPicker';
import { itemResult, STATUS_LABEL, useMyAnswers } from '../lib/reports';

const SECTION_LABEL: Record<Item['type'], string> = { lesson: 'Lessons', homework: 'Homework', exam: 'Exams', practice: 'Practice' };
function dueText(ms: number) {
  const d = new Date(ms);
  const days = Math.round((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const time = new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `Due today ${time}`;
  if (days === 1) return `Due tomorrow ${time}`;
  if (days < 0) return `Was due ${new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  return `Due ${new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function whenText(at: number) {
  const d = new Date(at);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (at < Date.now()) return `Started at ${time}`;
  if (same(d, today)) return `Today at ${time}`;
  if (same(d, tomorrow)) return `Tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} at ${time}`;
}

export function LearnerHome({ classId, name }: { classId: string; name: string }) {
  const { signOutNow, user, profile } = useAuth();
  usePresenceBeat(classId, user?.uid, { name, learnerId: profile?.role === 'learner' ? profile.learnerId : '', itemId: '', taskId: '', avatar: profile?.avatar });
  const [c, setC] = useState<ClassDoc | null | undefined>(undefined);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menu, () => setMenu(false));
  const [picking, setPicking] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const unreadMsgs = useUnread(profile?.role === 'learner' ? profile.learnerId : undefined);
  const [secretOpen, setSecretOpen] = useState(false);
  // First visit: invite the learner to choose a picture.
  const [askPicture, setAskPicture] = useState(() => !isProxyTab()) // a teacher viewing as the learner is not asked to choose their picture;
  const [live, setLiveState] = useState<LiveState | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'classes', classId), (s) => setC(s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }) : null), () => setC(null)),
      onSnapshot(collection(db, 'classes', classId, 'topics'), (s) => setTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic)), () => {}),
      onSnapshot(collection(db, 'classes', classId, 'items'), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)), () => {}),
    ];
    unsubs.push(onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {}));
    return () => unsubs.forEach((u) => u());
  }, [classId]);

  const t = theme(c?.themeColor);
  const visible = items.filter((i) => !i.hidden && !topics.find((tp) => tp.id === i.topicId)?.hidden);
  const lockedItem = (i: Item) => i.locked || !!topics.find((tp) => tp.id === i.topicId)?.locked;
  const [section, setSection] = useState<Item['type']>('lesson');
  const answers = useMyAnswers(classId, user?.uid);
  const recaps = useMyRecaps(classId, user?.uid);
  const mistakes = useMistakes(classId, user?.uid);
  const dueMistakes = mistakes.filter((m) => !m.done && m.nextAt <= Date.now()).length;
  const nbMe = useMemo(() => (user && profile?.role === 'learner' ? { uid: user.uid, name: profile.displayName, learnerId: profile.learnerId, teacher: false } : null), [user, profile]);
  const entries = useNotebook(classId, nbMe);
  const words = entries.filter((e) => e.type === 'vocab' && e.status === 'published').length;
  const threads = useThreads(classId, user && profile?.role === 'learner' ? { uid: user.uid, name: profile.displayName, learnerId: profile.learnerId, teacher: false } : null);
  const unreadThreads = useMemo(() => {
    const seen = readSeen(classId);
    return threads.filter((t) => t.approved && !t.hidden && t.by !== user?.uid && isUnread(t, seen)).length;
  }, [threads, classId, user?.uid]);
  const inSection = visible.filter((i) => i.type === section);
  const groups = [
    ...[...topics].filter((tp) => !tp.hidden).sort((a, b) => a.order - b.order).map((tp) => ({ tp, list: inSection.filter((i) => i.topicId === tp.id).sort((a, b) => a.order - b.order) })),
    { tp: { id: '_none', name: 'Other', order: 9999 } as Topic, list: inSection.filter((i) => !i.topicId || !topics.some((tp) => tp.id === i.topicId)).sort((a, b) => a.order - b.order) },
  ].filter((g) => g.list.length > 0);
  // Homework and exams that still need doing, soonest first; done ones stay for a week.
  const todo = visible
    .filter((i) => i.type === 'homework' || i.type === 'exam')
    .map((i) => ({ i, r: itemResult(i, answers) }))
    .filter(({ i, r }) => r.status !== 'marked' && !(r.status === 'submitted' && (!i.due || Date.now() - i.due > 7 * 86400000) && i.type !== 'exam'))
    .sort((a, b) => (a.i.due ?? Infinity) - (b.i.due ?? Infinity));
  const firstName = name.split(' ')[0];
  // Progress: lessons worked on, average score, where to carry on.
  const lessons = visible.filter((i) => i.type === 'lesson');
  const lessonsDone = lessons.filter((i) => answers.some((a) => a.itemId === i.id && (a.checked || Object.keys(a.responses ?? {}).length))).length;
  const checked = answers.filter((a) => a.checked && (a.total ?? 0) > 0);
  const avg = checked.length ? Math.round((checked.reduce((s, a) => s + (a.score ?? 0), 0) / checked.reduce((s, a) => s + (a.total ?? 0), 0)) * 100) : null;
  const lastAnswer = [...answers].filter((a) => visible.some((i) => i.id === a.itemId)).sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))[0];
  const carryOn = lastAnswer ? visible.find((i) => i.id === lastAnswer.itemId) : undefined;
  const latestThreads = threads.filter((x) => x.approved && !x.hidden).slice(0, 3);
  const liveNow = isLive(live) ? items.find((i) => i.id === live!.itemId) : undefined;
  // The next scheduled lesson (within the last hour counts as now). Times are shown in the learner's own time zone.
  const nextLesson = useMemo(() => {
    const now = Date.now();
    return items
      .filter((i) => i.type === 'lesson' && i.schedule?.at && i.schedule.at > now - 3600000 && (!i.hidden || visible.some((v) => v.id === i.id)))
      .sort((a, b) => a.schedule!.at - b.schedule!.at)[0];
  }, [items, visible]);
  const soon = !!nextLesson && nextLesson.schedule!.at - Date.now() < 15 * 60000;
  const showCall = !!c?.meeting?.url && (c.meeting.visibility === 'always' || !!liveNow || (c.meeting.visibility === 'before15' && soon));
  const nextLink = nextLesson?.schedule?.url || (c?.meeting?.url && (c.meeting.visibility === 'always' || soon) ? c.meeting.url : '');

  return (
    <div className="shell" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <AnnouncementCards classId={classId} learnerId={profile?.role === 'learner' ? profile.learnerId : ''} />
      <NoticeToasts classId={classId} to={profile?.role === 'learner' ? profile.learnerId : ''} link={(i, tk) => (i === 'disc' ? `/discuss/${tk}` : `/learn/${i}?task=${tk}`)} />
      <header className="topbar">
        <Wordmark />
        <span className="sub">{c?.name ?? ''}</span>
        <LearnerNav on="home" unreadMsgs={unreadMsgs} unreadThreads={unreadThreads} />
        <span className="icon-row">
          <PhoneMessagesLink />
        </span>
        <div className="right" ref={menuRef}>
          <button className="avatar" style={{ background: 'var(--tint)', color: 'var(--accent-text)' }} aria-label="Account" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {profile?.avatar ? <Avatar k={profile.avatar} size={32} /> : initials(name)}
          </button>
          {menu && (
            <div className="menu" role="menu">
              <div className="who">
                <strong>{name}</strong>
                <span className="hint">{c?.name}</span>
              </div>
              <button role="menuitem" onClick={() => (setPicking(true), setMenu(false))}>
                Choose a profile picture
              </button>
              <button role="menuitem" onClick={() => (setAppOpen(true), setMenu(false))}>
                App and notifications
              </button>
              {!isProxyTab() && (
                <button role="menuitem" onClick={() => (setSecretOpen(true), setMenu(false))}>
                  Change my PIN or password
                </button>
              )}
              <ThemeChoice />
              <button role="menuitem" onClick={signOutNow}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      {secretOpen && c && profile?.role === 'learner' && <MySecretDialog classId={classId} classCode={c.classCode} learnerId={profile.learnerId} onClose={() => setSecretOpen(false)} />}
      {appOpen && <AppSetupDialog onClose={() => setAppOpen(false)} />}
      {(picking || (profile && !profile.avatar && askPicture)) && <AvatarPicker classIds={[classId]} onClose={() => (setPicking(false), setAskPicture(false))} />}

      {c === null || c?.status === 'deleted' ? (
        <p className="placeholder">You’re no longer in this class. Ask your teacher if this is a mistake.</p>
      ) : (
        <main className="lh">
          <section className="lh-hero">
            <div className="lh-hello">
              <span className="eyebrow accent">
                {c?.name}
                {c?.level ? ` · ${c.level}` : ''}
              </span>
              <h1 className="page-title">Hello, {firstName}</h1>
              <span className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            {c && <CoverArt cover={c.cover} classId={classId} className="lh-cover" />}
          </section>
          <div className="lh-cols">
          <div className="lh-main">

          {liveNow && (
            <section className="live-card">
              <span className="live-dot" aria-hidden="true" />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow accent">Live now</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{liveNow.title}</span>
                <span className="hint">{live?.teacherName ?? 'Your teacher'} is teaching</span>
                <LiveWho classId={classId} itemId={liveNow.id} teacherName={live?.teacherName} selfId={profile?.role === 'learner' ? profile.learnerId : ''} compact />
              </span>
              {showCall && (
                <a className="btn" href={c!.meeting!.url} target="_blank" rel="noopener noreferrer">
                  Join call
                </a>
              )}
              <Link className="btn primary" to={`/learn/${liveNow.id}`}>
                Join lesson
              </Link>
            </section>
          )}

          {nextLesson && !liveNow && (
            <section className="live-card next-card">
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow accent">Next lesson</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{nextLesson.title}</span>
                <span className="hint">
                  {whenText(nextLesson.schedule!.at)} · {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')}
                </span>
              </span>
              {nextLink && (
                <a className={'btn' + (soon ? ' primary' : '')} href={nextLink} target="_blank" rel="noopener noreferrer">
                  Join call
                </a>
              )}
            </section>
          )}

          {showCall && !liveNow && !(nextLesson && nextLink) && (
            <section className="live-card">
              <span className="live-dot" aria-hidden="true" />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow accent">Class call</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{c?.name}</span>
              </span>
              <a className="btn primary" href={c!.meeting!.url} target="_blank" rel="noopener noreferrer">
                Join call
              </a>
            </section>
          )}


          {carryOn && !liveNow && (
            <Link className="lh-carry" to={`/learn/${carryOn.id}`}>
              <span className="eyebrow">Carry on</span>
              <span className="lh-carry-title">{carryOn.title}</span>
              <span className="hint">
                {(() => {
                  const r = itemResult(carryOn, answers);
                  return r.tasksTotal > 1 ? `${r.tasksDone} of ${r.tasksTotal} tasks checked` : STATUS_LABEL[r.status];
                })()}
              </span>
              <span className="lh-carry-go" aria-hidden="true">→</span>
            </Link>
          )}

          {todo.length > 0 && (
            <section className="todo">
              <h2 style={{ fontSize: 16 }}>To do</h2>
              <ul className="todo-list">
                {todo.map(({ i, r }) => (
                  <li key={i.id} className={'todo-item s-' + r.status + (lockedItem(i) ? ' is-locked' : '')}>
                    <span className="type">{i.type}</span>
                    {lockedItem(i) ? (
                      <span className="title locked-title">{i.title}</span>
                    ) : (
                      <Link to={`/learn/${i.id}`} className="title">
                        {i.title}
                      </Link>
                    )}
                    <span className="todo-meta">
                      {i.due && <span className={'todo-due' + (i.due < Date.now() && r.status !== 'submitted' && r.status !== 'marked' ? ' over' : '')}>{dueText(i.due)}</span>}
                      {i.type === 'exam' && i.exam?.minutes && !i.due ? <span className="hint">{i.exam.minutes} min</span> : null}
                      <span className={'rp-status s-' + r.status}>
                        {i.type === 'exam' && i.examReleased && (r.status === 'submitted' || r.status === 'marked') ? 'Results ready' : STATUS_LABEL[r.status]}
                        {r.late ? ' · late' : ''}
                      </span>
                      {r.status === 'in-progress' && r.tasksTotal > 1 && <span className="hint">{r.tasksDone} of {r.tasksTotal} tasks</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav className="tabs home-tabs" aria-label="Sections">
            {(['lesson', 'homework', 'exam', 'practice'] as const).map((t) => {
              const n = visible.filter((i) => i.type === t).length;
              return (
                <button key={t} className={section === t ? 'on' : ''} onClick={() => setSection(t)}>
                  {SECTION_LABEL[t]} {n > 0 && <span className="count">{n}</span>}
                </button>
              );
            })}
          </nav>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>
                {section === 'lesson' ? 'Your teacher hasn’t shared any lessons yet. They will appear here.' : `No ${SECTION_LABEL[section].toLowerCase()} yet.`}
              </p>
            ) : (
              groups.map(({ tp, list }) => (
                <div key={tp.id} className="topic">
                  {topics.length > 0 && (
                    <div className="topic-head">
                      <span className="topic-name static">{tp.name}</span>
                    </div>
                  )}
                  <ul className="items">
                    {list.map((i) => {
                      const r = itemResult(i, answers);
                      return (
                        <li key={i.id} className={'item' + (lockedItem(i) ? ' is-locked' : '')}>
                          <span className="type">{i.type}</span>
                          {lockedItem(i) ? (
                            <span className="title locked-title" title="Your teacher will open this soon">
                              {i.title}
                              <svg className="lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="locked">
                                <rect x="5" y="11" width="14" height="10" rx="2" />
                                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                              </svg>
                            </span>
                          ) : (
                            <Link to={`/learn/${i.id}`} className="title">
                              {i.title}
                            </Link>
                          )}
                          <span className="status">
                            {i.type === 'practice' && r.pct !== null ? `Last: ${r.pct}%` : r.status !== 'not-started' ? STATUS_LABEL[r.status] : ''}
                            {i.due ? ` · ${dueText(i.due)}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
          </div>
          <aside className="lh-side">
            <section className="lh-card lh-progress">
              <h2>My progress</h2>
              <div className="lh-bar" role="img" aria-label={`${lessonsDone} of ${lessons.length} lessons`}>
                <i style={{ width: lessons.length ? `${(lessonsDone / lessons.length) * 100}%` : 0 }} />
              </div>
              <span className="hint">
                {lessonsDone} of {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} worked on
              </span>
              <div className="lh-stats">
                <span>
                  <b>{avg === null ? '–' : `${avg}%`}</b>
                  <span className="hint">right answers</span>
                </span>
                <Link to="/notebook">
                  <b>{words}</b>
                  <span className="hint">words in the notebook</span>
                </Link>
                <Link to="/notebook">
                  <b>{dueMistakes}</b>
                  <span className="hint">{dueMistakes === 1 ? 'question to review' : 'questions to review'}</span>
                </Link>
              </div>
            </section>
            {profile?.role === 'learner' && <AnnouncementBoard classId={classId} learnerId={profile.learnerId} />}
          {recaps.length > 0 && (
            <section className="recaps lh-card">
              <h2 style={{ fontSize: 16 }}>Lesson recaps</h2>
              <ul className="recap-list">
                {recaps.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link to={`/recap/${r.itemId}`}>
                      <span className="recap-list-title">{r.lessonTitle}</span>
                      <span className="hint">
                        {new Date(r.date).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                        {r.comment ? ' · with a comment from your teacher' : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

            <section className="lh-card">
              <span className="row-between">
                <h2>Discussion</h2>
                <Link className="btn link small" to="/discuss">
                  Open{unreadThreads ? ` · ${unreadThreads} new` : ''}
                </Link>
              </span>
              {latestThreads.length ? (
                <ul className="lh-threads">
                  {latestThreads.map((x) => (
                    <li key={x.id}>
                      <Link to={`/discuss/${x.id}`}>
                        <span>{x.title}</span>
                        <span className="hint">
                          {x.replyCount} {x.replyCount === 1 ? 'reply' : 'replies'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="hint">Nothing here yet.</span>
              )}
            </section>
          </aside>
          </div>
        </main>
      )}
    </div>
  );
}

import { lessonStyleOf } from '../lib/lessonStyle';
import '../lessons/youngLesson.css';
import { LearnerLiveVideo } from '../components/LiveVideo';
import { tr, useClassTerms } from '../lib/terms';
import { ask } from '../lib/ask';
import { InstrView } from '../editor/InstrEditor';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { LiveWho } from '../components/LiveWho';
import { recordMistakes } from '../lib/mistakes';
import { LearnerQuiz } from '../components/TeamQuiz';
import { NotebookDrawer, SelectionNote } from '../components/NotebookDrawer';
// The class notebook is switched off for now; its parts stay for later.
const NOTEBOOK = false as boolean;
import type { Prefill } from '../components/Notebook';
import { collection } from 'firebase/firestore';
import type { Topic } from '../lib/classes';
import { PollCard } from '../components/Poll';
import { examScope, fmt, startExam, submitExam, timeLeft, useMyRun } from '../lib/exam';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc, Item } from '../lib/classes';
import {
  answerRef,
  isCorrect,
  isAnswered,
  scoreTask,
  loadKey,
  questionIds,
  saveResponses,
  tasksCol,
  type AnswerDoc,
  type Mark,
  type Correction,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { useLiveAudioSetup } from '../lib/liveAudio';
import { isLive, isSynced, liveRef, revealedCount, revealedSingles, revealedSubset, type LiveState } from '../lib/live';
import { TextSizeControl } from '../components/TextSizeControl';
import { PhoneMessagesLink } from '../components/ChatDock';
import { NoticeToasts } from '../components/NoticeToasts';
import { AnnouncementCards, PickedBanner, SignalBar, SpotlightCard, TimerChip } from '../components/LiveExtras';
import { DEFAULT_CODES, useAnnotations } from '../lib/annotations';
import { AnnotationLayer } from '../components/AnnotationLayer';
import { ClassAvatarsContext, useLearnerAvatars } from '../lib/avatars';
import { PanelToggle, usePanels } from '../components/PanelToggles';
import { TEXT_SCALE } from '../lib/auth';
import { drawShared, useSharedPicks } from '../lib/picks';
import { useClassmates } from '../lib/learners';
import { useThreads } from '../lib/discussion';
import { IconBtn, IconLink } from '../components/UiIcon';
import { sendFeedback, useReceivedFeedback } from '../lib/feedback';
import { usePresenceBeat } from '../lib/presence';
import { Wordmark } from '../components/Wordmark';
import { firstPage, LessonBoard } from '../components/LessonBoard';
import { chooseLevel, familyOf, isVariant, roomOf, useGroupSets, useMyLevels, useTaskBodies } from '../lib/groups';
import { TaskRenderer } from '../components/TaskRenderer';

export function LearnerLesson() {
  const { itemId = '' } = useParams();
  const { user, profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  useClassTerms(classId);
  const learnerId = profile?.role === 'learner' ? profile.learnerId : '';
  const [c, setC] = useState<ClassDoc | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [rawTasks, setTasks] = useState<Task[]>([]);
  const [current, setCurrent] = useState('');
  const [responses, setResponses] = useState<Responses>({});
  const [checked, setChecked] = useState(false);
  const [key, setKey] = useState<AnswerKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLiveState] = useState<LiveState | null>(null);
  useLiveAudioSetup(classId, isLive(live) && live?.itemId === itemId, false);
  const panels = usePanels('ll.learnerPanels');
  const timer = useRef<number>();
  const dirty = useRef(false);

  useEffect(() => {
    if (!classId) return;
    const u1 = onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }));
    const u2 = onSnapshot(doc(db, 'classes', classId, 'items', itemId), (s) => s.exists() && setItem({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }));
    const u3 = onSnapshot(query(tasksCol(classId, itemId), orderBy('order')), (s) => {
      setTasks(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })).filter((t) => !t.hidden && t.print?.show !== 'paper'));
    });
    return () => (u1(), u2(), u3());
  }, [classId, itemId]);

  // Groups and versions: each learner sees one version of a task, in the main task's place.
  const myLevels = useMyLevels(classId, user?.uid);
  const canOpen = (t: Task) => !t.restricted || !!t.allowed?.includes(learnerId);
  const withBodies = useTaskBodies(classId, itemId, rawTasks, canOpen);
  const tasks = useMemo(() => {
    const out: (Task & { needsLevel?: boolean; levels?: Task[] })[] = [];
    for (const m of withBodies) {
      if (isVariant(m) && withBodies.some((x) => x.id === m.family)) continue;
      const fam = familyOf(withBodies, m).filter(canOpen);
      if (!fam.length) continue;
      if (fam.length > 1 && m.dist?.mode === 'choose') {
        const pick = fam.find((f) => f.id === myLevels[m.id]);
        out.push({ ...(pick ?? fam[0]), title: m.title, needsLevel: !pick, levels: fam, order: m.order });
      } else out.push({ ...fam[0], title: m.title, order: m.order });
    }
    return out;
  }, [withBodies, myLevels, learnerId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The entry in the list for a task id (the teacher may be on another version of it).
  const entryFor = (id?: string) => {
    if (!id) return undefined;
    const t = rawTasks.find((x) => x.id === id);
    const fam = t?.family ?? id;
    return tasks.find((x) => x.id === id || (x.family ?? x.id) === fam);
  };
  useEffect(() => {
    setCurrent((cur) => (cur && tasks.some((t) => t.id === cur && !t.locked && t.kind !== 'section') ? cur : (entryFor(cur)?.id && !entryFor(cur)!.locked ? entryFor(cur)!.id : tasks.find((t) => !t.locked && t.kind !== 'section')?.id ?? '')));
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupSets = useGroupSets(classId);

  useEffect(() => {
    if (!classId) return;
    return onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {});
  }, [classId]);
  usePresenceBeat(classId, user?.uid, { name: profile?.role === 'learner' ? profile.displayName : '', learnerId, itemId, taskId: current, avatar: profile?.avatar, live: isLive(live) && live?.itemId === itemId });
  const myRoom = live?.groupSetId ? roomOf(groupSets.find((g) => g.id === live.groupSetId), learnerId) : undefined;
  const roomTarget = isLive(live) && live?.itemId === itemId && myRoom ? live.roomTask?.[myRoom.id] : undefined;
  // Homework and practice are self-paced: the class never pulls a learner along.
  const selfPaced = item?.type === 'homework' || item?.type === 'practice';
  const synced = !selfPaced && ((isSynced(live, itemId) && !live?.syncRoom) || !!roomTarget);
  const syncTo = entryFor(roomTarget ?? live?.taskId)?.id;
  const liveHere = isLive(live) && live?.itemId === itemId;
  const boardOpen = liveHere && !!live?.board?.open;
  const [onBoard, setOnBoard] = useState(false);
  const [boardNote, setBoardNote] = useState(false);
  // Following the teacher: the board opens for you. Working on your own: a note says it is open.
  useEffect(() => {
    if (!boardOpen) return setOnBoard(false), setBoardNote(false);
    if (synced) setOnBoard(true);
    else setBoardNote(true);
  }, [boardOpen, synced]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const teacherAt = (isLive(live) && live?.itemId === itemId && live?.showMarker !== false) || synced ? entryFor(live!.taskId)?.id ?? '' : '';
  // When the teacher syncs the class, everyone follows the teacher's task.
  useEffect(() => {
    if (synced && syncTo) setCurrent(syncTo);
  }, [synced, syncTo]);
  const go = (id: string) => !synced && setCurrent(id);
  // Arriving from a notification or link: open that task.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const t = params.get('task');
    if (t && tasks.some((x) => x.id === t && !x.locked)) {
      setCurrent(t);
      setParams({}, { replace: true });
    }
  }, [params, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Answers the teacher has revealed to the class for this task.
  const revealN = revealedCount(live, itemId, current);
  const singles = revealedSingles(live, itemId, current);
  const [revealKey, setRevealKey] = useState<AnswerKey | null>(null);
  useEffect(() => {
    setRevealKey(null);
    if ((!revealN && !singles.length) || !classId || !current) return;
    loadKey(classId, itemId, current).then(setRevealKey).catch(() => setRevealKey(null));
  }, [revealN !== 0 || singles.length > 0, classId, itemId, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const attemptsRef = useRef(0);
  // Load this learner's saved answers for the current task.
  useEffect(() => {
    if (!classId || !current || !user) return;
    setKey(null);
    setChecked(false);
    setResponses({});
    setFlags([]);
    dirty.current = false;
    return onSnapshot(answerRef(classId, current, user.uid), { includeMetadataChanges: true }, async (s) => {
      setPendingSave(s.metadata.hasPendingWrites);
      const d = s.data() as (AnswerDoc & { flags?: string[] }) | undefined;
      setFlags(d?.flags ?? []);
      attemptsRef.current = d?.attempts ?? 0;
      setMarks(d?.marks ?? {});
      setCorrections(d?.corrections ?? {});
      if (dirty.current) return;
      setResponses(d?.responses ?? {});
      setChecked(!!d?.checked);
      if (d?.checked) setKey(await loadKey(classId, itemId, current).catch(() => null));
    });
  }, [classId, itemId, current, user]);

  const task = item?.locked ? undefined : tasks.find((t) => t.id === current);
  const index = tasks.findIndex((t) => t.id === current);
  const shared = useSharedPicks(classId, current);
  const classmates = useClassmates(c?.classCode);
  const [nbOpen, setNbOpen] = useState(false);
  const [nbPrefill, setNbPrefill] = useState<Prefill | null>(null);
  const [nbFocus, setNbFocus] = useState<string | null>(null);
  const [nbItems, setNbItems] = useState<Item[]>([]);
  const [nbTopics, setNbTopics] = useState<Topic[]>([]);
  useEffect(() => {
    if (!classId) return;
    const u1 = onSnapshot(collection(db, 'classes', classId, 'items'), (s) => setNbItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Item).filter((i) => !i.hidden).sort((a, b) => a.order - b.order)), () => {});
    const u2 = onSnapshot(collection(db, 'classes', classId, 'topics'), (s) => setNbTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic).sort((a, b) => a.order - b.order)), () => {});
    return () => (u1(), u2());
  }, [classId]);
  const nbMe = user ? { uid: user.uid, name: profile?.role === 'learner' ? profile.displayName : '', learnerId, teacher: false } : null;
  const toNotebook = (p: Prefill) => {
    setNbPrefill({ ...p, itemId, taskId: current });
    setNbOpen(true);
  };
  const classAvatars = useLearnerAvatars(classId);
  const received = useReceivedFeedback(classId, current, learnerId);
  const withShared = useMemo(() => ({ ...responses, ...Object.fromEntries(Object.values(shared).map((p) => [p.pickId, { h: p.h, b: p.b }])) }), [responses, shared]);
  const qs = useMemo(() => questionIds(task?.content ?? null, withShared), [task, withShared]);
  const answered = qs.filter((q) => isAnswered(responses[q.id])).length;
  const base = user && task ? { learnerUid: user.uid, learnerId, itemId, taskId: task.id } : null;

  const [flags, setFlags] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [pendingSave, setPendingSave] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, Correction>>({});
  const anns = useAnnotations(classId, current, { teacher: false, uid: user?.uid });
  const allThreads = useThreads(classId, user && profile?.role === 'learner' ? { uid: user.uid, name: profile.displayName, learnerId: profile.learnerId, teacher: false } : null);
  const discussions = allThreads.filter((t) => t.approved && !t.hidden && t.link?.itemId === itemId);
  const resubmit = async (qid: string) => {
    if (!base || !user) return;
    window.clearTimeout(timer.current);
    await saveResponses(classId, base, responses, checked).catch(() => {});
    await setDoc(answerRef(classId, base.taskId, user.uid), { ...base, corrections: { [qid]: { ...corrections[qid], status: 'resubmitted', at: Date.now() } } }, { merge: true });
  };
  function toggleFlag(id: string) {
    if (!base) return;
    const next = flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id];
    setFlags(next);
    setDoc(answerRef(classId, base.taskId, base.learnerUid), { ...base, flags: next }, { merge: true }).catch((e) => console.error(e));
  }

  const examLockedRef = useRef(false);
  function change(id: string, v: Responses[string]) {
    if (!base || task?.locked || examLockedRef.current || (checked && corrections[id]?.status !== 'open')) return;
    const next = { ...responses, [id]: v };
    setResponses(next);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveResponses(classId, base, next).catch((e) => console.error(e));
      dirty.current = false;
    }, 600);
    sendPeerFeedback(id, v);
  }

  // Peer feedback the teacher shares with the classmate goes to them as it is written.
  const fbTimer = useRef<number>();
  function sendPeerFeedback(id: string, v: Responses[string]) {
    if (!base || !user) return;
    let block: { attrs?: Record<string, unknown> } | undefined;
    const walk = (n: { attrs?: Record<string, unknown>; type?: string; content?: unknown[] }) => {
      if (n.type === 'reflect' && n.attrs?.id === id) block = n;
      (n.content as typeof n[] | undefined)?.forEach(walk);
    };
    if (task?.content) walk(task.content as never);
    if (!block?.attrs?.share || block.attrs.about !== 'peer') return;
    const a = v as unknown as { peer?: string; ratings?: Record<string, number | number[] | string> };
    const pairs = (block.attrs.pairs ?? {}) as Record<string, string>;
    const to = block.attrs.pairing === 'teacher' ? pairs[learnerId] : a.peer;
    if (!to) return;
    window.clearTimeout(fbTimer.current);
    fbTimer.current = window.setTimeout(() => {
      sendFeedback(classId, {
        taskId: base.taskId,
        blockId: id,
        from: learnerId,
        fromName: profile?.role === 'learner' ? profile.displayName : '',
        fromUid: user.uid,
        to,
        ratings: a.ratings ?? {},
      }).catch((e) => console.error(e));
    }, 900);
  }

  async function check() {
    if (!base) return;
    setBusy(true);
    window.clearTimeout(timer.current);
    try {
      await saveResponses(classId, base, responses, true);
      const k = await loadKey(classId, itemId, base.taskId);
      const r = scoreTask(qs, k, responses);
      const late = !!item?.due && Date.now() > item.due;
      await saveResponses(classId, base, responses, true, { score: r.score, total: r.total }, { submittedAt: Date.now(), ...(late ? { late: true } : {}), attempts: (attemptsRef.current ?? 0) + 1 });
      if (item?.type === 'practice' || item?.type === 'homework') recordMistakes(classId, { learnerUid: base.learnerUid, learnerId }, itemId, base.taskId, task?.content ?? null, qs, k, responses).catch(() => {});
      setKey(k);
      setChecked(true);
    } catch (e) {
      console.error(e);
    } finally {
      dirty.current = false;
      setBusy(false);
    }
  }

  async function tryWrongAgain(all = false) {
    if (!base || !key) return;
    const kept: Responses = {};
    if (!all) for (const q of qs) if (isCorrect(key[q.id], responses[q.id]) || q.type === 'writing') kept[q.id] = responses[q.id];
    setResponses(kept);
    setChecked(false);
    setKey(null);
    await saveResponses(classId, base, kept, false);
  }

  const result = key ? scoreTask(qs, key, responses) : { score: 0, total: 0, hasWriting: false };
  const score = result.score;
  const retryMode = task?.afterCheck === 'retry';
  const prevOpen = [...tasks.slice(0, Math.max(0, index))].reverse().find((t) => !t.locked && t.kind !== 'section');
  const nextOpen = tasks.slice(index + 1).find((t) => !t.locked && t.kind !== 'section');
  const th = theme(c?.themeColor);
  const showScore = task?.showScore !== false;

  // Exams: Start, a timer, no checking, locked after submitting, results when the teacher releases them.
  const scope = examScope(item, task);
  const run = useMyRun(classId, scope?.id, user?.uid);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!scope || !run || run.submittedMs) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [scope?.id, run?.startMs, run?.submittedMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = timeLeft(run, scope?.minutes ?? null, now);
  const examState = !scope ? 'none' : run === undefined ? 'loading' : run === null ? 'before' : run.submittedMs ? (scope.released ? 'released' : 'submitted') : 'running';
  const examLocked = examState === 'before' || examState === 'submitted' || examState === 'loading' || (examState === 'released' && !checked);
  examLockedRef.current = examLocked;
  async function submitNow(auto = false) {
    if (!scope || !user) return;
    if (!auto && !(await ask(scope.kind === 'item' ? 'Hand in the whole exam? You can’t change your answers after this.' : 'Hand in this exam? You can’t change your answers after this.'))) return;
    window.clearTimeout(timer.current);
    if (base) await saveResponses(classId, base, responses).catch(() => {});
    await submitExam(classId, scope.id, user.uid).catch((e) => console.error(e));
  }
  useEffect(() => {
    if (examState === 'running' && left === 0) submitNow(true);
  }, [examState, left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // When results are released, mark this task so the learner sees how they did.
  useEffect(() => {
    if (examState === 'released' && !checked && !busy && base && qs.length) check();
  }, [examState, checked, current]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ClassAvatarsContext.Provider value={classAvatars}>
    <div className="shell wide lesson-shell" style={{ ['--accent' as string]: th.accent, ['--accent-text' as string]: th.text }}>
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">{c?.name ?? 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{item?.title ?? '…'}</span>
        </nav>
        <span className="right-push icon-row">
          {c?.meeting?.url && c.meeting.visibility === 'always' && <IconLink icon="call" label="Join the call" href={c.meeting.url} />}
          <IconLink icon="discuss" label="Class discussion" to="/discuss" />
          {NOTEBOOK && <IconBtn icon="notebook" label="Notebook" active={nbOpen} onClick={() => setNbOpen(true)} />}
          <PhoneMessagesLink />
          <TextSizeControl />
        </span>
      </header>

      <AnnouncementCards classId={classId} learnerId={learnerId} />
      <LearnerLiveVideo c={c} live={live} myRoomId={myRoom?.id} itemId={itemId} />
      {NOTEBOOK && nbMe && <NotebookDrawer open={nbOpen} onClose={() => (setNbOpen(false), setNbPrefill(null), setNbFocus(null))} classId={classId} c={c} me={nbMe} items={nbItems} topics={nbTopics} prefill={nbPrefill} onPrefillDone={() => setNbPrefill(null)} focus={nbFocus} context={{ itemId, taskId: current }} />}
      {liveHere && live?.quiz && user && <LearnerQuiz classId={classId} uid={user.uid} learnerId={learnerId} content={(tid) => withBodies.find((t) => t.id === tid)?.content ?? null} />}
      {liveHere && live?.poll && user && <PollCard classId={classId} poll={live.poll} me={{ uid: user.uid, learnerId, name: profile?.role === 'learner' ? profile.displayName : '' }} />}
      {liveHere && (
        <div className="live-float">
          <TimerChip timer={live?.timer} />
          <PickedBanner picked={live?.picked} me={learnerId} />
          <SignalBar classId={classId} uid={user?.uid} name={profile?.role === 'learner' ? profile.displayName : ''} learnerId={learnerId} />
        </div>
      )}
      <NoticeToasts classId={classId} to={learnerId} link={(i, t) => (i === 'disc' ? `/discuss/${t}` : `/learn/${i}?task=${t}`)} />
      <div className={'lesson-layout learner' + panels.cls}>
        <nav className="task-list" aria-label="Tasks">
          <span className="eyebrow" style={{ padding: '0 10px 6px', fontSize: 11 }}>
            {item?.title}
          </span>
          {liveHere && <LiveWho classId={classId} itemId={itemId} teacherName={live?.teacherName} selfId={learnerId} />}
          {tasks.map((t) =>
            t.kind === 'section' ? (
              <span key={t.id} className="section-label">
                {t.title}
              </span>
            ) : (
            <div key={t.id} className={'task-row' + (t.id === current ? ' on' : '')}>
              <button type="button" className={'task-pick' + (t.locked ? ' is-locked' : '')} disabled={t.locked || (synced && t.id !== current)} title={t.locked ? tr('Your teacher will open this task soon') : synced ? tr('Your teacher is leading the class') : undefined} onClick={() => go(t.id)}>
                <span>{t.title}</span>
                {t.locked && (
                  <svg className="lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="locked">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
                {teacherAt === t.id && (
                  <span className="teacher-here" title={`${live?.teacherName ?? tr('Your teacher')} is on this task`}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? 'Teacher'}
                  </span>
                )}
              </button>
            </div>
            ),
          )}
          {tasks.length === 0 && <span className="hint" style={{ padding: '0 10px' }}>No tasks yet.</span>}
        </nav>

        <div className="center-col">
        <div className="panel-toggles">
          <PanelToggle side="left" open={panels.left} onClick={panels.toggleLeft} label="the task list" />
        </div>
        {item?.locked && (
          <div className="locked-lesson">
            <strong>This lesson is locked.</strong> Your teacher will open it soon.
          </div>
        )}
        <main data-lesson-style={lessonStyleOf(c)} data-activity-number={tasks.filter(t => t.kind !== 'section').findIndex(t => t.id === task?.id) + 1 || undefined} className="task-frame" style={{ ['--ts' as string]: TEXT_SCALE[profile?.textSize ?? 'M'] }}>
          {task ? (
            <div className="frame-inner">
              <div className="frame-head">
                {!task.levels && (task.variant || task.family || (task.variants?.length ?? 0) > 0) && (
                  <span className="ver-badge">
                    <i aria-hidden="true" />
                    {task.variant ? (/^[A-Z]$/.test(task.variant) ? `Version ${task.variant}` : task.variant) : 'Version A'}
                  </span>
                )}
                <h1 className="task-title">{lessonStyleOf(c) === 'young' && <span className="yl-activity-number" aria-hidden="true">{tasks.filter(t => t.kind !== 'section').findIndex(t => t.id === task?.id) + 1}</span>}{task.title}</h1>
                <InstrView classId={classId} doc={task.instrDoc} text={task.instructions} />
                {discussions.filter((d) => d.link?.taskId === task.id || (!d.link?.taskId && d.link?.itemId === itemId)).map((d) => (
                  <Link key={d.id} className="disc-chip" to={`/discuss/${d.id}`}>
                    Discuss: {d.title} · {d.replyCount} {d.replyCount === 1 ? 'reply' : 'replies'} →
                  </Link>
                ))}
                {task.levels && !task.needsLevel && rawTasks.find((t) => t.id === (task.family ?? task.id))?.dist?.canChange !== false && (
                  <span className="seg small-seg level-tabs" role="radiogroup" aria-label="Level">
                    {task.levels.map((l) => (
                      <button key={l.id} type="button" role="radio" aria-checked={l.id === task.id} className={l.id === task.id ? 'on' : ''} onClick={() => user && chooseLevel(classId, task.family ?? task.id, user.uid, learnerId, l.id).then(() => setCurrent(l.id))}>
                        {l.variant ?? 'Standard'}
                      </button>
                    ))}
                  </span>
                )}
                {boardOpen && (
                  <span className="seg small-seg board-tabs" role="tablist" aria-label="Task or board">
                    <button type="button" role="tab" aria-selected={!onBoard} className={!onBoard ? 'on' : ''} onClick={() => setOnBoard(false)}>
                      Task
                    </button>
                    <button type="button" role="tab" aria-selected={onBoard} className={onBoard ? 'on' : ''} onClick={() => setOnBoard(true)}>
                      Board
                    </button>
                  </span>
                )}

              </div>
              {boardOpen && !onBoard && boardNote && (
                <div className="board-note" role="status">
                  <UiIcon name="board" size={18} />
                  <span>
                    <strong>{live?.teacherName ?? tr('Your teacher')} opened the board.</strong>
                  </span>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn small-btn primary" onClick={() => (setOnBoard(true), setBoardNote(false))}>
                    Open the board
                  </button>
                  <button type="button" className="board-note-x" aria-label="Not now" onClick={() => setBoardNote(false)}>
                    ×
                  </button>
                </div>
              )}
              {boardOpen && onBoard && user && item && <div className="board-pane"><LessonBoard classId={classId} item={item} uid={user.uid} teacher={false} page={live?.board?.page || firstPage(item)} /></div>}
              <div className="frame-body" ref={bodyRef} hidden={boardOpen && onBoard}>
                {liveHere && <SpotlightCard spotlight={live?.spotlight} taskId={task.id} />}
                {NOTEBOOK && nbMe && <SelectionNote container={bodyRef} c={c} me={nbMe} onAdd={toNotebook} />}
                <AnnotationLayer container={bodyRef} annotations={anns} classId={classId} taskId={task.id} canAnnotate={false} me={{ uid: user?.uid ?? '', name: profile?.role === 'learner' ? profile.displayName : '', teacher: false }} />
                {synced && (
                  <div className="sync-banner" role="status">
                    <span className="live-dot" aria-hidden="true" />
                    Following {live?.teacherName ?? tr('your teacher')}. Your screen moves with the class.
                  </div>
                )}
                {!synced && teacherAt && teacherAt !== task.id && (
                  <button type="button" className="teacher-banner" onClick={() => go(teacherAt)}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? tr('Your teacher')} is on “{tasks.find((t) => t.id === teacherAt)?.title ?? 'another task'}”. Go there
                  </button>
                )}
                {scope && (examState === 'before' || examState === 'loading') ? (
                  <div className="exam-start">
                    <span className="eyebrow">Exam</span>
                    <h2>{scope.title}</h2>
                    <ul>
                      <li>{scope.minutes ? `You have ${scope.minutes} minutes from when you start.` : 'There’s no time limit.'}</li>
                      <li>{tr('You won’t see the answers until your teacher shares the results.')}</li>
                      <li>When you hand it in{scope.minutes ? ' or the time is up' : ''}, your answers are locked.</li>
                    </ul>
                    <button type="button" className="btn primary tall" disabled={examState === 'loading'} onClick={() => user && startExam(classId, scope.id, user.uid, learnerId, profile?.role === 'learner' ? profile.displayName : '')}>
                      Start the exam
                    </button>
                  </div>
                ) : task.needsLevel && task.levels ? (
                  <div className="lvl-choose">
                    <span className="eyebrow">Choose your level</span>
                    <p>Pick the one that feels right for you today.</p>
                    <span className="level-pick-row">
                      {task.levels.map((l) => (
                        <button key={l.id} type="button" className="level-card" onClick={() => user && chooseLevel(classId, task.family ?? task.id, user.uid, learnerId, l.id).then(() => setCurrent(l.id))}>
                          <span className="level-bars" aria-hidden="true">
                            {[0, 1, 2].map((b) => (
                              <span key={b} className={b <= Math.max(0, ['Easier', 'Standard', 'Challenge'].indexOf(l.variant ?? 'Standard')) ? 'on' : ''} />
                            ))}
                          </span>
                          {l.variant ?? 'Standard'}
                        </button>
                      ))}
                    </span>
                  </div>
                ) : (
                <TaskRenderer
                  content={task.content}
                  responses={responses}
                  onChange={change}
                  revealed={revealKey ? revealedSubset(revealKey, questionIds(task.content), revealN, singles) : null}
                  results={checked ? key : null}
                  disabled={task.locked || examLocked}
                  hideAnswers={task.afterCheck === 'retry'}
                  layout={task.layout ?? 'single'}
                  colScroll={task.colScroll ?? 'separate'}
                  flags={flags}
                  teacherMarks={marks}
                  writingReview={{ anns, corrections, codes: c?.codes ?? DEFAULT_CODES, onResubmit: resubmit }}
                  shared={shared}
                  classmates={classmates}
                  classId={classId}
                  selfId={learnerId}
                  received={received}
                  boardMe={user && profile?.role === 'learner' ? { classId, taskId: current, itemId, uid: user.uid, name: profile.displayName, selfId: learnerId, people: classmates } : undefined}
                  onSharedReset={(pickId) => drawShared(classId, current, pickId, [], [], (shared[pickId]?.seq ?? 0) + 1, '').catch((e) => console.error(e))}
                  onOpenNotebook={(id) => (setNbFocus(id), setNbOpen(true))}
                  onOpenTask={(id) => {
                    const t = entryFor(id);
                    if (t && !t.locked) setCurrent(t.id);
                  }}
                  taskState={(id) => {
                    const t = entryFor(id);
                    return !t ? 'missing' : t.locked ? 'locked' : 'open';
                  }}
                  onSharedDraw={(pickId, next, seq) => drawShared(classId, current, pickId, next.h, next.b, seq, (profile?.role === 'learner' ? profile.displayName : '').split(' ')[0] || tr('A learner')).catch((e) => console.error(e))}
                  liveHere={liveHere}
                  onToggleFlag={task.locked ? undefined : toggleFlag}
                />
                )}
              </div>
              <div className="frame-foot">
                {scope && examState === 'running' ? (
                  <span className={'exam-clock' + (left !== null && left < 60000 ? ' soon' : '')} role="timer">
                    {left !== null ? `${fmt(left)} left` : 'Exam'} · {answered} of {qs.length} answered
                  </span>
                ) : scope && examState === 'submitted' ? (
                  <span className="hint">{tr('Handed in. Your teacher will share the results soon.')}</span>
                ) : checked && key && showScore ? (
                  <span className="score">
                    {result.total > 0 ? (
                      <>
                        <span className="big">{Math.round(score * 10) / 10}</span> of {result.total} correct
                      </>
                    ) : null}
                    {result.hasWriting && <span className="hint">{result.total > 0 ? ' · ' : ''}Your writing has gone to your teacher</span>}
                  </span>
                ) : (
                  <span className="hint foot-status">
                    {qs.length > 0 && <span className="foot-short">{answered}/{qs.length}</span>}
                    {qs.length > 0 ? <span className="foot-long">{`${answered} of ${qs.length} answered`}</span> : ''}
                    {qs.length > 0 && <span className={'save-dot' + (pendingSave ? ' pending' : '')}>{pendingSave ? ' · saving…' : ' · saved'}</span>}
                    {flags.filter((f) => qs.some((q) => q.id === f)).length > 0 && ` · ${flags.filter((f) => qs.some((q) => q.id === f)).length} flagged`}
                  </span>
                )}
                <span className="foot-acts">
                  <IconBtn icon="prev" label={synced ? tr('Your teacher is moving the class') : 'Previous task'} className="nav-arrow foot-prev" disabled={!prevOpen || synced} onClick={() => prevOpen && go(prevOpen.id)} />
                  {scope ? (
                    examState === 'running' ? (
                      <button className="btn primary" onClick={() => submitNow()}>
                        {scope.kind === 'item' ? 'Hand in the exam' : 'Hand in'}
                      </button>
                    ) : null
                  ) : qs.length > 0 && qs.every((q) => q.type === 'reflect') ? (
                    <span className="hint saved-auto">{Object.keys(responses).length ? tr('Saved. Your teacher can see your answers.') : ''}</span>
                  ) : qs.length > 0 &&
                    (checked ? (
                      item?.type === 'practice' ? (
                        <button className="btn primary" onClick={() => tryWrongAgain(true)}>
                          Try again
                        </button>
                      ) : (
                        retryMode && score < result.total && (
                          <button className="btn primary" onClick={() => tryWrongAgain()}>
                            Try the wrong ones again
                          </button>
                        )
                      )
                    ) : (
                      <button className="btn primary" disabled={busy || task.locked || answered === 0 || !!task.needsLevel} onClick={check}>
                        {busy ? 'One moment…' : qs.every((q) => q.type === 'writing' || q.type === 'reflect') ? 'Hand in' : (<>Check<span className="foot-long"> answers</span></>)}
                      </button>
                    ))}
                  <IconBtn icon="next" label={synced ? tr('Your teacher is moving the class') : 'Next task'} className={'nav-arrow foot-next' + (checked || qs.length === 0 ? ' pulse' : '')} disabled={!nextOpen || synced} onClick={() => nextOpen && go(nextOpen.id)} />
                </span>
              </div>
            </div>
          ) : (
            tasks.length === 0 ? (
              <p className="placeholder" style={{ padding: 24 }}>
                Your teacher hasn’t added tasks to this lesson yet.
              </p>
            ) : (
              <div className="frame-loading">
                <Loader label="Opening the task" />
              </div>
            )
          )}
        </main>
        </div>
      </div>
    </div>
    </ClassAvatarsContext.Provider>
  );
}

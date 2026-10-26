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
import { isLive, isSynced, liveRef, revealedCount, revealedSingles, revealedSubset, type LiveState } from '../lib/live';
import { TextSizeControl } from '../components/TextSizeControl';
import { NoticeToasts } from '../components/NoticeToasts';
import { AnnouncementCards, PickedBanner, SignalBar, SpotlightCard, TimerChip } from '../components/LiveExtras';
import { PointerDot } from '../components/PointerDot';
import { usePointer } from '../lib/session';
import { DEFAULT_CODES, useAnnotations } from '../lib/annotations';
import { AnnotationLayer } from '../components/AnnotationLayer';
import { ClassAvatarsContext, useLearnerAvatars } from '../lib/avatars';
import { PanelToggle, usePanels } from '../components/PanelToggles';
import { TEXT_SCALE } from '../lib/auth';
import { drawShared, useSharedPicks } from '../lib/picks';
import { useClassmates } from '../lib/learners';
import { sendFeedback, useReceivedFeedback } from '../lib/feedback';
import { usePresenceBeat } from '../lib/presence';
import { Wordmark } from '../components/Wordmark';
import { Whiteboard } from '../components/Whiteboard';
import { chooseLevel, familyOf, isVariant, roomOf, useGroupSets, useMyLevels, useTaskBodies } from '../lib/groups';
import { TaskRenderer } from '../components/TaskRenderer';

export function LearnerLesson() {
  const { itemId = '' } = useParams();
  const { user, profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
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
  const panels = usePanels('ll.learnerPanels');
  const timer = useRef<number>();
  const dirty = useRef(false);

  useEffect(() => {
    if (!classId) return;
    const u1 = onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }));
    const u2 = onSnapshot(doc(db, 'classes', classId, 'items', itemId), (s) => s.exists() && setItem({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }));
    const u3 = onSnapshot(query(tasksCol(classId, itemId), orderBy('order')), (s) => {
      setTasks(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })).filter((t) => !t.hidden));
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
  usePresenceBeat(classId, user?.uid, { name: profile?.role === 'learner' ? profile.displayName : '', learnerId, itemId, taskId: current, avatar: profile?.avatar });
  const myRoom = live?.groupSetId ? roomOf(groupSets.find((g) => g.id === live.groupSetId), learnerId) : undefined;
  const roomTarget = isLive(live) && live?.itemId === itemId && myRoom ? live.roomTask?.[myRoom.id] : undefined;
  const synced = (isSynced(live, itemId) && !live?.syncRoom) || !!roomTarget;
  const syncTo = entryFor(roomTarget ?? live?.taskId)?.id;
  const liveHere = isLive(live) && live?.itemId === itemId;
  const boardOpen = liveHere && !!live?.boardTask && entryFor(live.boardTask)?.id === current;
  const [onBoard, setOnBoard] = useState(false);
  useEffect(() => setOnBoard(boardOpen), [boardOpen]); // jump to the board when the teacher opens it
  const pointer = usePointer(liveHere ? classId : '');
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

  function change(id: string, v: Responses[string]) {
    if (!base || task?.locked || (checked && corrections[id]?.status !== 'open')) return;
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
      await saveResponses(classId, base, responses, true, { score: r.score, total: r.total });
      setKey(k);
      setChecked(true);
    } catch (e) {
      console.error(e);
    } finally {
      dirty.current = false;
      setBusy(false);
    }
  }

  async function tryWrongAgain() {
    if (!base || !key) return;
    const kept: Responses = {};
    for (const q of qs) if (isCorrect(key[q.id], responses[q.id]) || q.type === 'writing') kept[q.id] = responses[q.id];
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
        <span className="right-push" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TextSizeControl />
        {c?.meeting?.url && c.meeting.visibility === 'always' && (
          <a className="btn small-btn right-push" href={c.meeting.url} target="_blank" rel="noopener noreferrer">
            Join call
          </a>
        )}
        </span>
      </header>

      <AnnouncementCards classId={classId} learnerId={learnerId} />
      {liveHere && (
        <div className="live-float">
          <TimerChip timer={live?.timer} />
          <PickedBanner picked={live?.picked} me={learnerId} />
          <SignalBar classId={classId} uid={user?.uid} name={profile?.role === 'learner' ? profile.displayName : ''} learnerId={learnerId} />
        </div>
      )}
      {liveHere && <PointerDot pointer={pointer} taskId={current} container={bodyRef} />}
      <NoticeToasts classId={classId} to={learnerId} link={(i, t) => `/learn/${i}?task=${t}`} />
      <div className={'lesson-layout learner' + panels.cls}>
        <nav className="task-list" aria-label="Tasks">
          <span className="eyebrow" style={{ padding: '0 10px 6px', fontSize: 11 }}>
            {item?.title}
          </span>
          {tasks.map((t) =>
            t.kind === 'section' ? (
              <span key={t.id} className="section-label">
                {t.title}
              </span>
            ) : (
            <div key={t.id} className={'task-row' + (t.id === current ? ' on' : '')}>
              <button type="button" className={'task-pick' + (t.locked ? ' is-locked' : '')} disabled={t.locked || (synced && t.id !== current)} title={t.locked ? 'Your teacher will open this task soon' : synced ? 'Your teacher is leading the class' : undefined} onClick={() => go(t.id)}>
                <span>{t.title}</span>
                {t.locked && (
                  <svg className="lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="locked">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                )}
                {teacherAt === t.id && (
                  <span className="teacher-here" title={`${live?.teacherName ?? 'Your teacher'} is on this task`}>
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
        <main className="task-frame" style={{ ['--ts' as string]: TEXT_SCALE[profile?.textSize ?? 'M'] }}>
          {task ? (
            <div className="frame-inner">
              <div className="frame-head">
                <h1 className="task-title">{task.title}</h1>
                {task.instructions && <p className="task-instr">{task.instructions}</p>}
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
              {boardOpen && onBoard && user && <Whiteboard classId={classId} boardId={task.id} uid={user.uid} teacher={false} />}
              <div className="frame-body" ref={bodyRef} hidden={boardOpen && onBoard}>
                {liveHere && <SpotlightCard spotlight={live?.spotlight} taskId={task.id} />}
                <AnnotationLayer container={bodyRef} annotations={anns} classId={classId} taskId={task.id} canAnnotate={false} me={{ uid: user?.uid ?? '', name: profile?.role === 'learner' ? profile.displayName : '', teacher: false }} />
                {synced && (
                  <div className="sync-banner" role="status">
                    <span className="live-dot" aria-hidden="true" />
                    Following {live?.teacherName ?? 'your teacher'}. Your screen moves with the class.
                  </div>
                )}
                {!synced && teacherAt && teacherAt !== task.id && (
                  <button type="button" className="teacher-banner" onClick={() => go(teacherAt)}>
                    <span className="live-dot" aria-hidden="true" />
                    {live?.teacherName ?? 'Your teacher'} is on “{tasks.find((t) => t.id === teacherAt)?.title ?? 'another task'}”. Go there
                  </button>
                )}
                {task.needsLevel && task.levels ? (
                  <div className="level-pick">
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
                  disabled={task.locked}
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
                  onOpenTask={(id) => {
                    const t = entryFor(id);
                    if (t && !t.locked) setCurrent(t.id);
                  }}
                  taskState={(id) => {
                    const t = entryFor(id);
                    return !t ? 'missing' : t.locked ? 'locked' : 'open';
                  }}
                  onSharedDraw={(pickId, next, seq) => drawShared(classId, current, pickId, next.h, next.b, seq, (profile?.role === 'learner' ? profile.displayName : '').split(' ')[0] || 'A learner').catch((e) => console.error(e))}
                  onToggleFlag={task.locked ? undefined : toggleFlag}
                />
                )}
              </div>
              <div className="frame-foot">
                {checked && key && showScore ? (
                  <span className="score">
                    {result.total > 0 ? (
                      <>
                        <span className="big">{Math.round(score * 10) / 10}</span> of {result.total} correct
                      </>
                    ) : null}
                    {result.hasWriting && <span className="hint">{result.total > 0 ? ' · ' : ''}Your writing has gone to your teacher</span>}
                  </span>
                ) : (
                  <span className="hint">
                    {qs.length > 0 ? `${answered} of ${qs.length} answered` : ''}
                    {qs.length > 0 && <span className={'save-dot' + (pendingSave ? ' pending' : '')}>{pendingSave ? ' · saving…' : ' · saved'}</span>}
                    {flags.filter((f) => qs.some((q) => q.id === f)).length > 0 && ` · ${flags.filter((f) => qs.some((q) => q.id === f)).length} flagged`}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn" disabled={!prevOpen || synced} onClick={() => prevOpen && go(prevOpen.id)}>
                    Previous
                  </button>
                  {qs.length > 0 && qs.every((q) => q.type === 'reflect') ? (
                    <span className="hint saved-auto">{Object.keys(responses).length ? 'Saved. Your teacher can see your answers.' : ''}</span>
                  ) : qs.length > 0 &&
                    (checked ? (
                      retryMode && score < result.total && (
                        <button className="btn primary" onClick={tryWrongAgain}>
                          Try the wrong ones again
                        </button>
                      )
                    ) : (
                      <button className="btn primary" disabled={busy || task.locked || answered === 0} onClick={check}>
                        {busy ? 'One moment…' : qs.every((q) => q.type === 'writing' || q.type === 'reflect') ? 'Hand in' : 'Check answers'}
                      </button>
                    ))}
                  <button className={'btn' + (checked || qs.length === 0 ? ' primary' : '')} disabled={!nextOpen || synced} onClick={() => nextOpen && go(nextOpen.id)}>
                    Next
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <p className="placeholder" style={{ padding: 24 }}>
              {tasks.length === 0 ? 'Your teacher hasn’t added tasks to this lesson yet.' : 'Loading…'}
            </p>
          )}
        </main>
        </div>
      </div>
    </div>
    </ClassAvatarsContext.Provider>
  );
}

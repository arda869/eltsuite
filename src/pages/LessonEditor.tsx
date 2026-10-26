import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { updateItem, type ClassDoc, type Item } from '../lib/classes';
import {
  addTask,
  deleteTask,
  loadKey,
  mergeKey,
  saveTask,
  setTaskFlags,
  splitKey,
  questionIds,
  tasksCol,
  loadNotes,
  saveNotes,
  addVersion,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { isLive, liveRef, revealedCount, revealedSingles, revealedSubset, setLive, type LiveState } from '../lib/live';
import { TEXT_SCALE } from '../lib/auth';
import { TextSizeControl } from '../components/TextSizeControl';
import { NoticeToasts } from '../components/NoticeToasts';
import { PickedBanner, SpotlightCard, TimerChip } from '../components/LiveExtras';
import { ReactionBurst } from '../components/ReactionBurst';
import { AnnounceDialog } from '../components/AnnounceDialog';
import { claimClass, clearAllHands, sendPointer, useSignals, useThrottle } from '../lib/session';
import { Icon } from '../editor/Icons';
import { DEFAULT_CODES, useAnnotations } from '../lib/annotations';
import { AnnotationLayer } from '../components/AnnotationLayer';
import { CopyDialog } from '../components/CopyDialog';
import { VersionsDialog } from '../components/VersionsDialog';
import { download, lessonText } from '../lib/transfer';
import { downloadJson, lessonBundle } from '../lib/fullcopy';
import { roleIn } from '../lib/coteach';
import { WorksheetDialog } from '../components/WorksheetDialog';
import { RecapDialog } from '../components/Recap';
import { Avatar } from '../components/avatars';
import { ClassAvatarsContext, useLearnerAvatars } from '../lib/avatars';
import { PanelToggle, usePanels } from '../components/PanelToggles';
import { useAuth } from '../lib/auth';
import { isOnline, usePresence } from '../lib/presence';
import { TopBar } from '../components/TopBar';
import { TaskEditor } from '../editor/TaskEditor';
import { DOTS } from '../editor/nodes';
import { TaskRenderer } from '../components/TaskRenderer';
import { firstPage, LessonBoard } from '../components/LessonBoard';
import { LivePanel } from '../components/LivePanel';
import { drawShared, useSharedPicks } from '../lib/picks';
import { useClassmates } from '../lib/learners';
import { applyAccess, familyOf, isVariant, makeVariant, roleOf, ROLE_NAMES, unlinkVariant, useClassLevels, useGroupSets, useTaskBodies } from '../lib/groups';
import { GroupsDialog } from '../components/GroupsDialog';
import { TaskAudience } from '../components/TaskAudience';
import { ExamSettings } from '../components/ExamSettings';
import { PollDialog } from '../components/Poll';
import { TeacherQuiz } from '../components/TeamQuiz';
import { NotebookDrawer, SelectionNote } from '../components/NotebookDrawer';
import type { Prefill } from '../components/Notebook';
import { collection } from 'firebase/firestore';
import type { Topic } from '../lib/classes';
import { examScope, useRuns } from '../lib/exam';
import { HIGHLIGHTS, INK_COLORS, InkBar, PresentInk, type InkMode } from '../components/PresentInk';

const svg = (d: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const EYE = svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
const EYE_OFF = svg(<><path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M3 3l18 18" /></>);
const LOCK = svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
const UNLOCK = svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>);
const COPY = svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
const PEOPLE = svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .6 3 2.8 3 6" /></>);
const TRASH = svg(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>);

type Draft = { title: string; instructions: string; content: JSONContent };

export function LessonEditor() {
  const { classId = '', itemId = '' } = useParams();
  const [c, setC] = useState<ClassDoc | null>(null);
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [rawTasks, setTasks] = useState<Task[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [preview, setPreview] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [boardPageLocal, setBoardPageLocal] = useState('');
  const [inkMode, setInkMode] = useState<InkMode>('off');
  const [pollOpen, setPollOpen] = useState(false);
  const [nbOpen, setNbOpen] = useState(false);
  const [nbPrefill, setNbPrefill] = useState<Prefill | null>(null);
  const [nbFocus, setNbFocus] = useState<string | null>(null);
  const [nbItems, setNbItems] = useState<Item[]>([]);
  const [nbTopics, setNbTopics] = useState<Topic[]>([]);
  useEffect(() => {
    if (!classId) return;
    const u1 = onSnapshot(collection(db, 'classes', classId, 'items'), (s) => setNbItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Item).sort((a, b) => a.order - b.order)), () => {});
    const u2 = onSnapshot(collection(db, 'classes', classId, 'topics'), (s) => setNbTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic).sort((a, b) => a.order - b.order)), () => {});
    return () => (u1(), u2());
  }, [classId]);
  const toNotebook = (p: Prefill) => {
    setNbPrefill({ ...p, itemId, taskId: selected });
    setNbOpen(true);
  };
  const [quizOpen, setQuizOpen] = useState(false);
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [inkHl, setInkHl] = useState(HIGHLIGHTS[0]);
  const [inkClear, setInkClear] = useState(0);
  const [previewResponses, setPreviewResponses] = useState<Responses>({});
  const [previewChecked, setPreviewChecked] = useState(false);
  const [editWhileTeaching, setEditWhileTeaching] = useState(false);
  const { user, profile } = useAuth();
  const viewer = roleIn(c, user?.uid) === 'viewer'; // read-only access (observer or substitute)
  useEffect(() => {
    if (viewer) setPreview(true);
  }, [viewer]);
  const [live, setLiveState] = useState<LiveState | null>(null);
  const timer = useRef<number>();
  const pending = useRef<{ taskId: string; patch: Partial<Draft> } | null>(null);

  useEffect(() => onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) })), [classId]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'classes', classId, 'items', itemId),
        (s) => setItem(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }) : null),
        () => setItem(null),
      ),
    [classId, itemId],
  );
  useEffect(
    () =>
      onSnapshot(query(tasksCol(classId, itemId), orderBy('order')), (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }));
        setTasks(list);
        setSelected((cur) => (cur && list.some((t) => t.id === cur && t.kind !== 'section') ? cur : list.find((t) => t.kind !== 'section')?.id ?? ''));
      }),
    [classId, itemId],
  );

  // Versions sit under their main task; restricted tasks get their content from private/body.
  const withBodies = useTaskBodies(classId, itemId, rawTasks, () => true);
  const withBodiesRef = useRef(withBodies);
  withBodiesRef.current = withBodies;
  const tasks = useMemo(() => {
    const mains = withBodies.filter((t) => !isVariant(t) || !withBodies.some((m) => m.id === t.family));
    return mains.flatMap((m) => [m, ...(m.variants ?? []).map((id) => withBodies.find((x) => x.id === id)).filter((x): x is Task => !!x)]);
  }, [withBodies]);
  // Keep the number of tasks on the lesson, so learner home screens can show progress.
  useEffect(() => {
    if (!item || !tasks.length) return;
    const n = tasks.filter((t) => t.kind !== 'section' && !t.hidden && !isVariant(t)).length;
    if (item.taskCount !== n) updateItem(classId, itemId, { taskCount: n }).catch(() => {});
  }, [tasks, item?.taskCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupSets = useGroupSets(classId);
  const activeSet = groupSets.find((g) => g.id === live?.groupSetId);
  const task = tasks.find((t) => t.id === selected);
  // Live grid with versions: only the learners on this version, each with their room, role or level.
  const fam = familyOf(tasks, task);
  const famMain = fam[0];
  const choices = useClassLevels(classId, famMain?.dist?.mode === 'choose' && fam.length > 1 ? famMain.id : undefined);
  const vLabel = (t?: Task) => (!t ? '' : t.variant && /^[A-Z]$/.test(t.variant) ? `Version ${t.variant}` : t.variant ?? 'Version A');
  const gridOnly: string[] | null = !task || task.kind === 'section' ? null : fam.length > 1 && famMain?.dist?.mode === 'choose' ? Object.entries(choices).filter(([, tid]) => tid === task.id).map(([lid]) => lid) : task.allowed ?? null;
  const examRuns = useRuns(classId, examScope(item, task)?.id);
  const tagOf = (lid: string) => {
    const parts: string[] = [];
    const er = examRuns.find((r) => r.learnerId === lid);
    if (er) parts.push(er.submittedMs ? 'submitted' : 'in exam');
    if (fam.length > 1) {
      const d = famMain.dist;
      if (d?.mode === 'role') {
        const set = groupSets.find((g) => g.id === d.groupSetId);
        const r = roleOf(set, lid, d.roleMap?.length ?? fam.length);
        if (r >= 0) parts.push(`Learner ${ROLE_NAMES[r]}`);
      } else if (d?.mode === 'choose') parts.push(vLabel(fam.find((f) => f.id === choices[lid])) || 'not chosen');
      else parts.push(vLabel(fam.find((f) => !f.restricted || f.allowed?.includes(lid))));
    }
    return parts.join(' · ');
  };
  const sharedPicks = useSharedPicks(classId, selected);
  const classmates = useClassmates(c?.classCode);
  // Work out who may open each task whenever audiences, versions, groups or the class list change.
  const accessSig = JSON.stringify([rawTasks.map((t) => [t.id, t.kind, t.audience, t.family, t.variants, t.dist, t.restricted, t.allowed]), groupSets.map((g) => [g.id, g.groups]), classmates.map((m) => m.id)]);
  useEffect(() => {
    if (!classmates.length && !rawTasks.some((t) => t.restricted)) return;
    const t = window.setTimeout(() => applyAccess(classId, itemId, withBodiesRef.current, groupSets, classmates.map((m) => m.id)).catch((e) => console.error(e)), 400);
    return () => window.clearTimeout(t);
  }, [accessSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const classAvatars = useLearnerAvatars(classId);

  useEffect(() => onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {}), [classId]);
  const teachingHere = isLive(live) && live?.itemId === itemId;
  const presence = usePresence(classId, teachingHere);
  const online = presence.filter(isOnline).sort((a, b) => a.name.localeCompare(b.name));
  const inLesson = online.filter((p) => p.itemId === itemId);
  const onTask = (taskId: string) => inLesson.filter((p) => p.taskId === taskId).length;
  const [seeLearners, setSeeLearnersState] = useState(() => {
    try {
      return localStorage.getItem('ll.seeLearners') !== '0';
    } catch {
      return true;
    }
  });
  const setSeeLearners = (v: boolean) => {
    setSeeLearnersState(v);
    try {
      localStorage.setItem('ll.seeLearners', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  // While teaching, tell learners which task the teacher is on.
  useEffect(() => {
    if (teachingHere && selected && live?.taskId !== selected) setLive(classId, { taskId: selected, ...(live?.sync && live.syncRoom ? { roomTask: { ...(live.roomTask ?? {}), [live.syncRoom]: selected } } : {}) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingHere, selected]);

  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const t = params.get('task');
    if (t && tasks.some((x) => x.id === t)) {
      setParams({}, { replace: true });
      select(t);
      return;
    }
    if (params.get('teach') === '1' && selected && live !== undefined) {
      setParams({}, { replace: true });
      if (!teachingHere) toggleTeaching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Sync and reveal while teaching.
  const qCount = useMemo(() => (draft ? questionIds(splitKey(draft.content).content).filter((q) => q.type !== 'writing' && q.type !== 'reflect').length : 0), [draft]);
  const revealN = task ? revealedCount(live, itemId, task.id) : 0;
  const setReveal = (n: number) => task && setLive(classId, { revealed: { ...(live?.revealed ?? {}), [task.id]: n } });
  const revealNext = () => setReveal(revealN < 0 ? -1 : Math.min(qCount, revealN + 1));
  const revealAll = () => setReveal(-1);
  const hideAnswers = () => task && setLive(classId, { revealed: { ...(live?.revealed ?? {}), [task.id]: 0 }, revealedQs: { ...(live?.revealedQs ?? {}), [task.id]: [] } });
  const singles = task ? revealedSingles(live, itemId, task.id) : [];
  const teachBodyRef = useRef<HTMLDivElement>(null);
  const teacherAnns = useAnnotations(classId, task?.id ?? '', { teacher: true });
  // Classroom tools
  const [pointerOn, setPointerOn] = useState(false);
  const [timerMenu, setTimerMenu] = useState(false);
  const [picking, setPicking] = useState('');
  const [announcing, setAnnouncing] = useState(false);
  const signals = useSignals(teachingHere ? classId : '');
  const signalUids = Object.keys(signals);
  const hands = Object.values(signals).filter((x) => x.hand).sort((a, b) => (a.handAt ?? 0) - (b.handAt ?? 0));
  const stuckN = Object.values(signals).filter((x) => x.stuck).length;
  const movePointer = useThrottle((p: Parameters<typeof sendPointer>[1]) => sendPointer(classId, p), 66);
  useEffect(() => {
    if (user && c && c.teacherId === user.uid) claimClass(classId, user.uid); // boards can be prepared before class
  }, [user, c?.teacherId, classId]);
  const togglePointer = () => {
    const next = !pointerOn;
    setPointerOn(next);
    if (!next && task) sendPointer(classId, { taskId: task.id, bk: '', x: 0, y: 0, on: false });
  };
  const startTimer = (secs: number) => {
    setTimerMenu(false);
    setLive(classId, { timer: { endsAt: Date.now() + secs * 1000, total: secs } });
  };
  const stopTimer = () => (setTimerMenu(false), setLive(classId, { timer: null }));
  const pickLearner = () => {
    const pool = (inLesson.length ? inLesson.map((p) => ({ id: p.learnerId, name: p.name })) : classmates).filter((p) => p.name);
    if (!pool.length) return;
    const winner = pool[Math.floor(Math.random() * pool.length)];
    let n = 0;
    const spin = window.setInterval(() => {
      setPicking(pool[n++ % pool.length].name.split(' ')[0]);
      if (n > 14) {
        window.clearInterval(spin);
        setPicking('');
        setLive(classId, { picked: { name: winner.name, learnerId: winner.id, at: Date.now() } });
      }
    }, 90);
  };
  const toggleSingle = (qid: string) => {
    if (!task || !teachingHere) return;
    const cur = live?.revealedQs?.[task.id] ?? [];
    setLive(classId, { revealedQs: { ...(live?.revealedQs ?? {}), [task.id]: cur.includes(qid) ? cur.filter((x) => x !== qid) : [...cur, qid] } });
  };
  const taskList = tasks.filter((x) => x.kind !== 'section');
  const ti = taskList.findIndex((x) => x.id === selected);
  const prevTask = ti > 0 ? taskList[ti - 1] : undefined;
  const nextTask = ti >= 0 && ti < taskList.length - 1 ? taskList[ti + 1] : undefined;
  const toggleSync = () => setLive(classId, live?.sync ? { sync: false, syncRoom: null, roomTask: null } : { sync: true, taskId: selected, ...(live?.syncRoom ? { roomTask: { [live.syncRoom]: selected } } : {}) });
  // The lesson board: one board with pages for the whole lesson. While teaching, learners follow the page.
  const boardPage = (teachingHere && live?.board?.page) || boardPageLocal || firstPage(item);
  const goBoardPage = (id: string) => {
    setBoardPageLocal(id);
    if (teachingHere) setLive(classId, { board: { open: true, page: id } });
  };
  const showBoard = (on: boolean) => {
    setBoardView(on);
    if (teachingHere) setLive(classId, { board: on ? { open: true, page: boardPage } : null });
  };
  // With breakout rooms, sync can move one room with the teacher; other rooms stay where they are.
  const syncWho = (room: string | null) => setLive(classId, room ? { syncRoom: room, ...(live?.sync ? { roomTask: { ...(live?.roomTask ?? {}), [room]: selected } } : {}) } : { syncRoom: null, roomTask: null });

  // Teaching shortcuts (not while typing).
  const [help, setHelp] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [worksheet, setWorksheet] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => exportRef.current && !exportRef.current.contains(e.target as Node) && setExportOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportOpen]);
  const [copyTask, setCopyTask] = useState<Task | null>(null);
  const [copyMsg, setCopyMsg] = useState('');
  const panels = usePanels('ll.teacherPanels');
  const [present, setPresent] = useState(false);
  const [panelTab, setPanelTab] = useState<'answers' | 'notes'>('answers');
  const [showGrid, setShowGrid] = useState(false);
  // Teacher notes for the selected task (only the teacher can read them).
  const [notes, setNotes] = useState('');
  const notesTimer = useRef<number>();
  useEffect(() => {
    setNotes('');
    if (task) loadNotes(classId, itemId, task.id).then(setNotes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  const changeNotes = (v: string) => {
    setNotes(v);
    window.clearTimeout(notesTimer.current);
    const id = task?.id;
    notesTimer.current = window.setTimeout(() => id && saveNotes(classId, itemId, id, v).catch(() => {}), 700);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        flush();
        setPreview((v) => !v);
        return;
      }
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') return setHelp((h) => !h);
      if (e.key === 'Escape') return (setHelp(false), setPresent(false), setInkMode('off'));
      if (!teachingHere) return;
      const list = tasks.filter((x) => x.kind !== 'section');
      const i = list.findIndex((x) => x.id === selected);
      if (e.key === 'ArrowRight' && i < list.length - 1) select(list[i + 1].id);
      else if (e.key === 'ArrowLeft' && i > 0) select(list[i - 1].id);
      else if (e.key === 's' || e.key === 'S') toggleSync();
      else if (e.key === 'd' || e.key === 'D') setInkMode((m) => (m === 'off' ? 'pen' : 'off'));
      else if (e.key === 'R') (revealN < 0 ? hideAnswers() : revealAll());
      else if (e.key === 'r') (revealN < 0 || revealN >= qCount ? hideAnswers() : revealNext());
      else if ((e.key === 'h' || e.key === 'H') && task) setTaskFlags(classId, itemId, task.id, { hidden: !task.hidden });
      else if (e.key === 'c' || e.key === 'C') panels.toggleRight();
      else if ((e.key === 'l' || e.key === 'L') && task) setTaskFlags(classId, itemId, task.id, { locked: !task.locked });
      else if (e.key === 'p' || e.key === 'P') setPresent((v) => !v);
      else if (e.key === 't' || e.key === 'T') (live?.timer && live.timer.endsAt > Date.now() ? stopTimer() : startTimer(120));
      else if (e.key === 'a' || e.key === 'A') setAnnouncing(true);
      else if (e.key === 'n' || e.key === 'N') {
        if (!panels.right) panels.toggleRight();
        if (present) setShowGrid(true);
        setPanelTab((t) => (t === 'notes' ? 'answers' : 'notes'));
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function toggleTeaching() {
    // Always come back to the read-only teaching view, not an editing or preview state left over.
    setEditWhileTeaching(false);
    setPreview(false);
    setBoardView(false);
    await flush();
    if (teachingHere) await setLive(classId, { teaching: false, sync: false, board: null });
    else
      await setLive(classId, {
        sync: false,
        teaching: true,
        itemId,
        taskId: selected,
        teacherName: (user?.displayName || user?.email?.split('@')[0] || 'Your teacher').split(' ')[0],
        teacherUid: user?.uid ?? '',
      });
  }

  // Load the selected task (with its answer key) into the editor once per selection.
  useEffect(() => {
    if (!task) {
      setDraft(null);
      return;
    }
    if (task.restricted && task.content === null) return setDraft(null);
    let cancelled = false;
    loadKey(classId, itemId, task.id).then((key: AnswerKey) => {
      if (cancelled) return;
      const content = mergeKey(task.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }, key);
      setDraft({ title: task.title, instructions: task.instructions ?? '', content });
      setEditorKey(task.id + ':' + Date.now());
      setPreview(false);
      setPreviewResponses({});
      setPreviewChecked(false);
    });
    return () => {
      cancelled = true;
    };
    // Only when the selection changes, not on every remote update of the same task.
    // (A task whose content is kept apart waits until that content has arrived.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, !!task && (!task.restricted || task.content !== null)]);

  const lastVersion = useRef<Record<string, number>>({});
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const [versionsOpen, setVersionsOpen] = useState(false);

  async function flush() {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus('saving');
    try {
      await saveTask(classId, itemId, p.taskId, { ...p.patch, restricted: !!rawTasks.find((t) => t.id === p.taskId)?.restricted });
      setStatus(pending.current ? 'saving' : 'saved');
      // Keep a version at most every 3 minutes of editing.
      const last = lastVersion.current[p.taskId] ?? 0;
      if (Date.now() - last > 3 * 60 * 1000 && draftRef.current) {
        lastVersion.current[p.taskId] = Date.now();
        const d = draftRef.current;
        addVersion(classId, itemId, p.taskId, { title: d.title, instructions: d.instructions, content: d.content, by: user?.displayName || user?.email || '' }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  function change(patch: Partial<Draft>) {
    if (!task || !draft) return;
    setDraft({ ...draft, ...patch });
    pending.current = { taskId: task.id, patch: { ...(pending.current?.taskId === task.id ? pending.current.patch : {}), ...patch } };
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  }

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  });

  async function select(id: string) {
    await flush();
    setSelected(id);
    if (boardView) showBoard(false);
  }

  async function newTask() {
    await flush();
    const id = await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0);
    setSelected(id);
  }

  async function newSection() {
    await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0, 'section');
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Drop a task at a new position and renumber the order of every task.
  async function reorder(fromId: string, to: number) {
    // A task moves together with its versions; versions can't be dropped between other tasks' versions.
    const list = [...tasks];
    const from = list.findIndex((t) => t.id === fromId);
    if (from < 0) return;
    const block = familyOf(tasks, list[from]).filter((t) => list.includes(t));
    const start = list.indexOf(block[0]);
    list.splice(start, block.length);
    let at = to > start ? to - block.length : to;
    while (at > 0 && at < list.length && isVariant(list[at])) at++;
    list.splice(Math.max(0, at), 0, ...block);
    const mains = list.filter((t) => !isVariant(t) || !list.some((m) => m.id === t.family));
    const orderOf = (t: Task) => mains.indexOf(isVariant(t) ? mains.find((m) => m.id === t.family) ?? t : t);
    setTasks(list.map((t) => ({ ...t, order: orderOf(t) })));
    await Promise.all(list.map((t) => (t.order !== orderOf(t) ? setTaskFlags(classId, itemId, t.id, { order: orderOf(t) }) : null)));
  }

  async function remove(t: Task) {
    const fam = familyOf(tasks, t);
    if (isVariant(t)) {
      if (!window.confirm(`Delete version ${t.variant ?? ''} of “${t.title}”?`)) return;
      pending.current = null;
      await unlinkVariant(classId, itemId, tasks, t);
      await deleteTask(classId, itemId, t.id);
      return;
    }
    if (!window.confirm(fam.length > 1 ? `Delete the task “${t.title}” and its ${fam.length - 1} other ${fam.length === 2 ? 'version' : 'versions'}?` : `Delete the task “${t.title}”?`)) return;
    pending.current = null;
    for (const f of fam) await deleteTask(classId, itemId, f.id);
  }

  async function newVersion(label: string) {
    if (!task || !draft) return;
    await flush();
    const id = await makeVariant(classId, itemId, tasks, task, label, splitKey(draft.content).content);
    setSelected(id);
  }

  const previewKey = useMemo(() => (draft ? splitKey(draft.content) : null), [draft, previewChecked]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = theme(c?.themeColor);

  return (
    <ClassAvatarsContext.Provider value={classAvatars}>
    <div className="shell wide" style={{ ['--accent' as string]: th.accent, ['--accent-text' as string]: th.text }}>
      <TopBar>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">Classes</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/class/${classId}`}>{c?.name ?? 'Class'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{item?.title ?? '…'}</span>
        </nav>
        <div className="menu-anchor hide-phone" ref={exportRef}>
          <button type="button" className="btn small-btn" aria-expanded={exportOpen} aria-haspopup="menu" title="Worksheet, text file or full copy" onClick={() => setExportOpen((v) => !v)}>
            Export
          </button>
          {exportOpen && (
            <div className="menu" role="menu">
              {item?.type === 'lesson' && c && (
                <button role="menuitem" onClick={() => (setExportOpen(false), setRecapOpen(true))}>
                  Lesson recap…
                  <span className="hint" style={{ display: 'block' }}>
                    One page per learner to share after class
                  </span>
                </button>
              )}
              <button role="menuitem" onClick={() => (setExportOpen(false), setWorksheet(true))}>
                Worksheet…
                <span className="hint" style={{ display: 'block' }}>
                  Print, PDF or Word, with an answer key
                </span>
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  setExportOpen(false);
                  await flush();
                  const { title, text } = await lessonText(classId, itemId, window.confirm('Include your teacher notes in the file? Choose Cancel to leave them out, for example when sharing.'));
                  download(title, text);
                }}
              >
                Lesson text (.md)
                <span className="hint" style={{ display: 'block' }}>
                  Edit in any text editor and import again
                </span>
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  setExportOpen(false);
                  await flush();
                  downloadJson(item?.title ?? 'Lesson', await lessonBundle(classId, itemId));
                }}
              >
                Full copy (.lessonlit.json)
                <span className="hint" style={{ display: 'block' }}>
                  Everything, including board drawings and pictures
                </span>
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn small-btn" onClick={() => setNbOpen(true)} title="The class notebook: words and notes, grammar and vocabulary banks">
          Notebook
        </button>
        {!viewer && (
          <button type="button" className={'btn small-btn' + (boardView ? ' on-accent' : '')} onClick={() => showBoard(!boardView)} title="The lesson board: pages you can prepare and show in class">
            Board
          </button>
        )}
        {!viewer && (
          <button type="button" className={'btn small-btn' + (teachingHere && live?.groupSetId ? ' on-accent' : '')} onClick={() => setGroupsOpen(true)} title="Group sets and breakout rooms">
            Groups
          </button>
        )}
        <button type="button" className="btn small-btn hide-phone" onClick={() => setPresent((v) => !v)} title="Hide the side panels for screen sharing (P)">
          {present ? 'Exit present mode' : 'Present'}
        </button>
        <button type="button" className="btn small-btn icon-help hide-phone" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          ?
        </button>
        {viewer ? (
          teachingHere && <span className="hint">{live?.teacherName} is teaching</span>
        ) : (
          <button type="button" className={'btn small-btn teach-btn' + (teachingHere ? ' on' : '')} onClick={toggleTeaching} title={teachingHere && live?.teacherUid && live.teacherUid !== user?.uid ? `${live.teacherName} is teaching this lesson. Stopping ends it for them too.` : 'Shows learners which task you are on'}>
          {teachingHere && <span className="live-dot" aria-hidden="true" />}
          {teachingHere ? (live?.teacherUid && live.teacherUid !== user?.uid ? `${live.teacherName} teaching · stop` : 'Teaching · stop') : 'Start teaching'}
          </button>
        )}
        <TextSizeControl />
        <span className={'save-state ' + status}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved. Check your connection.' : 'Saved'}</span>
      </TopBar>

      {quizOpen && <TeacherQuiz classId={classId} itemId={itemId} tasks={tasks} taskId={selected} roster={classmates} online={inLesson.map((p) => p.learnerId)} activeSet={activeSet} onClose={() => setQuizOpen(false)} />}
      {user && (
        <NotebookDrawer open={nbOpen} onClose={() => (setNbOpen(false), setNbPrefill(null), setNbFocus(null))} classId={classId} c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} items={nbItems} topics={nbTopics} roster={classmates} prefill={nbPrefill} onPrefillDone={() => setNbPrefill(null)} focus={nbFocus} context={{ itemId, taskId: selected }} />
      )}
      {pollOpen && <PollDialog classId={classId} poll={live?.poll} onClose={() => setPollOpen(false)} />}
      {groupsOpen && (
        <GroupsDialog
          classId={classId}
          roster={classmates}
          sets={groupSets}
          activeId={teachingHere ? live?.groupSetId ?? null : null}
          onActivate={teachingHere ? (id) => setLive(classId, { groupSetId: id, syncRoom: null, roomTask: null }) : undefined}
          onClose={() => setGroupsOpen(false)}
        />
      )}
      <NoticeToasts classId={classId} to="teacher" link={(i, t) => `/class/${classId}/lesson/${i}?task=${t}`} />
      {item === null && <p className="placeholder">This lesson could not be found.</p>}

      {item && (
        <div className={'lesson-layout' + (present ? ' present' : '') + panels.cls}>
          <nav className="task-list" aria-label="Tasks">
            <input
              className="lesson-title"
              defaultValue={item.title}
              aria-label="Lesson title"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.title && updateItem(classId, itemId, { title: e.target.value.trim() })}
            />
            {tasks.map((t, i) => (
              <div
                key={t.id}
                className={'task-row' + (isVariant(t) ? ' variant-row' : '') + (t.id === selected ? ' on' : '') + (dragId === t.id ? ' dragging' : '') + (dropAt === i ? ' drop-before' : '') + (dropAt === tasks.length && i === tasks.length - 1 ? ' drop-after' : '')}
                draggable={!isVariant(t)}
                onDragStart={(e) => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', t.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dropAt !== null) reorder(dragId, dropAt);
                  setDragId(null);
                  setDropAt(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
              >
                <span className="drag-handle" aria-hidden="true" title="Drag to reorder">
                  {DOTS}
                </span>
                {t.kind === 'section' ? (
                  <span className="section-row">
                    <input
                      className="section-input"
                      defaultValue={t.title}
                      aria-label="Section name"
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.title && setTaskFlags(classId, itemId, t.id, { title: e.target.value.trim() })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <button type="button" className="icon-btn" aria-label="Delete section" onClick={() => deleteTask(classId, itemId, t.id)}>
                      ×
                    </button>
                  </span>
                ) : (
                <button type="button" className="task-pick" onClick={() => select(t.id)}>
                  {isVariant(t) ? (
                    <span className="n variant-n" aria-hidden="true">↳</span>
                  ) : (
                    <span className="n">{tasks.filter((x) => x.kind !== 'section' && !isVariant(x)).findIndex((x) => x.id === t.id) + 1}</span>
                  )}
                  {isVariant(t) ? (
                    <span className="variant-label">{t.variant && /^[A-Z]$/.test(t.variant) ? `Version ${t.variant}` : t.variant}</span>
                  ) : (
                    <span className={t.hidden ? 'hidden-title' : ''}>{t.id === selected && draft ? draft.title || 'Untitled task' : t.title || 'Untitled task'}</span>
                  )}
                  {!isVariant(t) && (t.variants?.length ?? 0) > 0 && <span className="variant-count" title={`${(t.variants?.length ?? 0) + 1} versions`}>{t.variant ?? 'A'}</span>}
                  {!isVariant(t) && t.audience && t.audience.mode !== 'all' && <span className="state-mark aud-mark" title="Only some learners see this">{PEOPLE}</span>}
                  {t.hidden && <span className="state-mark" title="Hidden from learners">{EYE_OFF}</span>}
                  {t.locked && <span className="state-mark" title="Locked">{LOCK}</span>}
                  {teachingHere && seeLearners && onTask(t.id) > 0 && (
                    <span className="on-task" title={`${onTask(t.id)} on this task`}>
                      {onTask(t.id)}
                    </span>
                  )}
                </button>
                )}
                {t.kind !== 'section' && (
                  <span className="row-actions">
                    <button type="button" className={'row-act' + (t.hidden ? ' on' : '')} title={t.hidden ? 'Show to learners' : 'Hide from learners'} aria-label={t.hidden ? 'Show to learners' : 'Hide from learners'} onClick={() => setTaskFlags(classId, itemId, t.id, { hidden: !t.hidden })}>
                      {t.hidden ? EYE_OFF : EYE}
                    </button>
                    <button type="button" className={'row-act' + (t.locked ? ' on' : '')} title={t.locked ? 'Unlock' : 'Lock · learners see it but can’t open it'} aria-label={t.locked ? 'Unlock' : 'Lock'} onClick={() => setTaskFlags(classId, itemId, t.id, { locked: !t.locked })}>
                      {t.locked ? LOCK : UNLOCK}
                    </button>
                    {!teachingHere && !isVariant(t) && (
                      <button type="button" className="row-act" title="Duplicate or copy to another lesson" aria-label="Copy task" onClick={() => setCopyTask(t)}>
                        {COPY}
                      </button>
                    )}
                    {!teachingHere && (
                      <button type="button" className="row-act" title="Delete task" aria-label="Delete task" onClick={() => remove(t)}>
                        {TRASH}
                      </button>
                    )}
                  </span>
                )}
              </div>
            ))}
            {!viewer && (
              <div className="list-adds">
                <button type="button" className="btn dashed" onClick={newTask}>
                  + New task
                </button>
                <button type="button" className="btn dashed" onClick={newSection}>
                  + Section
                </button>
              </div>
            )}
          </nav>

          <div className="center-col">
          <div className="panel-toggles">
            <PanelToggle side="left" open={panels.left} onClick={panels.toggleLeft} label="the task list" />
            <PanelToggle side="right" open={panels.right} onClick={panels.toggleRight} label={teachingHere ? 'the live answers' : 'the task settings'} />
          </div>
          {teachingHere && (
            <div className="session-strip" aria-label="Learners in this session">
              <span className="session-count">
                <span className="live-dot" aria-hidden="true" />
                {inLesson.length} of {c?.learnerCount ?? 0} in this lesson
              </span>
              <span className="session-people">
                {online.length === 0 && <span className="hint">No learners online yet. Share the class code {c?.classCode}.</span>}
                {online.map((p) => (
                  <span key={p.id} className={'person' + (p.itemId === itemId ? '' : ' elsewhere')} title={p.itemId === itemId ? !seeLearners ? `${p.name} · in this lesson` : `${p.name} · ${tasks.find((t) => t.id === p.taskId)?.title ?? 'in this lesson'}` : `${p.name} · online, not in this lesson`}>
                    <Avatar k={p.avatar} name={p.name} size={24} className="avatar-24" />
                    <span className="pname">{p.name.split(' ')[0]}</span>
                    {seeLearners && p.itemId === itemId && p.taskId !== selected && <span className="ptask">{tasks.findIndex((t) => t.id === p.taskId) + 1 || ''}</span>}
                  </span>
                ))}
              </span>
              <span className="live-ctl">
                <span className="tool-group" aria-label="Classroom tools">
                  <button type="button" className={'btn small-btn' + (pointerOn ? ' on-accent' : '')} onClick={togglePointer} title="A red dot everyone sees where you point">
                    Pointer
                  </button>
                  <span className="timer-ctl">
                    <button type="button" className={'btn small-btn' + (live?.timer && live.timer.endsAt > Date.now() ? ' on-accent' : '')} onClick={() => setTimerMenu((v) => !v)} title="Shortcut: T">
                      Timer
                    </button>
                    {timerMenu && (
                      <span className="timer-menu">
                        {[1, 2, 3, 5, 10].map((m) => (
                          <button key={m} type="button" onClick={() => startTimer(m * 60)}>
                            {m} min
                          </button>
                        ))}
                        <button type="button" onClick={() => startTimer(30)}>
                          30 s
                        </button>
                        {live?.timer && (
                          <button type="button" onClick={() => stopTimer()}>
                            Stop
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                  <button type="button" className="btn small-btn" onClick={pickLearner} disabled={!!picking} title="Choose a learner at random">
                    {picking || 'Pick a learner'}
                  </button>
                  <button type="button" className={'btn small-btn' + (live?.poll?.open ? ' on-accent' : '')} onClick={() => setPollOpen(true)} title="Ask the class a quick question">
                    Poll
                  </button>
                  <button type="button" className={'btn small-btn' + (live?.quiz ? ' on-accent' : '')} onClick={() => setQuizOpen(true)} title="Turn this task’s questions into a team race">
                    Team quiz
                  </button>
                  <button type="button" className={'btn small-btn' + (inkMode !== 'off' ? ' on-accent' : '')} onClick={() => setInkMode(inkMode === 'off' ? 'pen' : 'off')} title="Draw or highlight on the task while you present. Not saved. Shortcut: D">
                    Draw
                  </button>
                  <button type="button" className="btn small-btn" onClick={() => setAnnouncing(true)} title="Shortcut: A">
                    Announce
                  </button>
                </span>
                {hands.length > 0 && (
                  <span className="hands" title={hands.map((h) => h.name).join(', ')}>
                    <Icon name="wave" size="15" /> {hands.length} {hands.length === 1 ? 'hand' : 'hands'} up
                    <button type="button" className="btn link small" onClick={() => clearAllHands(classId, signalUids.filter((u) => signals[u]?.hand))}>
                      Lower all
                    </button>
                  </span>
                )}
                {stuckN > 0 && (
                  <span className="hands stuck" title={Object.values(signals).filter((x) => x.stuck).map((x) => x.name).join(', ')}>
                    <Icon name="question" size="15" /> {stuckN} stuck
                  </span>
                )}
                {present && (
                  <button type="button" className={'btn small-btn' + (showGrid ? ' on-accent' : '')} onClick={() => setShowGrid((v) => !v)}>
                    Live answers
                  </button>
                )}
                <button type="button" className={'btn small-btn' + (live?.sync ? ' on-accent' : '')} onClick={toggleSync} title="Shortcut: S">
                  {live?.sync ? `${live.syncRoom ? activeSet?.groups.find((g) => g.id === live.syncRoom)?.name ?? 'Room' : 'Class'} follows me · stop` : live?.syncRoom ? `Sync ${activeSet?.groups.find((g) => g.id === live.syncRoom)?.name ?? 'room'} to me` : 'Sync class to me'}
                </button>
                {activeSet && (
                  <select className="sync-who" value={live?.syncRoom ?? ''} aria-label="Who follows you" onChange={(e) => syncWho(e.target.value || null)}>
                    <option value="">Whole class</option>
                    {activeSet.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                {qCount > 0 && (
                  <span className="reveal-ctl" aria-label="Reveal answers">
                    <span className="hint">{revealN === 0 ? 'Answers hidden' : revealN < 0 || revealN >= qCount ? 'All answers shown' : `${revealN} of ${qCount} shown`}</span>
                    <button type="button" className="btn small-btn" disabled={revealN < 0 || revealN >= qCount} onClick={revealNext} title="Shortcut: R">
                      Reveal next
                    </button>
                    <button type="button" className="btn small-btn" disabled={revealN < 0} onClick={revealAll} title="Shortcut: Shift + R">
                      Reveal all
                    </button>
                    {(revealN !== 0 || singles.length > 0) && (
                      <button type="button" className="btn small-btn" onClick={hideAnswers} title="Shortcut: H">
                        Hide
                      </button>
                    )}
                  </span>
                )}
              </span>
            </div>
          )}
          <main className="task-frame" style={{ ['--ts' as string]: TEXT_SCALE[profile?.textSize ?? 'M'] }}>
            {boardView && !(teachingHere && !editWhileTeaching) && item && user ? (
              <div className="frame-inner">
                <div className="frame-head">
                  <h1 className="task-title">Lesson board</h1>
                  <p className="hint" style={{ margin: 0 }}>Prepare pages before class. When you teach, learners see the page you are on.</p>
                </div>
                <div className="frame-body">
                  <LessonBoard classId={classId} item={item} uid={user.uid} teacher page={boardPage} onPage={goBoardPage} />
                </div>
              </div>
            ) : !task || !draft ? (
              <div className="empty" style={{ padding: 28 }}>
                <h2>{tasks.length ? 'Loading…' : 'Add the first task'}</h2>
                {!tasks.length && <p>A lesson is a set of tasks. Each task is like a page: a short title, a bold instruction, then the text and questions.</p>}
                {!tasks.length && (
                  <button className="btn primary" onClick={newTask}>
                    + New task
                  </button>
                )}
              </div>
            ) : preview || (teachingHere && !editWhileTeaching) ? (
              <div className="frame-inner">
                <div className="frame-head">
                  <h1 className="task-title">{draft.title}</h1>
                  {draft.instructions && <p className="task-instr">{draft.instructions}</p>}
                  {!preview && (
                    <span className="seg small-seg board-tabs" role="tablist" aria-label="Task or board">
                      <button type="button" role="tab" aria-selected={!boardView} className={!boardView ? 'on' : ''} onClick={() => showBoard(false)}>
                        Task
                      </button>
                      <button type="button" role="tab" aria-selected={boardView} className={boardView ? 'on' : ''} onClick={() => showBoard(true)}>
                        Board
                      </button>
                    </span>
                  )}
                </div>
                {!preview && boardView && user && item && <div className="board-pane"><LessonBoard classId={classId} item={item} uid={user.uid} teacher page={boardPage} onPage={goBoardPage} people={inLesson.map((p) => ({ uid: p.id, name: p.name }))} /></div>}
                {!preview && <SpotlightCard spotlight={live?.spotlight} taskId={task.id} onClose={() => setLive(classId, { spotlight: null })} />}
                {!preview && <TimerChip timer={live?.timer} onStop={stopTimer} />}
                {!preview && <PickedBanner picked={live?.picked} />}
                {!preview && <ReactionBurst signals={signals} />}
                <div
                  ref={teachBodyRef}
                  hidden={!preview && boardView}
                  className={'frame-body' + (!preview ? ' teach-view' : '') + (pointerOn && !preview ? ' pointing' : '')}
                  onMouseMove={(e) => {
                    if (!pointerOn || preview || !task) return;
                    const el = (e.target as HTMLElement).closest('[data-bk]') as HTMLElement | null;
                    if (!el) return;
                    const r = el.getBoundingClientRect();
                    movePointer({ taskId: task.id, bk: el.dataset.bk!, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, on: true });
                  }}
                  onClick={(e) => {
                    if (preview || !task || inkMode !== 'off') return;
                    const q = (e.target as HTMLElement).closest('[data-qid]') as HTMLElement | null;
                    if (q?.dataset.qid) toggleSingle(q.dataset.qid);
                  }}
                >
                  {!preview && user && inkMode === 'off' && <SelectionNote container={teachBodyRef} c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} onAdd={toNotebook} />}
                  {!preview && <PresentInk container={teachBodyRef} mode={inkMode} color={inkColor} highlight={inkHl} clearKey={task.id + ':' + inkClear} />}
                  {!preview && <AnnotationLayer container={teachBodyRef} annotations={teacherAnns} classId={classId} taskId={task.id} canAnnotate={teachingHere && inkMode === 'off'} me={{ uid: user?.uid ?? '', name: (user?.displayName || 'Teacher').split(' ')[0], teacher: true }} />}
                  <TaskRenderer
                    content={previewKey?.content ?? null}
                    responses={previewResponses}
                    onChange={(id, v) => setPreviewResponses((r) => ({ ...r, [id]: v }))}
                    results={preview && previewChecked ? previewKey?.key : null}
                    hideAnswers={task.afterCheck === 'retry'}
                    disabled={!preview}
                    layout={task.layout ?? 'single'}
                    colScroll={task.colScroll ?? 'separate'}
                    teacher
                    revealed={!preview && previewKey ? revealedSubset(previewKey.key, questionIds(previewKey.content), revealN, singles) : null}
                    classmates={classmates}
                    classId={classId}
                    boardMe={!preview && user ? { classId, taskId: task.id, itemId, uid: user.uid, name: (user.displayName || user.email?.split('@')[0] || 'Teacher').split(' ')[0], teacher: true, people: classmates, penPeople: inLesson.map((p) => ({ uid: p.id, name: p.name })) } : undefined}
                    onOpenTask={(id) => select(id)}
                    onOpenNotebook={(id) => (setNbFocus(id), setNbOpen(true))}
                    shared={preview ? undefined : sharedPicks}
                    onSharedDraw={(pickId, next, seq) => drawShared(classId, task.id, pickId, next.h, next.b, seq, live?.teacherName || 'Teacher').catch((e) => console.error(e))}
                    onSharedReset={(pickId) => drawShared(classId, task.id, pickId, [], [], (sharedPicks[pickId]?.seq ?? 0) + 1, '').catch((e) => console.error(e))}
                  />
                </div>
                {!preview && <InkBar mode={inkMode} setMode={setInkMode} color={inkColor} setColor={setInkColor} highlight={inkHl} setHighlight={setInkHl} onClear={() => setInkClear((n) => n + 1)} />}
                <div className="frame-foot">
                  <span className="hint">{preview ? 'Preview · answers here are not saved' : 'Teaching · click a question to show its answer to the class'}</span>
                  <span className="foot-acts">
                    {!preview && (
                      <button className="btn" disabled={!prevTask} onClick={() => prevTask && select(prevTask.id)} title="Shortcut: ←">
                        Previous
                      </button>
                    )}
                    {!preview && (
                      <button className="btn" disabled={!nextTask} onClick={() => nextTask && select(nextTask.id)} title="Shortcut: →">
                        Next
                      </button>
                    )}
                    {!preview ? (
                      <button className="btn" onClick={() => setEditWhileTeaching(true)}>
                        Edit task
                      </button>
                    ) : questionIds(previewKey?.content ?? null).every((q) => q.type === 'reflect') ? null : previewChecked ? (
                      <button className="btn" onClick={() => setPreviewChecked(false)}>
                        Try again
                      </button>
                    ) : (
                      <button className="btn primary" onClick={() => setPreviewChecked(true)}>
                        Check answers
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="frame-inner">
                <div className="frame-head">
                  {teachingHere && (
                    <button type="button" className="btn small-btn done-edit" onClick={() => (flush(), setEditWhileTeaching(false))}>
                      Done editing
                    </button>
                  )}
                  <input className="task-title input" value={draft.title} placeholder="Task title" aria-label="Task title" onChange={(e) => change({ title: e.target.value })} />
                  <input
                    className="task-instr input"
                    value={draft.instructions}
                    placeholder="Instruction, for example: Complete the sentences."
                    aria-label="Instruction"
                    onChange={(e) => change({ instructions: e.target.value })}
                  />
                </div>
                <div className="frame-body">
                  <TaskEditor
                    key={editorKey}
                    content={draft.content}
                    onChange={(content) => change({ content })}
                    classmates={classmates}
                    classId={classId}
                    onNotebook={(word, sentence) => toNotebook({ type: 'vocab', word, example: sentence })}
                    places={tasks.filter((t) => t.kind !== 'section' && t.id !== task.id).map((t) => ({ id: t.id, title: t.title, n: tasks.filter((x) => x.kind !== 'section').findIndex((x) => x.id === t.id) + 1 }))}
                  />
                </div>
              </div>
            )}
          </main>
          </div>

          {task && draft && teachingHere && !editWhileTeaching && !preview && previewKey && (!present || showGrid) && (
            <LivePanel
              classId={classId}
              taskId={task.id}
              content={previewKey.content}
              answerKey={previewKey.key}
              presence={inLesson}
              showMarker={live?.showMarker !== false}
              onShowMarker={(v) => setLive(classId, { showMarker: v })}
              seeLearners={seeLearners}
              onSeeLearners={setSeeLearners}
              revealedIds={singles}
              onRevealQuestion={toggleSingle}
              signals={signals}
              codes={c?.codes ?? DEFAULT_CODES}
              annotations={teacherAnns}
              onSpotlight={(qid, text) => setLive(classId, { spotlight: { taskId: task.id, qid, text, at: Date.now() } })}
              tab={panelTab}
              onTab={setPanelTab}
              notes={notes}
              onNotes={changeNotes}
              rooms={activeSet?.groups}
              only={gridOnly}
              tagOf={tagOf}
            />
          )}
          {task && draft && viewer && (
            <aside className="task-side" aria-label="Viewing">
              <span className="eyebrow">Viewing</span>
              <span className="hint">You have view-only access to this class, so you see the lesson as learners do. Nothing here is saved.</span>
            </aside>
          )}
          {task && draft && !viewer && !(teachingHere && !editWhileTeaching && !preview) && (
            <aside className="task-side" aria-label="Task settings">
              <button className={'btn block' + (preview ? ' primary' : '')} onClick={() => (flush(), setPreview((p) => !p))}>
                {preview ? 'Back to editing' : 'Preview as learner'}
              </button>
              <TaskAudience classId={classId} itemId={itemId} task={task} tasks={tasks} sets={groupSets} roster={classmates} onMakeVersion={newVersion} onOpen={select} onOpenGroups={() => setGroupsOpen(true)} />
              {(() => {
                const hasCols = JSON.stringify(draft.content).includes('"columnBreak"');
                return (
                  <div className="field" style={{ gap: 6 }}>
                    <span>Columns</span>
                    {!hasCols ? (
                      <>
                        <button
                          type="button"
                          className="btn small-btn"
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() => {
                            const c = draft.content;
                            const n = Math.max(1, Math.floor((c.content?.length ?? 1) / 2));
                            const next = { ...c, content: [...(c.content ?? []).slice(0, n), { type: 'columnBreak' }, ...(c.content ?? []).slice(n)] };
                            change({ content: next });
                            setEditorKey(task.id + ':' + Date.now());
                          }}
                        >
                          Split into two columns
                        </button>
                        <span className="hint">Or type / and choose “Next column” where the second column should start.</span>
                      </>
                    ) : (
                      <>
                        <span className="seg" role="radiogroup" aria-label="Column widths">
                          {([
                            ['two', 'Equal'],
                            ['two-wide', 'Wide left'],
                            ['media', 'Media + questions'],
                          ] as const).map(([k, label]) => (
                            <button key={k} type="button" role="radio" aria-checked={(task.layout === 'two-wide' || task.layout === 'media' ? task.layout : 'two') === k} className={(task.layout === 'two-wide' || task.layout === 'media' ? task.layout : 'two') === k ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { layout: k })}>
                              {label}
                            </button>
                          ))}
                        </span>
                        <span className="seg" role="radiogroup" aria-label="Scrolling">
                          {([
                            ['separate', 'Scroll separately'],
                            ['together', 'Scroll together'],
                          ] as const).map(([k, label]) => (
                            <button key={k} type="button" role="radio" aria-checked={(task.colScroll ?? 'separate') === k} className={(task.colScroll ?? 'separate') === k ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { colScroll: k })}>
                              {label}
                            </button>
                          ))}
                        </span>
                        <span className="hint">Remove the “Next column” line in the text to go back to one column.</span>
                      </>
                    )}
                  </div>
                );
              })()}
              <div className="field" style={{ gap: 6 }}>
                <span>After checking</span>
                <span className="seg" role="radiogroup" aria-label="After checking">
                  <button type="button" role="radio" aria-checked={task.afterCheck !== 'retry'} className={task.afterCheck !== 'retry' ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { afterCheck: 'reveal' })}>
                    Show answers
                  </button>
                  <button type="button" role="radio" aria-checked={task.afterCheck === 'retry'} className={task.afterCheck === 'retry' ? 'on' : ''} onClick={() => setTaskFlags(classId, itemId, task.id, { afterCheck: 'retry' })}>
                    Try again
                  </button>
                </span>
                <span className="hint">
                  {task.afterCheck === 'retry' ? 'Learners only see which answers are right or wrong, then try the wrong ones again.' : 'Learners see the correct answers after they check.'}
                </span>
              </div>
              <label className="switch-row">
                <span>
                  Show the score after checking
                  <span className="hint">Learners see how many they got right</span>
                </span>
                <input type="checkbox" checked={task.showScore !== false} onChange={() => setTaskFlags(classId, itemId, task.id, { showScore: task.showScore === false })} />
              </label>
              {item && <ExamSettings classId={classId} item={item} task={task} />}
              <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => (flush(), setVersionsOpen(true))}>
                Version history
              </button>
              <div className="field" style={{ gap: 6 }}>
                <span>Teacher notes</span>
                <textarea className="notes-input" value={notes} placeholder="Timing, instructions, answers to check… Only you can see these." onChange={(e) => changeNotes(e.target.value)} />
              </div>
              <h2>Tips</h2>
              <p className="hint" style={{ margin: 0 }}>
                Type <strong>/</strong> in the text for a gap or a multiple-choice question. In a gap, separate other accepted answers with |, for example
                “have been | ’ve been”. Capitals, curly apostrophes and a final full stop are ignored when checking.
              </p>
            </aside>
          )}
        </div>
      )}
      {versionsOpen && task && draft && (
        <VersionsDialog
          classId={classId}
          itemId={itemId}
          taskId={task.id}
          onClose={() => setVersionsOpen(false)}
          onRestore={async (v) => {
            await addVersion(classId, itemId, task.id, { title: draft.title, instructions: draft.instructions, content: draft.content, by: (user?.displayName || '') + ' (before restoring)' }).catch(() => {});
            setDraft({ title: v.title, instructions: v.instructions, content: v.content });
            setEditorKey(task.id + ':' + Date.now());
            pending.current = { taskId: task.id, patch: { title: v.title, instructions: v.instructions, content: v.content } };
            await flush();
            setVersionsOpen(false);
          }}
        />
      )}
      {copyTask && <CopyDialog kind="task" fromClass={classId} itemId={itemId} taskId={copyTask.id} title={copyTask.title || 'Untitled task'} onClose={() => setCopyTask(null)} onDone={setCopyMsg} />}
      {copyMsg && (
        <div className="toasts">
          <div className="toast">
            <span className="toast-body">
              {copyMsg}
              <span className="toast-actions">
                <button type="button" className="btn small-btn" onClick={() => setCopyMsg('')}>
                  OK
                </button>
              </span>
            </span>
          </div>
        </div>
      )}
      {announcing && <AnnounceDialog classId={classId} roster={classmates} onClose={() => setAnnouncing(false)} />}
      {worksheet && <WorksheetDialog classId={classId} itemId={itemId} onClose={() => setWorksheet(false)} />}
      {recapOpen && c && item && <RecapDialog c={c} item={item} items={nbItems} onClose={() => setRecapOpen(false)} />}
      {help && (
        <div className="scrim" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setHelp(false)}>
          <div className="dialog shortcuts" onClick={(e) => e.stopPropagation()}>
            <h2>Keyboard shortcuts</h2>
            <p className="hint" style={{ margin: 0 }}>While teaching. They don’t work while you are typing.</p>
            <dl>
              {[
                ['← →', 'Previous or next task (moves the class when synced)'],
                ['S', 'Sync the class to you, or stop'],
                ['D', 'Draw or highlight on the screen (not saved)'],
                ['R', 'Reveal the next answer (again at the end to hide)'],
                ['Shift + R', 'Reveal all answers, or hide them'],
                ['H', 'Hide or show this task'],
                ['L', 'Lock or unlock this task'],
                ['C', 'Show or hide the class panel'],
                ['N', 'Teacher notes'],
                ['P', 'Present mode'],
                ['T', 'Start a 2-minute timer, or stop it'],
                ['A', 'New announcement'],
                ['Esc', 'Leave present mode, close this'],
                ['⌘ + K', 'Editor: link the selected words'],
                ['Alt + ↑ ↓', 'Editor: move the block up or down'],
                ['⌘ + Shift + P', 'Preview as learner'],
                ['?', 'Show these shortcuts'],
              ].map(([k, d]) => (
                <div key={k} className="sc-row">
                  <dt>
                    {k.split(' ').map((x, i) => (x === '+' ? <span key={i}> + </span> : <kbd key={i}>{x}</kbd>))}
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
            <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
    </ClassAvatarsContext.Provider>
  );
}

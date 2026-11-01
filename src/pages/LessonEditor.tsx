import { MaterialImport, ImportMaterialsButton, TaskStartChoice } from '../materials/MaterialImport';
import { useAiPilot } from '../ai/pilot';
import { lessonStyleOf } from '../lib/lessonStyle';
import '../lessons/youngLesson.css';
import { NSelect } from '../components/Select';
import { VoiceDiversityPrompt } from '../components/VoiceDiversityPrompt';
import { TeacherLiveVideo } from '../components/LiveVideo';
import { setActivity } from '../lib/status';
import { tr, useClassTerms } from '../lib/terms';
import { LIVE_BEAT } from '../lib/live';
import { ask, askText, tell } from '../lib/ask';
import { addToLesson, breakLink, lessonTaskBody, saveToLibrary, updateLibTask } from '../lib/libtasks';
import { LibraryPicker } from '../components/LibraryPicker';
import { usePhone } from '../lib/useMedia';
import { PresenterNotes, usePresenterNotes } from '../components/PresenterNotes';
import { InstrEditor, InstrView } from '../editor/InstrEditor';
import { Loader } from '../components/Loader';
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
  loadNoteDoc,
  saveNotes,
  addVersion,
  type AnswerKey,
  type Responses,
  type Task,
} from '../lib/tasks';
import { theme } from '../lib/themes';
import { useLiveAudioSetup } from '../lib/liveAudio';
import { isLive, liveRef, revealedCount, revealedSingles, revealedSubset, setLive, type LiveState } from '../lib/live';
import { TEXT_SCALE } from '../lib/auth';
import { TextSizeControl } from '../components/TextSizeControl';
import { NoticeToasts } from '../components/NoticeToasts';
import { PickedBanner, SpotlightCard, TimerChip, TimerMenu } from '../components/LiveExtras';
import { ReactionBurst } from '../components/ReactionBurst';
import { AnnounceDialog } from '../components/AnnounceDialog';
import { claimClass, clearAllHands, useSignals } from '../lib/session';
import { Icon } from '../editor/Icons';
import { DEFAULT_CODES, useAnnotations } from '../lib/annotations';
import { AnnotationLayer } from '../components/AnnotationLayer';
import { CopyDialog } from '../components/CopyDialog';
import { ImportTasksDialog } from '../components/ImportTasksDialog';
import { VersionsDialog } from '../components/VersionsDialog';
import { download, lessonText } from '../lib/transfer';
import { downloadJson, lessonBundle } from '../lib/fullcopy';
import { roleIn } from '../lib/coteach';
import { WorksheetDialog } from '../components/WorksheetDialog';
import { RecapDialog } from '../components/Recap';
import { IconBtn, UiIcon } from '../components/UiIcon';
import { NotesEditor, NotesView } from '../editor/NotesEditor';
import { ModeMenu, type Mode } from '../components/ModeMenu';
import { PaneResizer, usePaneWidths } from '../components/PaneResizer';
import { ViewAsLearner } from '../components/ViewAsLearner';
import { BankPicker, SaveToBankDialog } from '../components/QuestionBank';
import { withFreshIds } from '../lib/bank';
import { Avatar } from '../components/avatars';
import { ClassAvatarsContext, useLearnerAvatars } from '../lib/avatars';
import { PanelToggle, usePanels } from '../components/PanelToggles';
import { useAuth } from '../lib/auth';
import { isOnline, usePresence } from '../lib/presence';
import { TopBar } from '../components/TopBar';
import { TaskEditor } from '../editor/TaskEditor';
import { DOTS } from '../editor/nodes';
import { TaskRenderer } from '../components/TaskRenderer';
import { PaperBar, SheetView, type Zoom } from '../lessons/SheetView';
import { useSheet } from '../lessons/useSheet';
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
// The class notebook is switched off for now; its parts stay for later.
const NOTEBOOK = false as boolean;
import type { Prefill } from '../components/Notebook';
import { collection } from 'firebase/firestore';
import type { Topic } from '../lib/classes';
import { examScope, useRuns } from '../lib/exam';
import { type InkMode } from '../components/PresentInk';
import { openShortcuts } from '../components/Shortcuts';

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

type Draft = { title: string; instructions: string; instrDoc?: JSONContent | null; content: JSONContent };

export function LessonEditor() {
  const { classId = '', itemId = '' } = useParams();
  useClassTerms(classId);
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
  const [previewResponses, setPreviewResponses] = useState<Responses>({});
  const [previewChecked, setPreviewChecked] = useState(false);
  const [editWhileTeaching, setEditWhileTeaching] = useState(false);
  const { user, profile } = useAuth();
  const viewer = roleIn(c, user?.uid) === 'viewer'; // read-only access (observer or substitute)
  const phone = usePhone(); // on a phone, lessons are taught and looked at, not built
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
        if (r >= 0) parts.push(tr(`Learner ${ROLE_NAMES[r]}`));
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
  // The shortcuts panel (? or Ctrl+/) opens on the teaching keys while teaching.
  useEffect(() => {
    document.documentElement.dataset.keys = teachingHere ? 'teaching' : 'writing';
    return () => void delete document.documentElement.dataset.keys;
  }, [teachingHere]);
  // Colleagues see that this teacher is in class while the lesson is live.
  useEffect(() => {
    if (!teachingHere || !c?.name) return;
    setActivity({ cls: c.name });
    return () => setActivity({ cls: null });
  }, [teachingHere, c?.name]);
  const [fold, setFoldS] = useState<string>(() => {
    try {
      return localStorage.getItem('ll.taskFold') ?? 'who';
    } catch {
      return 'who';
    }
  });
  const setFold = (v: string) => {
    setFoldS(v);
    try {
      localStorage.setItem('ll.taskFold', v);
    } catch {
      /* fine */
    }
  };
  useLiveAudioSetup(classId, teachingHere, true);
  // While this screen teaches, it checks in every minute, so the lesson stays live for the class.
  const mineLive = teachingHere && (!live?.teacherUid || live.teacherUid === user?.uid);
  useEffect(() => {
    if (!mineLive) return;
    const beat = () => void setLive(classId, {}).catch(() => {});
    const id = window.setInterval(beat, LIVE_BEAT);
    document.addEventListener('visibilitychange', beat);
    return () => (window.clearInterval(id), document.removeEventListener('visibilitychange', beat));
  }, [mineLive, classId]);
  const presence = usePresence(classId, teachingHere);
  const online = presence.filter(isOnline).sort((a, b) => a.name.localeCompare(b.name));
  const inLesson = online.filter((p) => p.itemId === itemId);
  const onTask = (taskId: string) => inLesson.filter((p) => p.taskId === taskId).length;
  // Class settings → While teaching.
  const seeLearners = c?.teaching?.seeLearners !== false;
  const showMarkerSetting = c?.teaching?.showMarker !== false;
  useEffect(() => {
    if (teachingHere && (live?.showMarker !== false) !== showMarkerSetting) setLive(classId, { showMarker: showMarkerSetting }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachingHere, showMarkerSetting]);

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
    if (params.get('teach') === '1' && selected && live !== undefined && item !== undefined) {
      setParams({}, { replace: true });
      if (!teachingHere && item?.type === 'lesson') toggleTeaching();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, item]);

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
  const [timerMenu, setTimerMenu] = useState(false);
  const [picking, setPicking] = useState('');
  const [announcing, setAnnouncing] = useState(false);
  const signals = useSignals(teachingHere ? classId : '');
  const signalUids = Object.keys(signals);
  const hands = Object.values(signals).filter((x) => x.hand).sort((a, b) => (a.handAt ?? 0) - (b.handAt ?? 0));
  const stuckN = Object.values(signals).filter((x) => x.stuck).length;
  useEffect(() => {
    if (user && c && c.teacherId === user.uid) claimClass(classId, user.uid); // boards can be prepared before class
  }, [user, c?.teacherId, classId]);
  // Editing during a live lesson puts the pen and the tools away.
  useEffect(() => {
    if (!editWhileTeaching) return;
    setInkMode('off');
    setTimerMenu(false);
    setActivityOpen(false);
  }, [editWhileTeaching]); // eslint-disable-line react-hooks/exhaustive-deps
  const startTimer = (secs: number) => {
    setTimerMenu(false);
    setLive(classId, { timer: { endsAt: Date.now() + secs * 1000, total: secs } });
  };
  const startCountUp = () => {
    setTimerMenu(false);
    setLive(classId, { timer: { endsAt: 0, total: 0, up: true, startedAt: Date.now() } });
  };
  const stopTimer = () => (setTimerMenu(false), setLive(classId, { timer: null }));
  const addTime = (secs: number) => live?.timer && setLive(classId, { timer: { endsAt: Math.max(Date.now(), live.timer.endsAt) + secs * 1000, total: live.timer.total + secs } });
  const timerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!timerMenu) return;
    const close = (e: MouseEvent) => timerRef.current && !timerRef.current.contains(e.target as Node) && setTimerMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setTimerMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [timerMenu]);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [worksheet, setWorksheet] = useState(false);
  // Worksheet view: how big the page is shown, and how much of the screen it takes (remembered here).
  const [sheetZoom, setSheetZoomState] = useState<Zoom>(() => {
    try {
      return localStorage.getItem('ll.sheetZoom') === 'page' ? 'page' : 'width';
    } catch {
      return 'width';
    }
  });
  const setSheetZoom = (z: Zoom) => {
    setSheetZoomState(z);
    try {
      localStorage.setItem('ll.sheetZoom', z);
    } catch {
      /* fine */
    }
  };
  const [sheetW, setSheetWState] = useState(() => {
    try {
      return Number(localStorage.getItem('ll.sheetW')) || 45;
    } catch {
      return 45;
    }
  });
  const setSheetW = (w: number) => {
    setSheetWState(w);
    try {
      localStorage.setItem('ll.sheetW', String(w));
    } catch {
      /* fine */
    }
  };
  // Worksheet view: the lesson as A4 pages, remembered on this device.
  const [sheet, setSheetState] = useState(() => {
    try {
      return localStorage.getItem('ll.sheetView') === '1';
    } catch {
      return false;
    }
  });
  const setSheet = (on: boolean) => {
    setSheetState(on);
    // Room for the page and the editor side by side: the task settings fold away (one click brings them back).
    if (on && panels.right) panels.toggleRight();
    try {
      localStorage.setItem('ll.sheetView', on ? '1' : '');
    } catch {
      /* fine */
    }
  };
  const [recapOpen, setRecapOpen] = useState(false);
  const [bankSave, setBankSave] = useState<{ kind: 'question' | 'task'; content: JSONContent[]; title?: string; instructions?: string } | null>(null);
  const [bankPick, setBankPick] = useState<((nodes: JSONContent[]) => void) | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: MouseEvent) => exportRef.current && !exportRef.current.contains(e.target as Node) && setExportOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setExportOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [exportOpen]);
  const [copyTask, setCopyTask] = useState<Task | null>(null);
  const [copyMsg, setCopyMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const aiPilot=useAiPilot();
  const [materialImport,setMaterialImport]=useState(false);
  const [taskStart,setTaskStart]=useState(false);
  const [fromLib, setFromLib] = useState(false);
  const panels = usePanels('ll.teacherPanels');
  const panes = usePaneWidths();
  const [present, setPresent] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const presentRef = useRef(present);
  presentRef.current = present;
  useEffect(() => {
    const on = () => {
      setFullscreen(!!document.fullscreenElement);
      // leaving full screen (Esc) leaves the full-screen teaching view too
      if (!document.fullscreenElement && presentRef.current) setPresent(false);
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    if (!present && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [present]);
  const [activityOpen, setActivityOpen] = useState(false);
  const activityRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!activityOpen) return;
    const close = (e: MouseEvent) => activityRef.current && !activityRef.current.contains(e.target as Node) && setActivityOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setActivityOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [activityOpen]);
  const [showGrid, setShowGrid] = useState(false);
  // Teacher notes for the selected task (only the teacher can read them).
  const [notes, setNotes] = useState('');
  const [notesDoc, setNotesDoc] = useState<JSONContent | null>(null);
  const [notesFor, setNotesFor] = useState('');
  const [notesEditing, setNotesEditing] = useState(false);
  const notesPane = usePresenterNotes();
  const notesTimer = useRef<number>();
  // A note typed just before moving to another task (or leaving) is saved then, not dropped.
  const notesPending = useRef<(() => void) | null>(null);
  const flushNotes = () => {
    window.clearTimeout(notesTimer.current);
    const f = notesPending.current;
    notesPending.current = null;
    f?.();
  };
  useEffect(() => () => flushNotes(), [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setNotes('');
    setNotesDoc(null);
    setNotesFor('');
    setNotesEditing(false);
    const id = task?.id;
    if (id)
      loadNoteDoc(classId, itemId, id)
        .then((n) => (setNotes(n.text), setNotesDoc(n.doc), setNotesFor(id)))
        .catch(() => setNotesFor(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  const changeNotes = (doc: JSONContent, text: string) => {
    setNotes(text);
    setNotesDoc(doc);
    window.clearTimeout(notesTimer.current);
    const id = task?.id;
    notesPending.current = id ? () => void saveNotes(classId, itemId, id, text, doc).catch(() => {}) : null;
    notesTimer.current = window.setTimeout(flushNotes, 700);
  };
  const notesEditor = (cls: string, placeholder: string) =>
    task && notesFor === task.id ? <NotesEditor key={task.id} className={cls} doc={notesDoc} text={notes} onChange={changeNotes} placeholder={placeholder} /> : <span className="hint">Loading…</span>;
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
      // ? opens the app's shortcuts panel (components/Shortcuts), on the teaching keys here.
      if (e.key === '?') return;
      if (e.key === 'Escape') return (present && changeMode('teach'), setInkMode('off'));
      if (!teachingHere) return;
      if ((e.key === 'f' || e.key === 'F') && !editWhileTeaching) return (e.preventDefault(), changeMode(present ? 'teach' : 'present'));
      const list = tasks.filter((x) => x.kind !== 'section');
      const i = list.findIndex((x) => x.id === selected);
      if (e.key === 'ArrowRight' && i < list.length - 1) select(list[i + 1].id);
      else if (e.key === 'ArrowLeft' && i > 0) select(list[i - 1].id);
      else if (e.key === 's' || e.key === 'S') toggleSync();
      else if (e.key === 'R') (revealN < 0 ? hideAnswers() : revealAll());
      else if (e.key === 'r') (revealN < 0 || revealN >= qCount ? hideAnswers() : revealNext());
      else if ((e.key === 'h' || e.key === 'H') && task) setTaskFlags(classId, itemId, task.id, { hidden: !task.hidden });
      else if (e.key === 'c' || e.key === 'C') panels.toggleRight();
      else if ((e.key === 'l' || e.key === 'L') && task) setTaskFlags(classId, itemId, task.id, { locked: !task.locked });
      else if (e.key === 't' || e.key === 'T') (live?.timer && (live.timer.up || live.timer.endsAt > Date.now()) ? stopTimer() : setTimerMenu(true));
      else if (e.key === 'a' || e.key === 'A') setAnnouncing(true);
      else if (e.key === 'n' || e.key === 'N') notesPane.toggle();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The mode menu at the top right.
  // A phone shows the learner view instead of the editor.
  useEffect(() => {
    if (phone && !preview && !(teachingHere && !editWhileTeaching)) (setEditWhileTeaching(false), setPreview(true));
  }, [phone, preview, teachingHere, editWhileTeaching]);
  const mode: Mode = preview ? 'preview' : teachingHere && !editWhileTeaching ? (present ? 'present' : 'teach') : 'edit';
  async function startTeaching() {
    if (!teachingHere && item?.type === 'lesson') await toggleTeaching();
  }
  async function endTeaching() {
    setPresent(false);
    if (teachingHere) await toggleTeaching();
  }
  async function changeMode(m: Mode) {
    // Full screen while teaching fills the whole screen, like F11. It must be asked for straight away, inside the click.
    if (m === 'present' && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    await flush();
    if (m === 'edit') {
      setPreview(false);
      setPresent(false);
      if (teachingHere) setEditWhileTeaching(true); // keep the class live while you fix something
    } else if (m === 'preview') {
      setPresent(false);
      setPreview(true);
    } else {
      await startTeaching();
      setPreview(false);
      setEditWhileTeaching(false);
      setPresent(m === 'present');
    }
  }
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
        teacherName: (user?.displayName || user?.email?.split('@')[0] || tr('Your teacher')).split(' ')[0],
        teacherUid: user?.uid ?? '',
      });
  }

  // Load the selected task (with its answer key) into the editor once per selection.
  const [taskErr, setTaskErr] = useState('');
  const [taskTry, setTaskTry] = useState(0);
  // The task being opened: the editor shows a loading veil until its content is in.
  const [opening, setOpening] = useState('');
  useEffect(() => {
    setTaskErr('');
    if (!task) {
      setDraft(null);
      return;
    }
    if (task.restricted && task.content === null) return setDraft(null);
    let cancelled = false;
    if (draftRef.current) setOpening(task.id);
    loadKey(classId, itemId, task.id).then((key: AnswerKey) => {
      if (cancelled) return;
      setOpening('');
      const content = mergeKey(task.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }, key);
      setDraft({ title: task.title, instructions: task.instructions ?? '', instrDoc: task.instrDoc ?? null, content });
      setEditorKey(task.id + ':' + Date.now());
      setPreview(false);
      setPreviewResponses({});
      setPreviewChecked(false);
    }, (e) => {
      console.error(e);
      if (!cancelled) setOpening('');
      if (!cancelled) setTaskErr((e as { code?: string }).code === 'permission-denied' ? tr('We couldn’t open this task. If a “view as a learner” tab is open, close it and try again.') : 'We couldn’t open this task. Check your connection and try again.');
    });
    return () => {
      cancelled = true;
    };
    // Only when the selection changes, not on every remote update of the same task.
    // (A task whose content is kept apart waits until that content has arrived.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, !!task && (!task.restricted || task.content !== null), taskTry]);

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
      const saved = rawTasks.find((t) => t.id === p.taskId);
      await saveTask(classId, itemId, p.taskId, { ...p.patch, restricted: !!saved?.restricted });
      // A task linked to the library: the library and the other lessons that use it follow.
      if (saved?.lib && user && saved.lib.uid === user.uid && draftRef.current) {
        const d = draftRef.current;
        updateLibTask(user.uid, saved.lib.id, { title: d.title, instructions: d.instructions, instrDoc: d.instrDoc ?? null, content: d.content }, { classId, itemId, taskId: p.taskId }).catch(() => {});
      }
      setStatus(pending.current ? 'saving' : 'saved');
      // Keep a version at most every 3 minutes of editing.
      const last = lastVersion.current[p.taskId] ?? 0;
      if (Date.now() - last > 3 * 60 * 1000 && draftRef.current) {
        lastVersion.current[p.taskId] = Date.now();
        const d = draftRef.current;
        addVersion(classId, itemId, p.taskId, { title: d.title, instructions: d.instructions, instrDoc: d.instrDoc ?? null, content: d.content, by: user?.displayName || user?.email || '' }).catch(() => {});
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
    if(aiPilot){await flush();setTaskStart(true);return;}
    await newBlankTask();
  }
  async function newBlankTask() {
    await flush();
    const id = await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0);
    setSelected(id);
  }

  async function newTaskFrom(init: { title: string; instructions: string; content: JSONContent }) {
    await flush();
    const id = await addTask(classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0, 'task', init);
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
      if (!(await ask(`Delete version ${t.variant ?? ''} of “${t.title}”?`))) return;
      pending.current = null;
      await unlinkVariant(classId, itemId, tasks, t);
      await deleteTask(classId, itemId, t.id);
      return;
    }
    if (!(await ask(fam.length > 1 ? `Delete the task “${t.title}” and its ${fam.length - 1} other ${fam.length === 2 ? 'version' : 'versions'}?` : `Delete the task “${t.title}”?`))) return;
    pending.current = null;
    for (const f of fam) await deleteTask(classId, itemId, f.id);
  }

  async function newVersion(label: string) {
    if (!task || !draft) return;
    // Each version has a name the teacher chooses (Version B, Group 1, Fast finishers…), shown on top of the task.
    const levelNames = ['Easier', 'Standard', 'Challenge'];
    const asName = (l: string) => (/^[A-Z]$/.test(l) ? `Version ${l}` : l);
    let firstName = '';
    if (fam.length === 1 && !levelNames.includes(label)) {
      const first = await askText('Name the version you have now', vLabel(task), { ok: 'Next' });
      if (first === null) return;
      if (first.trim() && first.trim() !== vLabel(task)) firstName = first.trim();
    }
    if (!levelNames.includes(label)) {
      const name = await askText('Name the new version', asName(label), { ok: 'Make it' });
      if (name === null) return;
      if (name.trim()) label = name.trim();
    }
    await flush();
    const id = await makeVariant(classId, itemId, tasks, task, label, splitKey(draft.content).content);
    if (firstName) await setTaskFlags(classId, itemId, task.id, { variant: firstName });
    setSelected(id);
  }

  const previewKey = useMemo(() => (draft ? splitKey(draft.content) : null), [draft, previewChecked]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = theme(c?.themeColor);
  // The worksheet view's printed pieces, from the saved tasks.
  // The worksheet on the left follows the task being edited as you type (a moment after each change).
  const [live1, setLive1] = useState<{ key: string; d: Draft } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setLive1(draft ? { key: editorKey, d: draft } : null), 250);
    return () => window.clearTimeout(t);
  }, [draft, editorKey]);
  const liveId = task && editorKey.startsWith(task.id + ':') ? task.id : '';
  const liveDraft = live1 && live1.key === editorKey ? live1.d : null;
  // Each task's answers, so a gap that fits its answer is as long on the page as it prints.
  const [sheetKeys, setSheetKeys] = useState<Record<string, AnswerKey>>({});
  const sheetOn = sheet && mode === 'edit';
  useEffect(() => {
    if (!sheetOn) return;
    for (const t of tasks) if (t.kind !== 'section' && t.content && !(t.id in sheetKeys)) loadKey(classId, itemId, t.id).then((k) => setSheetKeys((m) => ({ ...m, [t.id]: k })), () => setSheetKeys((m) => ({ ...m, [t.id]: {} as AnswerKey })));
  }, [sheetOn, tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  // A task's answers may have changed while it was open: read them again when you move on.
  const lastOpen = useRef('');
  useEffect(() => {
    const prev = lastOpen.current;
    lastOpen.current = task?.id ?? '';
    if (prev && prev !== task?.id) setSheetKeys((m) => {
      const n = { ...m };
      delete n[prev];
      return n;
    });
  }, [task?.id]);
  // The editor beside the worksheet: closed by clicking the paper around the tasks, open again
  // by clicking a task (here or in the list).
  const [sheetEdit, setSheetEdit] = useState(true);
  useEffect(() => setSheetEdit(true), [task?.id]);
  const sheetTasks = useMemo(
    () =>
      tasks
        .filter((t) => !isVariant(t))
        .map((t) => (t.id === liveId && liveDraft ? { ...t, title: liveDraft.title, instructions: liveDraft.instructions, instrDoc: liveDraft.instrDoc, content: liveDraft.content } : t.content && sheetKeys[t.id] ? { ...t, content: mergeKey(t.content, sheetKeys[t.id]) } : t)),
    [tasks, liveId, liveDraft, sheetKeys], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sheetData = useSheet(item?.title ?? '', sheetTasks, { classId, accent: th.accent, className: c?.name, level: c?.level, cover: c?.cover, lessonStyle: lessonStyleOf(c) }, sheet && mode === 'edit');

  // The task being edited, in the digital view or on its worksheet page.
  const editFrame = task && draft ? (
              <div className="frame-inner">
                <div className="frame-head">
                  {teachingHere && (
                    <button type="button" className="btn small-btn done-edit" onClick={() => (flush(), setEditWhileTeaching(false))}>
                      Done editing
                    </button>
                  )}
                  {fam.length > 1 && <span className="ver-badge"><i aria-hidden="true" />{vLabel(task)}</span>}
                  {user && <LibLink task={task} uid={user.uid} classId={classId} itemId={itemId} flush={flush} />}
                  <input className="task-title input" value={draft.title} placeholder="Task title" aria-label="Task title" onChange={(e) => change({ title: e.target.value })} />
                  <InstrEditor classId={classId} lessonId={itemId} key={editorKey} doc={draft.instrDoc} text={draft.instructions} onChange={(instrDoc, instructions) => change({ instrDoc, instructions })} />
                </div>
                <div className="frame-body">
                  <VoiceDiversityPrompt key={itemId} />
                  <TaskEditor
                    key={editorKey}
                    compact
                    content={draft.content}
                    onChange={(content) => change({ content })}
                    classmates={classmates}
                    classId={classId}
                    lessonId={itemId}
                    taskContext={draft.instructions}
                    taskTitle={draft.title}
                    onNotebook={NOTEBOOK ? (word, sentence) => toNotebook({ type: 'vocab', word, example: sentence }) : undefined}
                    onBank={(nodes) => nodes.length && setBankSave({ kind: 'question', content: nodes })}
                    onPickBank={(insert) => setBankPick(() => insert)}
                    places={tasks.filter((t) => t.kind !== 'section' && t.id !== task.id).map((t) => ({ id: t.id, title: t.title, n: tasks.filter((x) => x.kind !== 'section').findIndex((x) => x.id === t.id) + 1 }))}
                  />
                </div>
              </div>
  ) : null;
  return (
    <ClassAvatarsContext.Provider value={classAvatars}>
    <div className="shell wide" style={{ ['--accent' as string]: th.accent, ['--accent-text' as string]: th.text }}>
      <TopBar>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/classes">Classes</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/class/${classId}`}>{c?.name ?? 'Class'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{item?.title ?? '…'}</span>
        </nav>
        <span className="icon-row tb-icons">
        {c && !viewer && <TeacherLiveVideo c={c} live={live} teachingHere={teachingHere} groupSets={groupSets} itemId={itemId} />}
        {NOTEBOOK && <IconBtn icon="notebook" label="Class notebook" active={nbOpen} onClick={() => setNbOpen(true)} />}
        <div className="menu-anchor" ref={exportRef}>
          <IconBtn icon="more" label="More: groups, export, shortcuts" aria-expanded={exportOpen} aria-haspopup="menu" active={exportOpen} onClick={() => setExportOpen((v) => !v)} />
          {exportOpen && (
            <div className="menu" role="menu">
              {!viewer && (
                <button role="menuitem" onClick={() => (setExportOpen(false), setGroupsOpen(true))}>
                  Groups and breakout rooms
                </button>
              )}
              <button role="menuitem" className="hide-phone" onClick={() => (setExportOpen(false), openShortcuts(teachingHere ? 'teaching' : 'writing'))}>
                Keyboard shortcuts
              </button>
              <span className="menu-sep" aria-hidden="true" />
              <span className="menu-label">Export</span>
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
                  const { title, text } = await lessonText(classId, itemId, (await ask(tr('Include your teacher notes in the file? Leave them out when you share it, for example.'), { ok: 'Include notes', cancel: 'Leave them out' })));
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
        </span>
        <span className="topbar-right">
          {!viewer && !phone && mode === 'edit' && !teachingHere && (
            <span className="sh-switch sh-view" role="radiogroup" aria-label="View">
              <button type="button" role="radio" aria-checked={!sheet} className={!sheet ? 'on' : ''} onClick={() => setSheet(false)} data-tip="The lesson as learners see it on a screen" aria-label="Digital: the lesson on screen">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M9 20h6M12 16.5V20" /></svg>
              </button>
              <button type="button" role="radio" aria-checked={sheet} className={sheet ? 'on' : ''} onClick={() => setSheet(true)} data-tip="The lesson as a printed worksheet: A4 pages, one column" aria-label="Worksheet: the lesson as printed pages">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7.5L19 7.5V21H7z" /><path d="M14.5 3v4.5H19M10 12h6M10 15.5h6M10 9h2" /></svg>
              </button>
            </span>
          )}
          {sheet && !viewer && !phone && mode === 'edit' && !teachingHere && (
            <button type="button" className="btn small-btn" onClick={() => void flush().then(() => setWorksheet(true))}>
              Print or PDF
            </button>
          )}
          <span className={'save-state ' + status}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved. Check your connection.' : 'Saved'}</span>
          {viewer ? (
            teachingHere && <span className="hint">{live?.teacherName} is teaching</span>
          ) : (
            <ModeMenu
              mode={mode === 'present' ? 'teach' : mode}
              noEdit={phone}
              noTeach={item?.type !== 'lesson'}
              live={teachingHere}
              online={inLesson.length}
              onMode={changeMode}
              onEnd={endTeaching}
              endLabel={live?.teacherUid && live.teacherUid !== user?.uid ? `End ${live.teacherName}’s live lesson` : undefined}
              viewAs={task && classmates.length ? <ViewAsLearner list classId={classId} classCode={c?.classCode ?? ''} roster={classmates} path={`/learn/${itemId}?task=${task.id}`} /> : undefined}
            />
          )}
          <TextSizeControl />
        </span>
      </TopBar>

      {quizOpen && <TeacherQuiz classId={classId} itemId={itemId} tasks={tasks} taskId={selected} roster={classmates} online={inLesson.map((p) => p.learnerId)} activeSet={activeSet} onClose={() => setQuizOpen(false)} />}
      {NOTEBOOK && user && (
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
      <NoticeToasts classId={classId} to="teacher" link={(i, t) => (i === 'disc' ? `/class/${classId}?tab=discussion&thread=${t}` : `/class/${classId}/lesson/${i}?task=${t}`)} />
      {item === undefined && <Loader full label="Opening the lesson" />}
      {item === null && <p className="placeholder">We couldn’t find this lesson.</p>}

      {item && (
        <div className={'lesson-layout' + (present ? ' present' : '') + (fullscreen && present ? ' fullscreen' : '') + panels.cls} style={panes.style}>
          <nav className="task-list" aria-label="Tasks">
            <textarea
              className="lesson-title"
              rows={1}
              defaultValue={item.title}
              aria-label="Lesson title"
              readOnly={preview || (teachingHere && !editWhileTeaching)}
              ref={(el) => {
                if (el) (el.style.height = '0'), (el.style.height = el.scrollHeight + 'px');
              }}
              onInput={(e) => ((e.currentTarget.style.height = '0'), (e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.title && updateItem(classId, itemId, { title: e.target.value.replace(/\s+/g, ' ').trim() })}
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
                      readOnly={preview || teachingHere}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.title && setTaskFlags(classId, itemId, t.id, { title: e.target.value.trim() })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    {!preview && !teachingHere && (
                      <button type="button" className="icon-btn sec-del" aria-label="Remove this heading (its tasks stay)" data-tip="Remove this heading (its tasks stay)" onClick={() => deleteTask(classId, itemId, t.id)}>
                        ×
                      </button>
                    )}
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
                  {!isVariant(t) && (t.variants?.length ?? 0) > 0 && <span className="variant-count" title={`${(t.variants?.length ?? 0) + 1} versions`}>{vLabel(t)}</span>}
                  {!isVariant(t) && t.audience && t.audience.mode !== 'all' && <span className="state-mark aud-mark" title={tr('Only some learners see this')}>{PEOPLE}</span>}
                  {t.hidden && <span className="state-mark" title={tr('Hidden from learners')}>{EYE_OFF}</span>}
                  {t.print?.show === 'paper' && <span className="show-tag" title="Only on the printed worksheet: learners don’t see it online">Paper</span>}
                  {t.print?.show === 'screen' && <span className="show-tag" title="Only on screen: not printed">Screen</span>}
                  {t.locked && <span className="state-mark" title="Locked">{LOCK}</span>}
                  {teachingHere && seeLearners && onTask(t.id) > 0 && (
                    <span className="on-task" title={`${onTask(t.id)} on this task`}>
                      {onTask(t.id)}
                    </span>
                  )}
                </button>
                )}
                {t.kind !== 'section' && !preview && (
                  <span className="row-actions">
                    <button type="button" className={'row-act' + (t.hidden ? ' on' : '')} title={t.hidden ? tr('Show to learners') : tr('Hide from learners')} aria-label={t.hidden ? tr('Show to learners') : tr('Hide from learners')} onClick={() => setTaskFlags(classId, itemId, t.id, { hidden: !t.hidden })}>
                      {t.hidden ? EYE_OFF : EYE}
                    </button>
                    <button type="button" className={'row-act' + (t.locked ? ' on' : '')} title={t.locked ? 'Unlock' : tr('Lock · learners see it but can’t open it')} aria-label={t.locked ? 'Unlock' : 'Lock'} onClick={() => setTaskFlags(classId, itemId, t.id, { locked: !t.locked })}>
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
            {!viewer && !teachingHere && !preview && (
              <div className="list-adds">
                <button type="button" className="btn dashed" onClick={newTask}>
                  + New task
                </button>
                {aiPilot&&<ImportMaterialsButton onClick={()=>void flush().then(()=>setMaterialImport(true))}/>}
                <button type="button" className="btn dashed" onClick={newSection}>
                  + Section
                </button>
                <button type="button" className="btn dashed wide-add" onClick={() => setImporting(true)}>
                  + From another lesson…
                </button>
                <button type="button" className="btn dashed wide-add" onClick={() => setFromLib(true)}>
                  + From the resources library…
                </button>
              </div>
            )}
          </nav>
          {panels.left && !present && <PaneResizer side="left" width={panes.widths.left} onWidth={(px) => panes.set('left', px)} onReset={() => panes.reset('left')} />}

          <div className="center-col">
          <div className="panel-toggles">
            <PanelToggle side="left" open={panels.left} onClick={panels.toggleLeft} label="the task list" />
            {!preview && <PanelToggle side="right" open={panels.right} onClick={panels.toggleRight} label={teachingHere ? 'the live answers' : 'the task settings'} />}
          </div>
          {/* The teaching tools show only on the teaching screen: not while editing during a live lesson. */}
          {teachingHere && !preview && !editWhileTeaching && (
            <div className="session-strip teach-bar" aria-label="Teaching tools">
              <span className="tb-group" aria-label="The class">
                <button type="button" className={'tb-sync' + (live?.sync ? ' on' : '')} onClick={toggleSync} data-tip={live?.sync ? tr('Learners follow you from task to task. Click to let them move freely (S)') : 'Bring everyone to the task you’re on, and keep them with you (S)'}>
                  <UiIcon name="sync" />
                  {live?.sync ? (live.syncRoom ? `${activeSet?.groups.find((g) => g.id === live.syncRoom)?.name ?? 'Room'} follows you` : 'Class follows you') : 'Sync class'}
                </button>
                {activeSet && fam.length > 1 && (
                  <NSelect className="sync-who" value={live?.syncRoom ?? ''} aria-label="Who follows you" onChange={(e) => syncWho(e.target.value || null)}>
                    <option value="">Whole class</option>
                    {activeSet.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </NSelect>
                )}
              </span>
              <span className="tb-group" aria-label="Screen">
                <span className="timer-ctl" ref={timerRef}>
                  <IconBtn icon="timer" label="Timer (T)" active={timerMenu || !!(live?.timer && (live.timer.up || live.timer.endsAt > Date.now()))} onClick={() => setTimerMenu((v) => !v)} />
                  {timerMenu && <TimerMenu running={!!live?.timer && (live.timer.up || live.timer.endsAt > Date.now())} onStart={startTimer} onCountUp={startCountUp} onAdd={() => addTime(60)} onStop={stopTimer} up={!!live?.timer?.up} />}
                </span>
              </span>
              <span className="tb-group menu-anchor" ref={activityRef}>
                {picking ? (
                  <span className="picking-name">{picking}</span>
                ) : (
                  <button type="button" className={'tb-more' + (activityOpen || live?.poll?.open || live?.quiz ? ' on' : '')} aria-haspopup="menu" aria-expanded={activityOpen} onClick={() => setActivityOpen((v) => !v)} data-tip={tr('Pick a learner, poll, team quiz, announcement')}>
                    Activities
                    <span aria-hidden="true">▾</span>
                  </button>
                )}
                {activityOpen && (
                  <div className="menu tb-menu" role="menu">
                    <button role="menuitem" onClick={() => (setActivityOpen(false), pickLearner())}>
                      <UiIcon name="pick" /> Pick a learner
                    </button>
                    <button role="menuitem" onClick={() => (setActivityOpen(false), setPollOpen(true))}>
                      <UiIcon name="poll" /> Quick poll{live?.poll?.open ? ' · open' : ''}
                    </button>
                    <button role="menuitem" onClick={() => (setActivityOpen(false), setQuizOpen(true))}>
                      <UiIcon name="quiz" /> Team quiz{live?.quiz ? ' · running' : ''}
                    </button>
                    <button role="menuitem" onClick={() => (setActivityOpen(false), setAnnouncing(true))}>
                      <UiIcon name="announce" /> Announcement
                    </button>
                  </div>
                )}
              </span>
              {/* Full screen: the side panels hide and the task fills the screen, for sharing it with the class. */}
              <span className="tb-group hide-phone">
                {present && <IconBtn icon="answers" label="Live answers" active={showGrid} onClick={() => setShowGrid((v) => !v)} />}
                <IconBtn icon={present ? 'fullscreenOff' : 'fullscreen'} label={present ? 'Leave full screen (Esc)' : 'Full screen (F)'} active={present} onClick={() => changeMode(present ? 'teach' : 'present')} />
              </span>
              {(hands.length > 0 || stuckN > 0) && (
                <span className="tb-signals">
                  {hands.length > 0 && (
                    <span className="hands" data-tip={hands.map((h) => h.name).join(', ')}>
                      <Icon name="wave" size="15" /> {hands.length}
                    </span>
                  )}
                  {stuckN > 0 && (
                    <span className="hands stuck" data-tip={Object.values(signals).filter((x) => x.stuck).map((x) => x.name).join(', ') + ' · stuck'}>
                      <Icon name="question" size="15" /> {stuckN}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          <main data-lesson-style={!boardView ? lessonStyleOf(c) : undefined} data-activity-number={tasks.filter(t => t.kind !== 'section').findIndex(t => t.id === task?.id) + 1 || undefined} className={'task-frame' + (opening ? ' is-opening' : '')} style={{ ['--ts' as string]: TEXT_SCALE[profile?.textSize ?? 'M'] }} aria-busy={!!opening}>
            {opening && !(sheet && mode === 'edit') && (
              <div className="frame-veil" role="status">
                <Loader label="Opening the task" />
              </div>
            )}
            {boardView && !(teachingHere && !editWhileTeaching) && item && user ? (
              <div className="frame-inner">
                <div className="frame-head">
                  <h1 className="task-title">Board</h1>
                  <p className="hint" style={{ margin: 0 }}>{tr('Prepare pages before class; double-click a page to name it. When you teach, learners see the page you’re on.')}</p>
                </div>
                <div className="frame-body">
                  <LessonBoard classId={classId} item={item} uid={user.uid} teacher page={boardPage} onPage={goBoardPage} />
                </div>
              </div>
            ) : !task || !draft ? (
              <div className="empty" style={{ padding: 28 }}>
                {taskErr ? (
                  <div className="frame-loading">
                    <span className="load-error">
                      {taskErr}
                      <button type="button" className="btn small" onClick={() => setTaskTry((n) => n + 1)}>
                        Try again
                      </button>
                    </span>
                  </div>
                ) : tasks.length ? (
                  <div className="frame-loading">
                    <Loader label="Opening the task" />
                  </div>
                ) : (
                  <h2>Add the first task</h2>
                )}
                {!tasks.length && <p>A lesson is a set of tasks. Each task is like a page: a short title, a bold instruction, then the text and questions.</p>}
                {!tasks.length && (
                  <span style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn primary" onClick={newTask}>
                      + New task
                    </button>
                    <button className="btn" onClick={() => setImporting(true)}>
                      Copy tasks from another lesson…
                    </button>
                  </span>
                )}
              </div>
            ) : preview || (teachingHere && !editWhileTeaching) ? (
              <div className={'frame-inner' + (!preview && boardView ? ' on-board' : '')}>
                <div className="frame-head" hidden={!preview && boardView}>
                  {!preview && !phone && (
                    <button type="button" className="btn small-btn done-edit" onClick={() => setEditWhileTeaching(true)} data-tip="Change this task while the class stays live">
                      <UiIcon name="edit" size={14} /> Edit
                    </button>
                  )}
                  {fam.length > 1 && <span className="ver-badge"><i aria-hidden="true" />{vLabel(task)}</span>}
                  <h1 className="task-title">{lessonStyleOf(c) === 'young' && <span className="yl-activity-number" aria-hidden="true">{tasks.filter(t => t.kind !== 'section').findIndex(t => t.id === task?.id) + 1}</span>}{draft.title}</h1>
                  <InstrView classId={classId} doc={draft.instrDoc} text={draft.instructions} />
                </div>
                {!preview && boardView && user && item && <div className="board-pane"><LessonBoard classId={classId} item={item} uid={user.uid} teacher page={boardPage} onPage={goBoardPage} people={inLesson.map((p) => ({ uid: p.id, name: p.name }))} /></div>}
                {!preview && <SpotlightCard spotlight={live?.spotlight} taskId={task.id} onClose={() => setLive(classId, { spotlight: null })} />}
                {!preview && <TimerChip timer={live?.timer} onStop={stopTimer} onAdd={live?.timer?.up ? undefined : () => addTime(60)} />}
                {!preview && <PickedBanner picked={live?.picked} onClose={() => setLive(classId, { picked: null })} />}
                {!preview && <ReactionBurst signals={signals} />}
                <div
                  ref={teachBodyRef}
                  hidden={!preview && boardView}
                  className={'frame-body' + (!preview ? ' teach-view' : '')}
                  onClick={(e) => {
                    if (preview || !task || inkMode !== 'off') return;
                    const q = (e.target as HTMLElement).closest('[data-qid]') as HTMLElement | null;
                    if (q?.dataset.qid) toggleSingle(q.dataset.qid);
                  }}
                >
                  {NOTEBOOK && !preview && user && inkMode === 'off' && <SelectionNote container={teachBodyRef} c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} onAdd={toNotebook} />}
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
                <div className="frame-foot">
                  <span className="hint">{preview ? 'Preview · answers here aren’t saved' : 'Teaching · click a question to show its answer to the class'}</span>
                  <span className="foot-acts">
                    {!preview && qCount > 0 && (
                      <span className="reveal-ctl foot-reveal" aria-label="Answers">
                        <IconBtn icon="revealOne" label={`Show the next answer (R) · ${revealN === 0 ? 'answers hidden' : revealN < 0 || revealN >= qCount ? 'all shown' : `${revealN} of ${qCount} shown`}`} disabled={revealN < 0 || revealN >= qCount} onClick={revealNext} />
                        <IconBtn icon="revealAll" label="Show all answers (Shift + R)" disabled={revealN < 0} onClick={revealAll} />
                        <IconBtn icon="hideAnswers" label="Hide the answers again (H)" disabled={revealN === 0 && singles.length === 0} onClick={hideAnswers} />
                      </span>
                    )}
                    <IconBtn icon="prev" label="Previous task (←)" className="nav-arrow" disabled={!prevTask} onClick={() => prevTask && select(prevTask.id)} />
                    <IconBtn icon="next" label="Next task (→)" className="nav-arrow" disabled={!nextTask} onClick={() => nextTask && select(nextTask.id)} />
                    {!preview ? null : questionIds(previewKey?.content ?? null).every((q) => q.type === 'reflect') ? null : previewChecked ? (
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
            ) : sheet && sheetData ? (
              <div className={'sh-split' + (sheetEdit ? '' : ' solo')} style={{ ['--sh-w' as string]: `${sheetW}%`, ['--sh-r' as string]: (100 - sheetW) / 100 }}>
                <section className="sh-left" aria-label="The worksheet">
                  <div className="sh-left-bar">
                    <span className="sh-switch" role="radiogroup" aria-label="Size of the page">
                      <button type="button" role="radio" aria-checked={sheetZoom === 'width'} className={sheetZoom === 'width' ? 'on' : ''} onClick={() => setSheetZoom('width')}>
                        Fit width
                      </button>
                      <button type="button" role="radio" aria-checked={sheetZoom === 'page'} className={sheetZoom === 'page' ? 'on' : ''} onClick={() => setSheetZoom('page')}>
                        Whole page
                      </button>
                    </span>
                    <span className="hint">{sheetEdit ? 'Click a task to edit it, or outside the tasks to close the editor' : 'Click a task to edit it'}</span>
                  </div>
                  <SheetView
                    parts={sheetData.parts}
                    zoom={sheetZoom}
                    focus={task.id}
                    onBlank={() => setSheetEdit(false)}
                    onMove={(id, before) => void reorder(id, before ? tasks.findIndex((x) => x.id === before) : tasks.length)}
                    blocks={sheetTasks.map((t) => {
                      const p = sheetData.byId[t.id];
                      const on = t.id === task.id && sheetEdit;
                      const pick = () => (setSheetEdit(true), void select(t.id));
                      const del = t.kind === 'section' ? { onDelete: () => void deleteTask(classId, itemId, t.id), deleteLabel: 'Remove this heading (its tasks stay)' } : { onDelete: () => void remove(t), deleteLabel: `Delete the task “${t.title || 'Untitled task'}”` };
                      if (!p) return { id: t.id, title: t.title, ...del, on, onClick: pick, label: `Edit ${t.title}`, node: <div className="sh-hidden">{t.hidden ? `${t.title || 'Task'} · hidden from learners, so not printed` : t.print?.show === 'screen' ? `${t.title || 'Task'} · only on screen, so not printed` : 'One moment…'}</div> };
                      return { id: t.id, title: t.title, ...del, on: on && t.kind !== 'section', html: p.html, heading: t.kind === 'section', onClick: t.kind === 'section' ? undefined : pick, label: `Edit ${t.title}`, note: p.online.length ? `Online only, not printed: ${p.online.join(', ')}` : undefined };
                    })}
                    after={
                      <button type="button" className="sh-add" onClick={() => void newTask()}>
                        + Add a task
                      </button>
                    }
                  />
                </section>
                <div
                  className="sh-divider"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Drag to change the size of the worksheet"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    const split = e.currentTarget.parentElement as HTMLElement;
                    const box = split.getBoundingClientRect();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    split.classList.add('dragging'); // no sliding while you drag
                    const move = (ev: PointerEvent) => setSheetW(Math.round(Math.min(70, Math.max(25, ((ev.clientX - box.left) / box.width) * 100))));
                    const up = () => (split.classList.remove('dragging'), window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                  }}
                  onKeyDown={(e) => (e.key === 'ArrowLeft' ? setSheetW(Math.max(25, sheetW - 5)) : e.key === 'ArrowRight' ? setSheetW(Math.min(70, sheetW + 5)) : null)}
                />
                <section className="sh-right" aria-label="Edit the task">
                  {task.kind !== 'section' && (
                    <PaperBar
                      key={task.id}
                      look={task.print ?? {}}
                      onChange={(print) => void setTaskFlags(classId, itemId, task.id, { print })}
                      gaps={JSON.stringify(draft.content).includes('"type":"gap"') || JSON.stringify(draft.content).includes('"type":"dropgap"')}
                      writing={JSON.stringify(draft.content).includes('"type":"writing"')}
                      online={sheetData.byId[task.id]?.online ?? []}
                    />
                  )}
                  {editFrame}
                </section>
              </div>
            ) : (
              editFrame
            )}
          </main>
          {task && draft && !viewer && !preview && !present && !boardView && (
            <PresenterNotes pane={notesPane} hasNotes={!!notes.trim()}>
              {teachingHere && !editWhileTeaching && !notesEditing ? (
                <div className="pn-read" onClick={() => setNotesEditing(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setNotesEditing(true)} data-tip="Click to edit">
                  {notes.trim() ? task && notesFor === task.id && <NotesView doc={notesDoc} text={notes} /> : <span className="pn-empty">Click to add notes</span>}
                </div>
              ) : teachingHere && !editWhileTeaching ? (
                <div className="pn-editing">
                  {notesEditor('pn-editor', 'Click to add notes')}
                  <button type="button" className="btn small-btn" onClick={() => setNotesEditing(false)}>
                    Done
                  </button>
                </div>
              ) : (
                notesEditor('pn-editor', 'Click to add notes')
              )}
            </PresenterNotes>
          )}
          </div>

          {panels.right && !present && !preview && task && draft && <PaneResizer side="right" width={panes.widths.right} onWidth={(px) => panes.set('right', px)} onReset={() => panes.reset('right')} />}
          {task && draft && teachingHere && !editWhileTeaching && !preview && previewKey && (!present || showGrid) && (
            <LivePanel
              classId={classId}
              taskId={task.id}
              content={previewKey.content}
              answerKey={previewKey.key}
              presence={inLesson}
              seeLearners={seeLearners}
              revealedIds={singles}
              onRevealQuestion={toggleSingle}
              signals={signals}
              codes={c?.codes ?? DEFAULT_CODES}
              annotations={teacherAnns}
              onSpotlight={(qid, text) => setLive(classId, { spotlight: { taskId: task.id, qid, text, at: Date.now() } })}
              people={
                <div className="lp-people">
                  <span className="session-count">
                    <span className="live-dot" aria-hidden="true" />
                    {inLesson.length} of {c?.learnerCount ?? 0} in this lesson
                  </span>
                  <span className="session-people">
                    {online.length === 0 && <span className="hint">No learners online yet. Share the class code {c?.classCode}.</span>}
                    {online.map((p) => (
                      <span key={p.id} className={'person' + (p.itemId === itemId ? '' : ' elsewhere') + (signals[p.id]?.hand ? ' hand' : '') + (signals[p.id]?.stuck ? ' stuck' : '')} data-tip={p.itemId === itemId ? (!seeLearners ? `${p.name} · in this lesson` : `${p.name} · ${tasks.find((t) => t.id === p.taskId)?.title ?? 'in this lesson'}`) + (signals[p.id]?.hand ? ' · hand up' : '') + (signals[p.id]?.stuck ? ' · stuck' : '') : `${p.name} · online, not in this lesson`}>
                        <Avatar k={p.avatar} name={p.name} size={24} className="avatar-24" />
                        <span className="pname">{p.name.split(' ')[0]}</span>
                        {seeLearners && p.itemId === itemId && p.taskId !== selected && <span className="ptask">{tasks.findIndex((t) => t.id === p.taskId) + 1 || ''}</span>}
                      </span>
                    ))}
                  </span>
                  {hands.length > 0 && (
                    <span className="hint">
                      <Icon name="wave" size="14" /> {hands.map((h) => h.name.split(' ')[0]).join(', ')} {hands.length === 1 ? 'has a hand up' : 'have hands up'} ·{' '}
                      <button type="button" className="btn link small" onClick={() => clearAllHands(classId, signalUids.filter((u) => signals[u]?.hand))}>
                        Lower all
                      </button>
                    </span>
                  )}
                </div>
              }
              rooms={activeSet?.groups}
              only={gridOnly}
              tagOf={tagOf}
            />
          )}
          {task && draft && viewer && (
            <aside className="task-side" aria-label="Viewing">
              <span className="eyebrow">Viewing</span>
              <span className="hint">{tr('You have view-only access to this class, so you see the lesson as learners do. Nothing here is saved.')}</span>
            </aside>
          )}
          {task && draft && !viewer && !preview && !(teachingHere && !editWhileTeaching) && (
            <aside className="task-side folds" aria-label="Task settings">
              <Fold id="who" title="Who sees this" open={fold} setOpen={setFold}>
              <TaskAudience classId={classId} itemId={itemId} task={task} tasks={tasks} sets={groupSets} roster={classmates} onMakeVersion={newVersion} onOpen={select} onOpenGroups={() => setGroupsOpen(true)} />
              </Fold>
              <Fold id="layout" title="Layout" open={fold} setOpen={setFold}>
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
              </Fold>
              <Fold id="check" title="Checking" open={fold} setOpen={setFold}>
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
                  {task.afterCheck === 'retry' ? tr('Learners only see which answers are right or wrong, then try the wrong ones again.') : tr('Learners see the correct answers after they check.')}
                </span>
              </div>
              <label className="switch-row">
                <span>
                  Show the score after checking
                  <span className="hint">{tr('Learners see how many they got right')}</span>
                </span>
                <input type="checkbox" checked={task.showScore !== false} onChange={() => setTaskFlags(classId, itemId, task.id, { showScore: task.showScore === false })} />
              </label>
              </Fold>
              {/* Only in an exam. A task already in exam mode elsewhere keeps it, so it can be turned off. */}
              {item && (item.type === 'exam' || !!task.exam) && (
                <Fold id="exam" title="Exam" open={fold} setOpen={setFold}>
                  <ExamSettings classId={classId} item={item} task={task} />
                </Fold>
              )}
              <Fold id="more" title="History and tips" open={fold} setOpen={setFold}>
                <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => (flush(), setVersionsOpen(true))}>
                  Version history
                </button>
                <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setBankSave({ kind: 'task', content: (draft.content.content ?? []) as JSONContent[], title: draft.title, instructions: draft.instructions })} title="Keep this task in your personal bank to reuse in any class">
                  Save task to my bank
                </button>
                <p className="hint" style={{ margin: 0 }}>
                  Type <strong>/</strong> in the text for a gap or a multiple-choice question. In a gap, separate other accepted answers with |, for example
                  “have been | ’ve been”. Capitals, curly apostrophes and a final full stop are ignored when checking.
                </p>
              </Fold>
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
            await addVersion(classId, itemId, task.id, { title: draft.title, instructions: draft.instructions, instrDoc: draft.instrDoc ?? null, content: draft.content, by: (user?.displayName || '') + ' (before restoring)' }).catch(() => {});
            setDraft({ title: v.title, instructions: v.instructions, instrDoc: v.instrDoc ?? null, content: v.content });
            setEditorKey(task.id + ':' + Date.now());
            pending.current = { taskId: task.id, patch: { title: v.title, instructions: v.instructions, instrDoc: v.instrDoc ?? null, content: v.content } };
            await flush();
            setVersionsOpen(false);
          }}
        />
      )}
      {copyTask && <CopyDialog kind="task" fromClass={classId} itemId={itemId} taskId={copyTask.id} title={copyTask.title || 'Untitled task'} onClose={() => setCopyTask(null)} onDone={setCopyMsg} />}
      {fromLib && user && (
        <LibraryPicker
          uid={user.uid}
          onClose={() => setFromLib(false)}
          onPick={async (lt) => {
            setFromLib(false);
            await flush();
            const id = await addToLesson(user.uid, lt, classId, itemId, tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0);
            setSelected(id);
          }}
        />
      )}
      {taskStart&&<TaskStartChoice onClose={()=>setTaskStart(false)} onBlank={()=>{setTaskStart(false);void newBlankTask();}} onImport={()=>{setTaskStart(false);setMaterialImport(true);}}/>}
      {materialImport&&<MaterialImport classId={classId} itemId={itemId} creationType={item?.type||'lesson'} onClose={()=>setMaterialImport(false)} onDone={(_,id)=>{setMaterialImport(false);setSelected(id);setCopyMsg('Reviewed task added.');}}/>}
      {importing && <ImportTasksDialog classId={classId} itemId={itemId} onClose={() => setImporting(false)} onDone={(m, id) => (setCopyMsg(m), id && setSelected(id))} />}
      {copyMsg && (
        <div className="toasts">
          <div className="toast">
            <span className="toast-body">
              {copyMsg}
              <span className="toast-actions">
                <button type="button" className="btn small-btn" onClick={() => setCopyMsg('')}>
                  Got it
                </button>
              </span>
            </span>
          </div>
        </div>
      )}
      {announcing && <AnnounceDialog classId={classId} roster={classmates} onClose={() => setAnnouncing(false)} />}
      {worksheet && <WorksheetDialog classId={classId} itemId={itemId} onClose={() => setWorksheet(false)} />}
      {bankSave && user && <SaveToBankDialog uid={user.uid} kind={bankSave.kind} content={bankSave.content} title={bankSave.title} instructions={bankSave.instructions} onClose={() => setBankSave(null)} />}
      {bankPick && user && (
        <BankPicker
          uid={user.uid}
          onClose={() => setBankPick(null)}
          onPick={(b) => {
            const nodes = withFreshIds(b.content);
            if (b.kind === 'task') {
              // a whole task becomes a new task after this one
              newTaskFrom({ title: b.title, instructions: b.instructions ?? '', content: { type: 'doc', content: nodes } });
            } else bankPick([...nodes, { type: 'paragraph' }]);
            setBankPick(null);
          }}
        />
      )}
      {recapOpen && c && item && <RecapDialog c={c} item={item} items={nbItems} onClose={() => setRecapOpen(false)} />}
    </div>
    </ClassAvatarsContext.Provider>
  );
}

// Above a task's title: whether it is linked to the resources library, and the way to link or unlink.
function LibLink({ task, uid, classId, itemId, flush }: { task: Task; uid: string; classId: string; itemId: string; flush: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const use = { classId, itemId, taskId: task.id };
  if (task.lib)
    return (
      <span className="lib-link" data-tip="Linked to your resources library: changes here reach the library and every lesson that uses it">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
        Linked to the library
        {task.lib.uid === uid && (
          <button
            type="button"
            className="lib-break"
            disabled={busy}
            onClick={async () => {
              if (!(await ask('Break the link with the library? This lesson’s task becomes its own: changes stop going both ways, and you can’t link it again.', { ok: 'Break the link' }))) return;
              setBusy(true);
              await flush();
              await breakLink(uid, task.lib!.id, use).catch(() => {});
              setBusy(false);
            }}
          >
            Break the link
          </button>
        )}
      </span>
    );
  return (
    <button
      type="button"
      className="lib-save"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await flush();
        const body = await lessonTaskBody(use).catch(() => null);
        if (body) await saveToLibrary(uid, use, body).catch(() => {});
        setBusy(false);
        if (body) void tell('Saved in your resources library. The two stay linked: a change in either reaches the other.');
      }}
      data-tip="Keep a linked copy in your resources library, to use in other lessons"
    >
      <UiIcon name="archive" size={13} /> {busy ? 'Saving…' : 'Save to the library'}
    </button>
  );
}

// One part of the task settings; one opens at a time.
function Fold({ id, title, open, setOpen, children }: { id: string; title: string; open: string; setOpen: (v: string) => void; children: React.ReactNode }) {
  const on = open === id;
  return (
    <section className={'fold' + (on ? ' on' : '')}>
      <button type="button" className="fold-h" aria-expanded={on} onClick={() => setOpen(on ? '' : id)}>
        {title}
        <span className="fold-chev" aria-hidden="true">›</span>
      </button>
      {on && <div className="fold-b">{children}</div>}
    </section>
  );
}

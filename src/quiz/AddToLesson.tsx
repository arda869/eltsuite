// Games in class lessons. A game in a lesson is a game block inside a task: its questions are the
// block's own content (marked and kept like any other question), and the teacher plays it live or lets
// learners play it at their own pace. Any task with marked questions can also be played as a game.
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTeacherClasses } from '../lib/coteach';
import { addTask } from '../lib/tasks';
import { useMyDocs } from '../lib/sharedDocs';
import { liveRef } from '../lib/live';
import { NSelect } from '../components/Select';
import { blankQuiz, blockFromQuiz, freshIds, fromSaved, liveQuestions, newId, quizProblems, type QuizDoc } from './model';
import { startBlock } from './InlineGame';
import { quizApi } from './live';
import './quiz.css';

/** Put a game into a lesson as a new task holding a game block. */
export async function gameIntoLesson(classId: string, itemId: string, quiz: QuizDoc, title: string, sourceId?: string) {
  const tasks = await getDocs(collection(db, 'classes', classId, 'items', itemId, 'tasks'));
  const order = tasks.docs.reduce((m, t) => Math.max(m, Number(t.data().order) || 0), -1) + 1;
  const blockId = newId();
  const block = blockFromQuiz(freshIds(quiz), title, blockId, sourceId);
  const taskId = await addTask(classId, itemId, order, 'task', { title: title || 'Game', instructions: 'Play the game.', content: { type: 'doc', content: [block] } });
  return { taskId, blockId };
}

/** Play a whole task as a game. Live opens the big screen in a new tab. */
export async function hostClassTask(classId: string, itemId: string, taskId: string, mode: 'live' | 'self', guests: boolean) {
  const w = mode === 'live' ? window.open('about:blank', '_blank') : null;
  try {
    const r = await quizApi<{ runId: string }>('host', { source: { kind: 'class', classId, itemId, taskId }, mode, guests });
    const to = '/game-host/' + r.runId;
    if (w) w.location.href = to;
    else window.open(to, '_blank');
    return r.runId;
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** From the game editor: choose a class and a lesson, and the game goes in as a new task. */
export function AddToLesson({ quiz, title, sourceId, onClose }: { quiz: QuizDoc; title: string; sourceId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { classes } = useTeacherClasses(user?.uid);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [itemId, setItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ classId: string; itemId: string; taskId: string } | null>(null);
  useEffect(() => {
    setItemId('');
    setLessons([]);
    if (!classId) return;
    void getDocs(collection(db, 'classes', classId, 'items'))
      .then((s) => setLessons(s.docs.filter((d) => d.data().kind !== 'topic' && !d.data().deletedAt).map((d) => ({ id: d.id, title: d.data().title || 'Lesson' }))))
      .catch(() => setError('We couldn’t load the lessons. Try again.'));
  }, [classId]);
  const add = async () => {
    setBusy(true);
    setError('');
    try {
      const { taskId } = await gameIntoLesson(classId, itemId, quiz, title, sourceId);
      setDone({ classId, itemId, taskId });
    } catch {
      setError('We couldn’t add the game just now. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog lq-dialog" role="dialog" aria-label="Add to a lesson" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Add “{title}” to a lesson</h2>
        {done ? (
          <>
            <p>The game is in the lesson as a new task. Open the lesson to play it live, or let learners play it at their own pace.</p>
            <div className="qe-row">
              <a className="btn primary" href={`/class/${done.classId}/lesson/${done.itemId}?task=${done.taskId}`}>
                Open the lesson
              </a>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="qe-hint">The game goes into the lesson as a new task. Play it live with the class, or let learners play it at their own pace. Their answers are kept with the class, like any other task.</p>
            <label className="field">
              Class
              <NSelect value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="" disabled>Choose a class</option>
                {(classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NSelect>
            </label>
            {classId && (
              <label className="field">
                Lesson
                <NSelect value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  <option value="" disabled>Choose a lesson</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </NSelect>
              </label>
            )}
            {classId && !lessons.length && <p className="qe-hint">This class has no lessons yet. Make a lesson first.</p>}
            {error && <p className="qe-problem">{error}</p>}
            <div className="qe-row">
              <button type="button" className="btn primary" disabled={!classId || !itemId || busy} onClick={() => void add()}>
                {busy ? 'Adding…' : 'Add to the lesson'}
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type TaskLite = { id: string; title: string; content: JSONContent | null; kind?: string };
type Running = { runId: string; code: string; title: string; mode?: 'live' | 'self' };

/** The game blocks in some task content. */
function blocksIn(content: JSONContent | null): { id: string; title: string; n: number }[] {
  const out: { id: string; title: string; n: number }[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'gameBlock' && n.attrs?.id) out.push({ id: String(n.attrs.id), title: String(n.attrs.title || 'Game'), n: liveQuestions({ type: 'doc', content: n.content || [] }).length });
    else n.content?.forEach(walk);
  };
  if (content) walk(content);
  return out;
}

/**
 * In a lesson (Activities → Game, or + → Game): play one of the lesson's games or any task with marked
 * questions, live or at learners' own pace; bring in a saved game; or make a new one here.
 */
export function GameDialog({ classId, itemId, tasks, currentTaskId, onClose, onSelect }: { classId: string; itemId: string; tasks: TaskLite[]; currentTaskId?: string; onClose: () => void; onSelect?: (taskId: string) => void }) {
  const { user } = useAuth();
  const { mine } = useMyDocs(user?.uid);
  const [mode, setMode] = useState<'live' | 'self'>('live');
  const [guests, setGuests] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState<Record<string, Running | null>>({});
  const [runs, setRuns] = useState<{ id: string; title: string; createdAt: number; players: number; status: string; mode?: string }[]>([]);
  const [pickSaved, setPickSaved] = useState(false);
  useEffect(() => onSnapshot(liveRef(classId), (s) => setRunning((s.data()?.games as Record<string, Running | null>) || {}), () => {}), [classId]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'quizRuns'), where('classId', '==', classId)),
        (s) => setRuns(s.docs.map((d) => ({ id: d.id, ...(d.data() as { title: string; createdAt: number; players: number; status: string; mode?: string }) })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)),
        () => {},
      ),
    [classId],
  );
  const games = tasks.flatMap((t) => blocksIn(t.content).map((b) => ({ ...b, taskId: t.id, taskTitle: t.title })));
  const playable = tasks
    .filter((t) => t.kind !== 'section' && !blocksIn(t.content).length)
    .map((t) => ({ ...t, n: liveQuestions(t.content).length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => (a.id === currentTaskId ? -1 : b.id === currentTaskId ? 1 : 0));
  const saved = (mine || []).filter((d) => d.kind === 'game' && !d.deletedAt);
  const live = Object.values(running).filter(Boolean) as Running[];

  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await f();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const bring = (id: string, title: string, start: boolean) =>
    run(id, async () => {
      const snap = await getDoc(doc(db, 'sharedDocs', id, 'game', 'main'));
      const quiz = fromSaved(snap.data());
      if (!snap.exists() || quizProblems(quiz).length) throw Error('Open this game and finish its questions first.');
      const { taskId, blockId } = await gameIntoLesson(classId, itemId, quiz, title, id);
      setPickSaved(false);
      onSelect?.(taskId);
      if (start) await startBlock(classId, itemId, blockId, mode, guests);
      else onClose();
    });
  const make = () =>
    run('new', async () => {
      const { taskId } = await gameIntoLesson(classId, itemId, blankQuiz(), 'Game');
      onSelect?.(taskId);
      onClose();
    });
  const end = (r: Running) => {
    if (!confirm('End this game? Everyone’s answers are kept.')) return;
    void quizApi('end', { runId: r.runId }).catch((e) => setError((e as Error).message));
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog wide lq-dialog" role="dialog" aria-label="Games" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Games</h2>
        {live.map((r) => (
          <div key={r.runId} className="lq-banner">
            <div>
              <strong>
                {r.title} · {r.mode === 'self' ? 'at their own pace' : 'live'}
              </strong>
              <br />
              <span>Code {r.code}. Learners in the class play it in their lesson.</span>
            </div>
            <a className="qz-btn" href={'/game-host/' + r.runId} target="_blank" rel="noreferrer">
              {r.mode === 'self' ? 'See progress' : 'Open the big screen'}
            </a>
            <button type="button" className="btn" onClick={() => end(r)}>
              End it
            </button>
          </div>
        ))}
        <div className="lq-mode" role="radiogroup" aria-label="How to play">
          <button type="button" role="radio" aria-checked={mode === 'live'} className={'lq-mode-opt' + (mode === 'live' ? ' on' : '')} onClick={() => setMode('live')}>
            <strong>Live</strong>
            <span>Everyone plays together. You run the clock from the big screen.</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'self'} className={'lq-mode-opt' + (mode === 'self' ? ' on' : '')} onClick={() => setMode('self')}>
            <strong>At their own pace</strong>
            <span>Each learner plays on their own, with a class leaderboard.</span>
          </button>
        </div>
        {!pickSaved ? (
          <div className="lq-options">
            {games.map((g) => (
              <button key={g.id} type="button" className="lq-option" disabled={!!busy || !!running[g.id] || !g.n} onClick={() => void run(g.id, () => startBlock(classId, itemId, g.id, mode, guests))}>
                <strong>
                  Play “{g.title}” <span className="lq-chip">Game</span>
                </strong>
                <span>
                  {g.n ? `${g.n} ${g.n === 1 ? 'question' : 'questions'} · in “${g.taskTitle || 'Task'}”` : 'Add questions to this game first.'}
                  {running[g.id] ? ' · running now' : busy === g.id ? ' · Starting…' : ''}
                </span>
              </button>
            ))}
            {playable.slice(0, 6).map((t) => (
              <button key={t.id} type="button" className="lq-option" disabled={!!busy || !!running[t.id]} onClick={() => void run(t.id, () => hostClassTask(classId, itemId, t.id, mode, guests))}>
                <strong>Play the task “{t.title || 'Task'}” as a game</strong>
                <span>
                  {t.n} {t.n === 1 ? 'question' : 'questions'}
                  {busy === t.id ? ' · Starting…' : ''}
                </span>
              </button>
            ))}
            <button type="button" className="lq-option" disabled={!!busy || !saved.length} onClick={() => setPickSaved(true)}>
              <strong>Bring in one of your saved games</strong>
              <span>{saved.length ? 'It goes into this lesson as a new task. Play it now or later.' : 'You don’t have any saved games yet.'}</span>
            </button>
            <button type="button" className="lq-option" disabled={!!busy} onClick={() => void make()}>
              <strong>Make a new game in this lesson</strong>
              <span>A new task with a game in it. Add your questions, then play.</span>
            </button>
          </div>
        ) : (
          <div className="lq-options">
            {saved.map((q) => (
              <div key={q.id} className="lq-option lq-option-row">
                <strong>{q.title}</strong>
                <span className="qe-row">
                  <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => void bring(q.id, q.title, false)}>
                    Add to this lesson
                  </button>
                  <button type="button" className="btn small-btn primary" disabled={!!busy} onClick={() => void bring(q.id, q.title, true)}>
                    Add and play now
                  </button>
                  {busy === q.id && <span>One moment…</span>}
                </span>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => setPickSaved(false)}>
              Back
            </button>
          </div>
        )}
        <label className="qe-check">
          <input type="checkbox" checked={guests} onChange={(e) => setGuests(e.target.checked)} /> Let people outside the class join with the code, as guests
        </label>
        {error && (
          <p className="qe-problem" role="alert">
            {error}
          </p>
        )}
        {runs.length > 0 && (
          <div className="qe-runs">
            <p className="qe-hint">Results of games played in this class</p>
            {runs.map((r) => (
              <a key={r.id} href={'/game-results/' + r.id} target="_blank" rel="noreferrer">
                <span>{r.title}</span>
                <span>
                  {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {r.mode === 'self' ? 'own pace · ' : ''}
                  {r.players} {r.players === 1 ? 'player' : 'players'}
                </span>
              </a>
            ))}
          </div>
        )}
        <div className="qe-row">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** In a learner's lesson: a game is being played live, join it. */
export function LearnerQuizBanner({ quiz }: { quiz: { runId: string; title: string } | null | undefined }) {
  if (!quiz?.runId) return null;
  return (
    <div className="lq-banner" role="status">
      <div>
        <strong>Game: {quiz.title}</strong>
        <br />
        <span>Your teacher has started a game.</span>
      </div>
      <a className="qz-btn" href={'/game?run=' + encodeURIComponent(quiz.runId)}>
        Join
      </a>
    </div>
  );
}

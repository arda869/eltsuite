// Live quizzes in class lessons. A quiz in a lesson is an ordinary task (its questions, with the
// answer key kept apart as usual) that remembers its slides and timings, so the teacher can play it
// live, learners can also do it on their own, and every answer is kept with the class.
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTeacherClasses } from '../lib/coteach';
import { addTask } from '../lib/tasks';
import { newSharedDoc, useMyDocs } from '../lib/sharedDocs';
import { liveRef } from '../lib/live';
import { fromSaved, liveQuestions, quizProblems, toTask, type QuizDoc } from './model';
import { quizApi } from './live';
import './quiz.css';
import { NSelect } from '../components/Select';

/** Put a quiz into a lesson as a new task. Returns the new task's id. */
export async function quizIntoLesson(classId: string, itemId: string, quiz: QuizDoc, title: string, sourceId?: string) {
  const tasks = await getDocs(collection(db, 'classes', classId, 'items', itemId, 'tasks'));
  const order = tasks.docs.reduce((m, t) => Math.max(m, Number(t.data().order) || 0), -1) + 1;
  const { content, plan } = toTask(quiz);
  const id = await addTask(classId, itemId, order, 'task', { title: title || 'Live quiz', instructions: 'Answer each question.', content });
  await updateDoc(doc(db, 'classes', classId, 'items', itemId, 'tasks', id), { quiz: { ...plan, ...(sourceId ? { source: sourceId } : {}) } });
  return id;
}

/** Start a live quiz from a class task, on a new tab for the big screen. */
export async function hostClassTask(classId: string, itemId: string, taskId: string, guests: boolean) {
  const w = window.open('about:blank', '_blank');
  try {
    const r = await quizApi<{ runId: string }>('host', { source: { kind: 'class', classId, itemId, taskId }, guests });
    if (w) w.location.href = '/quiz-host/' + r.runId;
    else window.location.href = '/quiz-host/' + r.runId;
    return r.runId;
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** From the quiz editor: choose a class and a lesson, and the quiz goes in as a task. */
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
      const taskId = await quizIntoLesson(classId, itemId, quiz, title, sourceId);
      setDone({ classId, itemId, taskId });
    } catch {
      setError('We couldn’t add the quiz just now. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog lq-dialog" role="dialog" aria-label="Add to a class" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Add “{title}” to a class</h2>
        {done ? (
          <>
            <p>The quiz is in the lesson as a new task. Open the lesson and choose Activities, then Live quiz, to play it with the class.</p>
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
            <p className="qe-hint">The quiz goes into the lesson as a task. Play it live with the class, or let learners do it on their own. Their answers are kept with the class, like any other task.</p>
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

type TaskLite = { id: string; title: string; content: JSONContent | null; kind?: string; quiz?: unknown };

/**
 * In a lesson (Activities → Live quiz): play a task live, bring in a saved quiz, or make a new one.
 * A quiz that's running shows here too, with its big screen and results.
 */
export function LiveQuizDialog({ classId, itemId, tasks, currentTaskId, onClose }: { classId: string; itemId: string; tasks: TaskLite[]; currentTaskId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const { mine } = useMyDocs(user?.uid);
  const [guests, setGuests] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState<{ runId: string; code: string; title: string } | null>(null);
  const [runs, setRuns] = useState<{ id: string; title: string; createdAt: number; players: number; status: string }[]>([]);
  const [pickSaved, setPickSaved] = useState(false);
  useEffect(() => onSnapshot(liveRef(classId), (s) => setRunning((s.data()?.liveQuiz as typeof running) || null), () => {}), [classId]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'quizRuns'), where('classId', '==', classId)),
        (s) => setRuns(s.docs.map((d) => ({ id: d.id, ...(d.data() as { title: string; createdAt: number; players: number; status: string }) })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)),
        () => {},
      ),
    [classId],
  );
  const playable = tasks.filter((t) => t.kind !== 'section').map((t) => ({ ...t, n: liveQuestions(t.content).length })).filter((t) => t.n > 0);
  playable.sort((a, b) => (a.id === currentTaskId ? -1 : b.id === currentTaskId ? 1 : 0));
  const quizzes = (mine || []).filter((d) => d.kind === 'game' && !d.deletedAt);

  const play = async (taskId: string) => {
    setBusy(taskId);
    setError('');
    try {
      await hostClassTask(classId, itemId, taskId, guests);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const bring = async (id: string, title: string, start: boolean) => {
    setBusy(id);
    setError('');
    try {
      const snap = await getDoc(doc(db, 'sharedDocs', id, 'game', 'main'));
      const quiz = fromSaved(snap.data());
      if (!snap.exists() || quizProblems(quiz).length) throw Error('Open this quiz and finish its questions first.');
      const taskId = await quizIntoLesson(classId, itemId, quiz, title, id);
      setPickSaved(false);
      if (start) await hostClassTask(classId, itemId, taskId, guests);
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const make = async () => {
    if (!user) return;
    const w = window.open('about:blank', '_blank');
    try {
      const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'game', 'New quiz');
      if (w) w.location.href = '/doc/' + id;
      else window.location.href = '/doc/' + id;
    } catch {
      w?.close();
      setError('We couldn’t make a quiz just now. Try again.');
    }
  };
  const end = async () => {
    if (!running || !confirm('End the quiz that’s running? Everyone’s answers are kept.')) return;
    await quizApi('end', { runId: running.runId }).catch((e) => setError((e as Error).message));
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog wide lq-dialog" role="dialog" aria-label="Live quiz" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Live quiz</h2>
        {running ? (
          <div className="lq-banner">
            <div>
              <strong>{running.title} is running</strong>
              <br />
              <span>Code {running.code}. Learners in the class see a Join button in their lesson.</span>
            </div>
            <a className="qz-btn" href={'/quiz-host/' + running.runId} target="_blank" rel="noreferrer">
              Open the big screen
            </a>
            <button type="button" className="btn" onClick={() => void end()}>
              End it
            </button>
          </div>
        ) : (
          <p className="qe-hint">Put a question on the big screen. Learners answer on their phones, against the clock, and every answer is kept with the class.</p>
        )}
        {!pickSaved ? (
          <div className="lq-options">
            {playable.slice(0, 8).map((t) => (
              <button key={t.id} type="button" className="lq-option" disabled={!!busy || !!running} onClick={() => void play(t.id)}>
                <strong>
                  Play “{t.title || 'Task'}” live
                  {t.quiz ? <span className="lq-chip" style={{ marginLeft: 8 }}>Quiz</span> : null}
                </strong>
                <span>
                  {t.n} {t.n === 1 ? 'question' : 'questions'}
                  {busy === t.id ? ' · Starting…' : ''}
                </span>
              </button>
            ))}
            {playable.length === 0 && <p className="qe-hint">No task in this lesson has questions that can be marked yet. Bring in a saved quiz, or make a new one.</p>}
            <button type="button" className="lq-option" disabled={!!busy || !quizzes.length} onClick={() => setPickSaved(true)}>
              <strong>Bring in one of your quizzes</strong>
              <span>{quizzes.length ? 'It goes into this lesson as a task. Play it now or later.' : 'You don’t have any saved quizzes yet.'}</span>
            </button>
            <button type="button" className="lq-option" disabled={!!busy} onClick={() => void make()}>
              <strong>Make a new quiz</strong>
              <span>Opens the quiz editor in a new tab. Come back here to play it.</span>
            </button>
          </div>
        ) : (
          <div className="lq-options">
            {quizzes.map((q) => (
              <div key={q.id} className="lq-option lq-option-row">
                <strong>{q.title}</strong>
                <span className="qe-row">
                  <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => void bring(q.id, q.title, false)}>
                    Add to this lesson
                  </button>
                  <button type="button" className="btn small-btn primary" disabled={!!busy || !!running} onClick={() => void bring(q.id, q.title, true)}>
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
        {!running && (
          <label className="qe-check">
            <input type="checkbox" checked={guests} onChange={(e) => setGuests(e.target.checked)} /> Let people outside the class join with the code, as guests
          </label>
        )}
        {error && (
          <p className="qe-problem" role="alert">
            {error}
          </p>
        )}
        {runs.length > 0 && (
          <div className="qe-runs">
            <p className="qe-hint">Results of quizzes played in this class</p>
            {runs.map((r) => (
              <a key={r.id} href={'/quiz-results/' + r.id} target="_blank" rel="noreferrer">
                <span>{r.title}</span>
                <span>
                  {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {r.players} {r.players === 1 ? 'player' : 'players'}
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

/** In a learner's lesson: a quiz has started, join it. */
export function LearnerQuizBanner({ quiz }: { quiz: { runId: string; title: string } | null | undefined }) {
  if (!quiz?.runId) return null;
  return (
    <div className="lq-banner" role="status">
      <div>
        <strong>Live quiz: {quiz.title}</strong>
        <br />
        <span>Your teacher has started a quiz.</span>
      </div>
      <a className="qz-btn" href={'/quiz?run=' + encodeURIComponent(quiz.runId)}>
        Join
      </a>
    </div>
  );
}

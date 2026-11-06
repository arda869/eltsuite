// A game inside a lesson. The teacher starts it live (everyone together, the teacher runs the clock)
// or lets learners play it at their own pace. Learners play right here in the lesson, and their
// answers sit with the task's other answers.
import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { liveRef, type LiveState as ClassLive } from '../lib/live';
import { GamePlayer } from './PlayPage';
import { liveQuestions } from './model';
import { loadSeat, quizApi, saveSeat, useLive, type Seat } from './live';
import './quiz.css';

type Pointer = NonNullable<NonNullable<ClassLive['games']>[string]>;

/** The lesson this page is showing, from its address. */
export function lessonFromUrl() {
  const p = window.location.pathname;
  const teacher = p.match(/^\/class\/([^/]+)\/lesson\/([^/]+)/);
  if (teacher) return { classId: teacher[1], itemId: teacher[2] };
  const learner = p.match(/^\/learn\/([^/]+)/);
  return learner ? { classId: '', itemId: learner[1] } : null;
}

/** Start a lesson's game. Live opens the big screen in a new tab; at their own pace stays here. */
export async function startBlock(classId: string, itemId: string, blockId: string, mode: 'live' | 'self', guests = false) {
  const w = mode === 'live' ? window.open('about:blank', '_blank') : null;
  try {
    const r = await quizApi<{ runId: string }>('host', { source: { kind: 'block', classId, itemId, blockId }, mode, guests });
    if (mode === 'live') {
      if (w) w.location.href = '/game-host/' + r.runId;
      else window.location.href = '/game-host/' + r.runId;
    }
    return r.runId;
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** Which game is running for each block in a class. */
export function useClassGames(classId: string) {
  const [games, setGames] = useState<Record<string, Pointer | null>>({});
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(liveRef(classId), (s) => setGames((s.data()?.games as Record<string, Pointer | null>) || {}), () => {});
  }, [classId]);
  return games;
}

/** Teacher controls for a lesson's game: start it either way, or see and end the one running. */
export function GameControls({ classId, itemId, blockId, running, compact }: { classId: string; itemId: string; blockId: string; running?: Pointer | null; compact?: boolean }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const start = async (mode: 'live' | 'self') => {
    setBusy(mode);
    setError('');
    try {
      await startBlock(classId, itemId, blockId, mode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const end = async () => {
    if (!running || !confirm('End this game? Learners can’t answer after this. Their answers are kept.')) return;
    await quizApi('end', { runId: running.runId }).catch((e) => setError((e as Error).message));
  };
  return (
    <div className="ig-controls">
      {running ? (
        <>
          <span className="ig-running">
            {running.mode === 'self' ? 'Open for learners at their own pace' : 'Playing live'} · code {running.code}
          </span>
          <a className="btn small-btn" href={'/game-host/' + running.runId} target="_blank" rel="noreferrer">
            {running.mode === 'self' ? 'See progress' : 'Open the big screen'}
          </a>
          <button type="button" className="btn small-btn" onClick={() => void end()}>
            End game
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn small-btn primary" disabled={!!busy} onClick={() => void start('live')} title="Everyone plays together. You run the clock.">
            {busy === 'live' ? 'Starting…' : 'Play live'}
          </button>
          <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => void start('self')} title="Each learner plays on their own, at their own pace.">
            {busy === 'self' ? 'Starting…' : 'Let learners play at their own pace'}
          </button>
          {!compact && <span className="qe-hint">Save the lesson first if you’ve just changed the game.</span>}
        </>
      )}
      {error && (
        <p className="qe-problem" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The game in a task, as the teacher (teaching) or a learner sees it. */
export function InlineGame({ node, classId, teacher }: { node: JSONContent; classId?: string; teacher?: boolean }) {
  const id = String(node.attrs?.id || '');
  const title = String(node.attrs?.title || 'Game');
  const count = liveQuestions({ type: 'doc', content: node.content || [] }).length;
  const at = lessonFromUrl();
  const cls = classId || at?.classId || '';
  const games = useClassGames(cls);
  const running = games[id] || null;
  return (
    <section className="ig" aria-label={'Game: ' + title}>
      <header className="ig-head">
        <span className="ig-kicker">Game</span>
        <h3>{title}</h3>
        <span className="qe-hint">
          {count} {count === 1 ? 'question' : 'questions'}
        </span>
      </header>
      {teacher ? (
        cls && at?.itemId ? <GameControls classId={cls} itemId={at.itemId} blockId={id} running={running} /> : <p className="qe-hint">Open this lesson in a class to play the game.</p>
      ) : running ? (
        <LearnerGame runId={running.runId} />
      ) : (
        <p className="ig-wait">Your teacher will start this game.</p>
      )}
    </section>
  );
}

function LearnerGame({ runId }: { runId: string }) {
  const [seat, setSeat] = useState<Seat | null>(() => {
    const s = loadSeat();
    return s?.runId === runId ? s : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  const live = useLive(seat ? runId : null);
  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await quizApi<Seat>('join', { runId });
      const s = { runId: r.runId, pid: r.pid, token: r.token, name: r.name, member: r.member };
      saveSeat(s);
      setSeat(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!seat)
    return (
      <div className="ig-join">
        <p>The game has started.</p>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void join()}>
          {busy ? 'Joining…' : 'Join the game'}
        </button>
        {error && <p className="qe-problem">{error}</p>}
      </div>
    );
  if (!live) return <p className="qe-hint">{live === false ? 'This game has finished.' : 'One moment…'}</p>;
  return (
    <div className={'ig-player' + (full ? ' full' : '')}>
      <button type="button" className="btn small-btn ig-full" onClick={() => setFull((v) => !v)}>
        {full ? 'Back to the lesson' : 'Full screen'}
      </button>
      <GamePlayer seat={seat} live={live} inline={!full} onLeave={() => (saveSeat(null), setSeat(null))} />
    </div>
  );
}

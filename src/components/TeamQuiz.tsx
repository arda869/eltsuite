import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { loadKey, type AnswerKey, type Responses, type Task } from '../lib/tasks';
import { setLive } from '../lib/live';
import { blockFor, endQuiz, makeTeams, patchQuiz, quizQuestions, scoreRound, sendQuizAnswer, startQuiz, TEAM_COLORS, TEAM_NAMES, teamOf, useQuiz, type QuizState, type Team } from '../lib/quiz';
import type { GroupSet } from '../lib/groups';
import { TaskRenderer } from './TaskRenderer';

// Team quiz: a task's auto-marked questions become a live team race with a timer per question,
// points for speed and accuracy, a leaderboard after each question and a podium at the end.

function Countdown({ startedAt, seconds, onEnd }: { startedAt: number; seconds: number; onEnd?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const ended = useRef(false);
  useEffect(() => {
    ended.current = false;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [startedAt]);
  const left = Math.max(0, startedAt + seconds * 1000 - now);
  useEffect(() => {
    if (left === 0 && !ended.current) {
      ended.current = true;
      onEnd?.();
    }
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'tq-timer' + (left < 5000 ? ' soon' : '')} role="timer">
      <span className="tq-timer-bar">
        <span style={{ width: `${(left / (seconds * 1000)) * 100}%` }} />
      </span>
      <span className="tq-timer-n">{Math.ceil(left / 1000)}</span>
    </div>
  );
}

function Leaderboard({ q, big }: { q: QuizState; big?: boolean }) {
  const rows = Object.entries(q.teams)
    .map(([id, t]) => ({ id, t, s: q.scores?.[id] ?? 0, g: q.gained?.[id] ?? 0 }))
    .sort((a, b) => b.s - a.s);
  const max = Math.max(1, ...rows.map((r) => r.s));
  return (
    <ol className={'tq-board' + (big ? ' big' : '')}>
      {rows.map((r, i) => (
        <li key={r.id} style={{ ['--c' as string]: r.t.color, animationDelay: `${i * 70}ms` }}>
          <span className="tq-rank">{i + 1}</span>
          <span className="tq-team">{r.t.name}</span>
          <span className="tq-bar">
            <span style={{ width: `${(r.s / max) * 100}%` }} />
          </span>
          <span className="tq-score">
            {r.s}
            {q.phase === 'reveal' && r.g > 0 && <span className="tq-gain">+{r.g}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Podium({ q }: { q: QuizState }) {
  const rows = Object.entries(q.teams)
    .map(([id, t]) => ({ id, t, s: q.scores?.[id] ?? 0 }))
    .sort((a, b) => b.s - a.s);
  const place = [rows[1], rows[0], rows[2]];
  return (
    <div className="tq-podium">
      {place.map((r, i) =>
        r ? (
          <div key={r.id} className={'tq-step p' + [2, 1, 3][i]} style={{ ['--c' as string]: r.t.color }}>
            <span className="tq-step-name">{r.t.name}</span>
            <span className="tq-step-score">{r.s}</span>
            <span className="tq-step-block">{[2, 1, 3][i]}</span>
          </div>
        ) : (
          <div key={i} className="tq-step empty" />
        ),
      )}
      {rows.length > 3 && (
        <ol className="tq-rest" start={4}>
          {rows.slice(3).map((r) => (
            <li key={r.id}>
              {r.t.name} · {r.s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type Person = { id: string; name: string };

export function TeacherQuiz({ classId, itemId, tasks, taskId, roster, online, activeSet, onClose }: { classId: string; itemId: string; tasks: Task[]; taskId: string; roster: Person[]; online: string[]; activeSet?: GroupSet; onClose: () => void }) {
  const q = useQuiz(classId);
  const [pick, setPick] = useState(taskId);
  const [seconds, setSeconds] = useState(20);
  const [source, setSource] = useState<'groups' | 'random'>(activeSet ? 'groups' : 'random');
  const [n, setN] = useState(2);
  const [key, setKey] = useState<AnswerKey | null>(null);
  const task = tasks.find((t) => t.id === (q?.taskId ?? pick));
  const usable = tasks.filter((t) => t.kind !== 'section' && quizQuestions(t.content).length > 0);
  useEffect(() => {
    if (task) loadKey(classId, itemId, task.id).then(setKey).catch(() => setKey(null));
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = useMemo(() => quizQuestions(task?.content ?? null), [task]);

  async function start() {
    if (!task) return;
    const people = online.length ? roster.filter((r) => online.includes(r.id)) : roster;
    const teams: Record<string, Team> =
      source === 'groups' && activeSet
        ? Object.fromEntries(activeSet.groups.filter((g) => g.members.length).map((g, i) => ['t' + i, { name: g.name, color: TEAM_COLORS[i % TEAM_COLORS.length], members: g.members }]))
        : makeTeams(people.map((p) => p.id), Math.max(2, Math.min(n, people.length || 2)));
    await startQuiz(classId, { itemId, taskId: task.id, title: task.title, qids: qs.map((x) => x.id), teams, seconds, i: 0, phase: 'lobby', startedAt: Date.now(), scores: Object.fromEntries(Object.keys(teams).map((t) => [t, 0])) });
    setLive(classId, { quiz: true }).catch(() => {});
  }
  const go = (i: number) => patchQuiz(classId, { i, phase: 'question', startedAt: Date.now(), results: null, gained: null });
  async function reveal() {
    if (!q || q.phase !== 'question' || !key) return;
    const r = scoreRound(q, key);
    await patchQuiz(classId, { phase: 'reveal', ...r });
  }
  async function stop() {
    await endQuiz(classId).catch(() => {});
    setLive(classId, { quiz: null }).catch(() => {});
    onClose();
  }
  const qid = q?.qids?.[q.i];
  const answeredN = qid ? Object.values(q?.answers ?? {}).filter((a) => a[qid]).length : 0;
  const players = Object.values(q?.teams ?? {}).reduce((s, t) => s + (t.members?.length ?? 0), 0);
  useEffect(() => {
    if (q?.phase === 'question' && players > 0 && answeredN >= players) reveal();
  }, [answeredN]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealedKey = q?.phase === 'reveal' && key && qid ? { [qid]: key[qid] } : null;

  return (
    <div className="tq-overlay" role="dialog" aria-label="Team quiz">
      <div className="tq-frame">
        <div className="tq-top">
          <span className="eyebrow accent">Team quiz</span>
          {q && <span className="hint">{q.title}{q.phase !== 'lobby' && q.phase !== 'podium' ? ` · question ${q.i + 1} of ${q.qids.length}` : ''}</span>}
          <button type="button" className="btn small-btn" style={{ marginLeft: 'auto' }} onClick={q ? stop : onClose}>
            {q ? 'End the quiz' : 'Close'}
          </button>
        </div>
        {!q ? (
          <div className="tq-setup">
            <h2>Start a team quiz</h2>
            <label className="field">
              <span>Questions from</span>
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                {usable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {quizQuestions(t.content).length} questions
                  </option>
                ))}
              </select>
            </label>
            {!usable.some((t) => t.id === pick) && <span className="hint">This task has no questions that can be marked automatically. Choose another task.</span>}
            <label className="field">
              <span>Time for each question</span>
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[10, 20, 30, 45, 60, 90].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Teams</span>
              <span className="seg small-seg">
                <button type="button" className={source === 'groups' ? 'on' : ''} disabled={!activeSet} onClick={() => setSource('groups')}>
                  {activeSet ? `Groups: ${activeSet.name}` : 'Groups (none in use)'}
                </button>
                <button type="button" className={source === 'random' ? 'on' : ''} onClick={() => setSource('random')}>
                  Random teams
                </button>
              </span>
              {source === 'random' && (
                <select value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Number of teams">
                  {[2, 3, 4, 5, 6].map((x) => (
                    <option key={x} value={x}>
                      {x} teams ({TEAM_NAMES.slice(0, x).join(', ')})
                    </option>
                  ))}
                </select>
              )}
              <span className="hint">{online.length ? `${online.length} learners in the lesson take part.` : 'Everyone in the class takes part.'} Points: 500 to 1000 for a right answer, more for a fast one. A team gets its members’ average.</span>
            </div>
            <button type="button" className="btn primary tall" disabled={!usable.some((t) => t.id === pick)} onClick={start}>
              Start
            </button>
          </div>
        ) : q.phase === 'lobby' ? (
          <div className="tq-lobby">
            <h2>Teams</h2>
            <div className="tq-teams">
              {Object.entries(q.teams).map(([id, t]) => (
                <div key={id} className="tq-team-card" style={{ ['--c' as string]: t.color }}>
                  <span className="tq-team-name">{t.name}</span>
                  <span className="tq-team-people">{(t.members ?? []).map((m) => roster.find((r) => r.id === m)?.name.split(' ')[0] ?? '…').join(', ')}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn primary tall" onClick={() => go(0)}>
              First question
            </button>
          </div>
        ) : q.phase === 'podium' ? (
          <div className="tq-end">
            <h2>Final results</h2>
            <Podium q={q} />
            <button type="button" className="btn primary" onClick={stop}>
              Finish
            </button>
          </div>
        ) : (
          <div className="tq-play">
            {q.phase === 'question' && <Countdown startedAt={q.startedAt} seconds={q.seconds} onEnd={reveal} />}
            <div className="tq-question">
              <TaskRenderer content={blockFor(task?.content ?? null, qid ?? '')} responses={{}} disabled teacher revealed={revealedKey} />
            </div>
            <div className="tq-foot">
              {q.phase === 'question' ? (
                <>
                  <span className="hint">
                    {answeredN} of {players} answered
                  </span>
                  <button type="button" className="btn primary" onClick={reveal}>
                    Show the answer
                  </button>
                </>
              ) : (
                <>
                  <Leaderboard q={q} />
                  <button type="button" className="btn primary" onClick={() => (q.i + 1 < q.qids.length ? go(q.i + 1) : patchQuiz(classId, { phase: 'podium' }))}>
                    {q.i + 1 < q.qids.length ? 'Next question' : 'Final results'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Learner: the quiz takes over the screen while it runs.
export function LearnerQuiz({ classId, uid, learnerId, content }: { classId: string; uid: string; learnerId: string; content: (taskId: string) => JSONContent | null }) {
  const q = useQuiz(classId);
  const [local, setLocal] = useState<Responses>({});
  const qid = q?.qids?.[q.i];
  const sent = qid ? q?.answers?.[uid]?.[qid] : undefined;
  useEffect(() => setLocal({}), [qid]);
  if (!q) return null;
  const team = teamOf(q, learnerId);
  const res = q.results?.[uid];
  const mine = team?.[1];
  return (
    <div className="tq-overlay learner" role="dialog" aria-label="Team quiz" style={{ ['--c' as string]: mine?.color ?? 'var(--accent)' }}>
      <div className="tq-frame">
        <div className="tq-top">
          <span className="eyebrow accent">Team quiz</span>
          {mine ? <span className="tq-you">Team {mine.name}</span> : <span className="hint">You’re watching this one</span>}
          {q.phase === 'question' || q.phase === 'reveal' ? <span className="hint" style={{ marginLeft: 'auto' }}>Question {q.i + 1} of {q.qids.length}</span> : null}
        </div>
        {q.phase === 'lobby' && (
          <div className="tq-lobby">
            <h2>{mine ? `You’re in Team ${mine.name}` : 'Get ready'}</h2>
            <p className="hint">The first question is coming. Fast right answers win more points.</p>
          </div>
        )}
        {q.phase === 'question' && qid && (
          <div className="tq-play">
            <Countdown startedAt={q.startedAt} seconds={q.seconds} />
            <div className="tq-question">
              <TaskRenderer content={blockFor(content(q.taskId), qid)} responses={sent ? { [qid]: sent.v } : local} onChange={(id, v) => !sent && setLocal((r) => ({ ...r, [id]: v }))} disabled={!!sent || !mine} />
            </div>
            <div className="tq-foot">
              {sent ? (
                <span className="tq-locked">Answer locked in. Wait for the others…</span>
              ) : (
                <button type="button" className="btn primary tall" disabled={!mine || local[qid] === undefined} onClick={() => sendQuizAnswer(classId, uid, qid, local[qid], learnerId)}>
                  Lock in my answer
                </button>
              )}
            </div>
          </div>
        )}
        {q.phase === 'reveal' && (
          <div className="tq-reveal">
            {mine && (
              <div className={'tq-result' + (res?.ok ? ' ok' : '')}>
                <span className="tq-result-big">{res ? (res.ok ? 'Correct!' : res.pts > 0 ? 'Partly right' : 'Not this time') : 'No answer'}</span>
                {res && res.pts > 0 && <span className="tq-result-pts">+{res.pts}</span>}
              </div>
            )}
            <Leaderboard q={q} big />
          </div>
        )}
        {q.phase === 'podium' && (
          <div className="tq-end">
            <h2>Final results</h2>
            <Podium q={q} />
          </div>
        )}
      </div>
    </div>
  );
}

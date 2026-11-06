// Results of one game: who played, their points and place, each question right or wrong, and the
// questions the room found hardest. Kept for as long as the teacher wants it, with a spreadsheet download.
// In a class, each learner's answers are also in the class's answers, like any other task.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fmt, ordinal } from './Stage';
import './quiz.css';

type Run = { title: string; createdAt: number; endedAt?: number; slides: number; labels?: string[]; kinds?: string[]; classId?: string | null; source?: { kind: string; classId?: string; itemId?: string; taskId?: string; id?: string }; status: string; code: string };
type Player = { id: string; name: string; score: number; got: number; max: number; kicked?: boolean; uid?: string; slides?: Record<string, { pts: number; frac: number | null; answered: boolean }> };

export function ResultsPage() {
  const { runId = '' } = useParams();
  const [run, setRun] = useState<Run | null | false>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const r = await getDoc(doc(db, 'quizRuns', runId));
        if (!r.exists()) return setRun(false);
        setRun(r.data() as Run);
        const p = await getDocs(collection(db, 'quizRuns', runId, 'players'));
        setPlayers(p.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Player, 'id'>) })).filter((x) => !x.kicked).sort((a, b) => (b.score || 0) - (a.score || 0)));
      } catch {
        setRun(false);
      }
    })();
  }, [runId]);
  if (run === null) return <main className="qr"><p role="status">One moment…</p></main>;
  if (run === false) return <main className="qr"><h1>We can’t find these results.</h1><p>They may belong to another teacher, or the game was removed.</p></main>;

  const n = run.slides;
  const labels = Array.from({ length: n }, (_, i) => run.labels?.[i] || `Question ${i + 1}`);
  const polls = new Set((run.kinds || []).map((k, i) => (k === 'poll' ? i : -1)).filter((i) => i >= 0));
  const cell = (p: Player, i: number) => {
    const s = p.slides?.[i];
    if (polls.has(i)) return s?.answered ? 'x' : 'n';
    if (!s || !s.answered) return 'n';
    return s.frac === 1 ? 'r' : s.frac && s.frac > 0 ? 'p' : 'w';
  };
  const perQ = labels.map((_, i) => {
    const c = { r: 0, p: 0, w: 0, n: 0, x: 0 };
    players.forEach((p) => c[cell(p, i) as keyof typeof c]++);
    return c;
  });
  const asked = labels.map((_, i) => i).filter((i) => !polls.has(i) && players.some((p) => p.slides?.[i]));
  const hardest = [...asked].sort((a, b) => perQ[a].r / Math.max(1, players.length) - perQ[b].r / Math.max(1, players.length)).slice(0, 3);
  const totalRight = players.reduce((s, p) => s + (p.got || 0), 0);
  const totalMax = players.reduce((s, p) => s + (p.max || 0), 0);
  const word = { r: 'Right', p: 'Partly right', w: 'Not right', n: 'No answer', x: 'Answered' };

  const csv = () => {
    const rows = [['Place', 'Name', 'Points', 'Right', 'Out of', ...labels.map((l, i) => `Q${i + 1}: ${l}`)], ...players.map((p, k) => [String(k + 1), p.name, String(p.score || 0), String(p.got || 0), String(p.max || 0), ...labels.map((_, i) => word[cell(p, i) as keyof typeof word])])];
    const text = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = `${run.title.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80)} results.csv`;
    a.click();
  };

  const lessonLink = run.source?.kind === 'class' ? `/class/${run.source.classId}/lesson/${run.source.itemId}?task=${run.source.taskId}` : '';
  return (
    <main className="qr">
      <div>
        <p className="qe-hint">Game results</p>
        <h1>{run.title}</h1>
        <p className="qe-hint">
          {new Date(run.createdAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          {run.status !== 'ended' ? ' · still open' : ''}
        </p>
      </div>
      <div className="qr-facts">
        <div className="qr-fact">
          <b>{players.length}</b>
          <span>{players.length === 1 ? 'player' : 'players'}</span>
        </div>
        <div className="qr-fact">
          <b>{n}</b>
          <span>{n === 1 ? 'question' : 'questions'}</span>
        </div>
        <div className="qr-fact">
          <b>{totalMax ? Math.round((totalRight / totalMax) * 100) + '%' : '–'}</b>
          <span>of answers right</span>
        </div>
        {players[0] && (
          <div className="qr-fact">
            <b>{players[0].name}</b>
            <span>won with {fmt(players[0].score || 0)} points</span>
          </div>
        )}
      </div>
      <div className="qe-row">
        <button type="button" className="btn primary" onClick={csv} disabled={!players.length}>
          Download as a spreadsheet
        </button>
        {lessonLink && (
          <a className="btn" href={lessonLink}>
            See the answers in the lesson
          </a>
        )}
        {run.status !== 'ended' && (
          <a className="btn" href={'/game-host/' + runId}>
            Back to the big screen
          </a>
        )}
      </div>
      {lessonLink && <p className="qe-hint">Each learner’s answers are also saved with the class, in the lesson’s task, with their other answers.</p>}

      {hardest.length > 0 && (
        <section>
          <h2>Worth going over</h2>
          <p className="qe-hint">The questions the fewest players got right.</p>
          {hardest.map((i) => (
            <div key={i} className="qr-q">
              <b>{i + 1}</b>
              <span>{labels[i]}</span>
              <span>
                <span className="qr-q-bar" aria-label={`${perQ[i].r} right, ${perQ[i].p} partly right, ${perQ[i].w} not right`}>
                  <i className="r" style={{ width: `${(perQ[i].r / Math.max(1, players.length)) * 100}%` }} />
                  <i className="p" style={{ width: `${(perQ[i].p / Math.max(1, players.length)) * 100}%` }} />
                  <i className="w" style={{ width: `${(perQ[i].w / Math.max(1, players.length)) * 100}%` }} />
                </span>
                <small className="qe-hint">
                  {perQ[i].r} of {players.length} right
                </small>
              </span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Every player</h2>
        {players.length === 0 ? (
          <p className="qe-hint">Nobody played this game.</p>
        ) : (
          <div className="qr-scroll">
            <table className="qr-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Name</th>
                  <th className="num">Points</th>
                  <th className="num">Right</th>
                  {labels.map((l, i) => (
                    <th key={i} title={l}>
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, k) => (
                  <tr key={p.id}>
                    <td>{ordinal(k + 1)}</td>
                    <td>
                      {p.name}
                      {p.uid ? '' : <span className="qe-hint"> · guest</span>}
                    </td>
                    <td className="num">{fmt(p.score || 0)}</td>
                    <td className="num">
                      {p.got || 0}/{p.max || 0}
                    </td>
                    {labels.map((_, i) => {
                      const c = cell(p, i);
                      return (
                        <td key={i}>
                          <span className={'qr-cell ' + c} title={`${labels[i]}: ${word[c as keyof typeof word]}`} aria-label={word[c as keyof typeof word]} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="qe-hint">
          <span className="qr-cell r" /> right <span className="qr-cell p" /> partly right <span className="qr-cell w" /> not right <span className="qr-cell n" /> no answer <span className="qr-cell x" /> poll
        </p>
      </section>
    </main>
  );
}

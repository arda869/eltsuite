// What players see on their own screens: the question, the answers coming in, the right answer with its
// explanation, the leaderboard and the final places. A learner sees everything the big screen shows,
// so a game works even when the teacher isn't sharing a screen.
import type { ReactNode } from 'react';
import { TaskRenderer } from '../components/TaskRenderer';
import type { AnswerKey, Responses } from '../lib/questions';
import { Flame, Medal, Shape, answerStyle, fmt, ordinal } from './Stage';
import { leaders, type LivePlayer, type LiveSlide } from './live';

export const kicker = (q: Pick<LiveSlide, 'index' | 'total' | 'poll' | 'points'>) =>
  `Question ${q.index + 1} of ${q.total}${q.poll ? ' · Poll' : q.points === 2 ? ' · Double points' : q.points === 0 ? ' · No points' : ''}`;

/** The question as the big screen shows it, sized for a phone or a lesson page. */
export function QuestionCard({ q, children, results, responses }: { q: LiveSlide; children?: ReactNode; results?: AnswerKey | null; responses?: Responses }) {
  return (
    <section className="qz-qcard" aria-label={kicker(q)}>
      <p className="qz-kicker">{kicker(q)}</p>
      {q.kind === 'choice' ? (
        <>
          {q.lead && (
            <div className="qz-qcard-lead">
              <TaskRenderer content={q.lead} responses={{}} disabled />
            </div>
          )}
          <h2 className="qz-qcard-prompt">{q.prompt}</h2>
          {q.multi && <p className="qz-sub">Choose every right answer.</p>}
        </>
      ) : (
        !children && (
          <div className="qz-qcard-task">
            <TaskRenderer content={q.content || null} responses={responses || {}} results={results || undefined} disabled />
          </div>
        )
      )}
      {children}
    </section>
  );
}

/** The answers with the right ones marked and, live, how many chose each. */
export function RevealOptions({ q, correct, counts, mine = [] }: { q: LiveSlide; correct: number[] | null | undefined; counts?: number[]; mine?: number[] }) {
  const right = new Set(correct || []);
  const most = Math.max(1, ...(counts || [1]));
  return (
    <ul className="qz-reveal-list">
      {(q.options || []).map((o, i) => {
        const ok = q.poll || right.has(i);
        return (
          <li key={i} className={'qz-reveal-row' + (ok ? ' right' : ' dim') + (mine.includes(i) ? ' mine' : '')} style={answerStyle(i)}>
            <Shape i={i} size={26} />
            <span className="qz-reveal-text">
              {o}
              {mine.includes(i) && <small> · your answer</small>}
            </span>
            {counts && (
              <span className="qz-reveal-count">
                <i style={{ width: `${((counts[i] || 0) / most) * 100}%` }} />
                <b>{counts[i] || 0}</b>
              </span>
            )}
            {!q.poll && right.has(i) && <span className="qz-reveal-tick" aria-label="Right answer">✓</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The explanation the teacher added, if any. */
export function Explanation({ keyed }: { keyed?: AnswerKey | null }) {
  const note = Object.values(keyed || {}).map((k) => k.feedback).filter(Boolean)[0];
  return note ? <p className="qz-note">{note}</p> : null;
}

/** How this player did on the question that's just closed. */
export function ResultBanner({ tone, title, gained, streak, line }: { tone: string; title: string; gained?: number; streak?: number; line?: string }) {
  return (
    <div className={'qz-banner ' + tone} role="status">
      <strong>{title}</strong>
      {!!gained && <b className="qz-banner-gain">+{fmt(gained)}</b>}
      {(streak || 0) >= 2 && tone === 'right' && (
        <span className="qz-banner-streak">
          <Flame size={18} /> {streak} in a row
        </span>
      )}
      {line && <span className="qz-banner-line">{line}</span>}
    </div>
  );
}

/** The top of the leaderboard, with this player shown even when they're further down. */
export function LeaderList({ players, me, top = 5 }: { players: Record<string, LivePlayer>; me?: string; top?: number }) {
  const all = leaders(players);
  const mine = all.findIndex((p) => p.id === me);
  const rows = all.slice(0, top);
  return (
    <ol className="qz-leaderlist">
      {rows.map((p, i) => (
        <li key={p.id} className={p.id === me ? 'me' : ''}>
          <span className="qz-ll-place">{i + 1}</span>
          <span className="qz-ll-name">
            {p.n}
            {(p.k || 0) >= 2 && (
              <span className="qz-streak">
                <Flame size={14} /> {p.k}
              </span>
            )}
          </span>
          <span className="qz-ll-score">{fmt(p.s || 0)}</span>
        </li>
      ))}
      {mine >= top && (
        <li className="me gap">
          <span className="qz-ll-place">{mine + 1}</span>
          <span className="qz-ll-name">{all[mine].n}</span>
          <span className="qz-ll-score">{fmt(all[mine].s || 0)}</span>
        </li>
      )}
      {!rows.length && <li className="qz-ll-empty">No scores yet.</li>}
    </ol>
  );
}

/** The top three with their medals. */
export function Winners({ players }: { players: Record<string, LivePlayer> }) {
  const top = leaders(players).slice(0, 3);
  return (
    <div className="qz-winners">
      {top.map((p, i) => (
        <div key={p.id} className={'qz-winner w' + (i + 1)}>
          <Medal place={(i + 1) as 1 | 2 | 3} size={i === 0 ? 70 : 56} />
          <b>{p.n}</b>
          <span>{fmt(p.s || 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function placeLine(place: number, score = 0, players: Record<string, LivePlayer>) {
  const all = leaders(players);
  if (place <= 0) return '';
  if (place === 1) return 'You’re in the lead.';
  const ahead = all[place - 2];
  if (!ahead) return `You’re ${ordinal(place)}.`;
  const gap = Math.max(0, (ahead.s || 0) - (score || 0));
  return gap ? `${ordinal(place)}, ${fmt(gap)} behind ${ahead.n}.` : `${ordinal(place)}, level with ${ahead.n}.`;
}

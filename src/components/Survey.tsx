import { useEffect, useState } from 'react';
import { downloadCsv, FACES, optionsOf, shareResults, submitSurvey, summarise, THUMBS, toCsv, useMySurvey, useResponses, useSharedResults, type QResult, type SurveyAnswer, type SurveyQ, type Summary } from '../lib/survey';

// Faces and thumbs, drawn in the app's line style.
export function Face({ n, size = 30 }: { n: number; size?: number }) {
  const mouth = ['M8 17c2-3 6-3 8 0', 'M8.5 16.5c2-1.5 5-1.5 7 0', 'M8.5 15.5h7', 'M8.5 14.5c2 1.5 5 1.5 7 0', 'M8 14c2 3.5 6 3.5 8 0'][n];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="9" cy="10" r="0.6" fill="currentColor" />
      <circle cx="15" cy="10" r="0.6" fill="currentColor" />
      <path d={mouth} />
    </svg>
  );
}
export function Thumb({ n, size = 30 }: { n: number; size?: number }) {
  const rot = [180, 90, 0][n];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H18a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7" />
    </svg>
  );
}

// One question, as the learner answers it.
export function SurveyInput({ q, value, onChange, disabled }: { q: SurveyQ; value: SurveyAnswer | undefined; onChange: (v: SurveyAnswer) => void; disabled?: boolean }) {
  const opts = optionsOf(q);
  switch (q.type) {
    case 'scale':
      return (
        <div className="sv-scale">
          <span className="sv-end">{q.low}</span>
          <span className="sv-nums" role="radiogroup">
            {opts.map((o, i) => (
              <button key={i} type="button" role="radio" aria-checked={value === i} className={value === i ? 'on' : ''} disabled={disabled} onClick={() => onChange(value === i ? null : i)}>
                {o}
              </button>
            ))}
          </span>
          <span className="sv-end">{q.high}</span>
        </div>
      );
    case 'emoji':
    case 'thumbs':
      return (
        <span className="sv-icons" role="radiogroup">
          {opts.map((o, i) => (
            <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={o} title={o} className={value === i ? 'on' : ''} disabled={disabled} onClick={() => onChange(value === i ? null : i)}>
              {q.type === 'emoji' ? <Face n={i} /> : <Thumb n={i} />}
            </button>
          ))}
        </span>
      );
    case 'single':
    case 'multi': {
      const picked = Array.isArray(value) ? value : typeof value === 'number' ? [value] : [];
      return (
        <span className="sv-choices">
          {opts.map((o, i) => {
            const on = picked.includes(i);
            return (
              <button key={i} type="button" className={'sv-choice' + (on ? ' on' : '')} aria-pressed={on} disabled={disabled} onClick={() => (q.type === 'single' ? onChange(on ? null : i) : onChange(on ? picked.filter((x) => x !== i) : [...picked, i].sort()))}>
                <span className={q.type === 'multi' ? 'radio square' : 'radio'} aria-hidden="true" />
                {o}
              </button>
            );
          })}
        </span>
      );
    }
    case 'rank': {
      const order: number[] = Array.isArray(value) && value.length === opts.length ? value : opts.map((_, i) => i);
      const move = (from: number, to: number) => {
        if (to < 0 || to >= order.length) return;
        const next = [...order];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        onChange(next);
      };
      return (
        <ol className="sv-rank">
          {order.map((o, pos) => (
            <li key={o}>
              <span className="pq-sent-n">{pos + 1}</span>
              <span className="sv-rank-text">{opts[o]}</span>
              <button type="button" className="icon-btn" aria-label="Move up" disabled={disabled || pos === 0} onClick={() => move(pos, pos - 1)}>
                ↑
              </button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={disabled || pos === order.length - 1} onClick={() => move(pos, pos + 1)}>
                ↓
              </button>
            </li>
          ))}
        </ol>
      );
    }
    case 'text':
      return <textarea className="sv-text" rows={3} value={typeof value === 'string' ? value : ''} disabled={disabled} placeholder="Write your answer" onChange={(e) => onChange(e.target.value)} />;
  }
}

// Results for one question: bars, average places, or a list of answers.
export function QuestionResult({ q, r }: { q: SurveyQ; r?: QResult }) {
  const opts = optionsOf(q);
  if (!r || !r.n) return <span className="hint">No answers yet.</span>;
  if (q.type === 'text')
    return (
      <ul className="sv-texts">
        {(r.texts ?? []).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    );
  if (q.type === 'rank') {
    const order = opts.map((o, i) => ({ o, a: r.avgRank?.[i] ?? 0 })).sort((x, y) => x.a - y.a);
    return (
      <ol className="sv-rank-result">
        {order.map((x, i) => (
          <li key={x.o}>
            <span className="pq-sent-n">{i + 1}</span>
            {x.o}
            <span className="hint">average place {x.a.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    );
  }
  const max = Math.max(1, ...(r.counts ?? []));
  const total = q.type === 'multi' ? r.n : (r.counts ?? []).reduce((s, x) => s + x, 0) || 1;
  return (
    <div className="sv-bars">
      {opts.map((o, i) => {
        const c = r.counts?.[i] ?? 0;
        return (
          <span key={i} className="sv-bar-row">
            <span className="sv-bar-label">{q.type === 'emoji' ? <Face n={i} size={20} /> : q.type === 'thumbs' ? <Thumb n={i} size={20} /> : o}</span>
            <span className="sv-bar">
              <span style={{ width: `${(c / max) * 100}%` }} className={c === max && c > 0 ? 'top' : ''} />
            </span>
            <span className="sv-bar-n">
              {c} <span className="hint">{Math.round((c / total) * 100)}%</span>
            </span>
          </span>
        );
      })}
      {r.mean !== undefined && <span className="hint">Average {r.mean.toFixed(1)} out of {q.max ?? 5}</span>}
    </div>
  );
}

export function ResultsView({ questions, summary }: { questions: SurveyQ[]; summary: Summary }) {
  return (
    <div className="sv-results">
      {questions.map((q, i) => (
        <div key={q.id} className="sv-res-q">
          <span className="sv-q-prompt">
            {questions.length > 1 && <span className="pq-n">{i + 1}</span>}
            {q.prompt}
          </span>
          <QuestionResult q={q} r={summary[q.id]} />
        </div>
      ))}
    </div>
  );
}

type Me = { uid: string; learnerId: string; name: string };

// The survey in a task. Learners answer and submit; the teacher sees results live and can share them.
export function SurveyBlock({ attrs, classId, me, teacher, itemId, taskId }: { attrs: { id: string; title?: string; anonymous?: boolean; questions?: SurveyQ[] }; classId?: string; me?: Me; teacher?: boolean; itemId?: string; taskId?: string }) {
  const questions = (attrs.questions ?? []).filter((q) => q.prompt?.trim() || q.type);
  const anonymous = !!attrs.anonymous;
  return (
    <section className="sv-block">
      <span className="sv-head">
        <span className="eyebrow">Survey</span>
        <span className="sv-anon">{anonymous ? 'Anonymous' : 'Your name is shown to your teacher'}</span>
      </span>
      {attrs.title && <h3 className="sv-title">{attrs.title}</h3>}
      {teacher && classId ? <TeacherResults classId={classId} surveyId={attrs.id} questions={questions} anonymous={anonymous} title={attrs.title || 'Survey'} /> : me && classId ? <LearnerSurvey classId={classId} surveyId={attrs.id} questions={questions} anonymous={anonymous} me={me} itemId={itemId} taskId={taskId} /> : <PreviewSurvey questions={questions} />}
    </section>
  );
}

function PreviewSurvey({ questions }: { questions: SurveyQ[] }) {
  const [a, setA] = useState<Record<string, SurveyAnswer>>({});
  return (
    <div className="sv-form">
      {questions.map((q, i) => (
        <div key={q.id} className="sv-q">
          <span className="sv-q-prompt">
            {questions.length > 1 && <span className="pq-n">{i + 1}</span>}
            {q.prompt}
          </span>
          <SurveyInput q={q} value={a[q.id]} onChange={(v) => setA((x) => ({ ...x, [q.id]: v }))} />
        </div>
      ))}
    </div>
  );
}

export function LearnerSurvey({ classId, surveyId, questions, anonymous, me, itemId, taskId, onDone }: { classId: string; surveyId: string; questions: SurveyQ[]; anonymous: boolean; me: Me; itemId?: string; taskId?: string; onDone?: () => void }) {
  const { done, mine } = useMySurvey(classId, surveyId, me.uid, anonymous);
  const [a, setA] = useState<Record<string, SurveyAnswer>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const shared = useSharedResults(classId, surveyId);
  useEffect(() => {
    if (mine) setA(mine);
  }, [mine]);
  const answered = questions.filter((q) => a[q.id] !== undefined && a[q.id] !== null && a[q.id] !== '').length;
  async function send() {
    setBusy(true);
    try {
      await submitSurvey(classId, { surveyId, itemId, taskId, anonymous, uid: me.uid, learnerId: me.learnerId, name: me.name, answers: a });
      setEditing(false);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }
  if (done && !editing)
    return (
      <div className="sv-thanks">
        <span className="sv-check" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <span>Thank you! Your answers have been sent.</span>
        {!anonymous && (
          <button type="button" className="btn link small" onClick={() => setEditing(true)}>
            Change my answers
          </button>
        )}
        {shared && <ResultsView questions={questions} summary={shared} />}
      </div>
    );
  return (
    <div className="sv-form">
      {questions.map((q, i) => (
        <div key={q.id} className="sv-q">
          <span className="sv-q-prompt">
            {questions.length > 1 && <span className="pq-n">{i + 1}</span>}
            {q.prompt}
          </span>
          <SurveyInput q={q} value={a[q.id]} onChange={(v) => setA((x) => ({ ...x, [q.id]: v }))} />
        </div>
      ))}
      <span className="sv-send">
        <button type="button" className="btn primary" disabled={busy || answered === 0 || done === null} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        {anonymous && <span className="hint">Anonymous: your teacher sees the answers but not who wrote them.</span>}
      </span>
    </div>
  );
}

export function TeacherResults({ classId, surveyId, questions, anonymous, title }: { classId: string; surveyId: string; questions: SurveyQ[]; anonymous: boolean; title: string }) {
  const responses = useResponses(classId, surveyId);
  const shared = useSharedResults(classId, surveyId);
  const summary = summarise(questions, responses);
  // Keep shared results up to date while they are shown to the class.
  const sig = JSON.stringify(summary);
  useEffect(() => {
    if (shared) shareResults(classId, surveyId, summary).catch(() => {});
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sv-teacher">
      <span className="sv-t-bar">
        <span className="hint">
          {responses.length} {responses.length === 1 ? 'answer' : 'answers'}
          {anonymous ? ' · anonymous' : ''}
        </span>
        <button type="button" className={'btn small-btn' + (shared ? ' on-accent' : '')} onClick={() => shareResults(classId, surveyId, shared ? null : summary)}>
          {shared ? 'Shown to the class · hide' : 'Show results to the class'}
        </button>
        <button type="button" className="btn small-btn" disabled={!responses.length} onClick={() => downloadCsv(title, toCsv(questions, responses, anonymous))}>
          CSV
        </button>
      </span>
      <ResultsView questions={questions} summary={summary} />
      {!anonymous && responses.length > 0 && <span className="hint sv-who">From {responses.map((r) => (r.name ?? '').split(' ')[0]).filter(Boolean).join(', ')}</span>}
    </div>
  );
}

export { THUMBS, FACES };

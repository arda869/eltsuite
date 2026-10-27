import { NSelect } from './Select';
import { onBackdrop } from '../lib/ask';
import { useState } from 'react';
import { newQ, TYPE_LABELS, type SurveyQ, type SurveyType } from '../lib/survey';
import { setLive, type LiveState } from '../lib/live';
import { newId } from '../lib/tasks';
import { LearnerSurvey, TeacherResults } from './Survey';

// A quick live poll the teacher can launch at any moment.
const QUICK: { label: string; make: () => SurveyQ }[] = [
  { label: 'Thumbs', make: () => newQ('thumbs', 'Did that make sense?') },
  { label: 'Faces', make: () => newQ('emoji', 'How are you feeling?') },
  { label: 'Confidence 1–5', make: () => ({ ...newQ('scale', 'How confident do you feel about this?'), low: 'Not at all', high: 'Very' }) },
  { label: 'Yes / No', make: () => ({ ...newQ('single', 'Have you ever …?'), options: ['Yes', 'No'] }) },
  { label: 'Choose one', make: () => ({ ...newQ('single', ''), options: ['', '', ''] }) },
  { label: 'Open answer', make: () => newQ('text', 'One word that describes today:') },
];

export function PollDialog({ classId, poll, onClose }: { classId: string; poll?: LiveState['poll']; onClose: () => void }) {
  const [q, setQ] = useState<SurveyQ>(() => QUICK[0].make());
  const [anonymous, setAnonymous] = useState(true);
  const open = poll?.open;
  const launch = () => setLive(classId, { poll: { id: 'p' + newId(), q: { ...q, options: q.options?.filter((o) => o.trim()) }, anonymous, open: true, at: Date.now() } });
  return (
    <div className="scrim" {...onBackdrop(onClose)}>
      <div className="dialog poll-dialog" role="dialog" aria-label="Live poll" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Live poll</h2>
        {poll ? (
          <>
            <TeacherResults classId={classId} surveyId={poll.id} questions={[poll.q]} anonymous={poll.anonymous} title={poll.q.prompt || 'Poll'} />
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {open ? (
                <button type="button" className="btn" onClick={() => setLive(classId, { poll: { ...poll, open: false } })}>
                  Stop answers
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => setLive(classId, { poll: { ...poll, open: true } })}>
                  Open again
                </button>
              )}
              <button type="button" className="btn" onClick={() => setLive(classId, { poll: null })}>
                New poll
              </button>
              <button type="button" className="btn primary" onClick={onClose}>
                Close
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="poll-quick">
              {QUICK.map((x) => (
                <button key={x.label} type="button" className="btn small-btn" onClick={() => setQ(x.make())}>
                  {x.label}
                </button>
              ))}
            </span>
            <label className="field">
              <span>Question</span>
              <input value={q.prompt} autoFocus placeholder="Ask the class something" onChange={(e) => setQ({ ...q, prompt: e.target.value })} />
            </label>
            <label className="field">
              <span>Answer with</span>
              <NSelect value={q.type} onChange={(e) => setQ({ ...newQ(e.target.value as SurveyType, q.prompt), id: q.id })}>
                {(Object.keys(TYPE_LABELS) as SurveyType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </NSelect>
            </label>
            {(q.type === 'single' || q.type === 'multi' || q.type === 'rank') && (
              <div className="pq-lines">
                {(q.options ?? []).map((o, k) => (
                  <span key={k} className="pq-line">
                    <input value={o} placeholder={`Option ${k + 1}`} onChange={(e) => setQ({ ...q, options: (q.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} />
                  </span>
                ))}
                <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => setQ({ ...q, options: [...(q.options ?? []), ''] })}>
                  + Option
                </button>
              </div>
            )}
            {q.type === 'scale' && (
              <span className="pq-row">
                <input value={q.low ?? ''} placeholder="Label for 1" onChange={(e) => setQ({ ...q, low: e.target.value })} />
                <input value={q.high ?? ''} placeholder="Label for 5" onChange={(e) => setQ({ ...q, high: e.target.value })} />
              </span>
            )}
            <label className="pop-check">
              <input type="checkbox" checked={anonymous} onChange={() => setAnonymous((v) => !v)} />
              Anonymous
            </label>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" disabled={!q.prompt.trim() || ((q.type === 'single' || q.type === 'multi' || q.type === 'rank') && (q.options ?? []).filter((o) => o.trim()).length < 2)} onClick={launch}>
                Ask the class
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Learner: the poll slides up; it goes away once answered (or when the teacher closes it).
export function PollCard({ classId, poll, me }: { classId: string; poll?: LiveState['poll']; me: { uid: string; learnerId: string; name: string } }) {
  const [hidden, setHidden] = useState('');
  if (!poll || hidden === poll.id) return null;
  return (
    <div className="poll-card" role="dialog" aria-label="Poll from your teacher">
      <span className="poll-card-head">
        <span className="eyebrow accent">Poll</span>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setHidden(poll.id)}>
          ×
        </button>
      </span>
      {poll.open ? <LearnerSurvey classId={classId} surveyId={poll.id} questions={[poll.q]} anonymous={poll.anonymous} me={me} /> : <span className="hint">The poll is closed.</span>}
    </div>
  );
}

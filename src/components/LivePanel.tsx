import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { learnersCol, type Learner } from '../lib/learners';
import type { Signal } from '../lib/session';
import { Icon } from '../editor/Icons';
import { TaskRenderer } from './TaskRenderer';
import { saveMark, setCorrection, type Correction, type Mark } from '../lib/tasks';
import { addAnnotation, removeAnnotation, DEFAULT_CODES, type Annotation, type Code } from '../lib/annotations';
import { AnswerMarkup } from './AnswerMarkup';
import { useClassAvatars } from '../lib/avatars';
import { Avatar } from './avatars';
import { isOnline, type Presence } from '../lib/presence';
import { isAnswered, isCorrect, questionIds, scoreQuestion, textOf, type AnswerDoc, type AnswerKey, type Response } from '../lib/tasks';

type Props = {
  classId: string;
  taskId: string;
  content: JSONContent | null; // public content (as learners see it)
  answerKey: AnswerKey;
  presence: Presence[];
  showMarker: boolean;
  onShowMarker: (v: boolean) => void;
  seeLearners: boolean;
  onSeeLearners: (v: boolean) => void;
  revealedIds?: string[];
  onRevealQuestion?: (qid: string) => void;
  tab?: 'answers' | 'notes';
  onTab?: (t: 'answers' | 'notes') => void;
  notes?: string;
  onNotes?: (v: string) => void;
  signals?: Record<string, Signal>;
  onSpotlight?: (qid: string, text: string) => void;
  codes?: Code[];
  annotations?: Annotation[];
};

// Find every question node by id, so answers can be shown as words rather than option numbers.
function nodesById(content: JSONContent | null) {
  const out: Record<string, JSONContent> = {};
  const walk = (n: JSONContent) => {
    if (n.attrs?.id) out[n.attrs.id] = n;
    n.content?.forEach(walk);
  };
  if (content) walk(content);
  return out;
}

function label(node: JSONContent | undefined, r: Response): string {
  if (!isAnswered(r)) return '';
  const a = node?.attrs ?? {};
  switch (node?.type) {
    case 'choice':
    case 'mcq': {
      const opts: string[] = a.options ?? [];
      return Array.isArray(r) ? r.map((i) => opts[i as number] ?? '?').join(', ') : opts[Number(r)] ?? '?';
    }
    case 'match': {
      const arr = Array.isArray(r) ? r : [];
      return `${arr.filter((x) => x !== null && x !== -1).length}/${(a.left ?? []).length} matched`;
    }
    case 'reflect': {
      const v = r as unknown as { peerName?: string };
      return v.peerName ? `for ${v.peerName.split(' ')[0]}` : 'done';
    }
    case 'writing': {
      const words = textOf(r).split(/\s+/).filter(Boolean).length;
      return `${words} ${words === 1 ? 'word' : 'words'}`;
    }
    default:
      return textOf(r);
  }
}

export function LivePanel({ classId, taskId, content, answerKey, presence, showMarker, onShowMarker, seeLearners, onSeeLearners, revealedIds = [], onRevealQuestion, tab = 'answers', onTab, notes = '', onNotes, signals = {}, onSpotlight, codes = DEFAULT_CODES, annotations = [] }: Props) {
  const [detail, setDetail] = useState<Learner | null>(null);
  const [roster, setRoster] = useState<Learner[]>([]);
  const [answers, setAnswers] = useState<AnswerDoc[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const avatars = useClassAvatars();

  useEffect(() => onSnapshot(learnersCol(classId), (s) => setRoster(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Learner, 'id'>) })).sort((a, b) => a.displayName.localeCompare(b.displayName))), () => {}), [classId]);
  useEffect(() => {
    setAnswers([]);
    return onSnapshot(query(collection(db, 'classes', classId, 'answers'), where('taskId', '==', taskId)), (s) => setAnswers(s.docs.map((d) => d.data() as AnswerDoc)), () => {});
  }, [classId, taskId]);

  const qs = useMemo(() => questionIds(content), [content]);
  const nodes = useMemo(() => nodesById(content), [content]);
  const byLearner = useMemo(() => Object.fromEntries(answers.map((a) => [a.learnerId, a])), [answers]);
  const onlineIds = new Set(presence.filter(isOnline).map((p) => p.learnerId));
  const here = new Set(presence.filter((p) => isOnline(p) && p.taskId === taskId).map((p) => p.learnerId));

  const pct = (qid: string) => {
    const got = answers.filter((a) => isAnswered(a.responses?.[qid]));
    if (!got.length || !answerKey[qid] || answerKey[qid]?.kind === 'writing') return null;
    return Math.round((got.filter((a) => isCorrect(answerKey[qid], a.responses[qid])).length / got.length) * 100);
  };

  // Most common wrong answers for the question in focus.
  const wrongs = useMemo(() => {
    if (!focus) return [];
    const count: Record<string, number> = {};
    for (const a of answers) {
      const r = a.responses?.[focus];
      if (!isAnswered(r) || isCorrect(answerKey[focus], r)) continue;
      const l = label(nodes[focus], r);
      count[l] = (count[l] ?? 0) + 1;
    }
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [focus, answers, answerKey, nodes]);

  const started = answers.filter((a) => Object.values(a.responses ?? {}).some(isAnswered)).length;
  const done = answers.filter((a) => a.checked).length;

  return (
    <aside className="task-side live-panel" aria-label="Live answers">
      {detail && <LearnerDetail classId={classId} taskId={taskId} learner={detail} answer={byLearner[detail.id]} content={content} answerKey={answerKey} onClose={() => setDetail(null)} onSpotlight={onSpotlight} codes={codes} annotations={annotations} />}
      <div className="lp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'answers'} className={tab === 'answers' ? 'on' : ''} onClick={() => onTab?.('answers')}>
          Live answers
        </button>
        <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => onTab?.('notes')} title="Shortcut: N">
          Teacher notes{notes.trim() ? ' •' : ''}
        </button>
      </div>
      {tab === 'notes' ? (
        <textarea className="lp-notes" value={notes} placeholder="Notes for this task. Only you can see them." onChange={(e) => onNotes?.(e.target.value)} />
      ) : (
      <>
      <span className="hint">
        {started} of {roster.length} started · {done} checked
      </span>

      {qs.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          This task has no questions.
        </p>
      ) : (
        <div className="lgrid" style={{ ['--cols' as string]: qs.length }}>
          <span className="lg-name lg-head" />
          {qs.map((q, i) => {
            const p = pct(q.id);
            return (
              <button key={q.id} type="button" className={'lg-head lg-q' + (focus === q.id ? ' on' : '')} onClick={() => setFocus(focus === q.id ? null : q.id)} title={p === null ? 'No answers yet' : `${p}% correct`}>
                <span className="lg-n">{i + 1}</span>
                <span className="lg-pct">{p === null ? '–' : `${p}%`}</span>
              </button>
            );
          })}
          {roster.map((l) => {
            const a = byLearner[l.id];
            return (
              <div key={l.id} className="lg-row" role="row">
                <span role="button" tabIndex={0} onClick={() => setDetail(l)} onKeyDown={(e) => e.key === 'Enter' && setDetail(l)} className={'lg-name clickable' + (onlineIds.has(l.id) ? ' online' : '')} title={(onlineIds.has(l.id) ? (here.has(l.id) ? 'On this task' : 'Online') : 'Offline') + ' · click to see all answers'}>
                  <span className="lg-dot" aria-hidden="true" />
                  <Avatar k={avatars.byLearner[l.id]} name={l.displayName} size={20} />
                  {l.displayName.split(' ')[0]}
                  {signals[l.authUid]?.hand && <span className="lg-sig" title="Hand up"><Icon name="wave" size="13" /></span>}
                  {signals[l.authUid]?.stuck && <span className="lg-sig stuck" title="Stuck"><Icon name="question" size="13" /></span>}
                  {a?.checked && <span className="lg-checked">checked</span>}
                  {qs.some((q) => q.type === 'writing' && isAnswered(a?.responses?.[q.id]) && a?.marks?.[q.id]?.score == null) && <span className="lg-tomark" title="Long answer to mark">to mark</span>}
                </span>
                {qs.map((q) => {
                  const r = a?.responses?.[q.id];
                  const text = label(nodes[q.id], r);
                  const k = answerKey[q.id];
                  const s = isAnswered(r) && k && k.kind !== 'writing' ? scoreQuestion(k, r) : null;
                  const state = !text ? 'empty' : !s ? 'neutral' : s.got === s.max ? 'right' : 'wrong';
                  return (
                    <span key={q.id} className={'lg-cell ' + state + (focus === q.id ? ' focus' : '')} title={text || 'No answer yet'}>
                      {text || '·'}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {focus && (
        <div className="lg-wrongs">
          <span className="eyebrow" style={{ fontSize: 11 }}>
            Question {qs.findIndex((q) => q.id === focus) + 1} · common wrong answers
          </span>
          {onRevealQuestion && answerKey[focus] && answerKey[focus].kind !== 'writing' && (
            <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onRevealQuestion(focus)}>
              {revealedIds.includes(focus) ? 'Hide this answer from the class' : 'Show this answer to the class'}
            </button>
          )}
          {wrongs.length === 0 ? (
            <span className="hint">None yet.</span>
          ) : (
            wrongs.map(([w, n]) => (
              <span key={w} className="lg-wrong">
                <span>{w}</span>
                <span className="hint">{n}</span>
              </span>
            ))
          )}
        </div>
      )}

      </>
      )}
      <h2>While teaching</h2>
      <label className="switch-row">
        <span>
          Show learners where I am
          <span className="hint">Learners see which task you are on</span>
        </span>
        <input type="checkbox" checked={showMarker} onChange={() => onShowMarker(!showMarker)} />
      </label>
      <label className="switch-row">
        <span>
          Show me where learners are
          <span className="hint">See which task each learner is on</span>
        </span>
        <input type="checkbox" checked={seeLearners} onChange={() => onSeeLearners(!seeLearners)} />
      </label>
    </aside>
  );
}

// One learner's answers for the task, with marking for long answers.
function LearnerDetail({ classId, taskId, learner, answer, content, answerKey, onClose, onSpotlight, codes, annotations }: { classId: string; taskId: string; learner: Learner; answer?: AnswerDoc; content: JSONContent | null; answerKey: AnswerKey; onClose: () => void; onSpotlight?: (qid: string, text: string) => void; codes: Code[]; annotations: Annotation[] }) {
  const writing = questionIds(content).filter((q) => q.type === 'writing');
  const nodes = nodesById(content);
  const [draft, setDraft] = useState<Record<string, Mark>>(() => answer?.marks ?? {});
  const [saved, setSaved] = useState('');
  const result = answer ? questionIds(content).reduce((acc, q) => {
    const s = scoreQuestion(answerKey[q.id], answer.responses?.[q.id]);
    return { got: acc.got + s.got, max: acc.max + s.max };
  }, { got: 0, max: 0 }) : { got: 0, max: 0 };
  async function save(qid: string) {
    if (!answer) return;
    await saveMark(classId, taskId, answer.learnerUid, qid, draft[qid] ?? { score: null, comment: '' });
    setSaved(qid);
    window.setTimeout(() => setSaved(''), 1500);
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog detail-dialog" role="dialog" aria-label={learner.displayName} onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>{learner.displayName}</h2>
          <span className="hint">{!answer ? 'No answers yet' : `${result.got} of ${result.max} correct${answer.checked ? ' · checked' : ' · not checked yet'}`}</span>
        </div>
        <div className="detail-body">
          <TaskRenderer content={content} responses={answer?.responses ?? {}} results={answerKey} disabled teacherMarks={answer?.marks} />
        </div>
        {onSpotlight && answer && (
          <div className="spot-pick">
            <span className="eyebrow">Show one answer to the class (the name stays hidden)</span>
            <span className="spot-btns">
              {questionIds(content).map((q, i) => {
                const text = label(nodes[q.id], answer.responses?.[q.id]);
                const full = q.type === 'writing' ? textOf(answer.responses?.[q.id]) : text;
                return full ? (
                  <button key={q.id} type="button" className="btn small-btn" onClick={() => (onSpotlight(q.id, `${i + 1}. ${full}`), onClose())}>
                    Question {i + 1}
                  </button>
                ) : null;
              })}
            </span>
          </div>
        )}
        {writing.length > 0 && answer && (
          <div className="mark-box">
            <span className="eyebrow">Mark the long answers</span>
            {writing.map((q) => {
              const m = draft[q.id] ?? { score: null, comment: '' };
              const out = (nodes[q.id]?.attrs?.points as number) ?? 5;
              return (
                <div key={q.id} className="mark-block">
                  <WritingReview classId={classId} taskId={taskId} learnerUid={answer.learnerUid} qid={q.id} text={textOf(answer.responses?.[q.id])} corr={answer.corrections?.[q.id]} codes={codes} anns={annotations.filter((a) => a.target === 'answer' && a.qid === q.id && a.learnerUid === answer.learnerUid)} />
                <div className="mark-row">
                  <span className="mark-q">Question {questionIds(content).findIndex((x) => x.id === q.id) + 1}</span>
                  <span className="mark-score">
                    <input inputMode="numeric" value={m.score ?? ''} placeholder="–" onChange={(e) => setDraft((d) => ({ ...d, [q.id]: { ...m, score: e.target.value === '' ? null : Math.min(out, Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')))) } }))} />
                    <span className="hint">/ {out}</span>
                  </span>
                  <textarea value={m.comment} placeholder="A comment for the learner" onChange={(e) => setDraft((d) => ({ ...d, [q.id]: { ...m, comment: e.target.value } }))} />
                  <button type="button" className="btn small-btn primary" onClick={() => save(q.id)}>
                    {saved === q.id ? 'Saved' : 'Save mark'}
                  </button>
                </div>
                </div>
              );
            })}
          </div>
        )}
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// Teacher: codes and comments on a long answer, asking for corrections and approving them.
function WritingReview({ classId, taskId, learnerUid, qid, text, corr, codes, anns }: { classId: string; taskId: string; learnerUid: string; qid: string; text: string; corr?: Correction; codes: Code[]; anns: Annotation[] }) {
  const base = corr?.before ?? text;
  const add = (a: { start: number; end: number; quote: string; kind: Annotation['kind']; code?: string; comment?: string }) =>
    addAnnotation(classId, {
      taskId,
      target: 'answer',
      qid,
      learnerUid,
      start: a.start,
      end: a.end,
      quote: a.quote,
      kind: a.kind,
      ...(a.code ? { code: a.code } : {}),
      ...(a.kind === 'highlight' ? { color: 'yellow' as const } : {}),
      visibility: 'private',
      replies: a.comment ? [{ by: 'teacher', name: 'Teacher', text: a.comment, at: Date.now(), teacher: true }] : [],
    });
  return (
    <div className="wr-teacher">
      <span className="eyebrow">{corr?.status === 'resubmitted' ? 'Before' : 'Select words to add a code or a comment'}</span>
      <AnswerMarkup text={base} anns={anns} codes={codes} editable={!corr || corr.status === 'open'} onAdd={add} onRemove={(id) => removeAnnotation(classId, id)} />
      {corr?.status === 'resubmitted' && (
        <>
          <span className="eyebrow">After</span>
          <div className="am-text after">{text}</div>
        </>
      )}
      <span className="wr-actions">
        {!corr && anns.length > 0 && (
          <button type="button" className="btn small-btn" onClick={() => setCorrection(classId, taskId, learnerUid, qid, { status: 'open', before: text, at: Date.now() })}>
            Ask the learner to correct it
          </button>
        )}
        {corr?.status === 'open' && <span className="hint">Waiting for the learner’s corrections.</span>}
        {corr?.status === 'resubmitted' && (
          <>
            <button type="button" className="btn small-btn primary" onClick={() => setCorrection(classId, taskId, learnerUid, qid, { ...corr, status: 'approved', at: Date.now() })}>
              Approve
            </button>
            <button type="button" className="btn small-btn" onClick={() => setCorrection(classId, taskId, learnerUid, qid, { ...corr, status: 'open', at: Date.now() })}>
              Ask again
            </button>
          </>
        )}
        {corr?.status === 'approved' && <span className="hint">Approved.</span>}
      </span>
    </div>
  );
}

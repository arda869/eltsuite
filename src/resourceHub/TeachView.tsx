import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HubActivity } from './catalog';
import './teachView.css';

type Stage = { id: string; title: string; minutes: number; steps: string[] };
const stagePatterns = [/^Lead-in$/i, /^A\. /, /^B\. /, /^C\. /, /^Produce(?: \(|$)/i, /^Feedback(?: \(|$)/i];
const endPattern = /^(?:What learners complete|Variations|Teaching tips|Key and suggested answers|Produce outcome|Notes on the supplied Produce materials)$/i;
const kitStages: Stage[] = [
  { id: 'lead', title: 'Lead-in', minutes: 5, steps: ['Tell the class two true experiences and one false one.', 'Learners ask “Have you ever…?” questions and guess which experience is false.'] },
  { id: 'ab', title: 'Practice A and B', minutes: 10, steps: ['Learners complete the past participles in A and match follow-up questions in B.', 'Check in pairs, then as a class. Contrast experience questions with questions about a specific past occasion.'] },
  { id: 'c', title: 'Practice C', minutes: 5, steps: ['Learners write their questions for the Find Someone Who table.', 'Help with past participles, then model one complete exchange.'] },
  { id: 'produce', title: 'Produce', minutes: 15, steps: ['Learners mingle and ask their questions.', 'After “Yes, I have”, they write the name and ask one past-simple follow-up question.', 'Stop when most learners have five names. Invite them to report a finding they may share.'] },
];
const kitKey = [
  'Practice A: 1 been · 2 eaten · 3 met · 4 seen · 5 lost · 6 won · 7 slept · 8 broken · 9 cooked · 10 forgotten.',
  'Practice B: 1 a · 2 b · 3 c · 4 g · 5 e · 6 f · 7 d · 8 h · 9 i · 10 j.',
  'Practice C and Produce: answers vary. Listen for present perfect + past participle, a short answer and a past-simple follow-up.',
];

function stagesFor(activity: HubActivity): Stage[] {
  if (activity.id === 'otp-002') return kitStages;
  const notes = activity.notes;
  const keyAt = notes.findIndex(line => /^Key and suggested answers$/i.test(line));
  const beforeKey = keyAt >= 0 ? notes.slice(0, keyAt) : notes;
  const matches = beforeKey.flatMap((line, index) => stagePatterns.some(pattern => pattern.test(line)) ? [{ line, index }] : []);
  const durationMatch = notes[1]?.match(/Produce\s+(\d+)/i);
  const produceMinutes = durationMatch ? Number(durationMatch[1]) : 15;
  const duration = (title: string): number => /^Lead-in/i.test(title) ? 3 : /^A\./.test(title) ? 5 : /^B\./.test(title) ? 8 : /^C\./.test(title) ? 7 : /^Produce/i.test(title) ? produceMinutes : 5;
  return matches.map((match, at) => {
    const next = matches[at + 1]?.index ?? beforeKey.length;
    const raw = beforeKey.slice(match.index + 1, next);
    const stop = raw.findIndex(line => endPattern.test(line));
    const steps = (stop < 0 ? raw : raw.slice(0, stop)).filter(line => line.trim() && !/^\w+ \(\d+ minutes\)$/.test(line));
    const cleanTitle = match.line.replace(/\s*\([^)]*\)$/, '');
    return { id: String(match.index), title: cleanTitle, minutes: duration(match.line), steps: steps.length ? steps : ['Continue with the activity instructions in the teacher notes.'] };
  }).filter(stage => stage.steps.length > 0);
}

function answerKeyFor(activity: HubActivity): string[] {
  if (activity.id === 'otp-002') return kitKey;
  const index = activity.notes.findIndex(line => /^Key and suggested answers$/i.test(line));
  if (index < 0) return [];
  return activity.notes.slice(index + 1).filter(line => line.trim());
}

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function TeachView({ activity, onClose }: { activity: HubActivity; onClose: () => void }) {
  const stages = useMemo(() => stagesFor(activity), [activity]);
  const keyLines = useMemo(() => answerKeyFor(activity), [activity]);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState((stages[0]?.minutes || 5) * 60);
  const [running, setRunning] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stage = stages[index];
  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);
  useEffect(() => { if (seconds === 0) setRunning(false); }, [seconds]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowRight' && index < stages.length - 1) changeStage(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) changeStage(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, onClose, stages]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeStage = (next: number) => {
    setIndex(next);
    setSeconds((stages[next]?.minutes || 5) * 60);
    setRunning(false);
    setShowKey(false);
  };
  const reset = () => { setRunning(false); setSeconds((stage?.minutes || 5) * 60); };
  return createPortal(<div className="rh-teach-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="rh-teach" role="dialog" aria-modal="true" aria-labelledby="rh-teach-title">
    <header className="rh-teach-head"><div><span className="rh-teach-kicker">TEACH VIEW · OFF THE PAGE</span><h1 id="rh-teach-title">{activity.title}</h1><p>{activity.focus} · {activity.level} · {activity.interaction}</p></div><button ref={closeRef} type="button" className="rh-teach-close" onClick={onClose} aria-label="Close Teach view">×</button></header>
    <div className="rh-teach-layout"><nav className="rh-teach-stages" aria-label="Activity stages"><span>LESSON FLOW</span>{stages.map((item, at) => <button key={item.id} type="button" className={at === index ? 'active' : ''} aria-current={at === index ? 'step' : undefined} onClick={() => changeStage(at)}><b>{String(at + 1).padStart(2, '0')}</b><span>{item.title}<small>{item.minutes} min</small></span></button>)}</nav>
      <main className="rh-teach-main"><span className="rh-teach-step-count">STAGE {index + 1} OF {stages.length}</span><h2>{stage?.title || 'Teaching notes'}</h2><ol>{stage?.steps.map((step, at) => <li key={`${at}-${step}`}>{step}</li>)}</ol><div className="rh-teach-stage-nav"><button type="button" disabled={index === 0} onClick={() => changeStage(index - 1)}>← Previous stage</button><button type="button" disabled={index >= stages.length - 1} onClick={() => changeStage(index + 1)}>Next stage →</button></div></main>
      <aside className="rh-teach-side"><div className="rh-teach-prep"><span>BEFORE CLASS</span><p>Print learner pages 2 and 3, one set per learner. Keep the teacher notes and answer key private. Clear space for the mingle.</p></div><div className="rh-teach-timer"><span>STAGE TIMER</span><strong role="timer" aria-live={seconds === 0 ? 'polite' : 'off'}>{clock(seconds)}</strong><div><button type="button" onClick={() => setRunning(value => !value)} disabled={seconds === 0}>{running ? 'Pause' : 'Start'}</button><button type="button" onClick={reset}>Reset</button></div><small>Suggested time: {stage?.minutes || 5} minutes</small></div><div className="rh-teach-private"><span>TEACHER ONLY</span><h3>Answer key</h3><p>Hidden until you choose to show it. Close it before sharing your screen with learners.</p><button type="button" aria-expanded={showKey} onClick={() => setShowKey(value => !value)}>{showKey ? 'Hide answer key' : 'Show answer key'}</button>{showKey && <div className="rh-teach-key">{keyLines.length ? keyLines.map((line, at) => <p key={`${at}-${line}`}>{line}</p>) : <p>No answer key is provided for this activity.</p>}</div>}</div></aside>
    </div>
  </section></div>, document.body);
}

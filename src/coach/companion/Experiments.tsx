import { useState } from 'react';
import { UiIcon } from '../../components/UiIcon';
import { ask } from '../../lib/ask';
import { newInquiry } from '../model';
import { removeDoc, saveVersioned, shortDay, type Experiment } from './data';

// Try something: a small classroom experiment, one step at a time: a question, what happens now,
// one change, how you'll know, a date to look again, notes as you go, and what you found.

const STEPS: { k: keyof Experiment; title: string; help: string; ph: string }[] = [
  { k: 'title', title: 'Your question', help: 'Something you wonder about in your own class.', ph: 'For example: Do my B1 learners speak more if they plan for one minute first?' },
  { k: 'baseline', title: 'What happens now', help: 'Before you change anything: what do you notice?', ph: 'For example: Most pairs stop after two or three sentences.' },
  { k: 'intervention', title: 'The one change', help: 'Small and clear, so you can tell if it helped.', ph: 'For example: One minute of silent planning with notes before every speaking task.' },
  { k: 'evidence', title: 'How you’ll know', help: 'What you’ll look at, and when. Keep it light.', ph: 'For example: Time how long three pairs keep talking, in two lessons before and two after.' },
  { k: 'observations', title: 'Notes as you go', help: 'Short notes after each lesson. Dates help.', ph: '12 Nov: …' },
  { k: 'interpretation', title: 'What you found', help: 'What changed? What else might explain it?', ph: 'It seemed to help most when…' },
  { k: 'next', title: 'What next', help: 'Keep it, change it, or try something else.', ph: 'Next I’ll…' },
];
export const reviewDue = (x: Experiment) => x.status !== 'done' && !!x.reviewAt && x.reviewAt <= Date.now();

export function Experiments({ uid, list, onTalk }: { uid: string; list: Experiment[]; onTalk: (x: Experiment) => void }) {
  const [open, setOpen] = useState<Experiment | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const start = (x?: Experiment) => { setOpen(x ?? { ...newInquiry(), status: 'planning', reviewAt: Date.now() + 14 * 864e5 }); setStep(0); setMsg(''); };
  const save = async (next?: Partial<Experiment>) => {
    if (!open) return;
    const value = { ...open, ...next };
    if (!value.title.trim()) { setMsg('Write your question first.'); return; }
    setBusy(true); setMsg('');
    try { const v = await saveVersioned(uid, 'inquiries', value); setOpen({ ...value, version: v }); setMsg('Saved'); }
    catch (e) { setMsg(e instanceof Error && e.message === 'changed' ? 'This changed in another window. Reopen it to carry on.' : 'We couldn’t save just now. Check your connection. Your words are still here.'); }
    finally { setBusy(false); }
  };
  if (open) {
    const s = STEPS[step];
    return (
      <div className="cp-section ex">
        <button type="button" className="cp-link cp-back" onClick={() => setOpen(null)}>← All experiments</button>
        <header className="cp-head"><span className="cp-k">Try something</span><h2>{open.title || 'A new experiment'}</h2></header>
        <ol className="ex-steps">
          {STEPS.map((x, i) => <li key={x.k}><button type="button" className={(i === step ? 'on ' : '') + (String(open[x.k] ?? '').trim() ? 'done' : '')} onClick={() => setStep(i)}><i>{String(open[x.k] ?? '').trim() ? '✓' : i + 1}</i>{x.title}</button></li>)}
        </ol>
        <section className="ex-card">
          <h3>{s.title}</h3>
          <p className="hint">{s.help}</p>
          <textarea value={String(open[s.k] ?? '')} rows={s.k === 'observations' ? 8 : 4} placeholder={s.ph} aria-label={s.title} onChange={(e) => setOpen({ ...open, [s.k]: e.target.value })} />
          {step === 3 && (
            <label className="ex-date">Look again on <input type="date" value={open.reviewAt ? new Date(open.reviewAt).toISOString().slice(0, 10) : ''} onChange={(e) => setOpen({ ...open, reviewAt: e.target.value ? new Date(e.target.value + 'T09:00').getTime() : null })} /><span className="hint">It shows on the Companion’s front page when it’s time.</span></label>
          )}
        </section>
        <div className="cl-nav">
          {step > 0 && <button type="button" className="cp-soft" onClick={() => setStep(step - 1)}>Back</button>}
          <span className="ex-msg" role="status">{msg}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="cp-soft" disabled={busy} onClick={() => void save()}>Save</button>
          {step < STEPS.length - 1 ? <button type="button" className="cp-primary" disabled={busy} onClick={() => { void save(step === 3 && open.status === 'planning' ? { status: 'trying' } : undefined); setStep(step + 1); }}>Next</button>
            : <button type="button" className="cp-primary" disabled={busy} onClick={() => void save({ status: 'done' })}>Finish</button>}
        </div>
        <div className="ex-foot">
          {open.version > 0 && <button type="button" className="cp-link" onClick={() => onTalk(open)}><UiIcon name="discuss" size={14} /> Think it through with the Companion</button>}
          {open.version > 0 && <button type="button" className="cp-link danger" onClick={() => void ask('Delete this experiment? You can’t undo this.', { ok: 'Delete', danger: true }).then((ok) => { if (ok) void removeDoc(uid, 'inquiries', open.id).then(() => setOpen(null)); })}>Delete</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="cp-section">
      <header className="cp-head"><span className="cp-k">Try something</span><h2>Small experiments in your classroom</h2><p>Notice something, try one change, and look again in a couple of weeks. Small and real beats big and perfect.</p>
        <button type="button" className="cp-primary" onClick={() => start()}><UiIcon name="plus" size={15} /> Start an experiment</button></header>
      {list.length ? (
        <div className="ex-list">
          {list.map((x) => (
            <button key={x.id} type="button" className={'ex-item' + (reviewDue(x) ? ' due' : '')} onClick={() => start(x)}>
              <span className={'ex-state ' + (x.status ?? 'planning')}>{x.status === 'done' ? 'Finished' : x.status === 'trying' ? 'Trying it' : 'Planning'}</span>
              <b>{x.title || 'Untitled experiment'}</b>
              <span>{x.intervention ? `The change: ${x.intervention.slice(0, 110)}` : 'Not planned yet'}</span>
              {x.reviewAt && x.status !== 'done' && <small>{reviewDue(x) ? 'Time to look again' : `Look again ${shortDay(x.reviewAt)}`}</small>}
            </button>
          ))}
        </div>
      ) : (
        <div className="ex-ideas">
          <span className="cp-k">Ideas to start from</span>
          {['Do learners speak more after one minute of planning?', 'Does writing the aim on the board change how learners work?', 'What happens if I wait five seconds after a question?', 'Do learners remember more vocabulary with spaced review?'].map((t) => (
            <button key={t} type="button" className="cl-help" onClick={() => { start(); setOpen((o) => o && { ...o, title: t }); }}><b>{t}</b><UiIcon name="next" size={16} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

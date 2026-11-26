import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UiIcon } from '../../components/UiIcon';
import { ask } from '../../lib/ask';
import type { CoachProfile } from '../model';
import { MOODS, removeDoc, saveVersioned, shortDay, type Entry, type Experiment, type Goal } from './data';

// Goals and growth: what you're working on, the small steps towards it, and everything you've
// written and tried on one timeline. A portfolio puts it together to print or save as a PDF, for an
// appraisal, a course or yourself.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const newGoal = (): Goal => ({ id: crypto.randomUUID(), title: '', why: '', steps: [], status: 'active', at: Date.now(), version: 0 });

function GoalCard({ uid, g, onOpen }: { uid: string; g: Goal; onOpen: () => void }) {
  const done = g.steps.filter((s) => s.done).length;
  const toggle = async (i: number) => {
    const steps = g.steps.map((s, k) => (k === i ? { ...s, done: !s.done } : s));
    await saveVersioned(uid, 'goals', { ...g, steps }).catch(() => {});
  };
  return (
    <article className={'gr-goal ' + g.status}>
      <button type="button" className="gr-goal-h" onClick={onOpen}>
        <b>{g.title}</b>
        <span className="gr-bar" aria-label={`${done} of ${g.steps.length} steps done`}><i style={{ width: g.steps.length ? `${(done / g.steps.length) * 100}%` : '0%' }} /></span>
      </button>
      {g.why && <p>{g.why}</p>}
      <ul className="gr-steps">
        {g.steps.map((s, i) => <li key={i}><label><input type="checkbox" checked={s.done} onChange={() => void toggle(i)} /> <span className={s.done ? 'done' : ''}>{s.text}</span></label></li>)}
      </ul>
    </article>
  );
}

function GoalEditor({ uid, start, onClose }: { uid: string; start: Goal; onClose: () => void }) {
  const [g, setG] = useState(start);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!g.title.trim()) return setMsg('Name your goal first.');
    try { await saveVersioned(uid, 'goals', { ...g, steps: step.trim() ? [...g.steps, { text: step.trim(), done: false }] : g.steps }); onClose(); }
    catch { setMsg('We couldn’t save just now. Try again. Your words are still here.'); }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog gr-edit" role="dialog" aria-label="Your goal">
        <h2>{start.version ? 'Your goal' : 'A new goal'}</h2>
        <label className="field"><span>What do you want to get better at?</span><input autoFocus value={g.title} maxLength={140} placeholder="For example: Giving clearer instructions" onChange={(e) => setG({ ...g, title: e.target.value })} /></label>
        <label className="field"><span>Why it matters to you (optional)</span><textarea rows={2} value={g.why} onChange={(e) => setG({ ...g, why: e.target.value })} /></label>
        <div className="field"><span>Small steps</span>
          <ul className="gr-steps">{g.steps.map((s, i) => <li key={i}><label><input type="checkbox" checked={s.done} onChange={() => setG({ ...g, steps: g.steps.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) })} /> {s.text}</label><button type="button" className="cp-link" aria-label="Remove this step" onClick={() => setG({ ...g, steps: g.steps.filter((_, k) => k !== i) })}>×</button></li>)}</ul>
          <input value={step} placeholder="Add a step and press Enter, for example: Record myself giving instructions" onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && step.trim()) { e.preventDefault(); setG({ ...g, steps: [...g.steps, { text: step.trim(), done: false }] }); setStep(''); } }} />
        </div>
        <div className="seg" role="radiogroup" aria-label="Status">{(['active', 'paused', 'done'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={g.status === s} className={g.status === s ? 'on' : ''} onClick={() => setG({ ...g, status: s })}>{s === 'active' ? 'Working on it' : s === 'paused' ? 'Paused' : 'Reached'}</button>)}</div>
        {msg && <p className="cp-error" role="alert">{msg}</p>}
        <span className="pe-actions">
          {start.version > 0 && <button type="button" className="btn link" onClick={() => void ask('Delete this goal? You can’t undo this.', { ok: 'Delete', danger: true }).then((ok) => { if (ok) void removeDoc(uid, 'goals', g.id).then(onClose); })}>Delete</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => void save()}>Save goal</button>
        </span>
      </div>
    </div>
  );
}

export function Growth({ uid, goals, entries, experiments, profile, name, onOpenEntry, onOpenExperiment }: { uid: string; goals: Goal[]; entries: Entry[]; experiments: Experiment[]; profile: CoachProfile | null; name: string; onOpenEntry: (e: Entry) => void; onOpenExperiment: () => void }) {
  const [editing, setEditing] = useState<Goal | null>(null);
  const [from, setFrom] = useState(() => new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10));
  const timeline = [
    ...entries.map((e) => ({ at: e.at, kind: e.kind === 'debrief' ? 'After a lesson' : 'Journal', title: e.title, open: () => onOpenEntry(e), mood: e.mood })),
    ...experiments.map((x) => ({ at: x.at, kind: 'Experiment', title: x.title, open: onOpenExperiment, mood: '' })),
    ...goals.map((g) => ({ at: g.at, kind: g.status === 'done' ? 'Goal reached' : 'Goal', title: g.title, open: () => setEditing(g), mood: '' })),
  ].sort((a, b) => b.at - a.at);
  const portfolio = () => {
    const since = new Date(from).getTime();
    const w = window.open('', '_blank');
    if (!w) return;
    const sec = (h: string, body: string) => (body.trim() ? `<section><h2>${h}</h2>${body}</section>` : '');
    const p = profile;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Teaching portfolio · ${esc(name)}</title><style>
@font-face{font-family:Fraunces;src:url('${location.origin}/fonts/Fraunces.ttf')} @font-face{font-family:Karla;src:url('${location.origin}/fonts/Karla.ttf')}
@page{size:A4;margin:20mm} body{font:11pt/1.55 Fraunces,Georgia,serif;color:#262420;margin:0} h1{font:800 22pt Karla,sans-serif;margin:0 0 2mm} .sub{font:10pt Karla,sans-serif;color:#66615b;margin-bottom:10mm}
h2{font:800 9pt Karla,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#975f40;border-bottom:1px solid #d6d3cd;padding-bottom:2mm;margin:9mm 0 4mm} h3{font:700 12pt Fraunces,serif;margin:5mm 0 1mm} .d{font:9pt Karla,sans-serif;color:#66615b} article{break-inside:avoid;margin-bottom:5mm} p{margin:0 0 2mm;white-space:pre-wrap} ul{margin:1mm 0 0 5mm;padding:0}
</style></head><body><h1>Teaching portfolio</h1><div class="sub">${esc(name)} · ${new Date(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
${sec('About my teaching', [p?.experience && `<p><b>Experience.</b> ${esc(p.experience)}</p>`, p?.qualifications && `<p><b>Qualifications.</b> ${esc(p.qualifications)}</p>`, p?.context && `<p><b>Where I teach.</b> ${esc(p.context)}</p>`, p?.beliefs && `<p><b>What I believe about teaching.</b> ${esc(p.beliefs)}</p>`].filter(Boolean).join(''))}
${sec('Goals', goals.map((g) => `<article><h3>${esc(g.title)}</h3><div class="d">${g.status === 'done' ? 'Reached' : g.status === 'paused' ? 'Paused' : 'Working on it'}</div>${g.why ? `<p>${esc(g.why)}</p>` : ''}${g.steps.length ? `<ul>${g.steps.map((s) => `<li>${s.done ? '✓ ' : ''}${esc(s.text)}</li>`).join('')}</ul>` : ''}</article>`).join(''))}
${sec('Classroom experiments', experiments.filter((x) => x.at >= since).map((x) => `<article><h3>${esc(x.title)}</h3><div class="d">${shortDay(x.at)}</div>${x.intervention ? `<p><b>The change.</b> ${esc(x.intervention)}</p>` : ''}${x.interpretation ? `<p><b>What I found.</b> ${esc(x.interpretation)}</p>` : ''}${x.next ? `<p><b>Next.</b> ${esc(x.next)}</p>` : ''}</article>`).join(''))}
${sec('Reflections', entries.filter((e) => e.at >= since).map((e) => `<article><h3>${esc(e.title)}</h3><div class="d">${new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${e.lessonRef ? ' · ' + esc(e.lessonRef.title) : ''}</div><p>${esc(e.text)}</p></article>`).join(''))}
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),200))</script></body></html>`);
    w.document.close();
  };
  const active = goals.filter((g) => g.status !== 'done');
  return (
    <div className="cp-section">
      <header className="cp-head"><span className="cp-k">Goals and growth</span><h2>What you’re working on</h2><p>One or two goals at a time works best. Break them into small steps you can tick off.</p>
        <button type="button" className="cp-primary" onClick={() => setEditing(newGoal())}><UiIcon name="plus" size={15} /> A new goal</button></header>
      {active.length ? <div className="gr-goals">{active.map((g) => <GoalCard key={g.id} uid={uid} g={g} onOpen={() => setEditing(g)} />)}</div> : <p className="cp-empty">No goals yet. What would make the biggest difference to your teaching this term?</p>}
      {goals.some((g) => g.status === 'done') && <p className="gr-reached">Reached: {goals.filter((g) => g.status === 'done').map((g) => <button key={g.id} type="button" className="jw-tag" onClick={() => setEditing(g)}>✓ {g.title}</button>)}</p>}
      <section className="gr-about">
        <div><span className="cp-k">Your teaching, in context</span><p>{profile?.experience || profile?.context ? [profile.experience, profile.context].filter(Boolean).join(' · ') : 'Your experience, qualifications and beliefs help the Companion give advice that fits you.'}</p></div>
        <Link className="cp-soft" to="/settings#set-teacher-s-companion">Edit profile and beliefs</Link>
      </section>
      <section className="gr-portfolio">
        <div><span className="cp-k">Portfolio</span><p>Your goals, experiments and reflections in one document, to print or save as a PDF. For an appraisal, a course or yourself.</p></div>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <button type="button" className="cp-primary" onClick={portfolio}><UiIcon name="download" size={15} /> Make my portfolio</button>
      </section>
      <section className="gr-timeline">
        <h3>Your timeline</h3>
        {timeline.length ? <ol>{timeline.slice(0, 60).map((t, i) => {
          const m = MOODS.find((x) => x.k === t.mood);
          return <li key={i}><button type="button" onClick={t.open}><i style={m ? { background: m.colour } : undefined} /><span className="d">{shortDay(t.at)}</span><span className="k">{t.kind}</span><b>{t.title || 'Untitled'}</b></button></li>;
        })}</ol> : <p className="cp-empty">Your journal entries, experiments and goals appear here as you go.</p>}
      </section>
      {editing && <GoalEditor uid={uid} start={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

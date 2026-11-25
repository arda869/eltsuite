import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ask } from '../lib/ask';
import { UiIcon } from '../components/UiIcon';
import { openSearch } from '../search/SearchLauncher';
import { GUIDE_EVENT, guideFor, markStep, setGuide, setStartHidden, STEPS, useStart, type StepId } from './steps';
import './start.css';

// The Get started list on Home. `auto` are the steps Home can already see are done (a class, a
// lesson…); the rest tick themselves as they happen.
export function GetStarted({ auto }: { auto: Partial<Record<StepId, boolean>> }) {
  const { user } = useAuth();
  const s = useStart(user?.uid);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!s || s.hidden) return null;
  const done = (id: StepId) => !!s.done[id] || !!auto[id];
  const n = STEPS.filter((x) => done(x.id)).length;
  const all = n === STEPS.length;
  const next = STEPS.find((x) => !done(x.id));
  const open = (id: StepId, to: string) => {
    setGuide(id);
    if (id === 'search') { openSearch(); markStep('search'); return; }
    navigate(to);
  };
  const hide = async () => {
    if (!all && !(await ask('Hide the Get started list? You can bring it back any time in Settings, under Home.', { ok: 'Hide the list' }))) return;
    setBusy(true);
    try { await setStartHidden(true); } finally { setBusy(false); }
  };
  const r = 15, c = 2 * Math.PI * r;
  return (
    <section className="gs hm-card" aria-labelledby="gs-h">
      <header className="gs-head">
        <span className="gs-ring" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r={r} className="gs-ring-bg" /><circle cx="20" cy="20" r={r} className="gs-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - n / STEPS.length)} /></svg>
          <b>{n}</b>
        </span>
        <span className="gs-titles">
          <h2 id="gs-h">{all ? 'You’ve done all ten' : 'Get started'}</h2>
          <span>{all ? 'You know your way round ELT Suite now.' : `${n} of ${STEPS.length} done${next ? ` · Next: ${next.title[0].toLowerCase() + next.title.slice(1)}` : ''}`}</span>
        </span>
        <button type="button" className={all ? 'gs-hide primary' : 'gs-hide'} disabled={busy} onClick={() => void hide()}>{all ? 'Hide this list' : 'Hide'}</button>
      </header>
      <ol className="gs-list">
        {STEPS.map((x, i) => {
          const ok = done(x.id);
          return (
            <li key={x.id}>
              <button type="button" className={'gs-step' + (ok ? ' done' : '') + (next?.id === x.id ? ' next' : '')} onClick={() => open(x.id, x.to)}>
                <span className="gs-tick" aria-hidden="true">{ok ? <UiIcon name="check" size={14} /> : i + 1}</span>
                <span className="gs-text"><b>{x.title}</b><span>{x.about}</span></span>
                <span className="gs-go" aria-hidden="true">›</span>
                <span className="sr-only">{ok ? ' (done)' : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// The guide for the step you are trying, in the corner of the page it opened. It never covers the
// work: a small card with two or three tips, gone when you close it or the step is done.
export function StartGuide() {
  const { user, profile } = useAuth();
  const s = useStart(profile?.role === 'teacher' ? user?.uid : null);
  const location = useLocation();
  const navigate = useNavigate();
  const [id, setId] = useState(guideFor);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const f = () => setId(guideFor());
    window.addEventListener(GUIDE_EVENT, f);
    return () => window.removeEventListener(GUIDE_EVENT, f);
  }, []);
  const step = STEPS.find((x) => x.id === id);
  const done = !!(step && s?.done[step.id]);
  useEffect(() => { if (done) { const t = window.setTimeout(() => setGuide(''), 4000); return () => window.clearTimeout(t); } }, [done]);
  if (!step || !s || location.pathname === '/' || step.id === 'search') return null;
  const i = STEPS.indexOf(step);
  return (
    <aside className={'gs-guide' + (small ? ' small' : '') + (done ? ' ok' : '')} aria-label={`Guide: ${step.title}`}>
      <header>
        <span className="gs-k">{done ? 'Done' : `Step ${i + 1} of ${STEPS.length}`}</span>
        <button type="button" className="gs-x" aria-label={small ? 'Show the guide' : 'Make the guide smaller'} data-tip={small ? 'Show' : 'Smaller'} onClick={() => setSmall((v) => !v)}>{small ? '+' : '–'}</button>
        <button type="button" className="gs-x" aria-label="Close the guide" data-tip="Close" onClick={() => setGuide('')}>×</button>
      </header>
      <b className="gs-gt">{done ? `Well done. ${step.title} is ticked.` : step.title}</b>
      {!small && !done && <ul>{step.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      {!small && (
        <footer>
          <button type="button" className="gs-link" onClick={() => { setGuide(''); navigate('/'); }}>Back to the list</button>
        </footer>
      )}
    </aside>
  );
}

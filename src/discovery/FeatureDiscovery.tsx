import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isProxyTab } from '../lib/proxy';
import { UiIcon } from '../components/UiIcon';
import { VisualGuide, WorkflowArt } from './VisualGuide';
import { canDeliver, DAY, defaults, FEATURES, recommendations, usageLabel, type DiscoveryState, type Feature, type Settings } from './catalog';
import { changeDiscovery, offerDiscovery, useDiscovery, useDiscoveryAccess } from './store';
import './discovery.css';

export function FeatureDiscovery() {
  const { user, profile } = useAuth();
  if (!user || profile?.role !== 'teacher' || isProxyTab()) return null;
  return <Discovery key={user.uid} uid={user.uid} goal={profile.teacherGoal ?? ''} />;
}
function Discovery({ uid, goal }: { uid: string; goal: string }) {
  const { state, error: loadError } = useDiscovery(uid);
  const allowed = useDiscoveryAccess(uid);
  const location = useLocation(), navigate = useNavigate();
  const [open, setOpen] = useState(false), [tab, setTab] = useState('for-you');
  const [guide, setGuide] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const quietWorkflow = /^\/(call|studio|learn)(\/|$)/.test(location.pathname) || /^\/class\/[^/]+\/lesson\//.test(location.pathname);
  useEffect(() => { const t = window.setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent('elt-assistant-panel', { detail: 'discovery' }));
      closeButton.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent).detail !== 'discovery') setOpen(false); };
    window.addEventListener('elt-assistant-panel', other);
    return () => window.removeEventListener('elt-assistant-panel', other);
  }, []);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [tab]);
  useEffect(() => {
    const show = () => { setGuide(''); setTab('preferences'); setOpen(true); };
    window.addEventListener('elt-discovery-settings', show);
    return () => window.removeEventListener('elt-discovery-settings', show);
  }, []);
  const available = FEATURES.filter(f => allowed.includes(f.id));
  const activeGuide = available.find(f => f.id === guide);
  const next = state ? recommendations(state, allowed, location.pathname, goal)[0]?.feature : undefined;
  const delivered = state && available.find(f => f.id === state.delivery.feature && !state.usage[f.id]?.count && !state.feedback[f.id]?.dismissed && (state.feedback[f.id]?.snoozedUntil ?? 0) <= Date.now());
  const suggestion = delivered || next;
  const allowedKey = allowed.join(',');
  useEffect(() => {
    if (!open || tab !== 'for-you' || !state?.settings.tracking || !suggestion || state.delivery.feature === suggestion.id) return;
    void changeDiscovery(uid, s => ({ ...s, feedback: { ...s.feedback, [suggestion.id]: { ...s.feedback[suggestion.id], offeredAt: Date.now() } }, delivery: { feature: suggestion.id, at: Date.now(), read: true } })).catch(() => {});
  }, [open, tab, state?.settings.tracking, suggestion?.id, state?.delivery.feature, uid]);
  useEffect(() => {
    if (!state || !canDeliver(state, Date.now(), new Date().getHours()) || quietWorkflow || open || !allowed.length || document.visibilityState !== 'visible') return;
    // Transaction makes the cap and single-unread rule apply across tabs and devices.
    void offerDiscovery(uid, allowed, location.pathname, goal).catch(() => {});
  }, [uid, state, allowedKey, location.pathname, goal, tick, quietWorkflow, open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function change(fn: (s: DiscoveryState) => DiscoveryState) {
    if (busy) return;
    setBusy(true); setError('');
    try { await changeDiscovery(uid, fn); } catch { setError('We couldn’t save that. Check your connection and try again.'); } finally { setBusy(false); }
  }
  function close() { setOpen(false); document.querySelector<HTMLElement>('[data-help-trigger]')?.focus(); }
  function settings(patch: Partial<Settings>) { void change(s => ({ ...s, settings: { ...s.settings, ...patch } })); }
  function feedback(f: Feature, patch: object) {
    return change(s => ({ ...s, feedback: { ...s.feedback, [f.id]: { ...s.feedback[f.id], ...patch } }, delivery: s.delivery.feature === f.id ? { ...s.delivery, read: true } : s.delivery }));
  }
  useEffect(() => {
    const requested = () => show();
    window.addEventListener('elt-open-discovery', requested);
    return () => window.removeEventListener('elt-open-discovery', requested);
  }, [state]);
  function show() {
    setOpen(true);
    if (state && !state.delivery.read) void change(s => ({ ...s, delivery: { ...s.delivery, read: true } }));
  }
  function startGuide(f: Feature) {
    setGuide(f.id);
    if (content.current) content.current.scrollTop = 0;
    if (state?.settings.tracking) void feedback(f, { guideStarted: true });
  }
  if (!open && (quietWorkflow || /^\/(welcome|tour|privacy|terms|auth|join|invite)(\/|$)/.test(location.pathname))) return null;
  return <div className="discovery" data-private>

    {open && <section id="discovery-panel" className={'discovery-panel' + (activeGuide ? ' with-guide' : '')} role="dialog" aria-label="ELT Suite feature discovery" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <header className="discovery-header"><div><span className="discovery-eyebrow">ELT SUITE ASSISTANT</span><h2>A little discovery.</h2></div><button ref={closeButton} className="discovery-close" type="button" aria-label="Close feature discovery" onClick={close}>×</button></header>
      <nav className="discovery-tabs" aria-label="Discovery views">{[['for-you', 'For you'], ['features', 'Your features'], ['preferences', 'Preferences']].map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setGuide(''); }}>{label}</button>)}</nav>
      <div ref={content} className="discovery-content" aria-busy={busy}>
        {(error || loadError) && <p role="alert" className="error">{error || loadError}</p>}
        {!state ? !loadError && <p role="status">Getting things ready…</p> : <>
          {activeGuide ? <VisualGuide key={activeGuide.id} feature={activeGuide} onBack={() => { setGuide(''); if (content.current) content.current.scrollTop = 0; }} onOpen={() => { if (state.settings.tracking) void feedback(activeGuide, { openedAt: Date.now() }); navigate(activeGuide.path); close(); }} /> : <>
          {tab === 'for-you' && <>
            {state.settings.tracking && <p className="discovery-intro">Small ideas for your next teaching day.<br />Explore at your own pace.</p>}
            {!state.settings.tracking ? <div className="discovery-card discovery-welcome"><WorkflowArt feature="lessons" /><h3>Make it useful to you.</h3><p>See suggestions based on the features you actually use. We keep feature counts and approximate dates, never lesson content or learner details.</p><button className="btn primary tall" disabled={busy} onClick={() => settings({ tracking: true, enabled: true })}>Personalise my suggestions</button><p className="discovery-fine">Optional. At most once a week by default, with quiet hours from 8 pm to 8 am on this device. Change this in Preferences.</p><button className="btn link" onClick={() => setTab('features')}>Browse features first →</button></div> : suggestion ? <article className="discovery-card" key={suggestion.id}>
              <div className="discovery-card-top"><span className="discovery-symbol"><UiIcon name={suggestion.icon} size={28} /></span><div><span className="discovery-tag">A possibility for you</span><h3>{suggestion.name}</h3></div></div>
              <WorkflowArt feature={suggestion.id} stage={1} /><p>{suggestion.benefit}</p><p className="discovery-reason">{suggestion.goal === goal ? 'A fit for the teaching goal you chose.' : suggestion.related.some(id => state.usage[id as keyof typeof state.usage]?.count) ? 'A next step from a feature you’ve used.' : 'Something you haven’t explored since tracking began.'}</p>
              <div className="discovery-actions"><button className="btn primary tall" disabled={busy} onClick={async () => { await feedback(suggestion, { openedAt: Date.now() }); navigate(suggestion.path); close(); }}>Try it now <span aria-hidden="true">↗</span></button><button className="btn tall" disabled={busy} onClick={() => startGuide(suggestion)}>Show me how</button></div>
              <div className="discovery-secondary"><button disabled={busy} onClick={() => void feedback(suggestion, { snoozedUntil: Date.now() + 7 * DAY })}>Remind me in a week</button><button disabled={busy} onClick={() => void feedback(suggestion, { dismissed: true })}>Not interested</button></div>
            </article> : <div className="discovery-card"><h3>You’re all caught up.</h3><p>No new suggestions right now. You can revisit your features or restore dismissed ideas in Preferences.</p><button className="btn" onClick={() => setTab('features')}>See your features</button></div>}
            <p className="discovery-fine">{state.settings.tracking ? 'Opening a suggestion doesn’t mark a feature as used. Usage starts when a workflow succeeds.' : 'Your existing teaching data stays out of discovery.'}</p>
            {state.settings.tracking && (!state.settings.enabled || state.settings.pausedUntil > Date.now()) && <p className="discovery-fine">Proactive suggestions are {state.settings.enabled ? 'paused' : 'off'}. You can still explore here.</p>}
          </>}
          {tab === 'features' && <>
            <p className="discovery-intro">Your toolkit, at a glance.</p><p className="discovery-fine">{state.settings.tracking ? 'Tracked from completed workflows since you opted in. Earlier use may not appear. “Used regularly” means three or more different completions.' : 'Turn on personalisation to track completed workflows.'}</p>
            <div className="discovery-features">{available.map(f => <div key={f.id} className="discovery-feature"><span className="discovery-feature-icon"><UiIcon name={f.icon} size={25} /></span><div className="discovery-feature-copy"><button type="button" className="discovery-feature-guide" aria-label={'Show visual guide for ' + f.name} onClick={() => startGuide(f)}><b>{f.name}</b><span>Visual guide <span aria-hidden="true">→</span></span></button><span>{state.settings.tracking ? usageLabel(state.usage[f.id]) : 'Tracking is off'}{state.usage[f.id]?.lastUsed ? ' · ' + new Date(state.usage[f.id]!.lastUsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''}</span>{state.usage[f.id]?.guided && <span>Guided workflow completed</span>}</div><Link to={f.path} aria-label={'Open ' + f.name} onClick={close}>↗</Link></div>)}</div>
            {!available.length && <p>We’re checking which features are available to your account. If this continues, reopen discovery later.</p>}
            <Link className="discovery-help" to="/guide" onClick={close}>Explore the full Guide →</Link>
          </>}
          {tab === 'preferences' && <>
            <p className="discovery-intro">Helpful, on your terms.</p>
            <label className="discovery-setting"><span><b>Personalise suggestions</b><small>Keep feature counts and approximate last-used dates in your private account.</small></span><input type="checkbox" checked={state.settings.tracking} disabled={busy} onChange={e => settings({ tracking: e.target.checked, ...(!e.target.checked ? { enabled: false } : {}) })} /></label>
            <label className="discovery-setting"><span><b>Quiet suggestions</b><small>A small unread dot. No popups, email or push notifications.</small></span><input type="checkbox" disabled={busy || !state.settings.tracking} checked={state.settings.enabled} onChange={e => settings({ enabled: e.target.checked })} /></label>
            <label className="discovery-setting"><span><b>At most</b><small>Applies across your devices.</small></span><select aria-label="Suggestion frequency" value={state.settings.gapDays} disabled={busy} onChange={e => settings({ gapDays: Number(e.target.value) })}><option value="1">One a day</option><option value="3">One every 3 days</option><option value="7">One a week</option></select></label>
            <div className="discovery-hours"><span><b>Quiet hours</b><small>Uses the local time on this device. Matching hours turn quiet hours off.</small></span>{(['quietStart', 'quietEnd'] as const).map((key, i) => <label key={key}>{i ? 'Until' : 'From'}<select aria-label={i ? 'Quiet hours end' : 'Quiet hours start'} value={state.settings[key]} disabled={busy} onChange={e => settings({ [key]: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>)}</div>
            <button className="btn tall block" disabled={busy} onClick={() => settings({ pausedUntil: state.settings.pausedUntil > Date.now() ? 0 : Date.now() + 30 * DAY })}>{state.settings.pausedUntil > Date.now() ? 'Resume suggestions' : 'Pause for 30 days'}</button>
            <details className="discovery-history"><summary>Recommendation history</summary>{FEATURES.filter(f => state.feedback[f.id]).map(f => <p key={f.id}><b>{f.name}</b> · {state.feedback[f.id]?.dismissed ? 'Not interested' : (state.feedback[f.id]?.snoozedUntil ?? 0) > Date.now() ? 'Snoozed' : state.usage[f.id]?.guided ? 'Guided workflow completed' : state.feedback[f.id]?.guideStarted ? 'Guide started' : state.feedback[f.id]?.openedAt ? 'Opened' : 'Suggested'}</p>)}{!Object.keys(state.feedback).length && <p>No recommendations yet.</p>}<button className="btn" disabled={busy} onClick={() => void change(s => ({ ...s, feedback: {}, delivery: { ...s.delivery, feature: '', read: true } }))}>Reset recommendation history</button></details>
            <p className="discovery-fine">Discovery stores no lesson text, learner details or private reflections. Turning personalisation off stops collection; delete the data below to clear saved counts and history.</p>
            <button className="btn link" disabled={busy} onClick={() => { if (window.confirm('Delete your discovery counts and recommendation history, and turn personalisation off?')) void change(() => defaults()); }}>Delete discovery data</button>
          </>}
          </>}
        </>}
      </div><footer className="discovery-footer"><span>Made for your teaching.</span><button type="button" onClick={() => { setGuide(''); setTab('preferences'); }}>Your preferences</button></footer>
    </section>}
  </div>;
}

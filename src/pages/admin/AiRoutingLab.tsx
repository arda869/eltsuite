import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../lib/firebase';
import './ai-routing-lab.css';

type JobId = 'tasks' | 'narration' | 'transcription' | 'music' | 'images';
type ProviderId = 'deepseek' | 'elevenlabs';
type Lab = {
  jobs: Record<JobId, { live: string; candidates: string[] }>;
  draft: Partial<Record<JobId, string>>;
  credentials: Partial<Record<ProviderId, { connected: boolean; checkedAt: number | null }>>;
};
type TrialResult = { route: string; value?: { title: string; learnerInstructions: string; questions: string[]; answerKey: string[]; teacherNotes: string }; usage?: { inputTokens: number; outputTokens: number }; maximumListCostUsd?: number | null; error?: string };
const JOBS: { id: JobId; name: string; detail: string; glyph: string }[] = [
  { id: 'tasks', name: 'Task creation', detail: 'Compare two DeepSeek creators against today’s task route.', glyph: '✦' },
  { id: 'narration', name: 'Narration', detail: 'Compare voices for lesson recordings.', glyph: '◉' },
  { id: 'transcription', name: 'Transcription', detail: 'Compare spoken-word accuracy and speaker labels.', glyph: '≋' },
  { id: 'music', name: 'Music', detail: 'Compare full-song output and licensing.', glyph: '♫' },
  { id: 'images', name: 'Pictures', detail: 'Compare classroom image quality and visual style.', glyph: '▧' },
];
const names: Record<string, string> = {
  'openai:gpt-6.1-sol': 'OpenAI · GPT 6.1 Sol',
  'openai:gpt-realtime-2.1-mini': 'OpenAI · Realtime 2.1 mini',
  'openai:gpt-4o-transcribe-diarize': 'OpenAI · Transcribe diarize',
  'openai:gpt-image-2.5-flare': 'OpenAI · GPT Image 2.5 Flare',
  'google:lyria-3.5': 'Google · Lyria 3.5',
  'deepseek:deepseek-v4-pro': 'DeepSeek Creator A · V4 Pro',
  'deepseek:deepseek-flash': 'DeepSeek Creator B · V4.1 Flash',
  'elevenlabs:eleven_v4': 'ElevenLabs · v4',
  'elevenlabs:eleven_v4_turbo': 'ElevenLabs · v4 Turbo',
  'elevenlabs:scribe_v3': 'ElevenLabs · Scribe v3',
  'elevenlabs:music': 'ElevenLabs · Music',
  'google:gemini-3.1-flash-image': 'Google · Gemini 3.1 Flash Image',
};
const invoke = async <T,>(data: unknown): Promise<T> =>
  (await httpsCallable<unknown, T>(getFunctions(app, 'us-central1'), 'adminAiRoutingLab')(data)).data;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'That did not work. Please try again.';

export function AiRoutingLab() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [job, setJob] = useState<JobId>('tasks');
  const [candidate, setCandidate] = useState('');
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ deepseek: '', elevenlabs: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [trial, setTrial] = useState<TrialResult[] | null>(null);
  async function refresh() {
    setBusy('load'); setError('');
    try { const next = await invoke<Lab>({ action: 'status' }); setLab(next); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (lab) setCandidate(lab.draft[job] || lab.jobs[job].candidates[0]); }, [job, lab]);
  async function connect(provider: ProviderId) {
    if (!keys[provider].trim()) return;
    setBusy(provider); setError(''); setNotice('');
    try {
      await invoke({ action: 'connect', provider, key: keys[provider].trim() });
      setKeys(previous => ({ ...previous, [provider]: '' }));
      setNotice(`${provider === 'deepseek' ? 'DeepSeek' : 'ElevenLabs'} passed a free account check and its key was saved securely.`);
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  }
  async function check(provider: ProviderId) {
    setBusy(provider); setError(''); setNotice('');
    try {
      await invoke({ action: 'check', provider });
      setNotice(`${provider === 'deepseek' ? 'DeepSeek' : 'ElevenLabs'} answered the free account check.`);
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  }
  async function saveDraft() {
    if (!candidate) return;
    setBusy('draft'); setError(''); setNotice('');
    try {
      await invoke({ action: 'saveDraft', job, candidate });
      setNotice('Saved as a private trial choice. Teacher requests still use the live route shown above.');
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  }
  async function compareTasks() {
    setBusy('trial'); setError(''); setNotice(''); setTrial(null);
    try {
      const result = await invoke<{ results: TrialResult[] }>({ action: 'trialTasks' });
      setTrial(result.results);
      setNotice('Three private task trials finished. Review the learner task, answer key and teacher notes before choosing a route.');
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(''); }
  }
  const selected = JOBS.find(entry => entry.id === job)!;
  const provider = candidate.split(':')[0];
  const ready = provider === 'google' || lab?.credentials[provider as ProviderId]?.connected === true;
  return <section className="routing-lab">
    <header className="routing-hero">
      <span className="routing-eyebrow">SUPER ADMIN · EXPERIMENTS</span>
      <h1>AI routing lab</h1>
      <p>Choose a provider for each job, connect its key, and prepare comparisons before changing what teachers use.</p>
      <div className="routing-hero-status"><span className="routing-pulse"/>Current routes are unchanged while you prepare the lab.</div>
    </header>
    {error && <p role="alert" className="routing-message routing-error">{error}</p>}
    {notice && <p role="status" className="routing-message routing-success">{notice}</p>}
    {!lab ? <p role="status">{busy === 'load' ? 'Loading routing choices…' : 'Routing choices are unavailable.'}</p> : <>
      <div className="routing-grid">
        <nav className="routing-jobs" aria-label="AI jobs">
          <h2>Jobs</h2>
          {JOBS.map(entry => <button key={entry.id} type="button" className={'routing-job ' + (entry.id === job ? 'is-active' : '')} aria-current={entry.id === job ? 'page' : undefined} onClick={() => setJob(entry.id)}>
            <span className="routing-job-glyph" aria-hidden="true">{entry.glyph}</span><span><b>{entry.name}</b><small>{entry.detail}</small></span><span className="routing-job-arrow" aria-hidden="true">›</span>
          </button>)}
        </nav>
        <div className="routing-detail">
          <div className="routing-section-title"><div><span className="routing-eyebrow">JOB ROUTING</span><h2>{selected.name}</h2></div><span className="routing-draft-pill">Private lab</span></div>
          <div className="routing-live"><span>Teachers use now</span><strong>{names[lab.jobs[job].live] || lab.jobs[job].live}</strong><small>Current production route</small></div>
          <fieldset className="routing-candidates"><legend>Choose a candidate to compare</legend>
            {lab.jobs[job].candidates.map(route => <label key={route} className={'routing-candidate ' + (candidate === route ? 'is-selected' : '')}>
              <input type="radio" name="routing-candidate" value={route} checked={candidate === route} onChange={() => setCandidate(route)}/>
              <span className="routing-radio" aria-hidden="true"/><span><b>{names[route] || route}</b><small>{route.startsWith('deepseek:') ? 'Task creator · structured output' : route.startsWith('elevenlabs:') ? 'Alternative provider' : 'Alternative image model'}</small></span>
            </label>)}
          </fieldset>
          {!ready && <p className="routing-need">Connect {provider === 'deepseek' ? 'DeepSeek' : 'ElevenLabs'} below before saving this trial choice.</p>}
          <div className="routing-actions"><button type="button" className="btn primary" disabled={!!busy || !ready || candidate === lab.draft[job]} onClick={() => void saveDraft()}>{busy === 'draft' ? 'Saving…' : 'Save trial choice'}</button><span>{lab.draft[job] ? `Saved: ${names[lab.draft[job]] || lab.draft[job]}` : 'No trial choice saved'}</span></div>
          <p className="routing-boundary">A trial choice does not switch live teacher requests. The task comparison below uses a fixed example. Publishing a candidate to teacher requests requires the full adapter, cost measurement and real task checks.</p>
        </div>
      </div>
      {job === 'tasks' && <section className="routing-trials"><div className="routing-section-title"><div><span className="routing-eyebrow">SIDE BY SIDE</span><h2>Compare task creators</h2><p>The same synthetic A2 brief goes to the current model and both DeepSeek models. No teacher or learner content is sent.</p></div></div>
        <div className="routing-trial-actions"><button type="button" className="btn primary" disabled={!!busy || !lab.credentials.deepseek?.connected} onClick={() => void compareTasks()}>{busy === 'trial' ? 'Comparing…' : 'Run three paid task trials'}</button><span>{lab.credentials.deepseek?.connected ? 'Up to five comparisons a day. Results and available cost estimates are recorded. Providers may bill incomplete calls.' : 'Connect DeepSeek below to enable this comparison. No calls run until you press this button.'}</span></div>
        {trial && <div className="routing-trial-grid">{trial.map(result => <article className="routing-trial-card" key={result.route}><span className="routing-eyebrow">{result.route.startsWith('openai:') ? 'CURRENT ROUTE' : 'CANDIDATE'}</span><h3>{names[result.route] || result.route}</h3>{result.error ? <p role="status" className="routing-trial-error">{result.error}</p> : result.value && <><strong className="routing-trial-title">{result.value.title}</strong><p>{result.value.learnerInstructions}</p><ol>{result.value.questions.map((question, index) => <li key={index}>{question}</li>)}</ol><details><summary>Answer key and teacher notes</summary><ol>{result.value.answerKey.map((answer, index) => <li key={index}>{answer}</li>)}</ol><p>{result.value.teacherNotes}</p></details><span className="routing-trial-cost">List price ceiling estimate: {result.maximumListCostUsd === null || result.maximumListCostUsd === undefined ? 'Usage unavailable' : `$${result.maximumListCostUsd.toFixed(5)}`}</span></>}</article>)}</div>}
      </section>}
      <section className="routing-keys"><div className="routing-section-title"><div><span className="routing-eyebrow">SECURE CONNECTIONS</span><h2>Provider keys</h2><p>Paste a key here when you are ready. Fields stay empty after saving, and keys never appear in this page again.</p></div></div>
        <div className="routing-key-grid">{(['deepseek', 'elevenlabs'] as const).map(id => <article className="routing-key-card" key={id}>
          <div className="routing-key-head"><div><strong>{id === 'deepseek' ? 'DeepSeek' : 'ElevenLabs'}</strong><span>{id === 'deepseek' ? 'Task creators A and B' : 'Narration, transcription and music'}</span></div><span className={'routing-key-state ' + (lab.credentials[id]?.connected ? 'is-connected' : '')}>{lab.credentials[id]?.connected ? 'Connected' : 'Not connected'}</span></div>
          <label htmlFor={'routing-key-' + id}>API key</label><div className="routing-key-row"><input id={'routing-key-' + id} type="password" value={keys[id]} autoComplete="off" spellCheck={false} placeholder="Paste API key" onChange={event => setKeys(previous => ({ ...previous, [id]: event.target.value }))}/><button className="btn primary" type="button" disabled={!!busy || !keys[id].trim()} onClick={() => void connect(id)}>{busy === id ? 'Checking…' : 'Connect'}</button></div>
          <div className="routing-key-foot"><span>{lab.credentials[id]?.checkedAt ? `Last checked ${new Date(lab.credentials[id]!.checkedAt!).toLocaleString()}` : 'Connection check is free; no media is generated.'}</span>{lab.credentials[id]?.connected && <button type="button" className="routing-link" disabled={!!busy} onClick={() => void check(id)}>Check again</button>}</div>
        </article>)}</div>
      </section>
    </>}
  </section>;
}

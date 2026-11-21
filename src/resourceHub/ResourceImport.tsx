import { useState } from 'react';
import { INTERACTION_PATTERNS, MultiSelect, interactionList, interactionText } from '../components/MultiSelect';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Select } from '../components/Select';
import { app } from '../lib/firebase';
import { ACCEPT, readMaterialSafely, type MaterialSource } from '../materials/readSource';
import { HUB_COLLECTIONS, type HubCollectionId } from './catalog';
import { createResourceDraft, type HubEditorSection } from './hubEditorData';

type Suggestion = {
  title: string; summary: string; focus: string; level: string; minutes: number; interaction: string;
  learnerTasks: { title: string; instructions: string; body: string }[];
  teacherNotes: string; answerKey: string; sourceWarnings: string[];
};
const paragraphs = (value: string) => ({ type: 'doc', content: value.split(/\n+/).filter(Boolean).map(line => ({ type: 'paragraph', content: [{ type: 'text', text: line.slice(0, 10000) }] })) });
const localError = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export function ResourceImport({ uid, onCreated, onCancel }: { uid: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [source, setSource] = useState<MaterialSource | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [collectionId, setCollectionId] = useState<HubCollectionId>('otp');
  const [rights, setRights] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const editSuggestion = (value: Suggestion) => { setSuggestion(value); setReviewed(false); };
  const read = async () => {
    if (!file) return;
    setBusy('Reading document…'); setError(''); setSuggestion(null); setReviewed(false); setRequestId('');
    try { const result = await readMaterialSafely(file, pages, new AbortController().signal); setSource(result); setSourceText(result.text); }
    catch (cause) { setError(localError(cause)); }
    finally { setBusy(''); }
  };
  const generate = async () => {
    if (!source || (!sourceText.trim() && !source.images.length) || !rights) return;
    setBusy('Preparing a draft suggestion…'); setError(''); setReviewed(false);
    try {
      const call = httpsCallable<{ action: string; requestId: string; source: MaterialSource; instruction: string }, { status: string; suggestion: Suggestion }>(getFunctions(app, 'us-central1'), 'lessonAssistant', { timeout: 420000 });
      const id = crypto.randomUUID(); setRequestId(id);
      const response = await call({ action: 'resourceHubImportDraft', requestId: id, source: { ...source, text: sourceText }, instruction });
      if (!response.data?.suggestion) throw new Error('The import returned no draft suggestion.');
      setSuggestion(response.data.suggestion);
      setRequestId('');
    } catch (cause) { setError(localError(cause)); }
    finally { setBusy(''); }
  };
  const check = async () => {
    if (!requestId) return;
    setBusy('Checking import…'); setError('');
    try {
      const call = httpsCallable<{ action: string; requestId: string }, { status: string; suggestion?: Suggestion }>(getFunctions(app, 'us-central1'), 'lessonAssistant');
      const response = await call({ action: 'resourceHubImportStatus', requestId });
      if (response.data.status === 'completed' && response.data.suggestion) { setSuggestion(response.data.suggestion); setRequestId(''); }
      else if (response.data.status === 'running') setError('The suggestion is still being prepared. Check again shortly.');
      else { setRequestId(''); setError('This import did not finish. Start a new request.'); }
    } catch (cause) { setError(localError(cause)); }
    finally { setBusy(''); }
  };
  const create = async () => {
    if (!suggestion || !reviewed || !rights) return;
    setBusy('Saving private draft…'); setError('');
    try {
      const sections: HubEditorSection[] = [
        { id: crypto.randomUUID(), audience: 'teacher', kind: 'notes', title: 'Teacher notes', instructions: '', content: paragraphs(suggestion.teacherNotes) },
        ...suggestion.learnerTasks.map(task => ({ id: crypto.randomUUID(), audience: 'learner' as const, kind: 'task' as const, title: task.title, instructions: task.instructions, content: paragraphs(task.body) })),
        { id: crypto.randomUUID(), audience: 'teacher', kind: 'answer-key', title: 'Answer key', instructions: '', content: paragraphs(suggestion.answerKey) },
      ];
      const result = await createResourceDraft(uid, collectionId, { title: suggestion.title, summary: suggestion.summary, focus: suggestion.focus, level: suggestion.level, minutes: suggestion.minutes, interaction: suggestion.interaction, sections, sourceReview: { fileName: source?.name ?? 'Pasted source', importedAt: Date.now(), rightsConfirmed: rights, warnings: [...(source?.warnings ?? []), ...suggestion.sourceWarnings] } });
      onCreated(result.id);
    } catch (cause) { setError(`The private draft could not be saved. ${localError(cause)}`); }
    finally { setBusy(''); }
  };
  return <section className="rhe-import" aria-labelledby="rhe-import-title"><header className="rhe-page-head"><div><span className="rh-kicker">PRIVATE DRAFT IMPORT</span><h1 id="rhe-import-title">Import from a document</h1><p>Read the source, review the suggested activity and create a private draft. Nothing is published automatically.</p></div><button type="button" className="rhe-outline" onClick={onCancel} disabled={!!busy}>Back to editor</button></header>
    <div className="rhe-import-layout"><div className="rhe-edit-card"><h2>1. Choose and inspect the source</h2><div className="rhe-form-grid"><label>Document<input type="file" accept={ACCEPT} disabled={!!busy || !!requestId} onChange={event => { setFile(event.target.files?.[0] ?? null); setSource(null); setSuggestion(null); setReviewed(false); }} /></label><label>PDF pages or slides, if needed<input value={pages} onChange={event => setPages(event.target.value)} placeholder="e.g. 1–3 or 2, 4" disabled={!!busy} /></label></div><p className="rhe-card-intro">PDF, Word, PowerPoint, Excel, text or image, up to 20 MB. Choose at most six PDF pages or slides.</p><button type="button" className="rhe-outline" onClick={() => void read()} disabled={!file || !!busy || !!requestId}>Read source</button>
    {source && <><p className="rhe-action-note">{source.name} · {source.images.length} page previews. Compare extracted text and pictures with the original before continuing.</p>{source.warnings.map(warning => <p key={warning} className="rhe-action-note">{warning}</p>)}<label className="rhe-wide-field">Extracted source text<textarea rows={14} value={sourceText} onChange={event => { setSourceText(event.target.value); setSuggestion(null); }} maxLength={30000} disabled={!!busy || !!requestId} /></label>{source.images.length > 0 && <div className="rhe-source-images">{source.images.map((image, index) => <figure key={index}><img src={image} alt={`Source page ${index + 1}`} /><figcaption>{source.imageLabels?.[index] ?? `Source image ${index + 1}`}</figcaption></figure>)}</div>}<label className="rhe-wide-field">Adaptation instructions, if any<textarea rows={3} maxLength={1000} value={instruction} onChange={event => { setInstruction(event.target.value); setSuggestion(null); setReviewed(false); }} placeholder="For example, make the directions simpler for B1 learners." disabled={!!busy || !!requestId} /></label><label className="rhe-confirm"><input type="checkbox" checked={rights} onChange={event => { setRights(event.target.checked); setReviewed(false); }} /> I have permission to use and adapt this source for the Resource Hub.</label><button type="button" className="rh-primary" onClick={() => void generate()} disabled={!!busy || !!requestId || !rights || (!sourceText.trim() && !source.images.length)}>Suggest a draft with AI</button>{requestId && <button type="button" className="rhe-outline" disabled={!!busy} onClick={() => void check()}>Check import status</button>}{!rights && <p className="rhe-action-note">Confirm your right to adapt the source before requesting a suggestion.</p>}</>}</div>
    {suggestion && <div className="rhe-edit-card"><h2>2. Review the proposed activity</h2><p className="rhe-card-intro">Edit the text below and check it against the source. Pictures are source references only and are not added to this draft.</p>{suggestion.sourceWarnings.map((warning, index) => <p key={index} className="rhe-action-note">Check source: {warning}</p>)}<div className="rhe-form-grid"><label>Title<input value={suggestion.title} onChange={event => editSuggestion({ ...suggestion, title: event.target.value })} /></label><label>Collection<Select value={collectionId} options={HUB_COLLECTIONS.map(item => ({ v: item.id, label: item.title }))} onChange={value => setCollectionId(value as HubCollectionId)} label="Collection" /></label><label>Language focus<input value={suggestion.focus} onChange={event => editSuggestion({ ...suggestion, focus: event.target.value })} /></label><label>Level<input value={suggestion.level} onChange={event => editSuggestion({ ...suggestion, level: event.target.value })} /></label><label>Time in minutes<input type="number" min={1} max={240} value={suggestion.minutes} onChange={event => editSuggestion({ ...suggestion, minutes: Number(event.target.value) })} /></label><label>Interaction<MultiSelect label="Interaction" options={INTERACTION_PATTERNS} value={interactionList(suggestion.interaction)} onChange={list => editSuggestion({ ...suggestion, interaction: interactionText(list) })} /></label></div><label className="rhe-wide-field">Summary<textarea rows={3} value={suggestion.summary} onChange={event => editSuggestion({ ...suggestion, summary: event.target.value })} /></label>{suggestion.learnerTasks.map((task, index) => <fieldset className="rhe-import-task" key={index}><legend>Learner task {index + 1}</legend><label className="rhe-wide-field">Title<input value={task.title} onChange={event => editSuggestion({ ...suggestion, learnerTasks: suggestion.learnerTasks.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })} /></label><label className="rhe-wide-field">Instruction<input value={task.instructions} onChange={event => editSuggestion({ ...suggestion, learnerTasks: suggestion.learnerTasks.map((item, at) => at === index ? { ...item, instructions: event.target.value } : item) })} /></label><label className="rhe-wide-field">Learner content<textarea rows={7} value={task.body} onChange={event => editSuggestion({ ...suggestion, learnerTasks: suggestion.learnerTasks.map((item, at) => at === index ? { ...item, body: event.target.value } : item) })} /></label></fieldset>)}<label className="rhe-wide-field">Teacher notes<textarea rows={8} value={suggestion.teacherNotes} onChange={event => editSuggestion({ ...suggestion, teacherNotes: event.target.value })} /></label><label className="rhe-wide-field">Private answer key<textarea rows={8} value={suggestion.answerKey} onChange={event => editSuggestion({ ...suggestion, answerKey: event.target.value })} /></label><label className="rhe-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I compared every learner task and the answer key with the source.</label><button type="button" className="rh-primary" disabled={!!busy || !reviewed || !rights || !suggestion.title.trim() || !suggestion.answerKey.trim()} onClick={() => void create()}>Create private draft</button>{!reviewed && <p className="rhe-action-note">Review the content and answer key before saving.</p>}</div>}
    </div>{busy && <p role="status" className="rhe-action-note">{busy}</p>}{error && <p role="alert" className="rhe-error">{error}</p>}</section>;
}

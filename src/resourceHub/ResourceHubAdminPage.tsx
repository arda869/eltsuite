import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { INTERACTION_PATTERNS, MultiSelect, interactionList, interactionText } from '../components/MultiSelect';
import { Select } from '../components/Select';
import { PdfPreview } from '../components/PdfPreview';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor, InstrView } from '../editor/InstrEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey } from '../lib/questions';
import { useAuth } from '../lib/auth';
import { useSuper } from '../lib/admin';
import { db } from '../lib/firebase';
import { HUB_ACTIVITIES, HUB_COLLECTIONS, type HubCollectionId } from './catalog';
import { addLearnerVersion, createCollectionDraft, createResourceDraft, getCollectionDraft, getResourceDraft, newSection, publishCollection, publishResource, returnCollectionToDraft, returnResourceToDraft, saveCollectionDraft, saveResourceDraft, sendCollectionForReview, sendResourceForReview, subscribePublishedResources, subscribeResourceDrafts, validateResource, type HubCollectionDraft, type HubEditorSection, type HubResourceDraft, type HubResourceEdition } from './hubEditorData';
import { generatedAnswerLines, withGeneratedAnswerKey } from './hubAnswerKey';
import { ResourceLivePreview } from './ResourceLivePreview';
import { ResourceActivityDirectory } from './ResourceActivityDirectory';
import { ResourceActivityMetrics } from './ResourceActivityMetrics';
import { prepareStaticPage, saveStaticKitOverride, subscribeStaticKitOverride, type HubStaticOverride } from './hubStaticOverride';
import { prepareHubImage } from './hubImageUpload';
import { ResourceImport } from './ResourceImport';
import { hasDigitalOnlyItems, makeEditorResourcePdf } from './ResourceRichPdf';
import { publishedResourceToActivity } from './usePublishedHubResources';
import { usePublishedHubCollections } from './usePublishedHubCollections';
import { publishedTasks } from './resourceTasks';
import './hub-editor.css';

const STATUS = { draft: 'Draft', 'in-review': 'In review' } as const;
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export function ResourceHubAdminPage() {
  const { user } = useAuth();
  const isSuper = useSuper();
  const { id } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  if (isSuper === null) return <Loader full label="Checking Resource Hub editor access" />;
  if (!user || !isSuper) return <div className="shell rhe-shell"><TopBar /><main className="rhe-denied"><h1>Resource Hub editor</h1><p>This workspace is available to ELT Suite super admins only.</p><Link to="/resource-hub">Return to Resource Hub</Link></main></div>;
  return <div className="shell rhe-shell"><TopBar><nav className="rhe-top"><Link to="/resource-hub">Resource Hub</Link><span>/</span><Link to="/resource-hub/admin">Editor</Link></nav></TopBar><main className={`rhe-main${id ? ' rhe-main--activity' : ''}`}>{id ? <ResourceEditor key={id} id={id} uid={user.uid} /> : params.get('source') === 'otp-002' ? <StaticKitEditor /> : params.get('import') ? <ResourceImport uid={user.uid} onCreated={createdId => { window.location.assign(`/resource-hub/admin/${createdId}`); }} onCancel={() => window.location.assign('/resource-hub/admin')} /> : params.get('collection') ? <CollectionEditor id={params.get('collection') as HubCollectionId} uid={user.uid} /> : <EditorIndex uid={user.uid} />}</main></div>;
}

function EditorIndex({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const publishedCollections = usePublishedHubCollections();
  const [drafts, setDrafts] = useState<HubResourceDraft[] | null>(null);
  const [published, setPublished] = useState<HubResourceEdition[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeResourceDrafts(setDrafts, cause => setError(friendlyError(cause))), []);
  useEffect(() => subscribePublishedResources(setPublished, cause => setError(friendlyError(cause))), []);
  const make = async () => {
    setBusy(true); setError('');
    try { const draft = await createResourceDraft(uid); navigate(`/resource-hub/admin/${draft.id}`); }
    catch (cause) { setError(`Couldn’t create the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  return <div className="rhe-index"><header className="rhe-page-head"><div><span className="rh-kicker">SUPER ADMIN WORKSPACE</span><h1>Resource Hub editor</h1><p>Author and review classroom resources. Draft edits are private until you publish an edition.</p></div><div className="rhe-head-actions"><Link className="rhe-outline" to="/resource-hub/admin?import=1">Import from document</Link><button type="button" className="rh-primary" disabled={busy} onClick={() => void make()}>{busy ? 'Creating…' : '+ New activity'}</button></div></header>
    {error && <p className="rhe-error" role="alert">{error}</p>}
    <ResourceActivityDirectory drafts={drafts} published={published} />
    <ResourceActivityMetrics published={published} />
    <section className="rhe-index-section"><div className="rhe-section-head"><h2>Collection identity</h2></div><div className="rhe-collection-grid">{HUB_COLLECTIONS.map(collection => <Link key={collection.id} to={`/resource-hub/admin?collection=${collection.id}`} className="rhe-collection-card"><img src={collection.cover} alt="" /><span><strong>{collection.title}</strong><small>{publishedCollections.items?.find(item => item.id === collection.id)?.visible === false ? 'Hidden from teachers' : 'Visible to teachers'} · Manage cover and visibility</small></span><b aria-hidden="true">→</b></Link>)}</div></section>
    <p className="rhe-disclosure">Document imports create private drafts only after source and answer-key review. Each draft requires a separate publication step.</p>
  </div>;
}

function ResourceEditor({ id, uid }: { id: string; uid: string }) {
  const publishedCollections = usePublishedHubCollections();
  const [saved, setSaved] = useState<HubResourceDraft | null>(null);
  const [draft, setDraft] = useState<HubResourceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('');
  const [tab, setTab] = useState<'content' | 'details' | 'history'>('content');
  const [editions, setEditions] = useState<{ edition: number; publishedAt: number }[]>([]);
  const [printPreview, setPrintPreview] = useState<Uint8Array | null>(null);
  const [keyReviewed, setKeyReviewed] = useState(false);
  // Like the lesson editor in Classes: the page on the left, the editor on the right, sizes you can drag.
  const [navOpen, setNavOpen] = useState(() => { try { return localStorage.getItem('rhe-nav') !== 'closed'; } catch { return true; } });
  const [split, setSplit] = useState(() => { try { const v = Number(localStorage.getItem('rhe-split')); return v >= 25 && v <= 70 ? v : 42; } catch { return 42; } });
  useEffect(() => { try { localStorage.setItem('rhe-nav', navOpen ? 'open' : 'closed'); localStorage.setItem('rhe-split', String(split)); } catch { /* sizes are a convenience */ } }, [navOpen, split]);
  useEffect(() => {
    let live = true;
    getResourceDraft(id).then(value => { if (live) { setSaved(value); setDraft(value); setActiveSection(value?.sections[0]?.id ?? ''); } }, cause => live && setError(friendlyError(cause)));
    getDocs(collection(db, 'resourceHubPublished', id, 'editions')).then(snapshot => { if (live) setEditions(snapshot.docs.map(item => item.data() as { edition: number; publishedAt: number }).sort((a, b) => b.edition - a.edition)); }, () => {});
    return () => { live = false; };
  }, [id]);
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const question = 'You have unsaved changes to this activity. Leave without saving?';
    const warnOnUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const warnOnLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.hasAttribute('download') || link.getAttribute('target') === '_blank') return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (window.confirm(question)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Browser back does not unload a React Router page. A same-URL history entry
    // lets us ask before the previous page is reached.
    const guard = `resource-draft-${Date.now()}`;
    const guardedUrl = window.location.href;
    const guardedState = { ...window.history.state, resourceDraftGuard: guard };
    window.history.pushState(guardedState, '', guardedUrl);
    const warnOnBack = () => {
      if (window.confirm(question)) {
        window.removeEventListener('beforeunload', warnOnUnload);
        window.removeEventListener('popstate', warnOnBack);
        window.history.back();
      } else window.history.pushState(guardedState, '', guardedUrl);
    };
    window.addEventListener('beforeunload', warnOnUnload);
    window.addEventListener('popstate', warnOnBack);
    document.addEventListener('click', warnOnLink, true);
    return () => {
      window.removeEventListener('beforeunload', warnOnUnload);
      window.removeEventListener('popstate', warnOnBack);
      document.removeEventListener('click', warnOnLink, true);
      // Saving removes the same-URL guard entry, so Back still takes one press.
      if (window.location.href === guardedUrl && window.history.state?.resourceDraftGuard === guard) window.history.back();
    };
  }, [dirty]);
  const validation = useMemo(() => draft ? validateResource(draft) : [], [draft]);
  const editable = draft?.state === 'draft';
  const patch = (value: Partial<HubResourceDraft>) => { setKeyReviewed(false); setDraft(current => current ? { ...current, ...value } : current); };
  const patchSection = (sectionId: string, value: Partial<HubEditorSection>) => { setKeyReviewed(false); setDraft(current => current ? { ...current, sections: current.sections.map(section => section.id === sectionId ? { ...section, ...value } : section) } : current); };
  const save = async () => {
    if (!draft || !saved || busy || !dirty) return;
    setBusy(true); setError('');
    try { const next = await saveResourceDraft(draft, saved.revision); setDraft(next); setSaved(next); }
    catch (cause) { setError(`Couldn’t save the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const review = async () => {
    if (!draft || busy || dirty) return;
    setBusy(true); setError('');
    try { await sendResourceForReview(draft.id, draft.revision); const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); setKeyReviewed(false); }
    catch (cause) { setError(`Couldn’t send for review. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const returnToDraft = async () => {
    if (!draft || busy) return;
    setBusy(true); setError('');
    try { await returnResourceToDraft(draft.id, draft.revision); const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); setKeyReviewed(false); }
    catch (cause) { setError(`Couldn’t reopen the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!draft || busy || dirty || !keyReviewed) return;
    setBusy(true); setError('');
    try {
      const activity = publishedResourceToActivity({ ...draft, sections: withGeneratedAnswerKey(draft.sections), edition: draft.revision, publishedAt: Date.now(), publishedBy: uid } as HubResourceEdition);
      const collection = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
      const learnerIds = draft.sections.filter(section => section.audience === 'learner').map(section => section.id);
      const teacherIds = draft.sections.filter(section => section.audience === 'teacher').map(section => section.id);
      const copiedTasks = publishedTasks(activity, new Set(learnerIds));
      const hasTeacherGuidance = draft.sections.some(section => section.audience === 'teacher' && (section.instructions.trim() || JSON.stringify(section.content).includes('"text":"')));
      if (copiedTasks.filter(task => !task.hidden).length !== learnerIds.length || (hasTeacherGuidance && !copiedTasks.some(task => task.hidden && task.notes))) throw new Error('The Class copy could not keep all learner tasks and private teacher notes.');
      const pdf = await makeEditorResourcePdf({ activity, collection, learnerIds, teacherIds, copies: 1, paper: 'a4', colour: 'colour' });
      if (pdf.length < 100 || new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') throw new Error('The printable edition could not be rendered.');
      const edition = await publishResource(draft.id, draft.revision, uid);
      const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); setKeyReviewed(false); setEditions(current => [{ edition: edition.edition, publishedAt: edition.publishedAt }, ...current]);
    }
    catch (cause) { setError(`Couldn’t publish. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const previewPrint = async () => {
    if (!draft || validation.length || busy) return;
    setBusy(true); setError('');
    try {
      const activity = publishedResourceToActivity({ ...draft, sections: withGeneratedAnswerKey(draft.sections), edition: draft.revision, publishedAt: Date.now(), publishedBy: uid } as HubResourceEdition);
      const collection = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
      const learnerIds = draft.sections.filter(section => section.audience === 'learner').map(section => section.id);
      const teacherIds = draft.sections.filter(section => section.audience === 'teacher').map(section => section.id);
      setPrintPreview(await makeEditorResourcePdf({ activity, collection, learnerIds, teacherIds, copies: 1, paper: 'a4', colour: 'colour' }));
    } catch (cause) { setError(`The print preview could not be made. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  if (!draft) return <div className="rhe-loading"><Link to="/resource-hub/admin">← All drafts</Link>{error ? <p className="rhe-error" role="alert">{error}</p> : <Loader label="Opening draft" />}</div>;
  const section = draft.sections.find(item => item.id === activeSection) ?? draft.sections[0];
  const generatedAnswers = generatedAnswerLines(draft.sections);
  const hasDigitalOnly = draft.sections.some(item => hasDigitalOnlyItems(item.content));
  return <div className={`rhe-editor rhe-split-editor${navOpen ? '' : ' nav-closed'}${tab === 'content' ? '' : ' details-view'}`} style={{ ['--rhe-split' as string]: `${split}%` }}><header className="rhe-editor-head rhe-head-compact"><div className="rhe-head-main"><Link to="/resource-hub/admin" className="rh-back" aria-label="All drafts">←</Link><button type="button" className="rhe-nav-toggle" aria-expanded={navOpen} aria-controls="rhe-editor-side" onClick={() => setNavOpen(open => !open)} title={navOpen ? 'Hide the side panel' : 'Show the side panel'}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg><span className="sr-only">{navOpen ? 'Hide the side panel' : 'Show the side panel'}</span></button><span className="rh-kicker">{draft.collectionId.toUpperCase()} · {draft.number || 'NEW'}</span><h1>{draft.title || 'Untitled activity'}</h1><span className="rhe-head-note" title={draft.publishedAt ? `Teachers still see the edition published on ${new Date(draft.publishedAt).toLocaleDateString()} until you publish this draft.` : 'This activity is private until its first edition is published.'}>{draft.publishedAt ? `Published ${new Date(draft.publishedAt).toLocaleDateString()}` : 'Private'}</span></div><div className="rhe-status"><span className={draft.state === 'in-review' ? 'review' : ''}>{STATUS[draft.state]}</span>{dirty ? 'Unsaved changes' : 'Saved'}{draft.publishedAt && <Link className="rhe-published-link" to={`/resource-hub?activity=${draft.collectionId}-${draft.number.padStart(3, '0')}`} target="_blank" rel="noopener noreferrer" title="Open the edition teachers can use, including PDF download and Class copy">View published page ↗</Link>}<button type="button" className="rhe-mobile-preview-link" onClick={() => document.getElementById('resource-live-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Preview ↓</button></div></header>
    <div className="rhe-editor-layout"><aside id="rhe-editor-side" className="rhe-editor-side" hidden={!navOpen}><div className="rhe-side-group"><strong>Activity</strong><button type="button" className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>Content</button><button type="button" className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details and filters</button><button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Version history</button></div>{tab === 'content' && <div className="rhe-side-group"><strong>Sections</strong>{draft.sections.map(item => <button key={item.id} type="button" className={activeSection === item.id ? 'on' : ''} onClick={() => setActiveSection(item.id)}>{item.audience === 'teacher' ? '◆' : '◇'} {item.versionLabel ? `${item.title} · ${item.versionLabel}` : item.title}</button>)}{editable && <div className="rhe-side-add"><button type="button" onClick={() => { const next = newSection('learner'); patch({ sections: [...draft.sections, next] }); setActiveSection(next.id); }}>+ Learner task</button>{section?.audience === 'learner' && <button type="button" onClick={() => { const result = addLearnerVersion(draft.sections, section.id); patch({ sections: result.sections }); setActiveSection(result.id); }}>+ A/B version</button>}<button type="button" onClick={() => { const next = newSection('teacher'); patch({ sections: [...draft.sections, next] }); setActiveSection(next.id); }}>+ Teacher note</button></div>}</div>}</aside><aside className="rhe-check-panel">{tab === 'content' && <ResourceLivePreview draft={draft} activeSectionId={activeSection} collection={{ ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) }} />}<span className="rh-kicker">BEFORE PUBLISHING</span><h3>Review checklist</h3><ul>{validation.length ? validation.map(message => <li key={message} className="needs">{message}</li>) : <li className="okay">Required details and learner content are present.</li>}<li>Check answer keys and classroom suitability before publishing.</li><li>Preview the printed pages and a copied Class task before making this edition available to teachers.</li>{hasDigitalOnly && <li className="needs">This activity contains digital-only visuals or interactions. The PDF labels them but cannot reproduce the complete task. Use the Class copy for those elements.</li>}</ul>{draft.sourceReview && <details className="rhe-source-review"><summary>Imported source and checks</summary><p>{draft.sourceReview.fileName}</p>{draft.sourceReview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}{error && <p className="rhe-error" role="alert">{error}</p>}{dirty && <p className="rhe-action-note">Save your changes before sending for review.</p>}<button type="button" className="rhe-outline rhe-preview-action" disabled={busy || dirty || validation.length > 0} onClick={() => void previewPrint()}>Preview print PDF</button>{!editable && <label className="rhe-confirm"><input type="checkbox" checked={keyReviewed} onChange={event => setKeyReviewed(event.target.checked)} /> I checked the learner tasks, private answer key and print preview.</label>}<div className="rhe-actions">{editable ? <><button type="button" className="rh-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Working…' : 'Save draft'}</button><button type="button" className="rhe-outline" disabled={busy || dirty || validation.length > 0} onClick={() => void review()}>Send for review</button></> : <><button type="button" className="rh-primary" disabled={busy || validation.length > 0 || !keyReviewed} onClick={() => void publish()}>{busy ? 'Working…' : 'Publish edition'}</button><button type="button" className="rhe-outline" disabled={busy} onClick={() => void returnToDraft()}>Return to draft</button></>}</div></aside><div className="rhe-divider" role="separator" aria-orientation="vertical" aria-label="Drag to change the size of the preview" aria-valuemin={25} aria-valuemax={70} aria-valuenow={split} tabIndex={0} onPointerDown={event => { const layout = event.currentTarget.parentElement as HTMLElement; const startX = event.clientX; const startSplit = split; const width = layout.getBoundingClientRect().width; event.currentTarget.setPointerCapture(event.pointerId); layout.classList.add('dragging'); const move = (ev: PointerEvent) => setSplit(Math.round(Math.min(70, Math.max(25, startSplit + ((ev.clientX - startX) / width) * 100)))); const up = () => { layout.classList.remove('dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} onKeyDown={event => { if (event.key === 'ArrowLeft') setSplit(value => Math.max(25, value - 5)); if (event.key === 'ArrowRight') setSplit(value => Math.min(70, value + 5)); }} />
    <div id="resource-editor-content" className="rhe-editor-body">{tab === 'content' && section && <div className="rhe-edit-card"><div className="rhe-card-head"><div><span className="rh-kicker">{section.audience === 'teacher' ? 'TEACHER MATERIAL' : 'LEARNER MATERIAL'}</span><h2>{section.title}</h2></div>{editable && draft.sections.length > 1 && <button type="button" className="rhe-danger" onClick={() => { const rest = draft.sections.filter(item => item.id !== section.id); if (section.versionGroup && rest.filter(item => item.versionGroup === section.versionGroup).length === 1) { const remainingIndex = rest.findIndex(item => item.versionGroup === section.versionGroup); const { versionGroup: _formerGroup, versionLabel: _formerLabel, ...plainSection } = rest[remainingIndex]; void _formerGroup; void _formerLabel; rest[remainingIndex] = plainSection; } patch({ sections: rest }); setActiveSection(rest[0]?.id ?? ''); }}>Remove section</button>}</div><div className="rhe-form-grid"><label>Section title<input value={section.title} disabled={!editable} onChange={event => patchSection(section.id, { title: event.target.value })} /></label>{section.versionGroup && <label>Version name<input value={section.versionLabel ?? ''} disabled={!editable} onChange={event => patchSection(section.id, { versionLabel: event.target.value })} placeholder="Learner A, Customer…" /></label>}<label>Who sees this?<Select value={section.audience} disabled={!editable || !!section.versionGroup} options={[{ v: 'learner', label: 'Learner' }, { v: 'teacher', label: 'Teacher' }]} onChange={value => patchSection(section.id, { audience: value, kind: value === 'learner' ? 'task' : section.kind === 'task' ? 'notes' : section.kind })} label="Section audience" /></label>{section.audience === 'teacher' && <label>Teacher section type<Select value={section.kind} disabled={!editable} options={[{ v: 'notes', label: 'Teacher notes' }, { v: 'answer-key', label: 'Answer key' }]} onChange={value => patchSection(section.id, { kind: value as 'notes' | 'answer-key' })} label="Teacher section type" /></label>}</div><div className="rhe-wide-field rhe-instruction-field"><span>On-screen instruction</span>{editable ? <InstrEditor key={`${section.id}-screen`} doc={section.instrDoc} text={section.instructions} onChange={(instrDoc, instructions) => patchSection(section.id, { instrDoc, instructions })} placeholder="What should the learner do?" /> : <InstrView doc={section.instrDoc} text={section.instructions} />}</div>{section.audience === 'learner' && <div className="rhe-wide-field rhe-instruction-field"><span>Paper instruction <small>Optional · leave blank to use the on-screen instruction</small></span>{editable ? <InstrEditor key={`${section.id}-paper`} doc={section.printInstrDoc} text={section.printInstructions ?? ''} onChange={(printInstrDoc, printInstructions) => patchSection(section.id, { printInstrDoc, printInstructions })} placeholder="Only if the printed instructions differ" /> : <InstrView doc={section.printInstrDoc} text={section.printInstructions ?? ''} />}</div>}{section.kind === 'answer-key' && <div className="rhe-answer-preview"><strong>Answers from learner questions</strong>{generatedAnswers.length ? <pre>{generatedAnswers.join('\n')}</pre> : <p>Answers entered in learner questions appear here automatically. Use the field below for suggested responses to open questions.</p>}</div>}<div className="rhe-content-label">{section.kind === 'answer-key' ? 'Suggested responses and extra guidance' : 'Content'}</div><div className="rhe-task-editor">{editable ? <TaskEditor key={section.id} content={section.content} onChange={content => patchSection(section.id, { content })} classId="" textOnly={section.audience === 'teacher'} label={section.title} /> : <LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(section.content, true).content} responses={{}} disabled classId="" /></LocalActivityMode.Provider>}</div></div>}
      {tab === 'details' && <div className="rhe-edit-card"><span className="rh-kicker">FINDABLE AND PRINTABLE</span><h2>Details and filters</h2><p className="rhe-card-intro">Teachers use these details to find the right activity for a class.</p><div className="rhe-form-grid"><label>Title<input value={draft.title} disabled={!editable} onChange={event => patch({ title: event.target.value })} /></label><label>Activity number<input value={draft.number} disabled={!editable} onChange={event => patch({ number: event.target.value })} placeholder="e.g. 051" /></label><label>Language focus<input value={draft.focus} disabled={!editable} onChange={event => patch({ focus: event.target.value })} /></label><label>Level<input value={draft.level} disabled={!editable} onChange={event => patch({ level: event.target.value })} placeholder="e.g. A2–B1" /></label><label>Time in minutes<input type="number" min={1} max={240} value={draft.minutes} disabled={!editable} onChange={event => patch({ minutes: Number(event.target.value) })} /></label><label>Interaction<MultiSelect label="Interaction" options={INTERACTION_PATTERNS} disabled={!editable} value={interactionList(draft.interaction)} onChange={list => patch({ interaction: interactionText(list) })} /></label><label>Preparation<Select value={draft.prep} disabled={!editable} options={[{ v: 'No prep', label: 'No prep' }, { v: 'Print', label: 'Print' }, { v: 'Print and cut', label: 'Print and cut' }]} onChange={value => patch({ prep: value })} label="Preparation" /></label><label>Works in<Select value={draft.mode} disabled={!editable} options={[{ v: 'Face-to-face and online', label: 'Face-to-face and online' }, { v: 'Face-to-face only', label: 'Face-to-face only' }, { v: 'Online only', label: 'Online only' }]} onChange={value => patch({ mode: value })} label="Delivery mode" /></label><label>Energy<Select value={String(draft.energy)} disabled={!editable} options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => patch({ energy: Number(value) as 1 | 2 | 3 })} label="Energy" /></label><label>Collection<Select value={draft.collectionId} disabled={!editable} options={HUB_COLLECTIONS.map(item => ({ v: item.id, label: item.title }))} onChange={value => patch({ collectionId: value })} label="Collection" /></label></div><label className="rhe-wide-field">Short summary<textarea value={draft.summary} disabled={!editable} rows={3} onChange={event => patch({ summary: event.target.value })} placeholder="What happens in this activity?" /></label></div>}
      {tab === 'history' && <div className="rhe-edit-card"><span className="rh-kicker">VERSIONS</span><h2>Version history</h2><p className="rhe-card-intro">Published editions are saved separately. Draft edits never change them.</p>{editions.length ? <ul className="rhe-history">{editions.map((edition, index) => <li key={edition.edition}><strong>Edition {edition.edition}</strong><span>{new Date(edition.publishedAt).toLocaleString()}</span>{index === 0 && <em>Current published edition</em>}</li>)}</ul> : <p>No edition has been published yet.</p>}</div>}
    </div></div>{printPreview && <PdfPreview bytes={printPreview} name={`${draft.title || "Resource Hub"} preview`} onClose={() => setPrintPreview(null)} />}
  </div>;
}

function StaticKitEditor() {
  const builtIn = HUB_ACTIVITIES.find(activity => activity.id === 'otp-002')!;
  const [saved, setSaved] = useState<HubStaticOverride | null>(null);
  const [draft, setDraft] = useState<HubStaticOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => subscribeStaticKitOverride(value => {
    const current = { id: 'otp-002' as const, title: builtIn.title, summary: builtIn.summary, pages: builtIn.pages, focus: builtIn.focus, level: builtIn.level, minutes: builtIn.minutes, interaction: builtIn.interaction, prep: builtIn.prep, mode: builtIn.mode, energy: builtIn.energy, updatedAt: 0, ...value };
    setSaved(current); setDraft(current);
  }, cause => setError(friendlyError(cause))), [builtIn]);
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const patchPage = (id: string, values: Partial<HubStaticOverride['pages'][number]>) => setDraft(current => current ? { ...current, pages: current.pages.map(page => page.id === id ? { ...page, ...values } : page) } : current);
  const uploadPage = async (id: string, file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try { patchPage(id, { image: await prepareStaticPage(file) }); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft || !dirty || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await saveStaticKitOverride(draft); setMessage('Source pages published. Teachers will see these images when they reopen Resource Hub.'); }
    catch (cause) { setError(`Couldn’t save source pages. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  if (!draft) return <div className="rhe-loading"><Link to="/resource-hub/admin">← Editor</Link>{error ? <p className="rhe-error" role="alert">{error}</p> : <Loader label="Loading source pages" />}</div>;
  return <div className="rhe-static-editor"><Link to="/resource-hub/admin" className="rh-back">← All activities</Link><Link className="rhe-published-link" to="/resource-hub?activity=otp-002" target="_blank" rel="noopener noreferrer">View published page ↗</Link><header className="rhe-page-head"><div><span className="rh-kicker">OFF THE PAGE · 002</span><h1>Edit source pages</h1><p>This activity uses four original page images. Replace or rename a page here; the artwork itself remains an image.</p></div><button type="button" className="rh-primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and publish'}</button></header><div className="rhe-edit-card"><div className="rhe-form-grid"><label>Activity title<input value={draft.title} onChange={event => setDraft(current => current ? { ...current, title: event.target.value } : current)} /></label><label>Short summary<input value={draft.summary} onChange={event => setDraft(current => current ? { ...current, summary: event.target.value } : current)} /></label><label>Language focus<input value={draft.focus ?? ''} onChange={event => setDraft(current => current ? { ...current, focus: event.target.value } : current)} /></label><label>Level<input value={draft.level ?? ''} onChange={event => setDraft(current => current ? { ...current, level: event.target.value } : current)} /></label><label>Time in minutes<input type="number" min={1} max={240} value={draft.minutes ?? 35} onChange={event => setDraft(current => current ? { ...current, minutes: Number(event.target.value) } : current)} /></label><label>Interaction<MultiSelect label="Interaction" options={INTERACTION_PATTERNS} value={interactionList(draft.interaction ?? '')} onChange={list => setDraft(current => current ? { ...current, interaction: interactionText(list) } : current)} /></label><label>Preparation<Select value={draft.prep ?? 'Print'} label="Preparation" options={[{ v: 'No prep', label: 'No prep' }, { v: 'Print', label: 'Print' }, { v: 'Print and cut', label: 'Print and cut' }]} onChange={value => setDraft(current => current ? { ...current, prep: value } : current)} /></label><label>Works in<Select value={draft.mode ?? 'Face-to-face and online'} label="Works in" options={[{ v: 'Face-to-face and online', label: 'Face-to-face and online' }, { v: 'Face-to-face only', label: 'Face-to-face only' }, { v: 'Online only', label: 'Online only' }]} onChange={value => setDraft(current => current ? { ...current, mode: value } : current)} /></label><label>Energy<Select value={String(draft.energy ?? 3)} label="Energy" options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => setDraft(current => current ? { ...current, energy: Number(value) as 1 | 2 | 3 } : current)} /></label></div><div className="rhe-static-pages">{draft.pages.map((page, index) => <section className="rhe-static-page" key={page.id}><img src={page.image} alt={`Preview of ${page.title}`} /><div><span className="rh-kicker">PAGE {index + 1}</span><label>Page title<input value={page.title} onChange={event => patchPage(page.id, { title: event.target.value })} /></label><label className="rhe-upload-field"><span>Replace page image</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void uploadPage(page.id, event.target.files?.[0]); event.target.value = ''; }} /><span className="rhe-upload-button">Choose image</span></label><small>JPG, PNG or WebP · at least 500 × 650 pixels</small></div></section>)}</div>{dirty && <p className="rhe-action-note">Changes are not published until you save.</p>}{message && <p role="status">{message}</p>}{error && <p className="rhe-error" role="alert">{error}</p>}</div></div>;
}

function CollectionEditor({ id, uid }: { id: HubCollectionId; uid: string }) {
  const seed = HUB_COLLECTIONS.find(item => item.id === id);
  const [saved, setSaved] = useState<HubCollectionDraft | null>(null);
  const [draft, setDraft] = useState<HubCollectionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!seed) return;
    let live = true;
    getCollectionDraft(id).then(value => { if (live) { setSaved(value); setDraft(value); } }, cause => live && setError(friendlyError(cause)));
    return () => { live = false; };
  }, [id, seed]);
  const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);
  const patch = (value: Partial<HubCollectionDraft>) => setDraft(current => current ? { ...current, ...value } : current);
  const uploadIdentity = async (file: File | undefined, kind: 'cover' | 'header') => {
    if (!file || draft?.state !== 'draft') return;
    setBusy(true); setError('');
    try { const image = await prepareHubImage(file, kind); patch(kind === 'cover' ? { cover: image } : { headerImage: image }); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!seed) return;
    setBusy(true); setError('');
    try { const next = await createCollectionDraft(uid, id, { title: seed.title, promise: seed.promise, cover: seed.cover, accent: seed.accent }); setSaved(next); setDraft(next); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft || !saved) return;
    setBusy(true); setError('');
    try { const next = await saveCollectionDraft(draft, saved.revision); setSaved(next); setDraft(next); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };
  const advance = async (action: 'review' | 'publish' | 'draft') => {
    if (!draft) return;
    setBusy(true); setError('');
    try { if (action === 'review') await sendCollectionForReview(id, draft.revision); else if (action === 'publish') await publishCollection(id, draft.revision, uid); else await returnCollectionToDraft(id, draft.revision); const next = await getCollectionDraft(id); setSaved(next); setDraft(next); }
    catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  };
  if (!seed) return <div className="rhe-loading"><Link to="/resource-hub/admin">← Editor</Link><p>Unknown collection.</p></div>;
  return <div className="rhe-collection-editor"><Link to="/resource-hub/admin" className="rh-back">← Editor</Link><header className="rhe-page-head"><div><span className="rh-kicker">COLLECTION IDENTITY</span><h1>{seed.title}</h1><p>A private draft can change the collection’s look while the published edition stays as it is.</p></div><span className="rhe-collection-stage">{draft ? STATUS[draft.state] : 'No draft yet'}</span></header>{!draft ? <div className="rhe-empty"><p>{error || 'Start a private collection draft from the current look.'}</p><button type="button" className="rh-primary" disabled={busy} onClick={() => void start()}>Start collection draft</button></div> : <div className="rhe-identity">
      <section className="rhe-identity-preview" aria-label="How teachers will see this collection">
        <span className="rh-kicker">PREVIEW</span>
        <div className="rhe-identity-card" style={{ ['--id-accent' as string]: draft.accent }}><div className="rhe-identity-cover">{draft.cover ? <img src={draft.cover} alt="" /> : <span>Add a cover</span>}</div><div className="rhe-identity-copy"><small>BY ELT SUITE</small><strong>{draft.title || 'Collection name'}</strong><p>{draft.promise || 'One sentence that tells teachers what this collection is for.'}</p></div></div>
        <div className="rhe-identity-paper" style={{ ['--id-accent' as string]: draft.paperAccent }}><div className="rhe-identity-band">{draft.headerImage ? <img src={draft.headerImage} alt="" /> : null}<span className="rhe-identity-name">Name</span><b>{draft.title || 'Collection name'}</b></div><i /><i /><i /><span className="rhe-identity-chip">1</span></div>
        <p className="rhe-preview-note">The card on Discover and the top of a printed page.</p>
      </section>
      <div className="rhe-identity-form">
        <section className="rhe-identity-step"><h3><span>1</span>Name and promise</h3><label className="rhe-wide-field">Name<input value={draft.title} disabled={draft.state !== 'draft'} onChange={event => patch({ title: event.target.value })} /></label><label className="rhe-wide-field">Promise <small>One sentence teachers see under the name</small><textarea value={draft.promise} disabled={draft.state !== 'draft'} rows={2} onChange={event => patch({ promise: event.target.value })} /></label></section>
        <section className="rhe-identity-step"><h3><span>2</span>Pictures</h3><div className="rhe-identity-drops">
          <label className={`rhe-drop${draft.cover ? ' has' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!(draft.state !== 'draft') && !busy) void uploadIdentity(event.dataTransfer.files?.[0], 'cover'); }}>{draft.cover && <img src={draft.cover} alt="Current cover" />}<span className="rhe-drop-text"><b>{draft.cover ? 'Replace the cover' : 'Add a cover'}</b><small>Drop a picture here or choose one · JPG, PNG or WebP, at least 500 × 500</small></span><input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={draft.state !== 'draft' || busy} onChange={event => { void uploadIdentity(event.target.files?.[0], 'cover'); event.target.value = ''; }} /></label>
          <label className={`rhe-drop rhe-drop-wide${draft.headerImage ? ' has' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!(draft.state !== 'draft') && !busy) void uploadIdentity(event.dataTransfer.files?.[0], 'header'); }}>{draft.headerImage && <img src={draft.headerImage} alt="Current printed-page header" />}<span className="rhe-drop-text"><b>{draft.headerImage ? 'Replace the page header' : 'Add a page header (optional)'}</b><small>Shown at the top of printed pages · at least 700 × 150</small></span><input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={draft.state !== 'draft' || busy} onChange={event => { void uploadIdentity(event.target.files?.[0], 'header'); event.target.value = ''; }} /></label>
        </div>{draft.headerImage && <button type="button" className="rhe-identity-remove" disabled={draft.state !== 'draft' || busy} onClick={() => patch({ headerImage: '' })}>Remove page header</button>}</section>
        <section className="rhe-identity-step"><h3><span>3</span>Colours</h3><div className="rhe-identity-colours">{([['accent', 'On screen'], ['paperAccent', 'On paper']] as const).map(([key, label]) => <label key={key} className="rhe-swatch"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft[key]) ? draft[key] : '#74762f'} disabled={draft.state !== 'draft'} onChange={event => patch(key === 'accent' ? { accent: event.target.value } : { paperAccent: event.target.value })} /><span><b>{label}</b><small>{draft[key]}</small></span></label>)}</div></section>
        <div className="rhe-visibility"><div><strong>Visible to teachers</strong><span>Hidden collections stay in the editor but don’t appear in Resource Hub after you publish.</span></div><button type="button" role="switch" aria-label="Visible to teachers" aria-checked={draft.visible !== false} disabled={draft.state !== 'draft'} className={draft.visible !== false ? 'on' : ''} onClick={() => patch({ visible: draft.visible === false })}><span /></button></div>
        <footer className="rhe-identity-actions"><span>{draft.publishedAt ? `Published ${new Date(draft.publishedAt).toLocaleDateString()} · changes stay private until you publish` : 'Not published yet'}</span>{error && <p className="rhe-error" role="alert">{error}</p>}<div className="rhe-actions">{draft.state === 'draft' ? <><button type="button" className="rh-primary" disabled={!dirty || busy} onClick={() => void save()}>Save draft</button><button type="button" className="rhe-outline" disabled={dirty || busy || !draft.title.trim() || !draft.promise.trim()} onClick={() => void advance('review')}>Send for review</button></> : <><button type="button" className="rh-primary" disabled={busy} onClick={() => void advance('publish')}>Publish collection</button><button type="button" className="rhe-outline" disabled={busy} onClick={() => void advance('draft')}>Return to draft</button></>}</div>{dirty && <p className="rhe-action-note">Save changes before review.</p>}</footer>
      </div>
    </div>}</div>;
}

export default ResourceHubAdminPage;

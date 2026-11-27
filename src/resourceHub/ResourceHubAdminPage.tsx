import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { INTERACTION_PATTERNS, MultiSelect, interactionList, interactionText } from '../components/MultiSelect';
import { Select } from '../components/Select';
import { PdfPreview } from '../components/PdfPreview';
import { IdentityDialog, RefsContext } from '../components/Identity';
import { hubRefTargets, lessonIdentities, versionLetter, type ActivityIdentity } from '../lib/identity';
import { useAuth } from '../lib/auth';
import { useSuper } from '../lib/admin';
import { db } from '../lib/firebase';
import { HUB_ACTIVITIES, HUB_COLLECTIONS, type HubCollectionId } from './catalog';
import { createCollectionDraft, createResourceDraft, getCollectionDraft, getResourceDraft, publishCollection, publishResource, returnCollectionToDraft, returnResourceToDraft, saveCollectionDraft, saveResourceDraft, sendCollectionForReview, sendResourceForReview, subscribePublishedResources, subscribeResourceDrafts, validateResource, type HubCollectionDraft, type HubEditorSection, type HubResourceDraft, type HubResourceEdition } from './hubEditorData';
import { generatedAnswerLines, withGeneratedAnswerKey } from './hubAnswerKey';
import { ResourceLivePreview } from './ResourceLivePreview';
import { HubLessonEditor } from './HubLessonEditor';
import { SuiteScriptStructureEditor } from '../editor/SuiteScriptStructureEditor';
import { SUITE_TYPES } from '../editor/TaskEditor';
import { toSuiteScriptBundle, type SuiteScriptBundle } from '../lib/suiteScriptBundle';
import { exportSuiteScriptHubDraft, saveSuiteScriptBundleToHubDraft } from './suiteScriptHubApply';
import { ResourceActivityDirectory } from './ResourceActivityDirectory';
import { ResourceActivityMetrics } from './ResourceActivityMetrics';
import { prepareStaticPage, saveStaticKitOverride, subscribeStaticKitOverride, type HubStaticOverride } from './hubStaticOverride';
import { prepareHubImage } from './hubImageUpload';
import { ResourceImport } from './ResourceImport';
import { hasDigitalOnlyItems } from './ResourceRichPdf';
import { makeResourceLessonPdf } from './ResourceLessonPdf';
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
  const make = async (resourceType: 'activity' | 'lesson' = 'activity') => {
    setBusy(true); setError('');
    try { const draft = await createResourceDraft(uid, 'otp', { resourceType }); navigate(`/resource-hub/admin/${draft.id}`); }
    catch (cause) { setError(`Couldn’t create the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  return <div className="rhe-index"><header className="rhe-page-head"><div><span className="rh-kicker">SUPER ADMIN WORKSPACE</span><h1>Resource Hub editor</h1><p>Author and review classroom resources. Draft edits are private until you publish an edition.</p></div><div className="rhe-head-actions"><Link className="rhe-outline" to="/resource-hub/admin?import=1">Import from document</Link><button type="button" className="rhe-outline" disabled={busy} onClick={() => void make('lesson')}>{busy ? 'Creating…' : '+ New lesson'}</button><button type="button" className="rh-primary" disabled={busy} onClick={() => void make('activity')}>{busy ? 'Creating…' : '+ New activity'}</button></div></header>
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
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [suiteStructure, setSuiteStructure] = useState<'task' | 'activity' | null>(null);
  const suiteSharedDetails = useRef('');
  // As in a lesson: the digital view, or the printed page beside the task.
  const [paper, setPaperState] = useState(() => { try { return localStorage.getItem('rhe-paper') === '1'; } catch { return false; } });
  const setPaper = (v: boolean) => { setPaperState(v); try { localStorage.setItem('rhe-paper', v ? '1' : ''); } catch { /* fine */ } };
  useEffect(() => {
    let live = true;
    getResourceDraft(id).then(value => { if (live) { setSaved(value); setDraft(value); setActiveSection(value?.sections[0]?.id ?? ''); } }, cause => live && setError(friendlyError(cause)));
    getDocs(collection(db, 'resourceHubPublished', id, 'editions')).then(snapshot => { if (live) setEditions(snapshot.docs.map(item => item.data() as { edition: number; publishedAt: number }).sort((a, b) => b.edition - a.edition)); }, () => {});
    return () => { live = false; };
  }, [id]);
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const question = 'You have unsaved changes to this resource. Leave without saving?';
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
  const patch = (value: Partial<HubResourceDraft>) => setDraft(current => current ? { ...current, ...value } : current);
  const patchSection = (sectionId: string, value: Partial<HubEditorSection>) => setDraft(current => current ? { ...current, sections: current.sections.map(section => section.id === sectionId ? { ...section, ...value } : section) } : current);
  const save = async () => {
    if (!draft || !saved || busy || !dirty) return;
    const submitted = draft;
    setBusy(true); setSaving(true); setSaveFailed(false); setError('');
    try {
      const next = await saveResourceDraft(submitted, saved.revision);
      setSaved(next);
      // Changes made while the request was in flight remain in the editor.
      setDraft(current => current && JSON.stringify(current) !== JSON.stringify(submitted)
        ? { ...current, revision: next.revision, updatedAt: next.updatedAt }
        : next);
    }
    catch (cause) { setSaveFailed(true); setError(`Couldn’t save the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); setSaving(false); }
  };
  const review = async () => {
    if (!draft || busy || dirty) return;
    setBusy(true); setError('');
    try { await sendResourceForReview(draft.id, draft.revision); const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); }
    catch (cause) { setError(`Couldn’t send for review. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const returnToDraft = async () => {
    if (!draft || busy) return;
    setBusy(true); setError('');
    try { await returnResourceToDraft(draft.id, draft.revision); const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); }
    catch (cause) { setError(`Couldn’t reopen the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!draft || busy || dirty || validation.length) return;
    setBusy(true); setError('');
    try {
      const activity = publishedResourceToActivity({ ...draft, sections: withGeneratedAnswerKey(draft.sections), edition: draft.revision, publishedAt: Date.now(), publishedBy: uid } as HubResourceEdition);
      const collection = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
      const learnerIds = draft.sections.filter(section => section.audience === 'learner').map(section => section.id);
      const teacherIds = draft.sections.filter(section => section.audience === 'teacher').map(section => section.id);
      const copiedTasks = publishedTasks(activity, new Set(learnerIds));
      const hasTeacherGuidance = draft.sections.some(section => section.audience === 'teacher' && (section.instructions.trim() || JSON.stringify(section.content).includes('"text":"')));
      if (copiedTasks.filter(task => !task.hidden).length !== learnerIds.length || (hasTeacherGuidance && !copiedTasks.some(task => task.hidden && task.notes))) throw new Error('The Class copy could not keep all learner tasks and private teacher notes.');
      const pdf = await makeResourceLessonPdf({ activity, collection, learnerIds, teacherIds, copies: 1, paper: 'a4', colour: 'colour' });
      if (pdf.length < 100 || new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') throw new Error('The printable edition could not be rendered.');
      const edition = await publishResource(draft.id, draft.revision, uid);
      const next = await getResourceDraft(draft.id); setSaved(next); setDraft(next); setEditions(current => [{ edition: edition.edition, publishedAt: edition.publishedAt }, ...current]);
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
      setPrintPreview(await makeResourceLessonPdf({ activity, collection, learnerIds, teacherIds, copies: 1, paper: 'a4', colour: 'colour' }));
    } catch (cause) { setError(`The print preview could not be made. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  const [idOpen, setIdOpen] = useState(false);
  if (!draft) return <div className="rhe-loading"><Link to="/resource-hub/admin">← All drafts</Link>{error ? <p className="rhe-error" role="alert">{error}</p> : <Loader label="Opening draft" />}</div>;
  const section = draft.sections.find(item => item.id === activeSection) ?? draft.sections[0];
  const generatedAnswers = generatedAnswerLines(draft.sections);
  const hasDigitalOnly = draft.sections.some(item => hasDigitalOnlyItems(item.content));
  const isLesson = draft.resourceType === 'lesson';
  // References and activity types: a section's id is its anchor, kept when it is copied to Classes.
  const refsValue = { targets: hubRefTargets(draft.sections), versions: section?.versionGroup ? draft.sections.filter(item => item.versionGroup === section.versionGroup).map(item => versionLetter(item.versionLabel)).filter(Boolean) : [], here: section?.versionGroup ? draft.sections.find(item => item.versionGroup === section.versionGroup)?.id : section?.id, strict: true };
  const saveIdentity = (value: ActivityIdentity | null, scope: 'here' | 'all') => {
    if (!section) return;
    const current = section.identity;
    patch({ sections: draft.sections.map(item => (scope === 'all' && current && value ? item.identity?.id === current.id : item.id === section.id || (!!section.versionGroup && item.versionGroup === section.versionGroup)) ? { ...item, identity: value } : item) });
    setIdOpen(false);
  };
  const publishedActivityId = isLesson ? `lesson-${draft.id}` : `${draft.collectionId}-${draft.number.padStart(3, '0')}`;
  const collectionLook = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
  const suiteRows = draft.sections.filter(item => item.audience === 'learner' && item.kind === 'task').map(item => ({ id: item.id, title: item.title || 'Untitled task', group: item.versionGroup, version: item.versionLabel }));
  const hasVersionScope = suiteRows.some(row => row.group);
  const openSuiteStructure = (kind: 'task' | 'activity') => {
    setError('');
    if (!editable) { setError('Return this resource to draft before editing it as SuiteScript.'); return; }
    if (dirty || busy) { setError('Save this draft before opening SuiteScript.'); return; }
    if (kind === 'task' && (!section || section.audience !== 'learner' || section.kind !== 'task')) { setError('Select a learner task to edit it as SuiteScript.'); return; }
    setSuiteStructure(kind);
  };
  const loadSuiteStructure = async (kind: 'task' | 'activity', ids: string[]): Promise<string> => {
    if (!saved || dirty || busy) throw new Error('Save this draft before opening SuiteScript.');
    const bundle = await exportSuiteScriptHubDraft(id, uid, kind === 'task' ? ids[0] : undefined, kind === 'activity' ? ids : undefined);
    if (bundle.kind === 'activity' && hasVersionScope) suiteSharedDetails.current = JSON.stringify((({ title, level, aim, minutes, summary, focus }) => ({ title, level, aim, minutes, summary, focus }))(bundle.activity));
    return toSuiteScriptBundle(bundle, SUITE_TYPES);
  };
  const applySuiteStructure = async (bundle: SuiteScriptBundle, ids: string[]) => {
    if (!saved || dirty || !editable) throw new Error('Save this draft before applying SuiteScript.');
    if (bundle.kind === 'activity' && hasVersionScope && JSON.stringify((({ title, level, aim, minutes, summary, focus }) => ({ title, level, aim, minutes, summary, focus }))(bundle.activity)) !== suiteSharedDetails.current) throw new Error('Shared resource title and details cannot change in a version-scoped SuiteScript edit. Edit them in Details.');
    const next = await saveSuiteScriptBundleToHubDraft(saved, saved.revision, bundle, bundle.kind === 'task' ? ids[0] : undefined, bundle.kind === 'activity' ? ids : undefined);
    setSaved(next); setDraft(next); setSaveFailed(false); setError('');
  };
  const publishing = <div className="rhl-publish">
    <ul className="rhl-checks">{validation.length ? validation.map(message => <li key={message} className="needs">{message}</li>) : <li className="okay">Ready for review or publication.</li>}{hasDigitalOnly && <li>Some parts work only on screen. The PDF shows a short note in their place; the Class copy has the full task.</li>}</ul>
    {draft.sourceReview && <details className="rhe-source-review"><summary>Imported source and checks</summary><p>{draft.sourceReview.fileName}</p>{draft.sourceReview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
    <button type="button" className="btn small-btn" disabled={busy || dirty || validation.length > 0} onClick={() => void previewPrint()}>Preview the print PDF</button>
    {dirty && <p className="hint">Save your changes before sending for review.</p>}
  </div>;
  const actions = editable
    ? <><button type="button" className="btn small-btn" disabled={busy || dirty || validation.length > 0} onClick={() => void review()}>Send for review</button><button type="button" className="btn small-btn primary" disabled={busy || !dirty} onClick={() => void save()}>{saving ? 'Saving…' : saveFailed ? 'Retry save' : 'Save draft'}</button></>
    : <><button type="button" className="btn small-btn" disabled={busy} onClick={() => void returnToDraft()}>Return to draft</button><button type="button" className="btn small-btn primary" disabled={busy || dirty || validation.length > 0} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish edition'}</button></>;
  return <RefsContext.Provider value={refsValue}><div className="rhe-editor rhl-editor">
    <header className="rhl-head">
      <div className="rhl-head-l">
        <Link to="/resource-hub/admin" className="rhl-back" aria-label="All drafts" data-tip="All drafts">←</Link>
        <span className="rh-kicker">{isLesson ? 'LESSON' : `${draft.collectionId.toUpperCase()} · ${draft.number || 'NEW'}`}</span>
        <span className={'rhl-state' + (draft.state === 'in-review' ? ' review' : '')}>{STATUS[draft.state]}</span>
        <span className="rhl-saved" role="status">{saving ? 'Saving…' : saveFailed ? 'Save failed · retry' : dirty ? 'Unsaved changes' : 'Saved'}</span>
        <span className="rhl-pub" title={draft.publishedAt ? `Teachers see the edition published on ${new Date(draft.publishedAt).toLocaleDateString()} until you publish this draft.` : 'Private until its first edition is published.'}>{draft.publishedAt ? <Link to={`/resource-hub?activity=${publishedActivityId}`} target="_blank" rel="noopener noreferrer">Published {new Date(draft.publishedAt).toLocaleDateString('en-GB')} ↗</Link> : 'Not published yet'}</span>
      </div>
      <div className="rhl-head-r">
        {tab === 'content' && <><button type="button" className="btn small-btn" onClick={() => openSuiteStructure('task')}>SuiteScript task</button><button type="button" className="btn small-btn" onClick={() => openSuiteStructure('activity')}>SuiteScript activity</button></>}
        <span className="seg rhl-view" role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={tab === 'content' && !paper} className={tab === 'content' && !paper ? 'on' : ''} onClick={() => { setTab('content'); setPaper(false); }}>Digital</button>
          <button type="button" role="radio" aria-checked={tab === 'content' && paper} className={tab === 'content' && paper ? 'on' : ''} onClick={() => { setTab('content'); setPaper(true); }}>Paper</button>
          <button type="button" role="radio" aria-checked={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
          <button type="button" role="radio" aria-checked={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button>
        </span>
        {validation.length > 0 && <span className="rhl-action-issue" role="status">{validation[0]}{validation.length > 1 ? ` +${validation.length - 1} more` : ''}</span>}
        {actions}
      </div>
    </header>
    {error && <p className="rhe-error rhl-error" role="alert">{error}</p>}
    {tab === 'content' ? <HubLessonEditor draft={draft} editable={editable} active={section?.id ?? ''} setActive={setActiveSection} patch={patch} patchSection={patchSection} onIdentity={() => setIdOpen(true)} generatedAnswers={generatedAnswers} paper={paper} preview={<ResourceLivePreview draft={draft} activeSectionId={section?.id ?? ''} collection={collectionLook} />} publishing={publishing} checks={validation.length} /> : <div className="rhl-page">
      <button type="button" className="btn link rhl-backto" onClick={() => setTab('content')}>← Back to the {isLesson ? 'lesson' : 'activity'}</button>
      {tab === 'details' && <div className="rhe-edit-card"><span className="rh-kicker">FINDABLE AND PRINTABLE</span><h2>Details and filters</h2><p className="rhe-card-intro">Teachers use these details to find the right {isLesson ? 'lesson' : 'activity'} for a class.</p><div className="rhe-form-grid"><label>Title<input value={draft.title} disabled={!editable} onChange={event => patch({ title: event.target.value })} /></label>{!isLesson && <label>Activity number<input value={draft.number} disabled={!editable} onChange={event => patch({ number: event.target.value })} placeholder="For example: 051" /></label>}<label>Language focus<input value={draft.focus} disabled={!editable} onChange={event => patch({ focus: event.target.value })} /></label><label>Level<input value={draft.level} disabled={!editable} onChange={event => patch({ level: event.target.value })} placeholder="For example: A2–B1" /></label><label>Time in minutes<input type="number" min={1} max={240} value={draft.minutes} disabled={!editable} onChange={event => patch({ minutes: Number(event.target.value) })} /></label><label>Interaction<MultiSelect label="Interaction" options={INTERACTION_PATTERNS} disabled={!editable} value={interactionList(draft.interaction)} onChange={list => patch({ interaction: interactionText(list) })} /></label><label>Preparation<Select value={draft.prep} disabled={!editable} options={[{ v: 'No prep', label: 'No prep' }, { v: 'Print', label: 'Print' }, { v: 'Print and cut', label: 'Print and cut' }]} onChange={value => patch({ prep: value })} label="Preparation" /></label><label>Works in<Select value={draft.mode} disabled={!editable} options={[{ v: 'Face-to-face and online', label: 'Face-to-face and online' }, { v: 'Face-to-face only', label: 'Face-to-face only' }, { v: 'Online only', label: 'Online only' }]} onChange={value => patch({ mode: value })} label="Delivery mode" /></label><label>Energy<Select value={String(draft.energy)} disabled={!editable} options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => patch({ energy: Number(value) as 1 | 2 | 3 })} label="Energy" /></label><label>Collection<Select value={draft.collectionId} disabled={!editable} options={HUB_COLLECTIONS.map(item => ({ v: item.id, label: item.title }))} onChange={value => patch({ collectionId: value })} label="Collection" /></label></div><label className="rhe-wide-field">Short summary<textarea value={draft.summary} disabled={!editable} rows={3} onChange={event => patch({ summary: event.target.value })} placeholder={isLesson ? 'What happens in this lesson?' : 'What happens in this activity?'} /></label></div>}
      {tab === 'history' && <div className="rhe-edit-card"><span className="rh-kicker">VERSIONS</span><h2>History</h2><p className="rhe-card-intro">Published editions are kept separately. Draft changes never change them.</p>{editions.length ? <ul className="rhe-history">{editions.map((edition, index) => <li key={edition.edition}><strong>Edition {edition.edition}</strong><span>{new Date(edition.publishedAt).toLocaleString('en-GB')}</span>{index === 0 && <em>Published now</em>}</li>)}</ul> : <p>No edition has been published yet.</p>}</div>}
    </div>}
    {printPreview && <PdfPreview bytes={printPreview} name={`${draft.title || "Resource Hub"} preview`} onClose={() => setPrintPreview(null)} />}
    {idOpen && section && <IdentityDialog value={section.identity} used={lessonIdentities(draft.sections)} onSave={saveIdentity} onClose={() => setIdOpen(false)} />}
    {suiteStructure && <SuiteScriptStructureEditor kind={suiteStructure} title={suiteStructure === 'task' ? section?.title || 'Selected task' : draft.title || 'Activity'} rows={suiteStructure === 'task' ? suiteRows.filter(row => row.id === section?.id) : suiteRows} sharedMetadata={suiteStructure === 'activity' && hasVersionScope} loadSource={ids => loadSuiteStructure(suiteStructure, ids)} applyBundle={applySuiteStructure} onClose={() => setSuiteStructure(null)} />}
  </div></RefsContext.Provider>;
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

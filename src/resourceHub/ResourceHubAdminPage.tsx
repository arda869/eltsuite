import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { Select } from '../components/Select';
import { PdfPreview } from '../components/PdfPreview';
import { TaskEditor } from '../editor/TaskEditor';
import { useAuth } from '../lib/auth';
import { useSuper } from '../lib/admin';
import { db } from '../lib/firebase';
import { HUB_COLLECTIONS, type HubCollectionId } from './catalog';
import { createCollectionDraft, createResourceDraft, getCollectionDraft, getResourceDraft, newSection, publishCollection, publishResource, returnCollectionToDraft, returnResourceToDraft, saveCollectionDraft, saveResourceDraft, sendCollectionForReview, sendResourceForReview, subscribeResourceDrafts, validateResource, type HubCollectionDraft, type HubEditorSection, type HubResourceDraft, type HubResourceEdition } from './hubEditorData';
import { prepareHubImage } from './hubImageUpload';
import { ResourceImport } from './ResourceImport';
import { makeEditorResourcePdf } from './ResourceRichPdf';
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
  return <div className="shell rhe-shell"><TopBar><nav className="rhe-top"><Link to="/resource-hub">Resource Hub</Link><span>/</span><Link to="/resource-hub/admin">Editor</Link></nav></TopBar><main className="rhe-main">{id ? <ResourceEditor key={id} id={id} uid={user.uid} /> : params.get('import') ? <ResourceImport uid={user.uid} onCreated={createdId => { window.location.assign(`/resource-hub/admin/${createdId}`); }} onCancel={() => window.location.assign('/resource-hub/admin')} /> : params.get('collection') ? <CollectionEditor id={params.get('collection') as HubCollectionId} uid={user.uid} /> : <EditorIndex uid={user.uid} />}</main></div>;
}

function EditorIndex({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<HubResourceDraft[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeResourceDrafts(setDrafts, cause => setError(friendlyError(cause))), []);
  const make = async () => {
    setBusy(true); setError('');
    try { const draft = await createResourceDraft(uid); navigate(`/resource-hub/admin/${draft.id}`); }
    catch (cause) { setError(`Couldn’t create the draft. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  return <div className="rhe-index"><header className="rhe-page-head"><div><span className="rh-kicker">SUPER ADMIN WORKSPACE</span><h1>Resource Hub editor</h1><p>Author and review classroom resources. Draft edits are private until you publish an edition.</p></div><div className="rhe-head-actions"><Link className="rhe-outline" to="/resource-hub/admin?import=1">Import from document</Link><button type="button" className="rh-primary" disabled={busy} onClick={() => void make()}>{busy ? 'Creating…' : '+ New activity'}</button></div></header>
    {error && <p className="rhe-error" role="alert">{error}</p>}
    <section className="rhe-index-section"><div className="rhe-section-head"><h2>Activity drafts</h2><span>{drafts?.length ?? 0}</span></div>{drafts === null ? <Loader label="Loading drafts" /> : drafts.length ? <div className="rhe-draft-grid">{drafts.map(draft => <Link key={draft.id} className="rhe-draft-card" to={`/resource-hub/admin/${draft.id}`}><span className="rh-kicker">{draft.collectionId.toUpperCase()} · {draft.number || 'NEW ACTIVITY'}</span><strong>{draft.title || 'Untitled activity'}</strong><span>{draft.summary || 'Add a summary and learner task.'}</span><span className="rhe-draft-foot"><em className={draft.state === 'in-review' ? 'review' : ''}>{STATUS[draft.state]}</em>{draft.publishedAt ? `Published edition · ${new Date(draft.publishedAt).toLocaleDateString()}` : 'Never published'}</span></Link>)}</div> : <div className="rhe-empty"><h3>Start with a blank activity</h3><p>Write a learner task and teacher guidance, then send the saved draft for review.</p><button type="button" className="rh-primary" onClick={() => void make()}>Create activity</button></div>}</section>
    <section className="rhe-index-section"><div className="rhe-section-head"><h2>Collection identity</h2></div><div className="rhe-collection-grid">{HUB_COLLECTIONS.map(collection => <Link key={collection.id} to={`/resource-hub/admin?collection=${collection.id}`} className="rhe-collection-card"><img src={collection.cover} alt="" /><span><strong>{collection.title}</strong><small>Cover, promise and printed page colours</small></span><b aria-hidden="true">→</b></Link>)}</div></section>
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
  useEffect(() => {
    let live = true;
    getResourceDraft(id).then(value => { if (live) { setSaved(value); setDraft(value); setActiveSection(value?.sections[0]?.id ?? ''); } }, cause => live && setError(friendlyError(cause)));
    getDocs(collection(db, 'resourceHubPublished', id, 'editions')).then(snapshot => { if (live) setEditions(snapshot.docs.map(item => item.data() as { edition: number; publishedAt: number }).sort((a, b) => b.edition - a.edition)); }, () => {});
    return () => { live = false; };
  }, [id]);
  const dirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
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
      const activity = publishedResourceToActivity({ ...draft, edition: draft.revision, publishedAt: Date.now(), publishedBy: uid } as HubResourceEdition);
      const collection = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
      const learnerIds = draft.sections.filter(section => section.audience === 'learner').map(section => section.id);
      const teacherIds = draft.sections.filter(section => section.audience === 'teacher').map(section => section.id);
      const copiedTasks = publishedTasks(activity, new Set(learnerIds));
      if (copiedTasks.length !== learnerIds.length || !copiedTasks[0]?.notes) throw new Error('The Class copy could not keep all learner tasks and private teacher notes.');
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
      const activity = publishedResourceToActivity({ ...draft, edition: draft.revision, publishedAt: Date.now(), publishedBy: uid } as HubResourceEdition);
      const collection = { ...HUB_COLLECTIONS.find(item => item.id === draft.collectionId)!, ...publishedCollections.items?.find(item => item.id === draft.collectionId) };
      const learnerIds = draft.sections.filter(section => section.audience === 'learner').map(section => section.id);
      const teacherIds = draft.sections.filter(section => section.audience === 'teacher').map(section => section.id);
      setPrintPreview(await makeEditorResourcePdf({ activity, collection, learnerIds, teacherIds, copies: 1, paper: 'a4', colour: 'colour' }));
    } catch (cause) { setError(`The print preview could not be made. ${friendlyError(cause)}`); }
    finally { setBusy(false); }
  };
  if (!draft) return <div className="rhe-loading"><Link to="/resource-hub/admin">← All drafts</Link>{error ? <p className="rhe-error" role="alert">{error}</p> : <Loader label="Opening draft" />}</div>;
  const section = draft.sections.find(item => item.id === activeSection) ?? draft.sections[0];
  return <div className="rhe-editor"><header className="rhe-editor-head"><div><Link to="/resource-hub/admin" className="rh-back">← All drafts</Link><span className="rh-kicker">{draft.collectionId.toUpperCase()} · {draft.number || 'NEW ACTIVITY'}</span><h1>{draft.title || 'Untitled activity'}</h1><p>{draft.publishedAt ? `Teachers still see the edition published on ${new Date(draft.publishedAt).toLocaleDateString()} until you publish this draft.` : 'This activity is private until its first edition is published.'}</p></div><div className="rhe-status"><span className={draft.state === 'in-review' ? 'review' : ''}>{STATUS[draft.state]}</span>{dirty ? 'Unsaved changes' : 'Saved'}</div></header>
    <div className="rhe-editor-layout"><aside className="rhe-editor-side"><div className="rhe-side-group"><strong>Activity</strong><button type="button" className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>Content</button><button type="button" className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details and filters</button><button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Version history</button></div>{tab === 'content' && <div className="rhe-side-group"><strong>Sections</strong>{draft.sections.map(item => <button key={item.id} type="button" className={activeSection === item.id ? 'on' : ''} onClick={() => setActiveSection(item.id)}>{item.audience === 'teacher' ? '◆' : '◇'} {item.title}</button>)}{editable && <div className="rhe-side-add"><button type="button" onClick={() => { const next = newSection('learner'); patch({ sections: [...draft.sections, next] }); setActiveSection(next.id); }}>+ Learner task</button><button type="button" onClick={() => { const next = newSection('teacher'); patch({ sections: [...draft.sections, next] }); setActiveSection(next.id); }}>+ Teacher note</button></div>}</div>}</aside>
    <div className="rhe-editor-body">{tab === 'content' && section && <div className="rhe-edit-card"><div className="rhe-card-head"><div><span className="rh-kicker">{section.audience === 'teacher' ? 'TEACHER ONLY' : 'LEARNER MATERIAL'}</span><h2>{section.title}</h2></div>{editable && draft.sections.length > 1 && <button type="button" className="rhe-danger" onClick={() => { const rest = draft.sections.filter(item => item.id !== section.id); patch({ sections: rest }); setActiveSection(rest[0]?.id ?? ''); }}>Remove section</button>}</div><div className="rhe-form-grid"><label>Section title<input value={section.title} disabled={!editable} onChange={event => patchSection(section.id, { title: event.target.value })} /></label><label>Who sees this?<Select value={section.audience} disabled={!editable} options={[{ v: 'learner', label: 'Learner' }, { v: 'teacher', label: 'Teacher only' }]} onChange={value => patchSection(section.id, { audience: value, kind: value === 'learner' ? 'task' : section.kind === 'task' ? 'notes' : section.kind })} label="Section audience" /></label>{section.audience === 'teacher' && <label>Teacher section type<Select value={section.kind} disabled={!editable} options={[{ v: 'notes', label: 'Teacher notes' }, { v: 'answer-key', label: 'Answer key' }]} onChange={value => patchSection(section.id, { kind: value as 'notes' | 'answer-key' })} label="Teacher section type" /></label>}</div><label className="rhe-wide-field">Instruction<input value={section.instructions} disabled={!editable} onChange={event => patchSection(section.id, { instructions: event.target.value })} placeholder="What should the learner do?" /></label><div className="rhe-content-label">Content</div><div className="rhe-task-editor">{editable ? <TaskEditor key={section.id} content={section.content} onChange={content => patchSection(section.id, { content })} classId="" textOnly label={section.title} /> : <pre>{section.content.content?.map(node => node.content?.map(child => child.text ?? '').join('') ?? '').join('\n') || 'No content yet.'}</pre>}</div></div>}
      {tab === 'details' && <div className="rhe-edit-card"><span className="rh-kicker">FINDABLE AND PRINTABLE</span><h2>Details and filters</h2><p className="rhe-card-intro">Teachers use these details to find the right activity for a class.</p><div className="rhe-form-grid"><label>Title<input value={draft.title} disabled={!editable} onChange={event => patch({ title: event.target.value })} /></label><label>Activity number<input value={draft.number} disabled={!editable} onChange={event => patch({ number: event.target.value })} placeholder="e.g. 051" /></label><label>Language focus<input value={draft.focus} disabled={!editable} onChange={event => patch({ focus: event.target.value })} /></label><label>Level<input value={draft.level} disabled={!editable} onChange={event => patch({ level: event.target.value })} placeholder="e.g. A2–B1" /></label><label>Time in minutes<input type="number" min={1} max={240} value={draft.minutes} disabled={!editable} onChange={event => patch({ minutes: Number(event.target.value) })} /></label><label>Interaction<input value={draft.interaction} disabled={!editable} onChange={event => patch({ interaction: event.target.value })} placeholder="Pairs, whole class…" /></label><label>Preparation<Select value={draft.prep} disabled={!editable} options={[{ v: 'No prep', label: 'No prep' }, { v: 'Print', label: 'Print' }, { v: 'Print and cut', label: 'Print and cut' }]} onChange={value => patch({ prep: value })} label="Preparation" /></label><label>Works in<Select value={draft.mode} disabled={!editable} options={[{ v: 'Face-to-face and online', label: 'Face-to-face and online' }, { v: 'Face-to-face only', label: 'Face-to-face only' }, { v: 'Online only', label: 'Online only' }]} onChange={value => patch({ mode: value })} label="Delivery mode" /></label><label>Energy<Select value={String(draft.energy)} disabled={!editable} options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => patch({ energy: Number(value) as 1 | 2 | 3 })} label="Energy" /></label><label>Collection<Select value={draft.collectionId} disabled={!editable} options={HUB_COLLECTIONS.map(item => ({ v: item.id, label: item.title }))} onChange={value => patch({ collectionId: value })} label="Collection" /></label></div><label className="rhe-wide-field">Short summary<textarea value={draft.summary} disabled={!editable} rows={3} onChange={event => patch({ summary: event.target.value })} placeholder="What happens in this activity?" /></label></div>}
      {tab === 'history' && <div className="rhe-edit-card"><span className="rh-kicker">VERSIONS</span><h2>Version history</h2><p className="rhe-card-intro">Published editions are saved separately. Draft edits never change them.</p>{editions.length ? <ul className="rhe-history">{editions.map((edition, index) => <li key={edition.edition}><strong>Edition {edition.edition}</strong><span>{new Date(edition.publishedAt).toLocaleString()}</span>{index === 0 && <em>Current published edition</em>}</li>)}</ul> : <p>No edition has been published yet.</p>}</div>}
    </div><aside className="rhe-check-panel"><span className="rh-kicker">BEFORE PUBLISHING</span><h3>Review checklist</h3><ul>{validation.length ? validation.map(message => <li key={message} className="needs">{message}</li>) : <li className="okay">Required details and learner content are present.</li>}<li>Check answer keys and classroom suitability before publishing.</li><li>Preview the printed pages and a copied Class task before making this edition available to teachers.</li></ul>{draft.sourceReview && <details className="rhe-source-review"><summary>Imported source and checks</summary><p>{draft.sourceReview.fileName}</p>{draft.sourceReview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}{error && <p className="rhe-error" role="alert">{error}</p>}{dirty && <p className="rhe-action-note">Save your changes before sending for review.</p>}<button type="button" className="rhe-outline rhe-preview-action" disabled={busy || dirty || validation.length > 0} onClick={() => void previewPrint()}>Preview print PDF</button>{!editable && <label className="rhe-confirm"><input type="checkbox" checked={keyReviewed} onChange={event => setKeyReviewed(event.target.checked)} /> I checked the learner tasks, private answer key and print preview.</label>}<div className="rhe-actions">{editable ? <><button type="button" className="rh-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Working…' : 'Save draft'}</button><button type="button" className="rhe-outline" disabled={busy || dirty || validation.length > 0} onClick={() => void review()}>Send for review</button></> : <><button type="button" className="rh-primary" disabled={busy || validation.length > 0 || !keyReviewed} onClick={() => void publish()}>{busy ? 'Working…' : 'Publish edition'}</button><button type="button" className="rhe-outline" disabled={busy} onClick={() => void returnToDraft()}>Return to draft</button></>}</div></aside></div>{printPreview && <PdfPreview bytes={printPreview} name={`${draft.title || "Resource Hub"} preview`} onClose={() => setPrintPreview(null)} />}
  </div>;
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
  return <div className="rhe-collection-editor"><Link to="/resource-hub/admin" className="rh-back">← Editor</Link><header className="rhe-page-head"><div><span className="rh-kicker">COLLECTION IDENTITY</span><h1>{seed.title}</h1><p>A private draft can change the collection’s look while the published edition stays as it is.</p></div><span className="rhe-collection-stage">{draft ? STATUS[draft.state] : 'No draft yet'}</span></header>{!draft ? <div className="rhe-empty"><p>{error || 'Start a private collection draft from the current look.'}</p><button type="button" className="rh-primary" disabled={busy} onClick={() => void start()}>Start collection draft</button></div> : <div className="rhe-collection-layout"><div className="rhe-edit-card"><span className="rh-kicker">BY ELT SUITE</span><h2>Look and promise</h2><div className="rhe-collection-preview"><img src={draft.cover} alt="Collection cover preview" /><div><strong>{draft.title}</strong><p>{draft.promise}</p></div></div><div className="rhe-form-grid"><label>Name<input value={draft.title} disabled={draft.state !== 'draft'} onChange={event => patch({ title: event.target.value })} /></label><label>Accent colour<input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : '#74762f'} disabled={draft.state !== 'draft'} onChange={event => patch({ accent: event.target.value })} /></label><label>Printed-page accent<input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.paperAccent) ? draft.paperAccent : '#74762f'} disabled={draft.state !== 'draft'} onChange={event => patch({ paperAccent: event.target.value })} /></label><label>Cover image URL<input value={draft.cover.startsWith('data:') ? 'Uploaded cover image' : draft.cover} disabled={draft.state !== 'draft' || draft.cover.startsWith('data:')} onChange={event => patch({ cover: event.target.value })} /></label><label>Printed-page header image URL<input value={draft.headerImage.startsWith('data:') ? 'Uploaded header image' : draft.headerImage} disabled={draft.state !== 'draft' || draft.headerImage.startsWith('data:')} onChange={event => patch({ headerImage: event.target.value })} placeholder="Optional" /></label><label className="rhe-upload-field">Upload cover image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={draft.state !== 'draft' || busy} onChange={event => { void uploadIdentity(event.target.files?.[0], 'cover'); event.target.value = ''; }} /><small>JPG, PNG or WebP · at least 500 × 500 pixels</small></label><label className="rhe-upload-field">Upload printed-page header<input type="file" accept="image/jpeg,image/png,image/webp" disabled={draft.state !== 'draft' || busy} onChange={event => { void uploadIdentity(event.target.files?.[0], 'header'); event.target.value = ''; }} /><small>JPG, PNG or WebP · at least 700 × 150 pixels</small></label></div>{draft.headerImage && <div className="rhe-header-preview"><span>Printed-page header preview</span><img src={draft.headerImage} alt="Preview of the printed-page header" /></div>}<label className="rhe-wide-field">Promise<textarea value={draft.promise} disabled={draft.state !== 'draft'} rows={3} onChange={event => patch({ promise: event.target.value })} /></label></div><aside className="rhe-check-panel"><span className="rh-kicker">PUBLICATION</span><h3>{draft.publishedAt ? `Published ${new Date(draft.publishedAt).toLocaleDateString()}` : 'Not published yet'}</h3><p>Cover, colour and promise edits stay private until you publish this edition.</p>{error && <p className="rhe-error" role="alert">{error}</p>}<div className="rhe-actions">{draft.state === 'draft' ? <><button type="button" className="rh-primary" disabled={!dirty || busy} onClick={() => void save()}>Save draft</button><button type="button" className="rhe-outline" disabled={dirty || busy || !draft.title.trim() || !draft.promise.trim()} onClick={() => void advance('review')}>Send for review</button></> : <><button type="button" className="rh-primary" disabled={busy} onClick={() => void advance('publish')}>Publish collection</button><button type="button" className="rhe-outline" disabled={busy} onClick={() => void advance('draft')}>Return to draft</button></>}</div>{dirty && <p className="rhe-action-note">Save changes before review.</p>}</aside></div>}</div>;
}

export default ResourceHubAdminPage;

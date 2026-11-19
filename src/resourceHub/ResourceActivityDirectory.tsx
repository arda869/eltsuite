import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Select } from '../components/Select';
import { HUB_ACTIVITIES, HUB_COLLECTIONS } from './catalog';
import { saveResourceDraft, type HubResourceDraft, type HubResourceEdition } from './hubEditorData';
import { subscribeStaticKitOverride, type HubStaticOverride } from './hubStaticOverride';
import './resource-activity-directory.css';

type ActivityRow = { id: string; draft?: HubResourceDraft; edition?: HubResourceEdition; builtIn?: boolean };

export function ResourceActivityDirectory({ drafts, published }: { drafts: HubResourceDraft[] | null; published: HubResourceEdition[] | null }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [base, setBase] = useState<HubResourceDraft | null>(null);
  const [working, setWorking] = useState<HubResourceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staticOverride, setStaticOverride] = useState<HubStaticOverride | null>(null);
  useEffect(() => subscribeStaticKitOverride(setStaticOverride, () => setStaticOverride(null)), []);
  const builtIn = HUB_ACTIVITIES.find(activity => activity.id === 'otp-002');
  const staticItem = builtIn ? { ...builtIn, ...staticOverride } : undefined;
  const rows = useMemo(() => {
    const byId = new Map<string, ActivityRow>();
    for (const edition of published ?? []) byId.set(edition.id, { id: edition.id, edition });
    for (const draft of drafts ?? []) byId.set(draft.id, { ...byId.get(draft.id), id: draft.id, draft });
    if (builtIn) byId.set(builtIn.id, { id: builtIn.id, builtIn: true });
    return [...byId.values()].sort((a, b) => {
      const aTime = a.draft?.updatedAt ?? a.edition?.publishedAt ?? 0;
      const bTime = b.draft?.updatedAt ?? b.edition?.publishedAt ?? 0;
      return bTime - aTime;
    });
  }, [drafts, published, builtIn]);
  const visible = rows.filter(row => {
    const item = row.draft ?? row.edition ?? staticItem;
    if (!item) return false;
    const status = row.builtIn || row.edition ? 'published' : row.draft?.state === 'in-review' ? 'review' : 'draft';
    return (filter === 'all' || filter === status) && `${item.title} ${item.number} ${item.focus} ${item.level} ${item.collectionId}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const choose = (row: ActivityRow) => {
    if (working && base && JSON.stringify(working) !== JSON.stringify(base) && !window.confirm('Discard unsaved metadata changes?')) return;
    setSelected(row); setBase(row.draft ?? null); setWorking(row.draft ? { ...row.draft } : null); setError('');
  };
  const close = () => {
    if (working && base && JSON.stringify(working) !== JSON.stringify(base) && !window.confirm('Discard unsaved metadata changes?')) return;
    setSelected(null); setBase(null); setWorking(null); setError('');
  };
  const patch = (value: Partial<HubResourceDraft>) => setWorking(current => current ? { ...current, ...value } : current);
  const dirty = !!working && !!base && JSON.stringify(working) !== JSON.stringify(base);
  const save = async () => {
    if (!working || !base || saving || !dirty) return;
    if (!Number.isFinite(working.minutes) || working.minutes < 1 || working.minutes > 240) { setError('Set a time from 1 to 240 minutes.'); return; }
    if (working.number.trim() && (!/^\d{1,3}$/.test(working.number.trim()) || Number(working.number) < 1)) { setError('Use a number from 001 to 999.'); return; }
    setSaving(true); setError('');
    try { const saved = await saveResourceDraft(working, base.revision); setWorking(saved); setBase(saved); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this activity.'); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // close reads current unsaved state; refresh the listener with each edit.
  }, [selected, working, base]);

  return <section className="rad-directory" aria-labelledby="rad-heading">
    <div className="rad-heading"><div><span className="rh-kicker">ACTIVITY DIRECTORY</span><h2 id="rad-heading">All activities</h2><p>Browse the catalogue and edit draft metadata in one place. Published pages stay unchanged until you publish a new edition.</p></div><span className="rad-count">{rows.length} activities</span></div>
    <div className="rad-toolbar"><label className="rad-search"><span className="sr-only">Search activities</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, number, focus or level" type="search" /></label><div className="rad-filters" role="group" aria-label="Filter activities">{[['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['review', 'In review']].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="rad-table-scroll"><table><thead><tr><th scope="col">Activity</th><th scope="col">Collection</th><th scope="col">Focus</th><th scope="col">Level</th><th scope="col">Time</th><th scope="col">Interaction</th><th scope="col">Preparation</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{visible.map(row => {
      const item = row.draft ?? row.edition ?? staticItem;
      if (!item) return null;
      const status = row.builtIn || row.edition ? 'Published' : row.draft?.state === 'in-review' ? 'In review' : 'Draft';
      return <tr key={row.id}><th scope="row"><span className="rad-number">{item.number || 'NEW'}</span><strong>{item.title || 'Untitled activity'}</strong><small>{item.summary || 'Add a short summary'}</small></th><td>{HUB_COLLECTIONS.find(collection => collection.id === item.collectionId)?.title ?? item.collectionId}</td><td>{item.focus || '—'}</td><td>{item.level || '—'}</td><td>{item.minutes ? `${item.minutes} min` : '—'}</td><td>{item.interaction || '—'}</td><td>{item.prep || '—'}</td><td><span className="rad-status">{status}</span></td><td><div className="rad-actions"><button type="button" onClick={() => choose(row)}>Metadata</button><Link to={row.builtIn ? '/resource-hub/admin?source=otp-002' : `/resource-hub/admin/${row.id}`}>Edit activity</Link>{(row.builtIn || row.edition) && <Link to={`/resource-hub?activity=${row.id}`}>View ↗</Link>}</div></td></tr>;
    })}</tbody></table>{!visible.length && <p className="rad-empty">No activities match this search.</p>}</div>
    {selected && <div className="rad-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><aside className="rad-panel" role="dialog" aria-modal="true" aria-labelledby="rad-panel-title"><div className="rad-panel-head"><div><span className="rh-kicker">ACTIVITY METADATA</span><h3 id="rad-panel-title">{working?.title || selected.edition?.title || staticItem?.title || 'Untitled activity'}</h3><p>{working ? 'Changes save to the private draft.' : 'Open the activity editor to change this source resource.'}</p></div><button type="button" onClick={close} aria-label="Close metadata">×</button></div>{working ? <><div className="rad-panel-scroll"><div className="rad-fields"><label>Title<input value={working.title} onChange={event => patch({ title: event.target.value })} /></label><label>Activity number<input disabled={working.publishedRevision != null} value={working.number} onChange={event => patch({ number: event.target.value })} placeholder="001–999" /></label><label className="rad-wide">Short summary<textarea rows={3} value={working.summary} onChange={event => patch({ summary: event.target.value })} /></label><label>Language focus<input value={working.focus} onChange={event => patch({ focus: event.target.value })} /></label><label>Level<input value={working.level} onChange={event => patch({ level: event.target.value })} /></label><label>Time in minutes<input type="number" min={1} max={240} value={working.minutes} onChange={event => patch({ minutes: Number(event.target.value) })} /></label><label>Interaction<input value={working.interaction} onChange={event => patch({ interaction: event.target.value })} /></label><label>Collection<Select disabled={working.publishedRevision != null} value={working.collectionId} label="Collection" options={HUB_COLLECTIONS.map(collection => ({ v: collection.id, label: collection.title }))} onChange={value => patch({ collectionId: value })} /></label><label>Preparation<Select value={working.prep} label="Preparation" options={['No prep', 'Print', 'Print and cut'].map(value => ({ v: value as HubResourceDraft['prep'], label: value }))} onChange={value => patch({ prep: value })} /></label><label>Works in<Select value={working.mode} label="Works in" options={['Face-to-face and online', 'Face-to-face only', 'Online only'].map(value => ({ v: value as HubResourceDraft['mode'], label: value }))} onChange={value => patch({ mode: value })} /></label><label>Energy<Select value={String(working.energy)} label="Energy" options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => patch({ energy: Number(value) as HubResourceDraft['energy'] })} /></label></div><div className="rad-meta">{working.publishedRevision != null && <span>Published collection and number are fixed; create a new activity to change those.</span>}{working.state === 'in-review' && <span>Saving edits returns this activity to Draft for review.</span>}<span>Workflow: {working.state === 'in-review' ? 'In review' : 'Draft'}</span><span>Draft revision {working.revision}</span><span>{working.publishedAt ? `Last published ${new Date(working.publishedAt).toLocaleDateString()}` : 'Not yet published'}</span></div></div>{error && <p className="rad-error" role="alert">{error}</p>}<div className="rad-panel-actions"><button type="button" className="rh-primary" onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save metadata'}</button><Link to={`/resource-hub/admin/${selected.id}`}>Edit activity →</Link></div></> : <div className="rad-panel-static"><p>Edit all available metadata for this source-page activity in its activity editor.</p><Link className="rh-primary" to={selected.builtIn ? '/resource-hub/admin?source=otp-002' : `/resource-hub/admin/${selected.id}`}>Open activity editor</Link></div>}</aside></div>}
  </section>;
}

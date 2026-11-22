import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Select } from '../components/Select';
import { INTERACTION_PATTERNS, MultiSelect, interactionList, interactionText } from '../components/MultiSelect';
import { HUB_ACTIVITIES, HUB_COLLECTIONS } from './catalog';
import { saveResourceDraft, type HubResourceDraft, type HubResourceEdition } from './hubEditorData';
import { subscribeStaticKitOverride, type HubStaticOverride } from './hubStaticOverride';
import './resource-activity-directory.css';

type ActivityRow = { id: string; draft?: HubResourceDraft; edition?: HubResourceEdition; builtIn?: boolean };

export function ResourceActivityDirectory({ drafts, published }: { drafts: HubResourceDraft[] | null; published: HubResourceEdition[] | null }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  const [filterPosition, setFilterPosition] = useState({ left: 0, top: 0 });
  const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null);
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [base, setBase] = useState<HubResourceDraft | null>(null);
  const [working, setWorking] = useState<HubResourceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staticOverride, setStaticOverride] = useState<HubStaticOverride | null>(null);
  // Spreadsheet-style editing: click a cell in a draft row, type, and it saves when you leave the cell.
  const [cellEdits, setCellEdits] = useState<Record<string, Partial<HubResourceDraft>>>({});
  const pendingEdits = useRef<Record<string, Partial<HubResourceDraft>>>({});
  const savingRows = useRef(new Set<string>());
  const latestSaved = useRef(new Map<string, HubResourceDraft>());
  const cancelledBlur = useRef(new Set<string>());
  const [rowSaving, setRowSaving] = useState<string[]>([]);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const editCell = (id: string, value: Partial<HubResourceDraft>) => {
    pendingEdits.current = { ...pendingEdits.current, [id]: { ...pendingEdits.current[id], ...value } };
    setCellEdits(pendingEdits.current);
  };
  const cancelRow = (id: string) => {
    const { [id]: _cancelled, ...rest } = pendingEdits.current;
    void _cancelled;
    pendingEdits.current = rest;
    setCellEdits(rest);
    cancelledBlur.current.add(id);
  };
  const commitRow = async (draft: HubResourceDraft, extra: Partial<HubResourceDraft> = {}) => {
    if (Object.keys(extra).length) editCell(draft.id, extra);
    if (savingRows.current.has(draft.id)) return;
    let base = latestSaved.current.get(draft.id);
    if (!base || draft.revision >= base.revision) base = draft;
    if (!Object.keys(pendingEdits.current[draft.id] ?? {}).length) return;
    savingRows.current.add(draft.id);
    setRowSaving([...savingRows.current]);
    setRowError(null);
    try {
      while (Object.keys(pendingEdits.current[draft.id] ?? {}).length) {
        const change = { ...pendingEdits.current[draft.id] };
        const next = { ...base, ...change };
        if (!Number.isFinite(next.minutes) || next.minutes < 1 || next.minutes > 240) throw new Error('Set a time from 1 to 240 minutes.');
        if (JSON.stringify(next) !== JSON.stringify(base)) {
          base = await saveResourceDraft(next, base.revision);
          latestSaved.current.set(draft.id, base);
        }
        // A teacher may have changed another cell while this save was in flight.
        // Remove only values included in this save, then save any newer edits with the new revision.
        const current = { ...pendingEdits.current[draft.id] };
        for (const [key, value] of Object.entries(change)) {
          if (current[key as keyof HubResourceDraft] === value) delete current[key as keyof HubResourceDraft];
        }
        pendingEdits.current = { ...pendingEdits.current, [draft.id]: current };
        setCellEdits(pendingEdits.current);
      }
    } catch (cause) {
      setRowError({ id: draft.id, message: cause instanceof Error ? cause.message : 'We couldn’t save that change. Try again. Your edit is still here.' });
    } finally {
      savingRows.current.delete(draft.id);
      setRowSaving([...savingRows.current]);
    }
  };
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
  const columnValue = (row: ActivityRow, key: string): string => {
    const item = row.draft ?? row.edition ?? staticItem;
    if (!item) return '';
    switch (key) {
      case 'activity': return `${item.number} ${item.title} ${item.summary}`;
      case 'collection': return HUB_COLLECTIONS.find(collection => collection.id === item.collectionId)?.title ?? item.collectionId;
      case 'focus': return item.focus;
      case 'level': return item.level;
      case 'time': return String(item.minutes);
      case 'interaction': return item.interaction;
      case 'preparation': return item.prep;
      case 'status': return row.builtIn || row.edition ? 'Published' : row.draft?.state === 'in-review' ? 'In review' : 'Draft';
      case 'published': return (row.edition?.publishedAt ?? row.draft?.publishedAt) ? new Date((row.edition?.publishedAt ?? row.draft?.publishedAt)!).toLocaleDateString() : '';
      default: return '';
    }
  };
  const columns = [['activity', 'Activity'], ['collection', 'Collection'], ['focus', 'Focus'], ['level', 'Level'], ['time', 'Time'], ['interaction', 'Interaction'], ['preparation', 'Preparation'], ['status', 'Status'], ['published', 'Published']] as const;
  const visible = rows.filter(row => {
    const item = row.draft ?? row.edition ?? staticItem;
    if (!item) return false;
    const status = row.builtIn || row.edition ? 'published' : row.draft?.state === 'in-review' ? 'review' : 'draft';
    return (filter === 'all' || filter === status) && `${item.title} ${item.number} ${item.focus} ${item.level} ${item.collectionId}`.toLowerCase().includes(query.trim().toLowerCase())
      && Object.entries(columnFilters).every(([key, value]) => columnValue(row, key).toLowerCase().includes(value.trim().toLowerCase()));
  }).sort((a, b) => sort ? (sort.key === 'published' ? ((a.edition?.publishedAt ?? a.draft?.publishedAt ?? 0) - (b.edition?.publishedAt ?? b.draft?.publishedAt ?? 0)) : columnValue(a, sort.key).localeCompare(columnValue(b, sort.key), undefined, { numeric: true, sensitivity: 'base' })) * (sort.descending ? -1 : 1) : 0);
  const columnHeader = ([key, label]: readonly [string, string]) => <th key={key} scope="col" className={columnFilters[key] ? 'rad-filtered' : ''}><div className="rad-column-head"><button type="button" className="rad-column-sort" onClick={() => setSort(current => current?.key === key ? { key, descending: !current.descending } : { key, descending: false })} aria-label={`Sort by ${label}${sort?.key === key ? sort.descending ? ', descending' : ', ascending' : ''}`}>{label}{sort?.key === key && <span aria-hidden="true">{sort.descending ? ' ↓' : ' ↑'}</span>}</button><button type="button" className="rad-filter-button" aria-label={`Filter ${label}`} aria-expanded={openColumn === key} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); setFilterPosition({ left: Math.min(bounds.left, window.innerWidth - 236), top: bounds.bottom + 5 }); setOpenColumn(current => current === key ? null : key); }}><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2.5 4h15l-6 7v4.5l-3 1V11z" /></svg></button></div></th>;
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
    <div className="rad-heading"><div><span className="rh-kicker">ACTIVITY DIRECTORY</span><h2 id="rad-heading">All activities</h2><p>Click a cell in a draft to edit it, like a spreadsheet. Changes save when you leave the cell. Published pages stay unchanged until you publish a new edition.</p></div><span className="rad-count">{rows.length} {rows.length === 1 ? 'activity' : 'activities'}</span></div>
    <div className="rad-toolbar"><label className="rad-search"><span className="sr-only">Search activities</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, number, focus or level" type="search" /></label><div className="rad-filters" role="group" aria-label="Filter activities">{[['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['review', 'In review']].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="rad-table-scroll"><table><thead><tr>{columns.map(columnHeader)}<th scope="col">Actions</th></tr></thead><tbody>{visible.map(row => {
      const item = row.draft ?? row.edition ?? staticItem;
      if (!item) return null;
      const status = row.builtIn || row.edition ? 'Published' : row.draft?.state === 'in-review' ? 'In review' : 'Draft';
      const draft = row.draft && !row.builtIn ? row.draft : null;
      const v = draft ? { ...draft, ...cellEdits[draft.id] } : null;
      const blur = () => { if (!draft) return; if (cancelledBlur.current.delete(draft.id)) return; void commitRow(draft); };
      const leave = (event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape' && draft) { cancelRow(draft.id); event.currentTarget.blur(); } };
      const text = (field: 'title' | 'focus' | 'level', placeholder: string) => v && draft ? <input className="rad-cell-input" value={v[field]} placeholder={placeholder} aria-label={`${field === 'title' ? 'Title' : field === 'focus' ? 'Language focus' : 'Level'} for ${v.title || 'untitled activity'}`} onChange={event => editCell(draft.id, { [field]: event.target.value })} onBlur={blur} onKeyDown={leave} /> : null;
      return <tr key={row.id} className={draft ? `rad-editable${rowSaving.includes(row.id) ? ' saving' : ''}` : ''}><th scope="row"><span className="rad-number">{item.number || 'NEW'}</span>{draft ? text('title', 'Untitled activity') : <strong>{item.title || 'Untitled activity'}</strong>}<small>{item.summary || 'Add a short summary'}</small>{rowError?.id === row.id && <small className="rad-cell-error" role="alert">{rowError.message}</small>}</th><td>{HUB_COLLECTIONS.find(collection => collection.id === item.collectionId)?.title ?? item.collectionId}</td><td>{draft ? text('focus', 'Add a focus') : item.focus || '—'}</td><td>{draft ? text('level', 'e.g. A2–B1') : item.level || '—'}</td><td>{v && draft ? <input className="rad-cell-input rad-cell-number" type="number" min={1} max={240} value={v.minutes} aria-label={`Time in minutes for ${v.title || 'untitled activity'}`} onChange={event => editCell(draft.id, { minutes: Number(event.target.value) })} onBlur={blur} onKeyDown={leave} /> : item.minutes ? `${item.minutes} min` : '—'}</td><td>{v && draft ? <MultiSelect className="rad-cell-select" label="Interaction" options={INTERACTION_PATTERNS} value={interactionList(v.interaction)} placeholder="Choose" onChange={list => { editCell(draft.id, { interaction: interactionText(list) }); void commitRow(draft); }} /> : item.interaction || '—'}</td><td>{v && draft ? <Select className="rad-cell-select" value={v.prep} label="Preparation" options={['No prep', 'Print', 'Print and cut'].map(value => ({ v: value as HubResourceDraft['prep'], label: value }))} onChange={value => { editCell(draft.id, { prep: value }); void commitRow(draft); }} /> : item.prep || '—'}</td><td><span className="rad-status">{rowSaving.includes(row.id) ? 'Saving…' : status}</span></td><td className="rad-date">{columnValue(row, 'published') || '—'}</td><td><div className="rad-actions"><button type="button" onClick={() => choose(row)}>Details</button><Link to={row.builtIn ? '/resource-hub/admin?source=otp-002' : `/resource-hub/admin/${row.id}`}>Edit activity</Link>{(row.builtIn || row.edition) && <Link to={`/resource-hub?activity=${row.id}`}>View ↗</Link>}</div></td></tr>;

    })}</tbody></table>{!visible.length && <p className="rad-empty">No activities match this search.</p>}</div>
    {selected && <div className="rad-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><aside className="rad-panel" role="dialog" aria-modal="true" aria-labelledby="rad-panel-title"><div className="rad-panel-head"><div><span className="rh-kicker">ACTIVITY METADATA</span><h3 id="rad-panel-title">{working?.title || selected.edition?.title || staticItem?.title || 'Untitled activity'}</h3><p>{working ? 'Changes save to the private draft.' : 'Open the activity editor to change this source resource.'}</p></div><button type="button" onClick={close} aria-label="Close metadata">×</button></div>{working ? <><div className="rad-panel-scroll"><div className="rad-fields"><label>Title<input value={working.title} onChange={event => patch({ title: event.target.value })} /></label><label>Activity number<input disabled={working.publishedRevision != null} value={working.number} onChange={event => patch({ number: event.target.value })} placeholder="001–999" /></label><label className="rad-wide">Short summary<textarea rows={3} value={working.summary} onChange={event => patch({ summary: event.target.value })} /></label><label>Language focus<input value={working.focus} onChange={event => patch({ focus: event.target.value })} /></label><label>Level<input value={working.level} onChange={event => patch({ level: event.target.value })} /></label><label>Time in minutes<input type="number" min={1} max={240} value={working.minutes} onChange={event => patch({ minutes: Number(event.target.value) })} /></label><label>Interaction<MultiSelect label="Interaction" options={INTERACTION_PATTERNS} value={interactionList(working.interaction)} onChange={list => patch({ interaction: interactionText(list) })} /></label><label>Collection<Select disabled={working.publishedRevision != null} value={working.collectionId} label="Collection" options={HUB_COLLECTIONS.map(collection => ({ v: collection.id, label: collection.title }))} onChange={value => patch({ collectionId: value })} /></label><label>Preparation<Select value={working.prep} label="Preparation" options={['No prep', 'Print', 'Print and cut'].map(value => ({ v: value as HubResourceDraft['prep'], label: value }))} onChange={value => patch({ prep: value })} /></label><label>Works in<Select value={working.mode} label="Works in" options={['Face-to-face and online', 'Face-to-face only', 'Online only'].map(value => ({ v: value as HubResourceDraft['mode'], label: value }))} onChange={value => patch({ mode: value })} /></label><label>Energy<Select value={String(working.energy)} label="Energy" options={[{ v: '1', label: 'Calm' }, { v: '2', label: 'Moderate' }, { v: '3', label: 'Energetic' }]} onChange={value => patch({ energy: Number(value) as HubResourceDraft['energy'] })} /></label></div><div className="rad-meta">{working.publishedRevision != null && <span>Published collection and number are fixed; create a new activity to change those.</span>}{working.state === 'in-review' && <span>Saving edits returns this activity to Draft for review.</span>}<span>Workflow: {working.state === 'in-review' ? 'In review' : 'Draft'}</span><span>Draft revision {working.revision}</span><span>{working.publishedAt ? `Last published ${new Date(working.publishedAt).toLocaleDateString()}` : 'Not yet published'}</span></div></div>{error && <p className="rad-error" role="alert">{error}</p>}<div className="rad-panel-actions"><button type="button" className="rh-primary" onClick={() => void save()} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save metadata'}</button><Link to={`/resource-hub/admin/${selected.id}`}>Edit activity →</Link></div></> : <div className="rad-panel-static"><p>Edit all available metadata for this source-page activity in its activity editor.</p><Link className="rh-primary" to={selected.builtIn ? '/resource-hub/admin?source=otp-002' : `/resource-hub/admin/${selected.id}`}>Open activity editor</Link></div>}</aside></div>}
    {openColumn && createPortal(<div className="rad-column-filter rad-filter-popover" style={{ left: Math.max(8, filterPosition.left), top: filterPosition.top }} role="dialog" aria-label={`Filter ${columns.find(([key]) => key === openColumn)?.[1] ?? openColumn}`}><label><span>Filter {columns.find(([key]) => key === openColumn)?.[1] ?? openColumn}</span><input autoFocus value={columnFilters[openColumn] ?? ''} onChange={event => setColumnFilters(current => ({ ...current, [openColumn]: event.target.value }))} placeholder={`Find ${(columns.find(([key]) => key === openColumn)?.[1] ?? openColumn).toLowerCase()}…`} /></label><div><button type="button" onClick={() => setColumnFilters(current => { const next = { ...current }; delete next[openColumn]; return next; })}>Clear</button><button type="button" onClick={() => setOpenColumn(null)}>Done</button></div></div>, document.body)}
  </section>;
}

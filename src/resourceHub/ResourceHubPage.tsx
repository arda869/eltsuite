import { markStep } from '../start/steps';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { Select } from '../components/Select';
import { useAuth } from '../lib/auth';
import { useSuper } from '../lib/admin';
import { allTeacherClasses } from '../lib/coteach';
import type { ClassDoc } from '../lib/classes';
import { HUB_ACTIVITIES, HUB_COLLECTIONS, type HubActivity, type HubCollection, type HubCollectionId } from './catalog';
import { ResourceDetail } from './ResourceDetail';
import { flushResourceMetrics, recordHubSearch } from './usageMetrics';
import { HubShelves } from './HubShelves';
import { PrintDesk } from './PrintDesk';
import { useHubState } from './hub-state';
import { usePublishedHubResources } from './usePublishedHubResources';
import { usePublishedHubCollections } from './usePublishedHubCollections';
import { subscribeStaticKitOverride, type HubStaticOverride } from './hubStaticOverride';
import './hub.css';

type Tab = 'discover' | 'collections' | 'shelves';
type Filters = { level: string; interaction: string; time: string; prep: string };
const DEFAULT_FILTERS: Filters = { level: 'All levels', interaction: 'Any interaction', time: 'Any length', prep: 'Any prep' };
const FILTER_CHOICES: Record<keyof Filters, string[]> = {
  level: ['All levels', 'A1', 'A2', 'B1', 'B2', 'C1'],
  interaction: ['Any interaction', 'Pairs', 'Small groups', 'Whole class', 'Teams'],
  time: ['Any length', '40 minutes or less', '45 minutes or less', '50 minutes or less'],
  prep: ['Any prep', 'Print', 'Print and cut'],
};
const TAB_LABELS: Record<Tab, string> = { discover: 'Discover', collections: 'Collections', shelves: 'My shelves' };
const VISIBLE_TABS: Tab[] = ['discover', 'shelves'];
const ICONS: Record<string, string> = {
  search: 'M21 21l-4.3-4.3m1.8-5.7a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  chevron: 'm7 10 5 5 5-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 15h12v6H6v-6Z',
  books: 'M3 4h4v16H3V4Zm5 3h4v13H8V7Zm5-2 4-1 4 15-4 1-4-15Z',
  close: 'M5 5l14 14M19 5 5 19',
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

function FilterMenu({ name, value, options, onChange }: { name: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="rh-filter"><Select value={value} options={options.map(option => ({ v: option, label: option }))} onChange={onChange} label={name} className={value !== options[0] ? 'rh-select-filter active' : 'rh-select-filter'} search={false} /></div>;
}

function ActivityCard({ activity, saved, onOpen, onSave }: { activity: HubActivity; saved: boolean; onOpen: () => void; onSave: () => void }) {
  const ready = activity.status === 'ready';
  return <article className="rh-activity-card">
    <button type="button" className="rh-activity-main" onClick={onOpen} aria-label={`View ${activity.title}`}>
      <span className={`rh-activity-art art-${activity.kind}`}>{ready && activity.pages.length ? <img src={activity.pages.find(page => page.audience === 'learner')?.image} alt="" /> : <><span>{activity.number}</span><strong>{activity.kind === 'lesson' ? 'L' : activity.kind === 'information-gap' ? 'A ↔ B' : activity.kind === 'table' ? '✓' : activity.kind === 'board' ? '◈' : activity.kind === 'cards' ? '▤' : activity.kind === 'strips' ? '≡' : '✦'}</strong></>}</span>
      <span className="rh-activity-copy"><span className="rh-activity-eyebrow">{activity.kind === 'lesson' ? 'LESSON' : `OFF THE PAGE · ${activity.number}`}</span><strong>{activity.title}</strong><span className="rh-activity-summary">{activity.summary}</span><span className="rh-activity-meta"><span>{activity.level}</span><span>{activity.minutes} min</span><span>{activity.interaction}</span></span></span>
      {/* Shown when the card is a wide feature: every page in the activity, so the width shows something useful. */}
      {ready && activity.pages.length > 1 && <span className="rh-activity-pages" aria-hidden="true">{activity.pages.map(page => <span key={page.id}><img src={page.image} alt="" /><small>{page.audience === 'teacher' ? 'Teacher' : 'Learner'}</small></span>)}</span>}
    </button>
    <div className="rh-card-footer"><span className={ready ? 'rh-ready' : 'rh-outline'}>{ready ? activity.kind === 'lesson' ? 'Editable lesson' : 'Printable activity' : 'Coming soon'}</span>{activity.publishedAt && <time className="rh-published-date" dateTime={new Date(activity.publishedAt).toISOString()}>Published {new Date(activity.publishedAt).toLocaleDateString()}</time>}<button type="button" className={saved ? 'rh-icon-button selected' : 'rh-icon-button'} onClick={onSave} aria-label={saved ? `Remove ${activity.title} from shelf` : `Save ${activity.title} to shelf`} title={saved ? 'Remove from shelf' : 'Save to shelf'}><Icon name="bookmark" size={17} /></button></div>
  </article>;
}

function CollectionCard({ collection, onClick, followed, onFollow, readyCount }: { collection: HubCollection; onClick: () => void; followed: boolean; onFollow: () => void; readyCount: number }) {
  return <article className="rh-collection-card" style={{ '--rh-collection-accent': collection.accent } as CSSProperties}><button type="button" className="rh-collection-open" onClick={onClick}><span className="rh-cover"><img src={collection.cover} alt="" /></span><span className="rh-collection-copy"><strong>{collection.title}</strong><span>{collection.promise}</span><small>{readyCount ? 'Open collection' : 'Coming soon'} <Icon name="arrow" size={13} /></small></span></button><button type="button" className="rh-collection-follow" aria-pressed={followed} onClick={onFollow}>{followed ? '✓ Following' : '+ Follow collection'}</button></article>;
}

export function ResourceHubPage() {
  const { user } = useAuth();
  useEffect(() => markStep('hub'), []);
  useEffect(() => {
    void flushResourceMetrics();
    window.addEventListener('online', flushResourceMetrics);
    return () => window.removeEventListener('online', flushResourceMetrics);
  }, [user?.uid]);
  const isSuper = useSuper();
  const [params, setParams] = useSearchParams();
  const preferredClassId = params.get('classId') || undefined;
  const [preferredClass, setPreferredClass] = useState<ClassDoc | null>(null);
  useEffect(() => {
    if (!preferredClassId || !user) { setPreferredClass(null); return; }
    let active = true;
    allTeacherClasses(user.uid).then(rows => { if (active) setPreferredClass(rows.find(row => row.id === preferredClassId && row.status === 'active') ?? null); }, () => { if (active) setPreferredClass(null); });
    return () => { active = false; };
  }, [preferredClassId, user]);
  const published = usePublishedHubResources();
  const publishedCollections = usePublishedHubCollections();
  const [staticKitOverride, setStaticKitOverride] = useState<HubStaticOverride | null>(null);
  useEffect(() => subscribeStaticKitOverride(setStaticKitOverride, () => setStaticKitOverride(null)), []);
  const collections = useMemo(() => HUB_COLLECTIONS.map(collection => ({ ...collection, ...publishedCollections.items?.find(item => item.id === collection.id) })).filter(collection => collection.visible !== false), [publishedCollections.items]);
  const activities = useMemo(() => {
    const additions = (published.items ?? []).filter(item => !(item.collectionId === 'otp' && item.number === '002'));
    const replacements = new Map(additions.map(item => [item.id, item]));
    const examples = HUB_ACTIVITIES.filter(item => item.id === 'otp-002');
    const builtIn = examples.map(item => item.id === staticKitOverride?.id ? { ...item, ...staticKitOverride, publishedAt: staticKitOverride.updatedAt || item.publishedAt, pages: staticKitOverride.pages } : replacements.get(item.id) ?? item);
    const builtInIds = new Set(examples.map(item => item.id));
    const visibleCollectionIds = new Set(collections.map(collection => collection.id));
    return [...builtIn, ...additions.filter(item => !builtInIds.has(item.id))].filter(item => visibleCollectionIds.has(item.collectionId));
  }, [published.items, staticKitOverride, collections]);
  const requestedTab = params.get('tab');
  const tab: Tab = requestedTab && requestedTab in TAB_LABELS ? requestedTab as Tab : 'discover';
  const selectedActivity = activities.find(a => a.id === params.get('activity'));
  const selectedCollection = collections.find(c => c.id === params.get('collection'));
  const [query, setQuery] = useState('');
  const [describing, setDescribing] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const hub = useHubState(user?.uid);
  const [showPrintDesk, setShowPrintDesk] = useState(false);
  const setRoute = (next: { tab?: Tab; collection?: HubCollectionId; activity?: string }) => {
    setShowPrintDesk(false);
    const value = new URLSearchParams();
    if (preferredClassId) value.set('classId', preferredClassId);
    if (next.tab && next.tab !== 'discover') value.set('tab', next.tab);
    if (next.collection) value.set('collection', next.collection);
    if (next.activity) value.set('activity', next.activity);
    setParams(value);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const matches = useMemo(() => activities.filter(a => {
    const words = `${a.title} ${a.focus} ${a.summary} ${a.tags.join(' ')} ${a.level} ${a.interaction}`.toLowerCase();
    const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2 && !['the', 'for', 'and', 'with', 'want', 'need', 'that', 'some', 'have', 'class', 'lesson'].includes(term));
    const queryMatch = !terms.length || (describing ? terms.some(term => words.includes(term)) : terms.every(term => words.includes(term)));
    return queryMatch && (filters.level === 'All levels' || a.level.includes(filters.level))
      && (filters.interaction === 'Any interaction' || a.interaction.toLowerCase().includes(filters.interaction.toLowerCase()))
      && (filters.time === 'Any length' || a.minutes <= Number.parseInt(filters.time, 10))
      && (filters.prep === 'Any prep' || a.prep === filters.prep)
      && (!onlineOnly || a.mode === 'Face-to-face and online' || a.mode === 'Online only');
  }), [activities, query, filters, describing, onlineOnly]);
  useEffect(() => { if (query.trim()) recordHubSearch(query, matches.length); }, [query, matches.length]);
  const openActivity = (id: string) => { hub.recordViewed(id); setRoute({ tab, collection: selectedCollection?.id, activity: id }); };
  const activityCards = (items: HubActivity[]) => <div className="rh-activity-grid">{items.map(a => <ActivityCard key={a.id} activity={a} saved={hub.savedIds.includes(a.id)} onOpen={() => openActivity(a.id)} onSave={() => hub.toggleSaved(a.id)} />)}</div>;
  const collectionCards = (collections: HubCollection[]) => <div className="rh-collection-grid">{collections.map(c => <CollectionCard key={c.id} collection={c} readyCount={activities.filter(a => a.collectionId === c.id && a.status === 'ready').length} onClick={() => setRoute({ tab: 'collections', collection: c.id })} followed={hub.followedIds.includes(c.id)} onFollow={() => hub.toggleFollowed(c.id)} />)}</div>;
  const clearDetail = () => setRoute({ tab, collection: selectedCollection?.id });
  return <div className="shell rh-app-shell"><TopBar><nav className="rh-top-links" aria-label="Resource Hub"><Link to="/archive">My files</Link></nav></TopBar>
    <main className="rh-main">
      {/* One bar: Discover and My shelves on the home pages, the Hub's actions on every page. */}
      {/* Only when it has something in it: no empty bar on an activity page. */}
      {(!(selectedActivity && !showPrintDesk) || isSuper === true || preferredClass) && <div className="rh-bar">{tab !== 'collections' && !selectedCollection && !selectedActivity && !showPrintDesk && <div className="rh-tabs" role="tablist" aria-label="Resource Hub sections">{VISIBLE_TABS.map(k => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setRoute({ tab: k })}>{TAB_LABELS[k]}</button>)}</div>}<div className="rh-heading-actions">{preferredClass && <span className="rh-class-context" title={`Finding for ${preferredClass.name}`}>Finding for {preferredClass.name}</span>}{isSuper === true && <Link className="rh-print-desk-link" to="/resource-hub/admin">Editor</Link>}{/* An activity page has its own print action. */}{!selectedActivity && <button type="button" className="rh-print-desk-link" aria-pressed={showPrintDesk} onClick={() => setShowPrintDesk(true)}><Icon name="print" size={16} /> Print Desk</button>}</div></div>}
      <div className={selectedActivity && !showPrintDesk ? 'rh-content rh-content-detail' : 'rh-content'} key={`${tab}-${selectedCollection?.id || ''}-${selectedActivity?.id || ''}-${showPrintDesk}`}>
        {published.error && <p className="rh-disclosure" role="status">Recently published activities could not be loaded. The built-in collection is still available.</p>}
        {publishedCollections.error && <p className="rh-disclosure" role="status">Collection updates could not be loaded. The built-in covers are still available.</p>}
        {showPrintDesk ? <PrintDesk activities={activities} collections={collections} preferredClassId={preferredClass?.id} basketIds={[]} onBack={() => setShowPrintDesk(false)} /> : selectedActivity ? <ResourceDetail activity={selectedActivity} collection={collections.find(item => item.id === selectedActivity.collectionId)} preferredClassId={preferredClass?.id} onBack={clearDetail} saved={hub.savedIds.includes(selectedActivity.id)} onSaveChange={() => hub.toggleSaved(selectedActivity.id)} /> : selectedCollection ? <>
          <button type="button" className="rh-back" onClick={() => setRoute({ tab: 'collections' })}>← All collections</button>
          <section className="rh-collection-hero" style={{ '--rh-collection-accent': selectedCollection.accent } as CSSProperties}><img src={selectedCollection.cover} alt="" /><div><span className="rh-kicker">COLLECTION · BY ELT SUITE</span><h1>{selectedCollection.title}</h1><p>{selectedCollection.promise}</p><div className="rh-hero-facts"><span>{selectedCollection.level}</span><span>{activities.filter(a => a.collectionId === selectedCollection.id && a.status === 'ready').length ? `${activities.filter(a => a.collectionId === selectedCollection.id && a.status === 'ready').length} printable ${activities.filter(a => a.collectionId === selectedCollection.id && a.status === 'ready').length === 1 ? 'activity' : 'activities'}` : 'Coming soon'}</span></div><button type="button" className="rh-collection-hero-follow" aria-pressed={hub.followedIds.includes(selectedCollection.id)} onClick={() => hub.toggleFollowed(selectedCollection.id)}>{hub.followedIds.includes(selectedCollection.id) ? '✓ Following collection' : '+ Follow collection'}</button></div></section>
          {activities.some(a => a.collectionId === selectedCollection.id && a.status === 'ready') ? <><div className="rh-section-heading"><div><span className="rh-kicker">ACTIVITIES</span><h2>Explore {selectedCollection.title}</h2></div></div>{activityCards(activities.filter(a => a.collectionId === selectedCollection.id))}</> : <section className="rh-empty"><h2>In the making</h2><p>This collection is being prepared. Explore Off the Page while we add the complete activities.</p><button type="button" className="rh-primary" onClick={() => setRoute({ tab: 'collections', collection: 'otp' })}>Explore Off the Page <Icon name="arrow" /></button></section>}
        </> : tab === 'discover' ? <>
          <section className="rh-discover-hero"><div className="rh-search" role="search"><Icon name="search" size={20} />{describing ? <textarea value={query} onChange={e => setQuery(e.target.value)} rows={2} placeholder="Tell us your topic, level or language goal…" aria-label="Describe the activity you need" /> : <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an activity, topic or language point…" aria-label="Search activities" />}{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={16} /></button>}<button type="button" className="rh-describe" aria-pressed={describing} onClick={() => { setDescribing(!describing); setQuery(''); }}>{describing ? 'Simple search' : 'Describe what you need'}</button></div>{describing && <p className="rh-search-hint">We match words in activity titles and descriptions. Complete activities are marked “Printable activity”.</p>}<div className="rh-filter-row">{(Object.keys(FILTER_CHOICES) as (keyof Filters)[]).map(k => <FilterMenu key={k} name={k} value={filters[k]} options={FILTER_CHOICES[k]} onChange={value => setFilters(prev => ({ ...prev, [k]: value }))} />)}<button type="button" className="rh-quick-chip" onClick={() => setRoute({ tab: 'collections', collection: 'nop' })}>No prep</button><button type="button" className="rh-quick-chip" onClick={() => setRoute({ tab: 'collections', collection: 'wfc' })}>Under 10 minutes</button><button type="button" className="rh-quick-chip" onClick={() => setQuery('speaking')}>Speaking</button><button type="button" className="rh-quick-chip" onClick={() => setQuery('pairs')}>Pair work</button><button type="button" className={onlineOnly ? 'rh-quick-chip on' : 'rh-quick-chip'} aria-pressed={onlineOnly} onClick={() => setOnlineOnly(value => !value)}>Works online</button></div></section>
          {query || onlineOnly || Object.values(filters).some((value, i) => value !== Object.values(DEFAULT_FILTERS)[i]) ? <section className="rh-section"><div className="rh-section-heading"><div><span className="rh-kicker">SEARCH RESULTS</span><h2>{matches.length} matching activities</h2></div><button type="button" className="rh-text-button" onClick={() => { setQuery(''); setFilters(DEFAULT_FILTERS); setOnlineOnly(false); }}>Clear filters</button></div>{matches.length ? activityCards(matches) : <div className="rh-empty"><h2>Nothing matched this search</h2><p>Try a language point such as “past simple” or choose fewer filters.</p></div>}</section> : <>
            <section className="rh-section"><div className="rh-section-heading"><div><h2>For your next lesson</h2></div><button type="button" className="rh-text-button" onClick={() => setRoute({ tab: 'collections', collection: 'otp' })}>See Off the Page <Icon name="arrow" size={15} /></button></div>{activityCards(activities.filter(a => a.status === 'ready').slice(0, 3))}</section>
            <section className="rh-section"><div className="rh-section-heading"><div><h2>Collections</h2><p>Photocopiable books by ELT Suite</p></div><button type="button" className="rh-text-button" onClick={() => setRoute({ tab: 'collections' })}>All collections <Icon name="arrow" size={15} /></button></div>{collectionCards(collections)}</section>
          </>}
        </> : tab === 'collections' ? <section className="rh-section"><button type="button" className="rh-back" onClick={() => setRoute({ tab: 'discover' })}>← Discover</button><div className="rh-section-heading"><div><h1>Collections</h1><p>Photocopiable books by ELT Suite</p></div></div>{collectionCards(collections)}</section> : <HubShelves activities={activities} collections={collections} syncStatus={hub.syncStatus} savedIds={hub.savedIds} followedIds={hub.followedIds} recentIds={hub.recentIds} namedShelves={hub.namedShelves} onCreateShelf={hub.createShelf} onRemoveShelf={hub.removeShelf} onToggleShelfActivity={hub.toggleShelfActivity} onOpen={openActivity} onRemove={hub.toggleSaved} onFollow={hub.toggleFollowed} onCollection={id => setRoute({ tab: 'collections', collection: id as HubCollectionId })} onDiscover={() => setRoute({ tab: 'discover' })} />}
      </div>
    </main>
  </div>;
}

export default ResourceHubPage;

import { useState } from 'react';
import { HUB_ACTIVITIES, HUB_COLLECTIONS, type HubActivity, type HubCollection } from './catalog';
import type { NamedHubShelf } from './hub-state';
import './hub-secondary.css';

export function HubShelves({ savedIds, followedIds, recentIds = [], namedShelves = [], onOpen, onRemove, onFollow, onCollection, onDiscover, onCreateShelf, onRemoveShelf, onToggleShelfActivity, activities = HUB_ACTIVITIES, collections = HUB_COLLECTIONS, syncStatus = 'browser' }: {
  savedIds: string[];
  followedIds: string[];
  recentIds?: string[];
  namedShelves?: NamedHubShelf[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onFollow: (id: string) => void;
  onCollection: (id: string) => void;
  onDiscover: () => void;
  onCreateShelf?: (title: string) => void;
  onRemoveShelf?: (id: string) => void;
  onToggleShelfActivity?: (shelfId: string, activityId: string) => void;
  activities?: HubActivity[];
  collections?: HubCollection[];
  syncStatus?: 'browser' | 'syncing' | 'synced' | 'error';
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [editingShelf, setEditingShelf] = useState<string | null>(null);
  const saved = [...new Set(savedIds)].map(id => activities.find(activity => activity.id === id)).filter((activity): activity is HubActivity => !!activity);
  const recentlyViewed = recentIds.filter(id => !savedIds.includes(id)).slice(0, 3).map(id => activities.find(activity => activity.id === id)).filter((activity): activity is HubActivity => !!activity);
  const followed = collections.filter(collection => followedIds.includes(collection.id));
  return <section className="rh-secondary-page" aria-labelledby="rh-shelves-title"><header className="rh-secondary-header"><div><span className="rh-kicker">YOUR FINDS</span><h1 id="rh-shelves-title">My shelves</h1><p>Activities you bookmarked and collections you follow. {syncStatus === 'synced' ? 'Synced to your account.' : syncStatus === 'error' ? 'Saved on this browser; account sync is unavailable.' : syncStatus === 'syncing' ? 'Saving to your account…' : 'Saved on this browser.'}</p></div><button type="button" className="rh-secondary-action" onClick={() => setCreating(value => !value)}>+ Make a shelf</button></header>
    {creating && <form className="rh-create-shelf" onSubmit={event => { event.preventDefault(); if (!title.trim() || !onCreateShelf) return; onCreateShelf(title.trim()); setTitle(''); setCreating(false); }}><label htmlFor="rh-new-shelf-name">Shelf name</label><input id="rh-new-shelf-name" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Monday conversation class" maxLength={60} required autoFocus /><button type="submit" className="rh-primary" disabled={!title.trim() || !onCreateShelf}>Create shelf</button><button type="button" className="rh-secondary-action" onClick={() => setCreating(false)}>Cancel</button></form>}
    {namedShelves.length > 0 && <div className="rh-shelf-section"><div className="rh-secondary-section-title"><h2>Your shelves</h2><span>{namedShelves.length}</span></div><div className="rh-named-shelf-grid">{namedShelves.map(shelf => <article className="rh-named-shelf" key={shelf.id}><div className="rh-named-shelf-head"><div><span className="rh-kicker">PERSONAL SHELF</span><h3>{shelf.title}</h3><p>{shelf.activityIds.length} {shelf.activityIds.length === 1 ? 'activity' : 'activities'}</p></div><button type="button" onClick={() => setEditingShelf(current => current === shelf.id ? null : shelf.id)} aria-expanded={editingShelf === shelf.id}>{editingShelf === shelf.id ? 'Done' : 'Edit'}</button></div>{editingShelf === shelf.id ? <div className="rh-named-shelf-picker"><p>Choose from your saved activities.</p>{saved.length ? saved.map(activity => <label key={activity.id}><input type="checkbox" checked={shelf.activityIds.includes(activity.id)} onChange={() => onToggleShelfActivity?.(shelf.id, activity.id)} />{activity.title}</label>) : <p>Save an activity while browsing, then add it here.</p>}<button type="button" className="rh-shelf-remove" onClick={() => onRemoveShelf?.(shelf.id)}>Delete shelf</button></div> : <div className="rh-named-shelf-items">{shelf.activityIds.length ? shelf.activityIds.map(id => activities.find(activity => activity.id === id)).filter((activity): activity is HubActivity => !!activity).map(activity => <button type="button" key={activity.id} onClick={() => onOpen(activity.id)}>{activity.title}<span aria-hidden="true">→</span></button>) : <p>No activities yet. Select Edit to add saved activities.</p>}</div>}</article>)}</div></div>}
    <div className="rh-shelf-section"><div className="rh-secondary-section-title"><h2>Saved activities</h2><span>{saved.length}</span></div>{saved.length ? <div className="rh-shelf-grid">{saved.map(activity => <article className="rh-shelf-card" key={activity.id}><button type="button" className="rh-shelf-open" onClick={() => onOpen(activity.id)}><span className="rh-shelf-art">{activity.status === 'ready' && activity.pages.find(page => page.audience === 'learner')?.image ? <img src={activity.pages.find(page => page.audience === 'learner')!.image} alt="" /> : <span aria-hidden="true">✦</span>}</span><span className="rh-kicker">OFF THE PAGE · {activity.number}</span><strong>{activity.title}</strong><span className="rh-shelf-card-desc">{activity.summary}</span><span className="rh-secondary-pills"><span>{activity.level}</span><span>{activity.status === 'ready' ? 'Printable' : 'Coming soon'}</span></span></button><button type="button" className="rh-shelf-remove" onClick={() => onRemove(activity.id)} aria-label={`Remove ${activity.title} from saved activities`}>Remove from shelf</button></article>)}</div> : <div className="rh-shelf-empty"><p>Save an activity to keep it close for a future lesson.</p><button type="button" onClick={onDiscover}>Explore activities →</button></div>}</div>
    <div className="rh-shelf-section"><div className="rh-secondary-section-title"><h2>Collections you follow</h2><span>{followed.length}</span></div>{followed.length ? <div className="rh-follow-grid">{followed.map(collection => <article className="rh-follow-card" key={collection.id}><button type="button" onClick={() => onCollection(collection.id)}><img src={collection.cover} alt="" /><span><strong>{collection.title}</strong><small>{collection.status === 'available' ? 'Explore collection' : 'Coming soon'}</small></span></button><button type="button" className="rh-shelf-remove" onClick={() => onFollow(collection.id)}>Unfollow</button></article>)}</div> : <div className="rh-shelf-empty"><p>Follow a collection to keep it here as new resources arrive.</p><button type="button" onClick={onDiscover}>Explore collections →</button></div>}</div>
    {recentlyViewed.length > 0 && <div className="rh-shelf-section"><div className="rh-secondary-section-title"><h2>Recently viewed</h2></div><div className="rh-recent-row">{recentlyViewed.map(activity => <button type="button" onClick={() => onOpen(activity.id)} key={activity.id}><span>{activity.number}</span>{activity.title}<span aria-hidden="true">→</span></button>)}</div></div>}
  </section>;
}

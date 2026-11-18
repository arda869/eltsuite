import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type NamedHubShelf = { id: string; title: string; activityIds: string[] };
export type HubState = { savedIds: string[]; basketIds: string[]; followedIds: string[]; recentIds: string[]; namedShelves: NamedHubShelf[] };
const EMPTY: HubState = { savedIds: [], basketIds: [], followedIds: [], recentIds: [], namedShelves: [] };
const EVENT = 'elt-resource-hub-state';
const storageKey = (uid?: string) => `elt-resource-hub:v1:${uid || 'guest'}`;
const cloudRef = (uid: string) => doc(db, 'resourceHubUserState', uid);
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : [];
const normalize = (raw: Record<string, unknown>): HubState => {
  const namedShelves: NamedHubShelf[] = Array.isArray(raw.namedShelves) ? raw.namedShelves.filter((item: unknown): item is NamedHubShelf => !!item && typeof item === 'object' && typeof (item as NamedHubShelf).id === 'string' && typeof (item as NamedHubShelf).title === 'string').map((item: NamedHubShelf) => ({ id: item.id, title: item.title, activityIds: strings(item.activityIds) })) : [];
  return { savedIds: strings(raw.savedIds), basketIds: strings(raw.basketIds), followedIds: strings(raw.followedIds), recentIds: strings(raw.recentIds), namedShelves };
};

export function readHubState(uid?: string): HubState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const stored = window.localStorage.getItem(storageKey(uid));
    if (!stored) {
      // Keep bookmarks and basket items made in the first Resource Hub version.
      const previousSaved = JSON.parse(window.localStorage.getItem(`rh-shelf:${uid || 'guest'}`) || '[]');
      const previousBasket = JSON.parse(window.localStorage.getItem(`rh-basket:${uid || 'guest'}`) || '[]');
      return { ...EMPTY, savedIds: strings(previousSaved), basketIds: strings(previousBasket) };
    }
    const raw = JSON.parse(stored);
    return normalize(raw);
  } catch { return EMPTY; }
}

export function updateHubState(uid: string | undefined, change: (current: HubState) => HubState): HubState {
  const next = change(readHubState(uid));
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(storageKey(uid), JSON.stringify(next)); } catch { /* Browser storage may be disabled. The current view still updates. */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: storageKey(uid), state: next } }));
    if (uid) void setDoc(cloudRef(uid), { ...next, updatedAt: Date.now() }, { merge: true }).catch(error => console.error('Could not sync Resource Hub shelves', error));
  }
  return next;
}

export function useHubState(uid?: string) {
  const key = storageKey(uid);
  const [state, setState] = useState<HubState>(() => readHubState(uid));
  const [syncStatus, setSyncStatus] = useState<'browser' | 'syncing' | 'synced' | 'error'>(uid ? 'syncing' : 'browser');
  useEffect(() => {
    setState(readHubState(uid));
    const sameTab = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; state: HubState }>).detail;
      if (detail?.key === key) setState(detail.state);
    };
    const anotherTab = (event: StorageEvent) => { if (event.key === key || event.key === null) setState(readHubState(uid)); };
    window.addEventListener(EVENT, sameTab);
    window.addEventListener('storage', anotherTab);
    return () => { window.removeEventListener(EVENT, sameTab); window.removeEventListener('storage', anotherTab); };
  }, [key, uid]);
  useEffect(() => {
    if (!uid) { setSyncStatus('browser'); return; }
    setSyncStatus('syncing');
    return onSnapshot(cloudRef(uid), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.exists()) {
        const remote = normalize(snapshot.data());
        try { localStorage.setItem(storageKey(uid), JSON.stringify(remote)); } catch { /* Local cache unavailable. */ }
        setState(remote);
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: storageKey(uid), state: remote } }));
        setSyncStatus(snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache ? 'syncing' : 'synced');
      } else if (!snapshot.metadata.fromCache) {
        const cached = readHubState(uid);
        const hasSavedData = cached.savedIds.length || cached.basketIds.length || cached.followedIds.length || cached.recentIds.length || cached.namedShelves.length;
        if (hasSavedData) void setDoc(cloudRef(uid), { ...cached, updatedAt: Date.now() }).catch(error => { console.error('Could not migrate Resource Hub shelves', error); setSyncStatus('error'); });
        else setSyncStatus('synced');
      }
    }, error => { console.error('Could not read Resource Hub shelves', error); setSyncStatus('error'); });
  }, [uid]);
  const update = useCallback((change: (current: HubState) => HubState) => setState(updateHubState(uid, change)), [uid]);
  const toggle = useCallback((field: 'savedIds' | 'basketIds' | 'followedIds', id: string) => update(current => ({ ...current, [field]: current[field].includes(id) ? current[field].filter(item => item !== id) : [...current[field], id] })), [update]);
  return {
    ...state,
    syncStatus,
    toggleSaved: (id: string) => toggle('savedIds', id),
    toggleBasket: (id: string) => toggle('basketIds', id),
    addToBasket: (id: string) => update(current => current.basketIds.includes(id) ? current : { ...current, basketIds: [...current.basketIds, id] }),
    removeFromBasket: (id: string) => update(current => ({ ...current, basketIds: current.basketIds.filter(item => item !== id) })),
    clearBasket: () => update(current => ({ ...current, basketIds: [] })),
    toggleFollowed: (id: string) => toggle('followedIds', id),
    recordViewed: (id: string) => update(current => ({ ...current, recentIds: [id, ...current.recentIds.filter(item => item !== id)].slice(0, 12) })),
    createShelf: (title: string) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `shelf-${Date.now()}`;
      update(current => ({ ...current, namedShelves: [...current.namedShelves, { id, title: title.trim(), activityIds: [] }] }));
      return id;
    },
    removeShelf: (id: string) => update(current => ({ ...current, namedShelves: current.namedShelves.filter(shelf => shelf.id !== id) })),
    toggleShelfActivity: (shelfId: string, activityId: string) => update(current => ({ ...current, namedShelves: current.namedShelves.map(shelf => shelf.id !== shelfId ? shelf : { ...shelf, activityIds: shelf.activityIds.includes(activityId) ? shelf.activityIds.filter(id => id !== activityId) : [...shelf.activityIds, activityId] }) })),
  };
}

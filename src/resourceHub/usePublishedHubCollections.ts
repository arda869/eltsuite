import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import type { HubCollection, HubCollectionId } from './catalog';

export type PublishedCollectionOverride = Pick<HubCollection, 'id' | 'title' | 'promise' | 'cover' | 'accent'> & {
  paperAccent: string;
  headerImage: string;
  edition: number;
};

/** Public editions only. The working collection identity is never read here. */
export function usePublishedHubCollections(): { items: PublishedCollectionOverride[] | null; error?: string } {
  const { user } = useAuth();
  const [items, setItems] = useState<PublishedCollectionOverride[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setItems(null); setError(undefined);
    if (!user) { setItems([]); return; }
    return onSnapshot(collection(db, 'resourceHubCollectionsPublished'), snapshot => {
      const known: HubCollectionId[] = ['otp', 'nop', 'wfc', 'igx', 'spg', 'pic'];
      setItems(snapshot.docs.map(item => item.data() as PublishedCollectionOverride).filter(item =>
        known.includes(item.id) && !!item.title?.trim() && !!item.promise?.trim() && !!item.cover?.trim() && /^#[0-9a-fA-F]{6}$/.test(item.accent)
      ));
      setError(undefined);
    }, cause => { setItems([]); setError(cause.message || 'Published collections could not be loaded.'); });
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, error };
}

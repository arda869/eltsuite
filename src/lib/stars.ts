import { useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Starred files: a teacher's own short list, kept on their profile as { [file id]: when }.
// A file is starred by its id (a shared file's id, or 'a:' + a recording's id in the archive).

export function useStars(uid?: string | null) {
  const [stars, setStars] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (s) => setStars(((s.data() ?? {}).stars as Record<string, number>) ?? {}),
      () => {},
    );
  }, [uid]);
  return stars;
}

export const setStar = (uid: string, id: string, on: boolean) => updateDoc(doc(db, 'users', uid), { [`stars.${id}`]: on ? Date.now() : deleteField() }).catch(() => {});

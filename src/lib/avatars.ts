import { createContext, useContext, useEffect, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Who uses which profile picture in a class. One claim document per picture: classes/{c}/avatars/{key}.
export type Claim = { key: string; uid: string; learnerId?: string; name: string };

export function useClaims(classIds: string[]) {
  const [claims, setClaims] = useState<Record<string, Claim[]>>({});
  const k = classIds.join(',');
  useEffect(() => {
    const unsubs = classIds.filter(Boolean).map((c) =>
      onSnapshot(
        collection(db, 'classes', c, 'avatars'),
        (s) => setClaims((m) => ({ ...m, [c]: s.docs.map((d) => ({ key: d.id, ...(d.data() as Omit<Claim, 'key'>) })) })),
        () => {},
      ),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return claims;
}

// learnerId -> picture, for showing classmates' pictures.
export function useLearnerAvatars(classId: string) {
  const claims = useClaims(classId ? [classId] : []);
  const list = claims[classId] ?? [];
  return { byLearner: Object.fromEntries(list.filter((c) => c.learnerId).map((c) => [c.learnerId!, c.key])), teacher: list.find((c) => !c.learnerId)?.key };
}

// Take a picture in every class given (a teacher's classes, or a learner's one class),
// giving up the old one. Fails if someone else already has it.
export async function chooseAvatar(uid: string, classIds: string[], key: string, old: string | undefined, info: { name: string; learnerId?: string }) {
  await runTransaction(db, async (tx) => {
    const refs = classIds.map((c) => doc(db, 'classes', c, 'avatars', key));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const oldRefs = old && old !== key ? classIds.map((c) => doc(db, 'classes', c, 'avatars', old)) : [];
    const oldSnaps = await Promise.all(oldRefs.map((r) => tx.get(r)));
    if (snaps.some((s) => s.exists() && s.data().uid !== uid)) throw new Error('taken');
    oldSnaps.forEach((s, i) => s.exists() && s.data().uid === uid && tx.delete(oldRefs[i]));
    refs.forEach((r) => tx.set(r, { uid, name: info.name, ...(info.learnerId ? { learnerId: info.learnerId } : {}) }));
  });
  await updateDoc(doc(db, 'users', uid), { avatar: key });
}

// Pictures of the people in the class, available to everything inside a lesson.
export type ClassAvatars = { byLearner: Record<string, string>; teacher?: string };
export const ClassAvatarsContext = createContext<ClassAvatars>({ byLearner: {} });
export const useClassAvatars = () => useContext(ClassAvatarsContext);

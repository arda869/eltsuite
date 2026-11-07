import { useEffect, useMemo, useState } from 'react';
import { arrayRemove, arrayUnion, collection, deleteField, doc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from './firebase';
import type { ClassDoc } from './classes';

// Co-teachers. The class owner invites another teacher by email. When that teacher signs in,
// the invitation appears on their Classes page and they accept it, which adds them to the class.
// Co-teacher: full access, can teach live. Viewer: read-only.

export type CoRole = 'co' | 'viewer';
export type MyRole = 'owner' | CoRole | null;
export type CoTeacher = { role: CoRole; email: string; name: string };

export const emailKey = (email: string) => email.trim().toLowerCase().replace(/\./g, ',');
export const keyEmail = (k: string) => k.replace(/,/g, '.');

export function roleIn(c: ClassDoc | null | undefined, uid?: string | null): MyRole {
  if (!c || !uid) return null;
  if (c.teacherId === uid) return 'owner';
  return c.coTeachers?.[uid]?.role ?? null;
}
export const canEdit = (c: ClassDoc | null | undefined, uid?: string | null) => roleIn(c, uid) === 'owner' || roleIn(c, uid) === 'co';

export async function inviteTeacher(c: ClassDoc, email: string, role: CoRole, byName: string) {
  const k = emailKey(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new Error('That doesn’t look like an email address.');
  await updateDoc(doc(db, 'classes', c.id), { [`invites.${k}`]: { role, by: byName, at: Date.now() }, inviteEmails: arrayUnion(keyEmail(k)) });
}
export async function cancelInvite(c: ClassDoc, email: string) {
  const k = emailKey(email);
  await updateDoc(doc(db, 'classes', c.id), { [`invites.${k}`]: deleteField(), inviteEmails: arrayRemove(keyEmail(k)) });
}
export async function removeCoTeacher(c: ClassDoc, uid: string) {
  await updateDoc(doc(db, 'classes', c.id), { [`coTeachers.${uid}`]: deleteField(), teacherIds: arrayRemove(uid) });
  await syncLiveTeachers(c);
}
export async function changeRole(c: ClassDoc, uid: string, role: CoRole) {
  await updateDoc(doc(db, 'classes', c.id), { [`coTeachers.${uid}.role`]: role });
  await syncLiveTeachers(c);
}

// The invited teacher accepts: they add themselves, which the rules allow when their email is invited.
export async function acceptInvite(c: ClassDoc, me: { uid: string; email: string; name: string }) {
  const k = emailKey(me.email);
  const inv = c.invites?.[k];
  if (!inv) throw new Error('This invitation is no longer open.');
  await updateDoc(doc(db, 'classes', c.id), {
    [`coTeachers.${me.uid}`]: { role: inv.role, email: keyEmail(k), name: me.name },
    teacherIds: arrayUnion(me.uid),
    [`invites.${k}`]: deleteField(),
    inviteEmails: arrayRemove(keyEmail(k)),
  });
}
export async function declineInvite(c: ClassDoc, email: string) {
  return cancelInvite(c, email);
}

// The owner's app keeps the Realtime Database in step, so co-teachers may move the pointer and draw.
export async function syncLiveTeachers(c: ClassDoc) {
  await httpsCallable<{ classId: string }, { owner: string }>(getFunctions(app, 'us-central1'), 'claimLiveClass')({ classId: c.id });
}

// Every class a teacher can open: their own, plus the ones they were added to.
export function useTeacherClasses(uid?: string | null) {
  const [own, setOwn] = useState<ClassDoc[] | null>(null);
  const [shared, setShared] = useState<ClassDoc[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setOwn(null);
    setShared(null);
    if (!uid) return;
    let timer = 0;
    const slow = window.setTimeout(() => setError((e) => e || 'Your classes are taking longer than expected to load. Check your connection and try again.'), 15000);
    const u1 = onSnapshot(
      query(collection(db, 'classes'), where('teacherId', '==', uid)),
      { includeMetadataChanges: true },
      (s) => {
        // An empty local cache is not proof that this account has no classes.
        if (s.empty && s.metadata.fromCache) return;
        clearTimeout(slow);
        setOwn(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })));
        setError('');
      },
      (e) => {
        console.error(e);
        // Try again on its own a few times (a token refresh or a dropped connection) before saying so.
        if (attempt < 3) timer = window.setTimeout(() => setAttempt((a) => a + 1), 1200 * (attempt + 1));
        else setError('We couldn’t load your classes. Try again.');
      },
    );
    const u2 = onSnapshot(query(collection(db, 'classes'), where('teacherIds', 'array-contains', uid)), { includeMetadataChanges: true }, (s) => {
      if (s.empty && s.metadata.fromCache) return;
      setShared(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })));
    }, () => setShared([]));
    return () => (u1(), u2(), clearTimeout(timer), clearTimeout(slow));
  }, [uid, attempt]);
  const retry = () => (setError(''), setOwn(null), setShared(null), setAttempt((a) => a >= 3 ? 0 : a + 1));
  const classes = useMemo(() => {
    if (!own) return null;
    const seen = new Set(own.map((c) => c.id));
    return [...own, ...(shared ?? []).filter((c) => !seen.has(c.id))];
  }, [own, shared]);
  return { classes, error, loading: own === null, retry };
}

// Invitations waiting for this teacher.
export function useInvites(email?: string | null) {
  const [list, setList] = useState<ClassDoc[]>([]);
  useEffect(() => {
    if (!email) return;
    return onSnapshot(query(collection(db, 'classes'), where('inviteEmails', 'array-contains', email.trim().toLowerCase())), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }))), () => setList([]));
  }, [email]);
  return list;
}

export async function allTeacherClasses(uid: string) {
  const [a, b] = await Promise.all([getDocs(query(collection(db, 'classes'), where('teacherId', '==', uid))), getDocs(query(collection(db, 'classes'), where('teacherIds', 'array-contains', uid))).catch(() => null)]);
  const seen = new Set<string>();
  const out: ClassDoc[] = [];
  for (const d of [...a.docs, ...(b?.docs ?? [])]) if (!seen.has(d.id)) (seen.add(d.id), out.push({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }));
  return out;
}

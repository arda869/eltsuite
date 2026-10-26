// Learner accounts.
//
// Learners never use email. Behind the scenes each learner gets a Firebase Auth
// email/password account with a made-up address and a password made from the
// class code and their PIN. Accounts are created from the teacher's browser
// using a second Firebase app instance, so the teacher stays signed in.
// (A later phase replaces this with Cloud Functions custom tokens.)

import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { setDoc } from 'firebase/firestore';
import { auth as mainAuth } from './firebase';
import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, collection, doc, getDoc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { firebaseConfig } from './firebaseConfig';
import type { ClassDoc } from './classes';

export const LEARNER_DOMAIN = 'learners.lesson-lit.firebaseapp.com';

export type Learner = { id: string; displayName: string; authUid: string; langs?: string[] };

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newLearnerId = () => Array.from({ length: 12 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
export const newPin = () => String(Math.floor(1000 + Math.random() * 9000));

export const learnerEmail = (learnerId: string) => `l_${learnerId}@${LEARNER_DOMAIN}`;
export const learnerPassword = (classCode: string, pin: string) => `${classCode.toUpperCase()}#${pin}`;
export const isLearnerEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@' + LEARNER_DOMAIN);

async function withSecondaryAuth<T>(fn: (auth: ReturnType<typeof getAuth>) => Promise<T>) {
  const app = initializeApp(firebaseConfig, 'secondary-' + Math.random().toString(36).slice(2));
  const auth = getAuth(app);
  try {
    return await fn(auth);
  } finally {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    await deleteApp(app);
  }
}

export async function addLearners(c: ClassDoc, names: string[]) {
  const added: { name: string; pin: string }[] = [];
  for (const raw of names) {
    const displayName = raw.trim().slice(0, 60);
    if (!displayName) continue;
    const learnerId = newLearnerId();
    const pin = newPin();
    const authUid = await withSecondaryAuth(async (auth) => {
      const cred = await createUserWithEmailAndPassword(auth, learnerEmail(learnerId), learnerPassword(c.classCode, pin));
      return cred.user.uid;
    });
    const batch = writeBatch(db);
    batch.set(doc(db, 'classes', c.id, 'learners', learnerId), { displayName, authUid, createdAt: serverTimestamp() });
    batch.set(doc(db, 'classes', c.id, 'secrets', learnerId), { pin });
    batch.set(doc(db, 'classes', c.id, 'members', authUid), { learnerId, displayName });
    batch.set(doc(db, 'users', authUid), { role: 'learner', classId: c.id, learnerId, displayName });
    batch.update(doc(db, 'classCodes', c.classCode), { roster: arrayUnion({ id: learnerId, name: displayName }) });
    batch.update(doc(db, 'classes', c.id), { learnerCount: increment(1) });
    await batch.commit();
    added.push({ name: displayName, pin });
  }
  return added;
}

export async function resetPin(c: ClassDoc, learner: Learner, oldPin: string) {
  const pin = newPin();
  await withSecondaryAuth(async (auth) => {
    const cred = await signInWithEmailAndPassword(auth, learnerEmail(learner.id), learnerPassword(c.classCode, oldPin));
    await updatePassword(cred.user, learnerPassword(c.classCode, pin));
  });
  const batch = writeBatch(db);
  batch.set(doc(db, 'classes', c.id, 'secrets', learner.id), { pin });
  await batch.commit();
  return pin;
}

// A learner sets their own PIN or a longer password. The teacher no longer sees it: the
// secrets record only says that the learner chose their own.
export type OwnSecret = { kind: 'pin' | 'password' };
export async function changeMySecret(o: { classId: string; classCode: string; learnerId: string; current: string; next: string; kind: 'pin' | 'password' }) {
  const u = mainAuth.currentUser;
  if (!u || !u.email) throw new Error('Please sign in again.');
  if (o.kind === 'pin' && !/^\d{4}$/.test(o.next)) throw new Error('A PIN is 4 numbers.');
  if (o.kind === 'password' && o.next.length < 8) throw new Error('Use at least 8 characters.');
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, learnerPassword(o.classCode, o.current)));
  } catch {
    throw new Error('Your current PIN or password is not right.');
  }
  await updatePassword(u, learnerPassword(o.classCode, o.next));
  await setDoc(doc(db, 'classes', o.classId, 'secrets', o.learnerId), { own: true, kind: o.kind, at: Date.now() });
}

export async function removeLearner(c: ClassDoc, learner: Learner, pin: string) {
  // Delete the sign-in account first so the learner can no longer get in.
  await withSecondaryAuth(async (auth) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, learnerEmail(learner.id), learnerPassword(c.classCode, pin));
      await cred.user.delete();
    } catch (e) {
      console.warn('Learner account could not be deleted; removing access anyway', e);
    }
  });
  const batch = writeBatch(db);
  batch.delete(doc(db, 'classes', c.id, 'learners', learner.id));
  batch.delete(doc(db, 'classes', c.id, 'secrets', learner.id));
  batch.delete(doc(db, 'classes', c.id, 'members', learner.authUid));
  batch.delete(doc(db, 'users', learner.authUid));
  batch.update(doc(db, 'classCodes', c.classCode), { roster: arrayRemove({ id: learner.id, name: learner.displayName }) });
  batch.update(doc(db, 'classes', c.id), { learnerCount: increment(-1) });
  await batch.commit();
}

export const learnersCol = (classId: string) => collection(db, 'classes', classId, 'learners');
export const secretsCol = (classId: string) => collection(db, 'classes', classId, 'secrets');

// Class list (names only) from the class code record, readable by everyone in the class.
export function useClassmates(classCode?: string) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!classCode) return;
    getDoc(doc(db, 'classCodes', classCode))
      .then((s) => setList([...((s.data()?.roster ?? []) as { id: string; name: string }[])].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setList([]));
  }, [classCode]);
  return list;
}

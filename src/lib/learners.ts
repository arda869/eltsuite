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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth as mainAuth } from './firebase';
import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, collection, doc, getDoc, increment, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { firebaseConfig } from './firebaseConfig';
import type { ClassDoc } from './classes';
import { countOne } from './limitError';

export const LEARNER_DOMAIN = 'learners.lesson-lit.firebaseapp.com';

export type Learner = { id: string; displayName: string; authUid: string; langs?: string[]; teacherUid?: string }; // teacherUid: a teacher in a training class

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

// from: for a teacher training class, the sign-in id of the teacher each name belongs to.
export async function addLearners(c: ClassDoc, names: string[], from: Record<string, string> = {}) {
  const added: { name: string; pin: string; id: string }[] = [];
  for (const raw of names) {
    const displayName = raw.trim().slice(0, 60);
    if (!displayName) continue;
    // An organisation with a limit of learners: check before making the sign-in account.
    const orgSnap = c.org ? await getDoc(doc(db, 'orgs', c.org)).catch(() => null) : null;
    const orgRef = orgSnap?.exists() && countOne(orgSnap.data(), 'learners') !== null ? orgSnap.ref : null;
    const learnerId = newLearnerId();
    const pin = newPin();
    await withSecondaryAuth(async (auth) => {
      const cred = await createUserWithEmailAndPassword(auth, learnerEmail(learnerId), learnerPassword(c.classCode, pin));
      try {
        // Keep the new sign-in session until every associated record is committed.
        await runTransaction(db, async (tx) => {
          const count = orgRef ? countOne((await tx.get(orgRef)).data(), 'learners') : null;
          tx.set(doc(db, 'classes', c.id, 'learners', learnerId), { displayName, authUid: cred.user.uid, ...(from[raw] ? { teacherUid: from[raw] } : {}), createdAt: serverTimestamp() });
          tx.set(doc(db, 'classes', c.id, 'secrets', learnerId), { pin });
          tx.set(doc(db, 'classes', c.id, 'members', cred.user.uid), { learnerId, displayName });
          tx.set(doc(db, 'users', cred.user.uid), { role: 'learner', classId: c.id, learnerId, displayName });
          tx.update(doc(db, 'classCodes', c.classCode), { roster: arrayUnion({ id: learnerId, name: displayName }) });
          tx.update(doc(db, 'classes', c.id), { learnerCount: increment(1) });
          if (orgRef && count !== null) tx.update(orgRef, { 'usage.learners': count });
        });
      } catch (error) {
        // Authentication and Firestore cannot share a transaction. Undo the account
        // while this secondary sign-in is still available to us.
        try { await cred.user.delete(); }
        catch (rollbackError) { console.error('Could not undo learner sign-in creation', learnerId, rollbackError); }
        throw error;
      }
    });
    added.push({ name: displayName, pin, id: learnerId });
  }
  return added;
}

export async function resetPin(c: ClassDoc, learner: Learner, oldPin: string) {
  const pin = newPin();
  await withSecondaryAuth(async (auth) => {
    const cred = await signInWithEmailAndPassword(auth, learnerEmail(learner.id), learnerPassword(c.classCode, oldPin));
    await updatePassword(cred.user, learnerPassword(c.classCode, pin));
    try {
      await setDoc(doc(db, 'classes', c.id, 'secrets', learner.id), { pin });
    } catch (error) {
      try { await updatePassword(cred.user, learnerPassword(c.classCode, oldPin)); }
      catch (rollbackError) { console.error('Could not restore previous learner PIN', learner.id, rollbackError); }
      throw error;
    }
  });
  return pin;
}

// A learner sets their own PIN or a longer password. The teacher no longer sees it: the
// secrets record only says that the learner chose their own.
export type OwnSecret = { kind: 'pin' | 'password' };
export async function changeMySecret(o: { classId: string; classCode: string; learnerId: string; current: string; next: string; kind: 'pin' | 'password' }) {
  const u = mainAuth.currentUser;
  if (!u || !u.email) throw new Error('Sign in again, please.');
  if (o.kind === 'pin' && !/^\d{4}$/.test(o.next)) throw new Error('A PIN is 4 numbers.');
  if (o.kind === 'password' && o.next.length < 8) throw new Error('Use at least 8 characters.');
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, learnerPassword(o.classCode, o.current)));
  } catch {
    throw new Error('That’s not your current PIN or password.');
  }
  await updatePassword(u, learnerPassword(o.classCode, o.next));
  try {
    await setDoc(doc(db, 'classes', o.classId, 'secrets', o.learnerId), { own: true, kind: o.kind, at: Date.now() });
  } catch (error) {
    try { await updatePassword(u, learnerPassword(o.classCode, o.current)); }
    catch (rollbackError) { console.error('Could not restore previous learner secret', o.learnerId, rollbackError); }
    throw error;
  }
}

export async function removeLearner(c: ClassDoc, learner: Learner, _pin: string) {
  // Server deletion is idempotent, so a failed Firestore batch can be retried
  // even when the sign-in account was already removed on the first attempt.
  await httpsCallable<{ classId: string; learnerId: string }, { deleted: boolean }>(getFunctions(app, 'us-central1'), 'deleteLearnerIdentity')({ classId: c.id, learnerId: learner.id });
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

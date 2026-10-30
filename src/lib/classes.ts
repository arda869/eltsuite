import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { countOne } from './limitError';
import { db } from './firebase';
import type { ThemeKey } from './themes';

export type Meeting = { url: string; meetingId?: string; passcode?: string; visibility: 'live' | 'before15' | 'always' };

export type ClassDoc = {
  id: string;
  teacherId: string;
  name: string;
  level: string;
  learningProfile?: import('../ai/ClassProfileFields').LearningProfile;
  themeColor: ThemeKey;
  classCode: string;
  status: 'active' | 'archived' | 'deleted';
  learnerCount?: number;
  dates?: { start?: string | null; end?: string | null };
  video?: { url: string; room: string; at?: number; paused?: boolean } | null; // paused: the organisation has used its call minutes this month
  // the class's own video room (Daily), made by scripts/video.mjs // the course's first and last day, as YYYY-MM-DD
  meeting?: Meeting | null;
  createdAt?: Timestamp;
  deletedAt?: Timestamp | null;
  codes?: { code: string; meaning: string }[];
  notebook?: { level: 'view' | 'add' | 'all'; review?: boolean; blocked?: string[] }; // who may add to the class notebook
  coTeachers?: Record<string, { role: 'co' | 'viewer'; email: string; name: string }>; // other teachers with access
  teacherIds?: string[]; // co-teacher uids, for queries
  invites?: Record<string, { role: 'co' | 'viewer'; by: string; at: number }>; // keyed by email with . replaced by ,
  inviteEmails?: string[];
  discussion?: { learnersStart?: boolean; approval?: boolean; muted?: string[]; track?: boolean };
  cover?: string | null; // "preset:<key>" or "media:<id>"
  messaging?: { learnerElements?: boolean; mode?: MessagingMode }; // learners may send task elements in messages; who learners may write to
  profile?: { photos?: boolean; names?: NameShow }; // learners may upload a photo; how learners' names show to each other
  nicknames?: Record<string, string>; // learner id → nickname, when names show as nicknames
  accounts?: { email?: 'off' | 'optional' | 'required' }; // learners link an email (Google sign-in, email summaries)
  teaching?: { showMarker?: boolean; seeLearners?: boolean }; // while teaching: show learners where I am, show me where learners are
  learnerTools?: Record<string, boolean>; // the text tools learners get when they write
  langs?: string[]; // languages the learners speak, for translations
  liveAudio?: 'self' | 'together' | 'teacher'; // who plays sounds and videos in live lessons
  kind?: ClassKind; // a language class, or a teacher training course
  org?: string; // the organisation it belongs to
  terms?: { learner?: string; learners?: string; teacher?: string; teachers?: string }; // what the class calls its people
};

// Messaging for learners: off; only with teachers; in groups the teacher makes; freely with each other.
export type MessagingMode = 'off' | 'teacher' | 'groups' | 'free';
// How a learner's name shows to other learners.
export type NameShow = 'first' | 'initial' | 'full' | 'nick';
export function shownName(name: string, id: string, c?: Pick<ClassDoc, 'profile' | 'nicknames'> | null): string {
  const parts = name.trim().split(/\s+/);
  const how = c?.profile?.names ?? 'full';
  if (how === 'first') return parts[0] ?? name;
  if (how === 'initial') return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] ?? name;
  if (how === 'nick') return c?.nicknames?.[id]?.trim() || parts[0] || name;
  return name;
}

export type Topic = { id: string; name: string; order: number; hidden?: boolean; locked?: boolean };
export type BoardPage = { id: string; title?: string; from?: string }; // from: the lesson a borrowed page belongs to
export type Item = { id: string; topicId: string | null; type: 'lesson' | 'homework' | 'exam' | 'practice'; title: string; order: number; hidden: boolean; locked: boolean; boardPages?: BoardPage[]; exam?: { minutes: number | null } | null; examReleased?: boolean; due?: number | null; taskCount?: number; schedule?: { at: number; url?: string } | null; recapShared?: Record<string, boolean> };

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Mixed'];

// Letters and digits that are hard to confuse when read aloud or typed (no O/0, I/1, etc.).
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

export function makeClassCode(name: string) {
  const fromName = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((c) => LETTERS.includes(c));
  let letters = fromName.slice(0, 3).join('');
  while (letters.length < 3) letters += pick(LETTERS);
  return `${letters}-${pick(DIGITS)}${pick(DIGITS)}${pick(DIGITS)}`;
}

// Creates the class and reserves a unique class code in one transaction.
export type ClassKind = 'language' | 'training';
export async function createClass(teacherId: string, input: { name: string; level: string; themeColor: ThemeKey; kind?: ClassKind; org?: string; extra?: Record<string, unknown> }) {
  const classRef = doc(collection(db, 'classes'));
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeClassCode(input.name);
    const codeRef = doc(db, 'classCodes', code);
    const ok = await runTransaction(db, async (tx) => {
      const existing = await tx.get(codeRef);
      // An organisation with a limit of classes counts this one in the same write (see firestore.rules).
      const orgRef = input.org ? doc(db, 'orgs', input.org) : null;
      const count = orgRef ? countOne((await tx.get(orgRef)).data(), 'classes') : null;
      if (existing.exists()) return false;
      if (orgRef && count !== null) tx.update(orgRef, { 'usage.classes': count });
      tx.set(classRef, {
        teacherId,
        name: input.name,
        level: input.level,
        themeColor: input.themeColor,
        kind: input.kind ?? 'language',
        classCode: code,
        status: 'active',
        learnerCount: 0,
        meeting: null,
        ...(input.org ? { org: input.org } : {}),
        ...(input.extra ?? {}),
        createdAt: serverTimestamp(),
      });
      tx.set(codeRef, { classId: classRef.id, teacherId, className: input.name, roster: [], ...(input.org ? { org: input.org } : {}), createdAt: serverTimestamp() });
      return true;
    });
    if (ok) return classRef.id;
  }
  throw new Error('We couldn’t find a free class code. Try again.');
}

export async function updateClass(c: ClassDoc, patch: Partial<Pick<ClassDoc, 'name' | 'learningProfile' | 'level' | 'themeColor' | 'meeting' | 'status' | 'codes' | 'notebook' | 'cover' | 'teaching' | 'messaging' | 'profile' | 'accounts' | 'nicknames' | 'learnerTools' | 'liveAudio' | 'kind' | 'terms' | 'dates'>>) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'classes', c.id), patch);
  if (patch.name) batch.update(doc(db, 'classCodes', c.classCode), { className: patch.name });
  await batch.commit();
}

// Topics and items ------------------------------------------------------------

export async function addTopic(classId: string, name: string, order: number) {
  const ref = doc(collection(db, 'classes', classId, 'topics'));
  await setDoc(ref, { name, order, createdAt: serverTimestamp() });
  return ref.id;
}

export const renameTopic = (classId: string, topicId: string, name: string) =>
  updateDoc(doc(db, 'classes', classId, 'topics', topicId), { name });

export const deleteTopic = (classId: string, topicId: string) => deleteDoc(doc(db, 'classes', classId, 'topics', topicId));

export async function addItem(classId: string, topicId: string | null, title: string, order: number, type: Item['type'] = 'lesson', due: number | null = null) {
  const ref = doc(collection(db, 'classes', classId, 'items'));
  await setDoc(ref, { topicId, type, title, order, hidden: false, locked: false, ...(type === 'exam' ? { exam: { minutes: null }, examReleased: false } : {}), ...(due ? { due } : {}), createdAt: serverTimestamp() });
  return ref.id;
}

export const updateItem = (classId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>) =>
  updateDoc(doc(db, 'classes', classId, 'items', itemId), patch);

export const deleteItem = (classId: string, itemId: string) => deleteDoc(doc(db, 'classes', classId, 'items', itemId));

export async function getClass(classId: string) {
  const s = await getDoc(doc(db, 'classes', classId));
  return s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) } as ClassDoc) : null;
}


export const updateTopic = (classId: string, topicId: string, patch: Partial<Omit<Topic, 'id'>>) => updateDoc(doc(db, 'classes', classId, 'topics', topicId), patch);

// What a teacher training course adds, shown when a class is made or changed.
export const TRAINING_ADDS = [
  'Language analysis cards: meaning, form, pronunciation, concept questions, problems and solutions',
  'Lesson plan templates with PPP, test-teach-test, task-based, ESA and skills frameworks',
  'Observation forms with criteria, strengths and action points',
  'Comments pinned to moments in a lesson video, for feedback',
  'Loop input: a step-back note you reveal after modelling a technique',
];

// A class's dates, for showing: "1 Sep – 20 Dec 2026", or what there is.
export function classDates(c: Pick<ClassDoc, 'dates'>): string {
  const f = (s?: string | null, year = true) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '');
  const a = c.dates?.start, b = c.dates?.end;
  if (a && b) return `${f(a, a.slice(0, 4) !== b.slice(0, 4))} – ${f(b)}`;
  return a ? `From ${f(a)}` : b ? `Until ${f(b)}` : '';
}
// Whether the course is on today: before it starts, running, or finished.
export const classPhase = (c: Pick<ClassDoc, 'dates'>, today = new Date().toISOString().slice(0, 10)): 'soon' | 'on' | 'done' | '' =>
  !c.dates?.start && !c.dates?.end ? '' : c.dates?.start && today < c.dates.start ? 'soon' : c.dates?.end && today > c.dates.end ? 'done' : 'on';

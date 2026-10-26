import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type DocumentData } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from './firebase';
import { keyRef, notesRef, taskRef, tasksCol, type Task } from './tasks';

// Groups, task versions and "Who sees this".
//
// A group set is a saved way of splitting the class (Pairs, Level groups, BOR today). Each group
// lists learner ids in order; in role mode the order gives the role (1st = A, 2nd = B, …).
//
// A task can have linked versions (A, B, C or Easier, Standard, Challenge). The main task keeps
// the list of versions and how they are given out. The teacher's browser works out which learners
// may open each version and stores that list on the task. A task that not everyone may open keeps
// its content in private/body, which the security rules only let those learners read.

export type Group = { id: string; name: string; members: string[] };
export type GroupSet = { id: string; name: string; groups: Group[]; createdAt?: unknown };
export type Audience = { mode: 'all' | 'groups' | 'learners'; groupSetId?: string; groupIds?: string[]; learnerIds?: string[] };
export type DistMode = 'same' | 'room' | 'role' | 'choose';
export type Dist = { mode: DistMode; groupSetId?: string; sameId?: string; roomMap?: Record<string, string>; roleMap?: string[]; canChange?: boolean };

export const LEVELS = ['Easier', 'Standard', 'Challenge'];
export const ROLE_NAMES = ['A', 'B', 'C', 'D'];

const setsCol = (classId: string) => collection(db, 'classes', classId, 'groupSets');
export const bodyRef = (classId: string, itemId: string, taskId: string) => doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId, 'private', 'body');

export function useGroupSets(classId: string) {
  const [list, setList] = useState<GroupSet[]>([]);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(query(setsCol(classId), orderBy('createdAt')), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupSet, 'id'>) }))), () => setList([]));
  }, [classId]);
  return list;
}
export const addGroupSet = (classId: string, set: Omit<GroupSet, 'id'>) => addDoc(setsCol(classId), { ...set, createdAt: serverTimestamp() });
export const saveGroupSet = (classId: string, id: string, patch: Partial<Omit<GroupSet, 'id'>>) => updateDoc(doc(setsCol(classId), id), patch);
export const deleteGroupSet = (classId: string, id: string) => deleteDoc(doc(setsCol(classId), id));

const gid = () => Math.random().toString(36).slice(2, 8);
function shuffled<T>(a: T[]) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// Random groups of a given size. Leftovers join the last groups, so there are no groups of one.
export function autoGroups(learnerIds: string[], size: number, prefix = 'Room'): Group[] {
  const ids = shuffled(learnerIds);
  const count = Math.max(1, Math.floor(ids.length / size));
  const groups: Group[] = Array.from({ length: count }, (_, i) => ({ id: gid(), name: `${prefix} ${i + 1}`, members: [] }));
  ids.forEach((id, i) => groups[i % count].members.push(id));
  return groups;
}
// Groups of similar level, from the learners' average scores (best first).
export function groupsByScore(learnerIds: string[], avg: Record<string, number>, count: number): Group[] {
  const ids = [...learnerIds].sort((a, b) => (avg[b] ?? -1) - (avg[a] ?? -1));
  const per = Math.ceil(ids.length / Math.max(1, count));
  return Array.from({ length: count }, (_, i) => ({ id: gid(), name: `Room ${i + 1}`, members: ids.slice(i * per, (i + 1) * per) })).filter((g) => g.members.length);
}
export const newGroup = (n: number): Group => ({ id: gid(), name: `Room ${n}`, members: [] });

export function roomOf(set: GroupSet | undefined, learnerId: string) {
  return set?.groups.find((g) => g.members.includes(learnerId));
}
// Role index within the room: learners take roles in turn, so an extra learner gets role A again.
export function roleOf(set: GroupSet | undefined, learnerId: string, roles: number) {
  const g = roomOf(set, learnerId);
  if (!g || roles < 1) return -1;
  return g.members.indexOf(learnerId) % roles;
}

// Task families -----------------------------------------------------------------

// The main task and its versions, in order.
export function familyOf(tasks: Task[], t: Task | undefined): Task[] {
  if (!t) return [];
  const main = t.family ? tasks.find((x) => x.id === t.family) ?? t : t;
  return [main, ...(main.variants ?? []).map((id) => tasks.find((x) => x.id === id)).filter((x): x is Task => !!x)];
}
export const isVariant = (t: Task) => !!t.family && t.family !== t.id;

// Learners (by id) the audience lets in, or null for everyone.
function audienceIds(a: Audience | undefined, sets: GroupSet[]): string[] | null {
  if (!a || a.mode === 'all') return null;
  if (a.mode === 'learners') return a.learnerIds ?? [];
  const set = sets.find((s) => s.id === a.groupSetId);
  return (set?.groups ?? []).filter((g) => (a.groupIds ?? []).includes(g.id)).flatMap((g) => g.members);
}

// Who may open each task: taskId -> learner ids, or null for everyone.
export function resolveAccess(tasks: Task[], sets: GroupSet[], roster: string[]): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {};
  for (const t of tasks) {
    if (t.kind === 'section' || isVariant(t)) continue;
    const fam = familyOf(tasks, t);
    const aud = audienceIds(t.audience, sets);
    const inAud = (id: string) => !aud || aud.includes(id);
    if (fam.length === 1) {
      out[t.id] = aud;
      continue;
    }
    const d: Dist = t.dist ?? { mode: 'same' };
    const give: Record<string, string[]> = Object.fromEntries(fam.map((f) => [f.id, []]));
    if (d.mode === 'choose') {
      for (const f of fam) out[f.id] = aud;
      continue;
    }
    const set = sets.find((s) => s.id === d.groupSetId);
    for (const lid of roster.filter(inAud)) {
      let to = d.mode === 'same' ? d.sameId ?? t.id : t.id;
      if (d.mode === 'room' && set) {
        const g = roomOf(set, lid);
        if (g && d.roomMap?.[g.id]) to = d.roomMap[g.id];
      }
      if (d.mode === 'role' && set && d.roleMap?.length) {
        const r = roleOf(set, lid, d.roleMap.length);
        if (r >= 0 && d.roleMap[r]) to = d.roleMap[r];
      }
      (give[to] ?? give[t.id]).push(lid);
    }
    // "Same for everyone" with the whole class: no list needed for the chosen version.
    for (const f of fam) out[f.id] = d.mode === 'same' && !aud && f.id === (d.sameId ?? t.id) ? null : give[f.id];
  }
  return out;
}

const sameList = (a?: string[] | null, b?: string[] | null) => (a ?? null) === null ? (b ?? null) === null : !!b && a!.length === b.length && [...a!].sort().join() === [...b].sort().join();

// Stores who may open each task, and moves content into or out of private/body as needed.
export async function applyAccess(classId: string, itemId: string, tasks: Task[], sets: GroupSet[], roster: string[]) {
  const access = resolveAccess(tasks, sets, roster);
  for (const t of tasks) {
    if (!(t.id in access)) continue;
    const allowed = access[t.id];
    const restricted = allowed !== null;
    if (!!t.restricted === restricted && sameList(t.allowed, allowed)) continue;
    const b = writeBatch(db);
    if (restricted && !t.restricted) {
      b.set(bodyRef(classId, itemId, t.id), { content: t.content ?? { type: 'doc', content: [] } });
      b.update(taskRef(classId, itemId, t.id), { restricted: true, allowed, content: null });
    } else if (!restricted && t.restricted) {
      const body = await getDoc(bodyRef(classId, itemId, t.id));
      b.update(taskRef(classId, itemId, t.id), { restricted: false, allowed: null, content: (body.data()?.content as JSONContent) ?? t.content ?? null });
    } else b.update(taskRef(classId, itemId, t.id), { allowed });
    await b.commit();
  }
}

// Keeps the content of restricted tasks filled in from private/body, so the rest of the app
// can read task.content as usual. Learners only subscribe to bodies they may open.
export function useTaskBodies(classId: string, itemId: string, tasks: Task[], canOpen: (t: Task) => boolean) {
  const [bodies, setBodies] = useState<Record<string, JSONContent | null>>({});
  const ids = tasks.filter((t) => t.restricted && canOpen(t)).map((t) => t.id).join(',');
  useEffect(() => {
    if (!ids) return;
    const unsubs = ids.split(',').map((id) => onSnapshot(bodyRef(classId, itemId, id), (s) => setBodies((b) => ({ ...b, [id]: (s.data()?.content as JSONContent) ?? null })), () => {}));
    return () => unsubs.forEach((u) => u());
  }, [classId, itemId, ids]);
  return tasks.map((t) => (t.restricted ? { ...t, content: bodies[t.id] ?? null } : t));
}

// Makes a linked version of a task: a copy of its content, key and notes, placed after it.
export async function makeVariant(classId: string, itemId: string, tasks: Task[], from: Task, label: string, content: JSONContent | null) {
  const fam = familyOf(tasks, from);
  const main = fam[0];
  const [k, n] = await Promise.all([getDoc(keyRef(classId, itemId, from.id)), getDoc(notesRef(classId, itemId, from.id))]);
  const ref = doc(tasksCol(classId, itemId));
  const b = writeBatch(db);
  const { id: _id, variants: _v, dist: _d, audience: _a, allowed: _al, restricted: _r, ...rest } = from as Task & DocumentData; // eslint-disable-line @typescript-eslint/no-unused-vars
  b.set(ref, { ...rest, title: main.title, content: content ?? from.content ?? null, family: main.id, variant: label, order: main.order, createdAt: serverTimestamp() });
  b.set(keyRef(classId, itemId, ref.id), k.exists() ? k.data() : {});
  if (n.exists()) b.set(notesRef(classId, itemId, ref.id), n.data());
  b.update(taskRef(classId, itemId, main.id), { family: main.id, variant: main.variant ?? (LEVELS.includes(label) ? 'Standard' : 'A'), variants: [...(main.variants ?? []), ref.id] });
  await b.commit();
  return ref.id;
}

// Removes a version from its family (the task itself is deleted by the caller).
export async function unlinkVariant(classId: string, itemId: string, tasks: Task[], v: Task) {
  const main = tasks.find((t) => t.id === v.family);
  if (!main) return;
  const left = (main.variants ?? []).filter((id) => id !== v.id);
  const d = main.dist;
  const clean = d ? { ...d, sameId: d.sameId === v.id ? main.id : d.sameId ?? null, roomMap: Object.fromEntries(Object.entries(d.roomMap ?? {}).filter(([, t]) => t !== v.id)), roleMap: (d.roleMap ?? []).map((t) => (t === v.id ? main.id : t)) } : null;
  await updateDoc(taskRef(classId, itemId, main.id), left.length ? { variants: left, dist: clean } : { variants: [], family: null, variant: null, dist: null });
}

// The level a learner picked for a family (Learners choose).
const choiceRef = (classId: string, family: string, uid: string) => doc(db, 'classes', classId, 'levelChoices', `${family}_${uid}`);
export const chooseLevel = (classId: string, family: string, uid: string, learnerId: string, taskId: string) => setDoc(choiceRef(classId, family, uid), { family, uid, learnerId, taskId, at: serverTimestamp() });
export function useMyLevels(classId: string, uid?: string) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!classId || !uid) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'levelChoices'), where('uid', '==', uid)), (s) => setMap(Object.fromEntries(s.docs.map((d) => [d.data().family, d.data().taskId]))), () => {});
  }, [classId, uid]);
  return map;
}
export function useClassLevels(classId: string, family?: string) {
  const [map, setMap] = useState<Record<string, string>>({}); // learnerId -> taskId
  useEffect(() => {
    setMap({});
    if (!classId || !family) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'levelChoices'), where('family', '==', family)), (s) => setMap(Object.fromEntries(s.docs.map((d) => [d.data().learnerId, d.data().taskId]))), () => {});
  }, [classId, family]);
  return map;
}

// Average score per learner across the class, for level groups.
export async function averageScores(classId: string) {
  const s = await getDocs(collection(db, 'classes', classId, 'answers'));
  const sum: Record<string, { got: number; max: number }> = {};
  for (const d of s.docs) {
    const a = d.data();
    if (!a.total) continue;
    const x = (sum[a.learnerId] ??= { got: 0, max: 0 });
    x.got += a.score ?? 0;
    x.max += a.total;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v.max ? v.got / v.max : 0]));
}

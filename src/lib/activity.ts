import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { AnswerDoc } from './tasks';
import type { Item } from './classes';
import type { Attendance } from './reports';
import type { Post, Thread } from './discussion';

// What learners have been doing: one learner's full timeline, and the latest across classes.

export type Activity = {
  at: number;
  kind: 'submit' | 'check' | 'work' | 'live' | 'post' | 'reply' | 'file';
  title: string; // what happened, in a few words
  where?: string; // the lesson and task
  pct?: number | null;
  late?: boolean;
  itemId?: string;
  taskId?: string;
  classId?: string;
  learnerId?: string;
  name?: string;
};

const ms = (v: unknown) => (typeof v === 'number' ? v : (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0);

// Task titles, read once and kept.
const taskTitles = new Map<string, Promise<string>>();
export function taskTitle(classId: string, itemId: string, taskId: string) {
  const k = `${classId}/${itemId}/${taskId}`;
  if (!taskTitles.has(k))
    taskTitles.set(
      k,
      getDoc(doc(db, 'classes', classId, 'items', itemId, 'tasks', taskId))
        .then((s) => String(s.data()?.title || 'a task'))
        .catch(() => 'a task'),
    );
  return taskTitles.get(k)!;
}

export async function fromAnswer(a: AnswerDoc, classId: string, items: Item[]): Promise<Activity> {
  const item = items.find((i) => i.id === a.itemId);
  const task = await taskTitle(classId, a.itemId, a.taskId);
  const pct = a.checked && a.total ? Math.round(((a.score ?? 0) / a.total) * 100) : null;
  const where = item ? `${item.title} · ${task}` : task;
  const base = { where, itemId: a.itemId, taskId: a.taskId, classId, learnerId: a.learnerId, late: !!a.late };
  if (a.submittedAt) return { ...base, at: Math.max(a.submittedAt, ms(a.updatedAt)), kind: 'submit', title: 'Handed in', pct };
  if (a.checked) return { ...base, at: ms(a.updatedAt), kind: 'check', title: pct === null ? 'Checked their answers' : `Checked: ${a.score ?? 0} of ${a.total}`, pct };
  return { ...base, at: ms(a.updatedAt), kind: 'work', title: 'Worked on' };
}

// Everything one learner has done in a class, newest first.
export function useLearnerTimeline(classId: string, uid: string, learnerId: string, items: Item[]) {
  const [list, setList] = useState<Activity[] | null>(null);
  const itemKey = items.map((i) => i.id + i.title).join();
  useEffect(() => {
    if (!classId || !uid) return;
    let dead = false;
    setList(null);
    (async () => {
      const [ans, att, files, threads] = await Promise.all([
        getDocs(query(collection(db, 'classes', classId, 'answers'), where('learnerUid', '==', uid))).catch(() => null),
        getDocs(query(collection(db, 'classes', classId, 'attendance'), where('uid', '==', uid))).catch(() => null),
        getDocs(query(collection(db, 'classes', classId, 'files'), where('owner', '==', uid))).catch(() => null),
        getDocs(collection(db, 'classes', classId, 'threads')).catch(() => null),
      ]);
      const out: Activity[] = [];
      for (const d of ans?.docs ?? []) out.push(await fromAnswer(d.data() as AnswerDoc, classId, items));
      for (const d of att?.docs ?? []) {
        const a = d.data() as Attendance;
        const item = items.find((i) => i.id === a.itemId);
        const mins = Math.round((a.corrected ?? a.minutes) || 0);
        out.push({ at: a.firstAt, kind: 'live', title: `In the live lesson, ${mins} min`, where: item?.title ?? 'a lesson', itemId: a.itemId });
      }
      for (const d of files?.docs ?? []) {
        const f = d.data() as { name?: string; taskId?: string; createdAt?: unknown };
        if (!f.name) continue; // a part of a file
        out.push({ at: ms(f.createdAt), kind: 'file', title: 'Sent a file', where: f.name, taskId: f.taskId });
      }
      for (const t of threads?.docs ?? []) {
        const th = t.data() as Thread;
        if (th.learnerId === learnerId) out.push({ at: ms((th as { at?: unknown }).at) || th.lastAt, kind: 'post', title: 'Started a discussion', where: th.title });
        const ps = await getDocs(collection(db, 'classes', classId, 'threads', t.id, 'posts')).catch(() => null);
        for (const p of ps?.docs ?? []) {
          const pd = p.data() as Post;
          if (pd.learnerId === learnerId) out.push({ at: pd.at, kind: 'reply', title: 'Replied in a discussion', where: th.title });
        }
      }
      if (!dead) setList(out.filter((x) => x.at).sort((a, b) => b.at - a.at));
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, uid, learnerId, itemKey]);
  return list;
}

// The latest work across classes, for the home screen.
export function useRecentWork(classIds: string[], items: Record<string, Item[]>) {
  const [byClass, setByClass] = useState<Record<string, Activity[]>>({});
  const [names, setNames] = useState<Record<string, Record<string, string>>>({});
  const key = classIds.join(',');
  const itemKey = classIds.map((c) => (items[c] ?? []).length).join();
  useEffect(() => {
    const offs = classIds.map((c) =>
      onSnapshot(
        query(collection(db, 'classes', c, 'answers'), orderBy('updatedAt', 'desc'), limit(12)),
        async (s) => {
          const acts = await Promise.all(s.docs.map((d) => fromAnswer(d.data() as AnswerDoc, c, items[c] ?? [])));
          setByClass((m) => ({ ...m, [c]: acts }));
        },
        () => {},
      ),
    );
    for (const c of classIds)
      getDocs(collection(db, 'classes', c, 'learners'))
        .then((s) => setNames((m) => ({ ...m, [c]: Object.fromEntries(s.docs.map((d) => [d.id, String(d.data().displayName ?? '')])) })))
        .catch(() => {});
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, itemKey]);
  return Object.entries(byClass)
    .flatMap(([c, list]) => list.map((a) => ({ ...a, name: names[c]?.[a.learnerId ?? ''] || 'A learner' })))
    .filter((a) => a.at)
    .sort((a, b) => b.at - a.at);
}

export function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

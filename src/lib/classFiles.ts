import { useEffect, useState } from 'react';
import { arrayUnion, collection, deleteField, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { allTeacherClasses } from './coteach';
import type { ClassDoc } from './classes';
import { openChat, sendMsg, type Chat, type Person } from './chat';

// Lessons in Files: every lesson made in a class appears there by itself, in Classes, then a
// folder for the class and one for each topic. They stay where the class puts them. A lesson can
// be shared with a colleague, who then edits the class's lesson itself.

export type LessonType = 'lesson' | 'homework' | 'exam' | 'practice';
export type ClassLesson = { type?: LessonType; classId: string; className: string; itemId: string; title: string; topic: string; at: number; editors: Record<string, string>; shared?: boolean; owner?: string };

export function useClassLessons(uid?: string) {
  const [list, setList] = useState<ClassLesson[] | null>(null);
  const [withMe, setWithMe] = useState<ClassLesson[]>([]);
  useEffect(() => {
    if (!uid) return;
    let dead = false;
    void (async () => {
      const classes = (await allTeacherClasses(uid).catch(() => [] as ClassDoc[])).filter((c) => c.status === 'active');
      const out: ClassLesson[] = [];
      await Promise.all(
        classes.map(async (c) => {
          const [ts, is] = await Promise.all([getDocs(collection(db, 'classes', c.id, 'topics')).catch(() => null), getDocs(collection(db, 'classes', c.id, 'items')).catch(() => null)]);
          const topics = new Map((ts?.docs ?? []).map((d) => [d.id, String(d.data().name ?? 'Topic')]));
          for (const d of is?.docs ?? []) {
            const v = d.data();
            out.push({ type: (v.type ?? 'lesson') as LessonType, classId: c.id, className: c.name, itemId: d.id, title: String(v.title ?? 'Lesson'), topic: v.topicId ? topics.get(v.topicId) ?? '' : '', at: v.createdAt?.toMillis?.() ?? 0, editors: (v.editors ?? {}) as Record<string, string> });
          }
        }),
      );
      if (!dead) setList(out);
    })();
    // Lessons colleagues share with me.
    const off = onSnapshot(
      query(collection(db, 'classes'), where('lessonEditorIds', 'array-contains', uid)),
      async (s) => {
        const got: ClassLesson[] = [];
        await Promise.all(
          s.docs.map(async (c) => {
            const ids = ((c.data().lessonEditors ?? {})[uid] ?? []) as string[];
            for (const itemId of ids) {
              const it = await getDoc(doc(db, 'classes', c.id, 'items', itemId)).catch(() => null);
              if (!it?.exists() || !(uid in (it.data().editors ?? {}))) continue;
              got.push({ type: (it.data().type ?? 'lesson') as LessonType, classId: c.id, className: String(c.data().name ?? ''), itemId, title: String(it.data().title ?? 'Lesson'), topic: '', at: 0, editors: it.data().editors ?? {}, shared: true, owner: String(c.data().teacherName ?? '') });
            }
          }),
        );
        if (!dead) setWithMe(got);
      },
      () => {},
    );
    return () => {
      dead = true;
      off();
    };
  }, [uid]);
  return { list, withMe };
}

// Files learners handed in for "File upload" questions, by class and learner.
export type HandIn = { classId: string; className: string; learner: string; id: string; name: string; type: string; size: number; parts: number; at: number };
export function useHandIns(uid?: string) {
  const [list, setList] = useState<HandIn[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    let dead = false;
    void (async () => {
      const classes = (await allTeacherClasses(uid).catch(() => [] as ClassDoc[])).filter((c) => c.status === 'active');
      const out: HandIn[] = [];
      await Promise.all(
        classes.map(async (c) => {
          const [fs, ls] = await Promise.all([getDocs(collection(db, 'classes', c.id, 'files')).catch(() => null), getDocs(collection(db, 'classes', c.id, 'learners')).catch(() => null)]);
          const names = new Map((ls?.docs ?? []).map((d) => [d.id, String(d.data().displayName ?? 'Learner')]));
          for (const d of fs?.docs ?? []) {
            const v = d.data();
            if (typeof v.name !== 'string' || 'part' in v) continue;
            out.push({ classId: c.id, className: c.name, learner: names.get(String(v.learnerId)) ?? 'Learner', id: d.id, name: v.name, type: String(v.type ?? ''), size: Number(v.size) || 0, parts: Number(v.parts) || 1, at: v.createdAt?.toMillis?.() ?? 0 });
          }
        }),
      );
      if (!dead) setList(out);
    })();
    return () => void (dead = true);
  }, [uid]);
  return list;
}

export const lessonLink = (l: { classId: string; itemId: string }) => `${window.location.origin}/class/${l.classId}/lesson/${l.itemId}`;

// Share one lesson with colleagues: they edit the class's lesson itself.
export async function shareLesson(l: ClassLesson, people: Person[], me: Person, tell: boolean, note: string) {
  const editors = Object.fromEntries(people.map((p) => [p.key, p.name]));
  await updateDoc(doc(db, 'classes', l.classId, 'items', l.itemId), Object.fromEntries(Object.entries(editors).map(([k, v]) => [`editors.${k}`, v])));
  const patch: Record<string, any> = { lessonEditorIds: arrayUnion(...people.map((p) => p.key)) };
  for (const p of people) patch[`lessonEditors.${p.key}`] = arrayUnion(l.itemId);
  await updateDoc(doc(db, 'classes', l.classId), patch);
  if (!tell) return;
  for (const p of people) {
    const chatId = await openChat(me, [p]);
    const c = { id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat;
    const text = note.trim() || `I shared the lesson “${l.title}” (${l.className}) with you, so we can work on it together.`;
    await sendMsg(c, me, { text: `${text} ${lessonLink(l)}`, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text + ' ' }, { type: 'text', text: `Open ${l.title}`, marks: [{ type: 'link', attrs: { href: lessonLink(l) } }] }] }] }, blocks: 0, mentions: [p.key] });
  }
}
export async function unshareLesson(l: ClassLesson, uid: string) {
  await updateDoc(doc(db, 'classes', l.classId, 'items', l.itemId), { [`editors.${uid}`]: deleteField() });
}

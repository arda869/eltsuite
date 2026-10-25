import { useEffect, useState } from 'react';
import { addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Annotations are anchored to the text, not to the screen: a block (data-bk) and character
// offsets inside it, plus the quoted text. For a learner's long answer: the question and
// character offsets in the answer.
export type AnnColor = 'yellow' | 'green' | 'pink';
export type Reply = { by: string; name: string; text: string; at: number; teacher?: boolean };
export type Annotation = {
  id: string;
  taskId: string;
  target: 'task' | 'answer';
  bk?: string; // task text: block key
  qid?: string; // answer: question id
  learnerUid?: string; // answer: whose answer (private to them and the teacher)
  start: number;
  end: number;
  quote: string;
  kind: 'highlight' | 'underline' | 'comment' | 'code';
  color?: AnnColor;
  code?: string; // correction code, e.g. T, WW, Sp
  visibility: 'class' | 'private';
  replies: Reply[];
  at?: Timestamp;
};

const col = (classId: string) => collection(db, 'classes', classId, 'annotations');

export function addAnnotation(classId: string, a: Omit<Annotation, 'id' | 'at' | 'replies'> & { replies?: Reply[] }) {
  return addDoc(col(classId), { replies: [], ...a, at: serverTimestamp() });
}
export const removeAnnotation = (classId: string, id: string) => deleteDoc(doc(col(classId), id));
export const replyTo = (classId: string, id: string, r: Reply) => updateDoc(doc(col(classId), id), { replies: arrayUnion(r) });

// Teacher: every annotation on a task. Learner: the class ones and their own private ones.
export function useAnnotations(classId: string, taskId: string, as: { teacher: boolean; uid?: string }) {
  const [list, setList] = useState<Annotation[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !taskId) return;
    const map = (s: { docs: { id: string; data: () => unknown }[] }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Annotation, 'id'>) }));
    if (as.teacher) return onSnapshot(query(col(classId), where('taskId', '==', taskId)), (s) => setList(map(s)), () => {});
    // Learners need two queries so the security rules can check each one.
    let a: Annotation[] = [];
    let b: Annotation[] = [];
    const u1 = onSnapshot(query(col(classId), where('taskId', '==', taskId), where('visibility', '==', 'class')), (s) => ((a = map(s)), setList([...a, ...b])), () => {});
    const u2 = as.uid ? onSnapshot(query(col(classId), where('taskId', '==', taskId), where('learnerUid', '==', as.uid)), (s) => ((b = map(s).filter((x) => x.visibility === 'private')), setList([...a, ...b])), () => {}) : () => {};
    return () => (u1(), u2());
  }, [classId, taskId, as.teacher, as.uid]);
  return list;
}

// Correction codes. Teachers can change them per class; learners can open the key.
export type Code = { code: string; meaning: string };
export const DEFAULT_CODES: Code[] = [
  { code: 'T', meaning: 'Tense' },
  { code: 'WW', meaning: 'Wrong word' },
  { code: 'Sp', meaning: 'Spelling' },
  { code: 'WO', meaning: 'Word order' },
  { code: 'Prep', meaning: 'Preposition' },
  { code: '^', meaning: 'Missing word' },
  { code: 'Art', meaning: 'Article (a, an, the)' },
  { code: 'P', meaning: 'Punctuation' },
  { code: 'Agr', meaning: 'Agreement (he goes, they go)' },
  { code: '✓', meaning: 'Good use of language' },
];

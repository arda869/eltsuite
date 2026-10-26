import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

// Grammar and vocabulary bank pages, for linking to them from tasks.
export type BankPage = { id: string; title: string; bank: 'grammar' | 'vocab'; topicId?: string | null };
export function useBankPages(classId: string, on = true) {
  const [list, setList] = useState<BankPage[]>([]);
  useEffect(() => {
    if (!classId || !on) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'notebook'), where('type', '==', 'page')), (s) => setList(s.docs.filter((d) => !d.data().hidden).map((d) => ({ id: d.id, title: (d.data().data?.title as string) || 'Untitled page', bank: d.data().bank ?? 'grammar', topicId: d.data().topicId ?? null }))), () => setList([]));
  }, [classId, on]);
  return list;
}

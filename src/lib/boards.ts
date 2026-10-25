import { useEffect, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Messages on a message board or notes on a post-it wall, shared live with the class.
export type Post = {
  id: string;
  text: string;
  byUid: string;
  byName: string; // empty when the board is anonymous
  avatar?: string;
  teacher?: boolean;
  color?: string;
  parentId?: string;
  reactions?: Record<string, string[]>; // reaction -> uids
  at?: Timestamp;
};

const postsCol = (classId: string, boardKey: string) => collection(db, 'classes', classId, 'boards', boardKey, 'posts');
export const boardKey = (taskId: string, boardId: string) => `${taskId}_${boardId}`;

export function usePosts(classId: string, key: string, enabled = true) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!classId || !key || !enabled) return;
    setPosts(null);
    return onSnapshot(
      query(postsCol(classId, key), orderBy('at', 'asc')),
      (s) => setPosts(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))),
      () => setPosts([]),
    );
  }, [classId, key, enabled]);
  return posts;
}

export function addPost(classId: string, key: string, p: Omit<Post, 'id' | 'at' | 'reactions'>) {
  return addDoc(postsCol(classId, key), { ...p, reactions: {}, at: serverTimestamp() });
}

export function react(classId: string, key: string, postId: string, reaction: string, uid: string, on: boolean) {
  return updateDoc(doc(postsCol(classId, key), postId), { [`reactions.${reaction}`]: on ? arrayUnion(uid) : arrayRemove(uid) });
}

export function removePost(classId: string, key: string, postId: string) {
  return deleteDoc(doc(postsCol(classId, key), postId));
}

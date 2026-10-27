import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Everyone's profile picture, where anyone signed in can see it: faces/{key}, where the key is
// the person's id in chats (a teacher's account, or a learner's id). Only its owner writes it.

const cache = new Map<string, Promise<string>>();
export function faceOf(key: string): Promise<string> {
  if (!cache.has(key)) cache.set(key, getDoc(doc(db, 'faces', key)).then((s) => String(s.data()?.avatar ?? '')).catch(() => ''));
  return cache.get(key)!;
}
export function useFace(key?: string) {
  const [k, setK] = useState('');
  useEffect(() => {
    if (!key) return;
    let live = true;
    void faceOf(key).then((v) => live && setK(v));
    return () => {
      live = false;
    };
  }, [key]);
  return k;
}
const done = new Set<string>();
export function publishFace(key: string, by: string, avatar: string) {
  const id = key + '|' + avatar;
  if (done.has(id)) return;
  done.add(id);
  cache.set(key, Promise.resolve(avatar));
  void setDoc(doc(db, 'faces', key), { avatar, by }).catch(() => {});
}

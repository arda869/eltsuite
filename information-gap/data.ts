import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { addDoc, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { firebaseConfig } from '../src/lib/firebaseConfig';

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_TIG_EMULATOR === '1';
const app = initializeApp(useEmulators ? { ...firebaseConfig, projectId: 'demo-information-gap' } : firebaseConfig, 'information-gap');
export const auth = getAuth(app);
export const db = getFirestore(app);
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export type Article = {
  id: string; title: string; standfirst: string; body: string; section: 'Essays' | 'Practice';
  topic: string; authorUid: string; authorName: string; status: 'draft' | 'submitted' | 'changes' | 'published' | 'rejected';
  createdAt: number; updatedAt: number; publishedAt?: number;
};
export type Thread = {
  id: string; title: string; body: string; topic: string; authorUid: string; authorName: string;
  status: 'visible' | 'hidden'; createdAt: number; updatedAt: number;
};
export type Reply = {
  id: string; body: string; authorUid: string; authorName: string; status: 'visible' | 'hidden'; createdAt: number;
};
export type Lesson = { id: string; title: string; description: string; url: string; level: string; authorName: string; createdAt: number };
export type Pitch = { id: string; title: string; summary: string; authorUid: string; authorName: string; status: 'new' | 'accepted' | 'declined'; createdAt: number };
export type Profile = { displayName: string; bio: string; createdAt: number };

function sorted<T extends { createdAt?: number; publishedAt?: number }>(items: T[]) {
  return items.sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0));
}
function rows<T>(snapshot: Awaited<ReturnType<typeof getDocs>>): T[] {
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as T));
}

export async function publishedArticles() {
  return sorted(rows<Article>(await getDocs(query(collection(db, 'tigArticles'), where('status', '==', 'published'), limit(100)))));
}
export async function getArticle(id: string) {
  const snap = await getDoc(doc(db, 'tigArticles', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Article : null;
}
export async function myArticles(uid: string) {
  return sorted(rows<Article>(await getDocs(query(collection(db, 'tigArticles'), where('authorUid', '==', uid), limit(100)))));
}
export async function editorialArticles() {
  return sorted(rows<Article>(await getDocs(query(collection(db, 'tigArticles'), limit(100)))));
}
export async function saveArticle(article: Partial<Article> & Pick<Article, 'title' | 'standfirst' | 'body' | 'section' | 'topic' | 'authorUid' | 'authorName' | 'status'>) {
  const now = Date.now();
  if (article.id) {
    await updateDoc(doc(db, 'tigArticles', article.id), {
      title: article.title.trim(), standfirst: article.standfirst.trim(), body: article.body.trim(),
      section: article.section, topic: article.topic.trim(), status: article.status, updatedAt: now,
    });
    return article.id;
  }
  const ref = await addDoc(collection(db, 'tigArticles'), {
    title: article.title.trim(), standfirst: article.standfirst.trim(), body: article.body.trim(),
    section: article.section, topic: article.topic.trim(), authorUid: article.authorUid,
    authorName: article.authorName, status: article.status, createdAt: now, updatedAt: now,
  });
  return ref.id;
}
export async function setArticleStatus(id: string, status: Article['status']) {
  await updateDoc(doc(db, 'tigArticles', id), {
    status, updatedAt: Date.now(), ...(status === 'published' ? { publishedAt: Date.now() } : {}),
  });
}

export async function visibleThreads() {
  return sorted(rows<Thread>(await getDocs(query(collection(db, 'tigThreads'), where('status', '==', 'visible'), limit(100)))));
}
export async function editorialThreads() {
  return sorted(rows<Thread>(await getDocs(query(collection(db, 'tigThreads'), limit(100)))));
}
export async function getThread(id: string) {
  const snap = await getDoc(doc(db, 'tigThreads', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Thread : null;
}
export async function createThread(value: Pick<Thread, 'title' | 'body' | 'topic' | 'authorUid' | 'authorName'>) {
  const ref = await addDoc(collection(db, 'tigThreads'), {
    ...value, title: value.title.trim(), body: value.body.trim(), topic: value.topic.trim(),
    status: 'visible', createdAt: Date.now(), updatedAt: Date.now(),
  });
  return ref.id;
}
export async function threadReplies(id: string) {
  return sorted(rows<Reply>(await getDocs(query(collection(db, 'tigThreads', id, 'replies'), where('status', '==', 'visible'), limit(100)))));
}
export async function editorialReplies(id: string) {
  return sorted(rows<Reply>(await getDocs(query(collection(db, 'tigThreads', id, 'replies'), limit(100)))));
}
export async function addReply(threadId: string, value: Pick<Reply, 'body' | 'authorUid' | 'authorName'>) {
  await addDoc(collection(db, 'tigThreads', threadId, 'replies'), {
    ...value, body: value.body.trim(), status: 'visible', createdAt: Date.now(),
  });
}
export async function moderateThread(id: string, status: Thread['status']) {
  await updateDoc(doc(db, 'tigThreads', id), { status, updatedAt: Date.now() });
}
export async function moderateReply(threadId: string, replyId: string, status: Reply['status']) {
  await updateDoc(doc(db, 'tigThreads', threadId, 'replies', replyId), { status });
}

export async function sharedLessons() {
  return sorted(rows<Lesson>(await getDocs(query(collection(db, 'tigLessons'), limit(100)))));
}
export async function addSharedLesson(value: Omit<Lesson, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'tigLessons'), { ...value, createdAt: Date.now() });
}
export async function myPitches(uid: string) {
  return sorted(rows<Pitch>(await getDocs(query(collection(db, 'tigPitches'), where('authorUid', '==', uid), limit(100)))));
}
export async function editorialPitches() {
  return sorted(rows<Pitch>(await getDocs(query(collection(db, 'tigPitches'), limit(100)))));
}
export async function createPitch(value: Omit<Pitch, 'id' | 'status' | 'createdAt'>) {
  await addDoc(collection(db, 'tigPitches'), { ...value, status: 'new', createdAt: Date.now() });
}
export async function setPitchStatus(id: string, status: Pitch['status']) {
  await updateDoc(doc(db, 'tigPitches', id), { status });
}
export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'tigProfiles', uid));
  return snap.exists() ? snap.data() as Profile : null;
}
export async function saveProfile(uid: string, displayName: string, bio: string) {
  const previous = await getProfile(uid);
  await setDoc(doc(db, 'tigProfiles', uid), {
    displayName: displayName.trim(), bio: bio.trim(), createdAt: previous?.createdAt || Date.now(),
  });
}
export async function isEditor(uid: string, email: string | null) {
  if (email?.toLowerCase() === 'ardanurioglu@gmail.com') return true;
  const snap = await getDoc(doc(db, 'tigEditors', uid));
  if (snap.exists()) return true;
  if (!email) return false;
  try {
    return (await getDoc(doc(db, 'superAdmins', email.toLowerCase()))).exists();
  } catch {
    return false;
  }
}
export async function addEditor(uid: string, email: string) {
  await setDoc(doc(db, 'tigEditors', uid), { email: email.trim().toLowerCase(), addedAt: Date.now() });
}

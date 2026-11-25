import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Get started: ten things that make ELT Suite useful, on the home screen. Each opens the place where
// it is done with a short guide in the corner. A step ticks itself when it is done (some from what is
// already there, like a class; others when they happen, like a search) and stays on the list, ticked,
// to open again. The list can be hidden, and brought back in Settings.
// Kept on the teacher's own profile: users/{uid}.start = { done: { [step]: time }, hidden }.

export type StepId = 'class' | 'learners' | 'lesson' | 'files' | 'doc' | 'design' | 'record' | 'activity' | 'hub' | 'search';
export type Step = { id: StepId; title: string; about: string; to: string; tips: string[] };

export const STEPS: Step[] = [
  { id: 'class', title: 'Make your first class', about: 'A home for one group of learners.', to: '/classes', tips: ['Press Make a class and give it a name and a level.', 'Choose a colour and a cover. Your printed worksheets use them too.'] },
  { id: 'learners', title: 'Invite your learners', about: 'They join with the class code. No email needed.', to: '/classes', tips: ['Open a class and press Invite learners.', 'Share the code or the QR code. Learners appear as they join.'] },
  { id: 'lesson', title: 'Write your first lesson', about: 'Tasks for the screen and the page, in one place.', to: '/classes', tips: ['Open a class and press Make a lesson.', 'Type / in a task to add gaps, matching, pictures and more.', 'Switch to Worksheet to see the printed version.'] },
  { id: 'files', title: 'Keep a picture in My Files', about: 'Everything you upload, ready to use again.', to: '/archive', tips: ['Press New, then Upload, and choose a picture from your computer.', 'Make folders for your units. Add windows open in the folder you used last.'] },
  { id: 'doc', title: 'Write a Collab document', about: 'Write together, with comments and suggestions.', to: '/collab', tips: ['Make a document and press Share to invite a colleague.', 'Questions you add print as a worksheet, with an answer key at the end.'] },
  { id: 'design', title: 'Make a poster or flashcards', about: 'Design ready-made classroom pages.', to: '/design', tips: ['Start from a template such as Flashcards or Classroom poster.', 'Change the words and pictures, then download or print.'] },
  { id: 'record', title: 'Record a listening', about: 'Record, tidy and add a script for karaoke.', to: '/recordings', tips: ['Press Record and read your script aloud.', 'Trim the start and end, then save. It goes to My Files.'] },
  { id: 'activity', title: 'Try a speaking activity', about: 'Find someone who, bingo, cue cards and more.', to: '/classes', tips: ['In a lesson, type / and choose Speaking activities.', 'Teach it live: learners see their own cards on their devices.'] },
  { id: 'hub', title: 'Find a lesson in the Resource Hub', about: 'Ready-made lessons to copy into a class.', to: '/resource-hub', tips: ['Search by topic or level.', 'Press Copy to a class to make it yours to change.'] },
  { id: 'search', title: 'Find anything with Ctrl+K', about: 'Files, messages, lessons and learners.', to: '', tips: ['Press Ctrl+K (⌘K on a Mac) on any screen.', 'Type a few letters. Every word must match.'] },
];

export type StartState = { done: Partial<Record<StepId, number>>; hidden: boolean };
const EMPTY: StartState = { done: {}, hidden: false };

export function useStart(uid?: string | null) {
  const [s, setS] = useState<StartState | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (d) => {
      const x = (d.data()?.start ?? {}) as Partial<StartState>;
      setS({ done: x.done ?? {}, hidden: !!x.hidden });
    }, () => setS(EMPTY));
  }, [uid]);
  return s;
}

// Tick a step. Cheap to call often: each step is written once per device.
const sent = new Set<string>();
export function markStep(id: StepId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const key = uid + ':' + id;
  if (sent.has(key)) return;
  sent.add(key);
  try { if (localStorage.getItem('ll.start.' + key)) return; localStorage.setItem('ll.start.' + key, '1'); } catch { /* fine */ }
  void updateDoc(doc(db, 'users', uid), { ['start.done.' + id]: Date.now() }).catch(() => { sent.delete(key); try { localStorage.removeItem('ll.start.' + key); } catch { /* fine */ } });
}

export function setStartHidden(hidden: boolean) {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.resolve();
  return updateDoc(doc(db, 'users', uid), { 'start.hidden': hidden });
}

// The guide for the step being tried, shown on the page it opens.
const GUIDE = 'll.startGuide';
export const guideFor = () => { try { return (sessionStorage.getItem(GUIDE) || '') as StepId | ''; } catch { return ''; } };
export const setGuide = (id: StepId | '') => { try { if (id) sessionStorage.setItem(GUIDE, id); else sessionStorage.removeItem(GUIDE); } catch { /* fine */ } window.dispatchEvent(new Event(GUIDE)); };
export const GUIDE_EVENT = GUIDE;

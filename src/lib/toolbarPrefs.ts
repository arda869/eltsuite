import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useAuth } from './auth';

// Which tools each teacher keeps on the text toolbar: shown, behind the › arrow, or hidden.
// Saved on their user record so it follows them, and cached on this device.

export type ToolPlace = 'show' | 'more' | 'hide';
export const TOOLS: { k: string; label: string }[] = [
  { k: 'bold', label: 'Bold' },
  { k: 'italic', label: 'Italic' },
  { k: 'underline', label: 'Underline' },
  { k: 'strike', label: 'Strikethrough' },
  { k: 'color', label: 'Text colour' },
  { k: 'highlight', label: 'Highlight' },
  { k: 'heading', label: 'Heading' },
  { k: 'bullets', label: 'Bulleted list' },
  { k: 'numbers', label: 'Numbered list' },
  { k: 'table', label: 'Table' },
  { k: 'definition', label: 'Definition' },
  { k: 'link', label: 'Link' },
  { k: 'questions', label: 'Questions' },
  { k: 'icons', label: 'Icons' },
  { k: 'symbols', label: 'Symbols and grammar labels' },
  { k: 'pron', label: 'Pronunciation' },
  { k: 'add', label: '+ Add…' },
];
const KEY = 'll.toolbar';
let prefs: Record<string, ToolPlace> | null = null;
let loadedFor = '';
const listeners = new Set<(p: Record<string, ToolPlace>) => void>();

function current(): Record<string, ToolPlace> {
  if (!prefs) {
    try {
      prefs = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      prefs = {};
    }
  }
  const uid = auth.currentUser?.uid ?? '';
  if (uid && loadedFor !== uid) {
    loadedFor = uid;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        const r = s.data()?.toolbar;
        if (r && typeof r === 'object') {
          prefs = r as Record<string, ToolPlace>;
          try {
            localStorage.setItem(KEY, JSON.stringify(prefs));
          } catch {
            /* fine */
          }
          listeners.forEach((f) => f(prefs!));
        }
      })
      .catch(() => {});
  }
  return prefs!;
}

export function setToolPlace(k: string, place: ToolPlace) {
  prefs = { ...current(), [k]: place };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* fine */
  }
  listeners.forEach((f) => f(prefs!));
  const uid = auth.currentUser?.uid;
  if (uid) void setDoc(doc(db, 'users', uid), { toolbar: prefs }, { merge: true }).catch(() => {});
}

export function resetTools() {
  prefs = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* fine */
  }
  listeners.forEach((f) => f({}));
  const uid = auth.currentUser?.uid;
  if (uid) void setDoc(doc(db, 'users', uid), { toolbar: {} }, { merge: true }).catch(() => {});
}

export function useToolbarPrefs() {
  const [p, setP] = useState(current);
  useEffect(() => {
    listeners.add(setP);
    return () => void listeners.delete(setP);
  }, []);
  return (k: string): ToolPlace => p[k] ?? DEFAULT_PLACE[k] ?? 'show';
}
// Out of the box: the everyday tools on the bar, the rest behind the › arrow.
export const DEFAULT_PLACE: Record<string, ToolPlace> = { strike: 'more', table: 'more', definition: 'more', icons: 'more', symbols: 'more' };

// Learners: the teacher chooses the text tools for each class in class settings. Writing tools
// are on by default; language teaching tools (pronunciation, grammar labels, definitions) and
// task tools (headings, tables) are off until the teacher turns them on. Learners cannot change them.
export const LEARNER_TOOLS: { k: string; label: string; on: boolean }[] = [
  { k: 'bold', label: 'Bold', on: true },
  { k: 'italic', label: 'Italic', on: true },
  { k: 'underline', label: 'Underline', on: true },
  { k: 'strike', label: 'Strikethrough', on: true },
  { k: 'color', label: 'Text colour', on: true },
  { k: 'highlight', label: 'Highlight', on: true },
  { k: 'bullets', label: 'Bulleted list', on: true },
  { k: 'numbers', label: 'Numbered list', on: true },
  { k: 'link', label: 'Link', on: true },
  { k: 'icons', label: 'Icons', on: true },
  { k: 'heading', label: 'Heading', on: false },
  { k: 'table', label: 'Table', on: false },
  { k: 'definition', label: 'Definition', on: false },
  { k: 'symbols', label: 'Symbols and grammar labels', on: false },
  { k: 'pron', label: 'Pronunciation: stress, intonation, linking, sounds', on: false },
];
export const learnerToolOn = (k: string, set?: Record<string, boolean>) => {
  const d = LEARNER_TOOLS.find((t) => t.k === k);
  if (!d) return true; // gaps, choices and + Add follow "Learners can send task elements"
  return set?.[k] ?? d.on;
};

// Where a tool goes for whoever is writing: the teacher's own choice, or the class's for learners.
export function useToolGate(): (k: string) => ToolPlace {
  const { profile } = useAuth();
  const mine = useToolbarPrefs();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const [set, setSet] = useState<Record<string, boolean> | undefined>(undefined);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(
      doc(db, 'classes', classId),
      (s) => setSet((s.data()?.learnerTools ?? {}) as Record<string, boolean>),
      () => {},
    );
  }, [classId]);
  if (profile?.role === 'learner') return (k) => (learnerToolOn(k, set) ? 'show' : 'hide');
  return mine;
}

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isMac, keyLabel } from './keys';

// Shortcuts teachers can change: going to a place (G, then a letter), making something new (N,
// then a letter) and a few that work everywhere. Two-key sequences never clash with the browser.
// Teachers change them in Settings; their keys are kept on their profile (users/{uid}.keys) and on
// this device, and the Keyboard shortcuts list shows them. The keys a browser keeps for itself
// (a new tab, closing the tab…) can't be used: no web page can take them.

export type CmdId = 'go-home' | 'go-classes' | 'go-files' | 'go-messages' | 'go-timetable' | 'go-hub' | 'go-collab' | 'go-design' | 'go-recordings' | 'go-settings'
  | 'new-doc' | 'new-lesson' | 'new-recording' | 'new-design' | 'search';
export type Cmd = { id: CmdId; group: 'Go to' | 'Make' | 'Everywhere'; label: string; def: string; to?: string; make?: 'doc' | 'lesson' };

export const COMMANDS: Cmd[] = [
  { id: 'go-home', group: 'Go to', label: 'Home', def: 'G H', to: '/' },
  { id: 'go-classes', group: 'Go to', label: 'Classes', def: 'G C', to: '/classes' },
  { id: 'go-files', group: 'Go to', label: 'My Files', def: 'G F', to: '/archive' },
  { id: 'go-messages', group: 'Go to', label: 'Messages', def: 'G M', to: '/messages' },
  { id: 'go-timetable', group: 'Go to', label: 'Timetable', def: 'G T', to: '/timetable' },
  { id: 'go-hub', group: 'Go to', label: 'Resource Hub', def: 'G R', to: '/resource-hub' },
  { id: 'go-collab', group: 'Go to', label: 'Collab documents', def: 'G D', to: '/collab' },
  { id: 'go-design', group: 'Go to', label: 'Design', def: 'G P', to: '/design' },
  { id: 'go-recordings', group: 'Go to', label: 'Recordings', def: 'G A', to: '/recordings' },
  { id: 'go-settings', group: 'Go to', label: 'Settings', def: 'G S', to: '/settings' },
  { id: 'new-doc', group: 'Make', label: 'A new Collab document', def: 'N D', make: 'doc' },
  { id: 'new-lesson', group: 'Make', label: 'A new lesson file', def: 'N L', make: 'lesson' },
  { id: 'new-recording', group: 'Make', label: 'A new recording', def: 'N R', to: '/studio/sound/new' },
  { id: 'new-design', group: 'Make', label: 'A new design', def: 'N P', to: '/design' },
  { id: 'search', group: 'Everywhere', label: 'Search everything', def: 'Mod+K' },
];

// Keys a browser keeps for itself: a page never sees them, or can't stop what they do.
const RESERVED = new Set([
  'Mod+T', 'Mod+W', 'Mod+N', 'Mod+Shift+N', 'Mod+Shift+T', 'Mod+Shift+W', 'Mod+Tab', 'Mod+Shift+Tab', 'Mod+Q', 'Mod+L',
  'Mod+R', 'Mod+Shift+R', 'Mod+H', 'Mod+M', 'Mod+J', 'Mod+Shift+Delete', 'F5', 'F11', 'F12', 'Alt+F4', 'Alt+Left', 'Alt+Right',
  ...Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`),
]);
// Keys ELT Suite already uses everywhere, or in writing.
const TAKEN: Record<string, string> = {
  'Mod+B': 'bold', 'Mod+I': 'italic', 'Mod+U': 'underline', 'Mod+Z': 'undo', 'Mod+Y': 'redo', 'Mod+Shift+Z': 'redo', 'Mod+C': 'copy', 'Mod+V': 'paste',
  'Mod+X': 'cut', 'Mod+A': 'select all', 'Mod+/': 'the shortcuts list', 'Mod+S': 'save', 'Mod+P': 'print', 'Mod+F': 'find', 'Mod+Enter': 'a page break or send',
  'Mod+D': 'microphone in calls', 'Mod+E': 'camera in calls', 'Mod+Alt+M': 'a comment',
};

// A key press as a combo: "Mod+Shift+K", "G", "?".
export function comboOf(e: KeyboardEvent): string {
  if (['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'CapsLock'].includes(e.key)) return '';
  // Letters and numbers by their place on the keyboard, so Alt (⌥ on a Mac) doesn't change them.
  const code = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit[0-9]$/.test(e.code) ? e.code.slice(5) : '';
  const single = e.key.length === 1;
  const k = code || (single ? e.key.toUpperCase() : e.key === ' ' ? 'Space' : e.key.replace(/^Arrow/, ''));
  const shift = e.shiftKey && (!single || !!code);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  return [mod && 'Mod', e.altKey && 'Alt', shift && 'Shift', k].filter(Boolean).join('+');
}
export const label = (combo: string) => combo.split(' ').map(keyLabel).join(' then ');
export function problemWith(combo: string, id: CmdId, keys: Record<string, string>): string {
  if (!combo) return '';
  const first = combo.split(' ')[0];
  if (RESERVED.has(first)) return `${keyLabel(first)} belongs to your browser, so no web page can use it. Try another key, or two keys one after the other, such as G then a letter.`;
  if (TAKEN[combo]) return `${keyLabel(combo)} is already used for ${TAKEN[combo]}.`;
  if (combo.split(' ').length === 1 && !combo.includes('Mod') && !combo.includes('Alt') && /^[A-Z0-9?]$|^Shift\+[A-Z]$/.test(combo)) return 'A single letter would get in the way of typing. Add Ctrl (⌘) or use two keys one after the other.';
  const other = COMMANDS.find((c) => c.id !== id && (keys[c.id] ?? c.def) === combo);
  if (other) return `${label(combo)} is already used for ${other.group === 'Go to' ? 'going to ' + other.label : other.label.toLowerCase()}.`;
  const prefix = COMMANDS.find((c) => c.id !== id && (keys[c.id] ?? c.def).split(' ')[0] === combo);
  if (prefix) return `${label(combo)} starts other shortcuts, such as ${label(keys[prefix.id] ?? prefix.def)}.`;
  return '';
}

const LOCAL = 'll.keys';
let mine: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}'); } catch { return {}; } })();
const listeners = new Set<(k: Record<string, string>) => void>();
const publish = () => { try { localStorage.setItem(LOCAL, JSON.stringify(mine)); } catch { /* fine */ } listeners.forEach((f) => f(mine)); };
export const keysNow = () => mine;
export const keyFor = (id: CmdId) => mine[id] || COMMANDS.find((c) => c.id === id)!.def;
export function useKeys() {
  const [k, setK] = useState(mine);
  useEffect(() => { listeners.add(setK); return () => void listeners.delete(setK); }, []);
  return k;
}
// The teacher's own keys, from their profile when they sign in.
export async function loadKeys(uid: string) {
  try {
    const d = await getDoc(doc(db, 'users', uid));
    const k = d.data()?.keys;
    if (k && typeof k === 'object') { mine = { ...k }; publish(); }
  } catch { /* the device's copy will do */ }
}
export async function setKey(id: CmdId, combo: string | null) {
  const def = COMMANDS.find((c) => c.id === id)!.def;
  mine = { ...mine };
  if (!combo || combo === def) delete mine[id];
  else mine[id] = combo;
  publish();
  const uid = auth.currentUser?.uid;
  if (uid) await updateDoc(doc(db, 'users', uid), { keys: mine }).catch(() => {});
}
export async function resetKeys() {
  mine = {};
  publish();
  const uid = auth.currentUser?.uid;
  if (uid) await updateDoc(doc(db, 'users', uid), { keys: {} }).catch(() => {});
}

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { arrayUnion, doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { newId } from './tasks';
import { useAuth } from './auth';

// What people do in ELT Suite, for super admins (Super Admin → Activity).
// Teachers: each visit, every page they open and everything they click (what it was, never what
// they typed). Learners: only when they came, nothing they do. Kept 90 days (scripts/space.mjs).
// usage/{uid}: a summary (last visit, how many); usage/{uid}/visits/{id}: one visit.

export type ActEv = { t: number; k: 'in' | 'page' | 'click'; p?: string; l?: string };
export type Visit = { id: string; start: number; last: number; device: string; role: 'teacher' | 'learner'; events: ActEv[]; n: number };

const MAX = 1500; // events in one visit's document before a new one starts
let uid = '';
let role: 'teacher' | 'learner' = 'teacher';
let vid = '';
let count = 0;
let buf: ActEv[] = [];
let timer = 0;
let off: (() => void) | null = null;

function device() {
  const u = navigator.userAgent;
  const os = /iPhone|iPad/.test(u) ? 'iPhone or iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /CrOS/.test(u) ? 'Chromebook' : /Linux/.test(u) ? 'Linux' : 'a computer';
  const br = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'a browser';
  return `${br} on ${os}${window.innerWidth < 640 ? ', phone size' : ''}`;
}
const visitRef = () => doc(db, 'usage', uid, 'visits', vid);
const path = () => location.pathname + (location.search.includes('tab=') ? '?' + new URLSearchParams(location.search).get('tab') : '');

async function newVisit(first: ActEv[]) {
  vid = Date.now().toString(36) + newId();
  count = first.length;
  const now = Date.now();
  await setDoc(visitRef(), { start: now, last: now, device: device(), role, events: first, n: first.length });
  await setDoc(doc(db, 'usage', uid), { last: now, visits: increment(1), role, at: serverTimestamp() }, { merge: true });
}

function flush() {
  window.clearTimeout(timer);
  timer = 0;
  if (!uid || !vid || !buf.length) return;
  const evs = buf;
  buf = [];
  if (count + evs.length > MAX) {
    void newVisit(evs).catch(() => {});
    return;
  }
  count += evs.length;
  void updateDoc(visitRef(), { events: arrayUnion(...evs), last: Date.now(), n: increment(evs.length) }).catch(() => {});
  void setDoc(doc(db, 'usage', uid), { last: Date.now() }, { merge: true }).catch(() => {});
}
function note(e: ActEv) {
  if (!uid || role !== 'teacher') return;
  buf.push(e);
  if (buf.length >= 40) flush();
  else if (!timer) timer = window.setTimeout(flush, 15000);
}

// What was clicked, in words: its label, never what was typed into it.
const PICK = 'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="switch"], [role="option"], summary, label, input, select, textarea, [contenteditable="true"], [data-sel]';
function labelOf(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const typed = tag === 'textarea' || el.isContentEditable || (tag === 'input' && !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type));
  const name = el.getAttribute('aria-label') || el.getAttribute('data-tip') || el.getAttribute('title') || (typed ? el.getAttribute('placeholder') : '') || (typed ? '' : el.innerText);
  const clean = (name || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const kind = typed ? 'text box' : tag === 'a' ? 'link' : tag === 'select' ? 'list' : tag === 'input' ? (el as HTMLInputElement).type : '';
  return [kind, clean].filter(Boolean).join(': ') || tag;
}
function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.(PICK) as HTMLElement | null;
  if (!el || el.closest('[data-private]')) return;
  note({ t: Date.now(), k: 'click', p: path(), l: labelOf(el) });
}

export function startActivity(u: string, r: 'teacher' | 'learner') {
  if (uid === u) return;
  stopActivity();
  uid = u;
  role = r;
  void newVisit([{ t: Date.now(), k: 'in', p: path() }]).catch(() => (uid = ''));
  if (r !== 'teacher') return;
  const hide = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('pagehide', flush);
  off = () => (document.removeEventListener('click', onClick, true), document.removeEventListener('visibilitychange', hide), window.removeEventListener('pagehide', flush));
}
export function stopActivity() {
  flush();
  off?.();
  off = null;
  uid = '';
  vid = '';
}

// Mounted once inside the router: starts with the signed-in person and notes each page.
export function UsageWatch() {
  const { user, profile } = useAuth();
  const { pathname, search } = useLocation();
  const r = profile?.role === 'learner' ? 'learner' : profile?.role === 'teacher' ? 'teacher' : null;
  useEffect(() => {
    if (user && r) startActivity(user.uid, r);
    else if (!user) stopActivity();
  }, [user?.uid, r]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (vid) note({ t: Date.now(), k: 'page', p: path() });
  }, [pathname, search]);
  return null;
}

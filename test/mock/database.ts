import { load, persist, subscribe } from './store';
type Ref = { path: string };
const tree = () => load<Record<string, unknown>>('mockrtdb', {});
const parts = (p: string) => p.split('/').filter(Boolean);
function getAt(t: Record<string, unknown>, p: string) {
  let cur: unknown = t;
  for (const k of parts(p)) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;
  return cur;
}
function setAt(t: Record<string, unknown>, p: string, v: unknown) {
  const ks = parts(p);
  let cur = t;
  for (const k of ks.slice(0, -1)) cur = (cur[k] && typeof cur[k] === 'object' ? cur[k] : (cur[k] = {})) as Record<string, unknown>;
  if (v === null || v === undefined) delete cur[ks[ks.length - 1]];
  else cur[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
}
export const getDatabase = () => ({});
export const ref = (_db: unknown, path = '') => ({ path });
export function onValue(r: Ref, cb: (s: { val: () => unknown; exists: () => boolean }) => void) {
  let last = '';
  const fire = () => {
    const v = getAt(tree(), r.path) ?? null;
    const j = JSON.stringify(v);
    if (j === last) return;
    last = j;
    cb({ val: () => (v === null ? null : JSON.parse(j)), exists: () => v !== null });
  };
  setTimeout(fire, 0);
  return subscribe(fire);
}
export async function set(r: Ref, v: unknown) {
  const t = tree();
  setAt(t, r.path, v);
  persist('mockrtdb', t);
}
export async function update(r: Ref, v: Record<string, unknown>) {
  const t = tree();
  for (const [k, x] of Object.entries(v)) setAt(t, r.path + '/' + k, x);
  persist('mockrtdb', t);
}
export async function remove(r: Ref) {
  return set(r, null);
}
export const onDisconnect = () => ({ set: async () => {}, remove: async () => {}, update: async () => {}, cancel: async () => {} });
export const serverTimestamp = () => Date.now();
export async function get(r: Ref) {
  const v = getAt(tree(), r.path) ?? null;
  return { val: () => (v === null ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== null };
}

// Lists: push keys, child events and transactions, for the shared documents.
let pushN = 0;
export function push(r: Ref, v?: unknown) {
  const key = Date.now().toString(36) + (pushN++).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
  const child = { path: r.path + '/' + key, key };
  if (v !== undefined) void set(child, v);
  return child;
}
type Snap = { key: string | null; val: () => unknown; exists: () => boolean };
function childWatch(r: Ref, kind: 'added' | 'changed' | 'removed', cb: (s: Snap) => void) {
  let last: Record<string, string> = {};
  let first = true;
  const fire = () => {
    const v = (getAt(tree(), r.path) ?? {}) as Record<string, unknown>;
    const now: Record<string, string> = {};
    for (const [k, x] of Object.entries(v)) now[k] = JSON.stringify(x);
    for (const k of Object.keys(now).sort()) {
      const snap = { key: k, val: () => JSON.parse(now[k]), exists: () => true };
      if (kind === 'added' && !(k in last)) cb(snap);
      if (kind === 'changed' && !first && k in last && last[k] !== now[k]) cb(snap);
    }
    if (kind === 'removed') for (const k of Object.keys(last)) if (!(k in now)) cb({ key: k, val: () => JSON.parse(last[k]), exists: () => false });
    last = now;
    first = false;
  };
  setTimeout(fire, 0);
  return subscribe(fire);
}
export const onChildAdded = (r: Ref, cb: (s: Snap) => void) => childWatch(r, 'added', cb);
export const onChildChanged = (r: Ref, cb: (s: Snap) => void) => childWatch(r, 'changed', cb);
export const onChildRemoved = (r: Ref, cb: (s: Snap) => void) => childWatch(r, 'removed', cb);
export async function runTransaction(r: Ref, f: (cur: unknown) => unknown) {
  const cur = getAt(tree(), r.path) ?? null;
  const next = f(cur === null ? null : JSON.parse(JSON.stringify(cur)));
  if (next === undefined) return { committed: false, snapshot: { val: () => cur } };
  await set(r, next);
  return { committed: true, snapshot: { val: () => next } };
}
export type DatabaseReference = Ref;

import { load, persist, subscribe } from './store';

// In-memory (localStorage) Firestore stand-in for screenshots and multi-tab tests.
type Data = Record<string, unknown>;
const KEY = 'mockfs';
const all = () => load<Record<string, Data>>(KEY, {});

export class Timestamp {
  constructor(public seconds: number, public nanoseconds = 0) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
}
const SENT = '__mock';
export const serverTimestamp = () => ({ [SENT]: 'ts' });
export const arrayUnion = (...v: unknown[]) => ({ [SENT]: 'union', v });
export const arrayRemove = (...v: unknown[]) => ({ [SENT]: 'remove', v });
export const increment = (n: number) => ({ [SENT]: 'inc', n });
export const deleteField = () => ({ [SENT]: 'del' });

function revive(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const o = v as Data;
    if ('__ts' in o) return Timestamp.fromMillis(o.__ts as number);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, revive(x)]));
  }
  return v;
}
function freeze(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(freeze);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Data).filter(([, x]) => x !== undefined).map(([k, x]) => [k, freeze(x)]));
  return v;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function apply(prev: unknown, v: unknown): unknown {
  if (v && typeof v === 'object' && SENT in (v as Data)) {
    const s = v as Data;
    if (s[SENT] === 'ts') return { __ts: Date.now() };
    if (s[SENT] === 'union') return [...(Array.isArray(prev) ? prev : []), ...(s.v as unknown[]).map(freeze).filter((x) => !(Array.isArray(prev) && prev.some((p) => eq(p, x))))];
    if (s[SENT] === 'remove') return (Array.isArray(prev) ? prev : []).filter((p) => !(s.v as unknown[]).some((x) => eq(freeze(x), p)));
    if (s[SENT] === 'inc') return ((prev as number) ?? 0) + (s.n as number);
  }
  return freeze(v);
}
function mergeInto(target: Data, patch: Data, deep: boolean) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && (v as Data)[SENT] === 'del') { delete target[k]; continue; }
    if (deep && v && typeof v === 'object' && !Array.isArray(v) && !(SENT in (v as Data)) && !(v instanceof Timestamp)) {
      const t = (target[k] && typeof target[k] === 'object' && !Array.isArray(target[k]) ? target[k] : {}) as Data;
      target[k] = t;
      mergeInto(t, v as Data, true);
    } else target[k] = apply(target[k], v);
  }
}
function setPath(target: Data, dotted: string, v: unknown) {
  const ks = dotted.split('.');
  let cur = target;
  for (const k of ks.slice(0, -1)) cur = (cur[k] && typeof cur[k] === 'object' ? cur[k] : (cur[k] = {})) as Data;
  const last = ks[ks.length - 1];
  if (v && typeof v === 'object' && (v as Data)[SENT] === 'del') delete cur[last];
  else if (v && typeof v === 'object' && !Array.isArray(v) && !(SENT in (v as Data)) && !(v instanceof Timestamp)) { cur[last] = {}; mergeInto(cur[last] as Data, v as Data, true); }
  else cur[last] = apply(cur[last], v);
}

type DocRef = { type: 'document'; path: string; id: string; parent: CollRef; firestore: unknown };
type CollRef = { type: 'collection'; path: string; id: string };
type Q = { type: 'query'; path: string; cons: Constraint[] };
type Constraint = { kind: 'where'; f: string; op: string; v: unknown } | { kind: 'orderBy'; f: string; dir: 'asc' | 'desc' } | { kind: 'limit'; n: number };
const auto = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10);
const mkDoc = (path: string): DocRef => ({ type: 'document', path, id: path.split('/').pop()!, parent: mkColl(path.split('/').slice(0, -1).join('/')), firestore: {} });
const mkColl = (path: string): CollRef => ({ type: 'collection', path, id: path.split('/').pop()! });
const base = (x: unknown) => (x && typeof x === 'object' && 'path' in (x as Data) ? (x as { path: string }).path : '');

export function doc(parent: unknown, ...segs: string[]): DocRef {
  const b = base(parent);
  if (!segs.length) return mkDoc(b + '/' + auto());
  return mkDoc([b, ...segs].filter(Boolean).join('/'));
}
export function collection(parent: unknown, ...segs: string[]): CollRef {
  return mkColl([base(parent), ...segs].filter(Boolean).join('/'));
}
export const where = (f: string, op: string, v: unknown): Constraint => ({ kind: 'where', f, op, v });
export const orderBy = (f: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'orderBy', f, dir });
export const limit = (n: number): Constraint => ({ kind: 'limit', n });
export const query = (c: CollRef | Q, ...cons: Constraint[]): Q => ({ type: 'query', path: c.path, cons: [...('cons' in c ? c.cons : []), ...cons] });

const field = (d: Data, f: string) => f.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Data)[k] : undefined), d);
const cmpVal = (x: unknown) => (x && typeof x === 'object' && '__ts' in (x as Data) ? (x as Data).__ts : x) as number | string;
function match(d: Data, c: Constraint) {
  if (c.kind !== 'where') return true;
  const x = field(d, c.f);
  const v = freeze(c.v);
  switch (c.op) {
    case '==': return eq(x, v);
    case '!=': return x !== undefined && !eq(x, v);
    case 'in': return (v as unknown[]).some((y) => eq(y, x));
    case 'array-contains': return Array.isArray(x) && x.some((y) => eq(y, v));
    case 'array-contains-any': return Array.isArray(x) && x.some((y) => (v as unknown[]).some((z) => eq(y, z)));
    case '<': return cmpVal(x) < cmpVal(v);
    case '<=': return cmpVal(x) <= cmpVal(v);
    case '>': return cmpVal(x) > cmpVal(v);
    case '>=': return cmpVal(x) >= cmpVal(v);
  }
  return true;
}
const snapDoc = (path: string, d?: Data) => ({
  id: path.split('/').pop()!,
  ref: mkDoc(path),
  exists: () => !!d,
  data: () => (d ? (revive(JSON.parse(JSON.stringify(d))) as Data) : undefined),
  get: (f: string) => (d ? revive(field(d, f)) : undefined),
  metadata: { hasPendingWrites: false, fromCache: false },
});
function runQuery(q: Q | CollRef) {
  const store = all();
  const depth = q.path.split('/').length + 1;
  let docs = Object.entries(store).filter(([p]) => p.startsWith(q.path + '/') && p.split('/').length === depth);
  const cons = 'cons' in q ? q.cons : [];
  for (const c of cons) docs = docs.filter(([, d]) => match(d, c));
  for (const c of [...cons].reverse()) if (c.kind === 'orderBy') docs.sort(([, a], [, b]) => { const x = cmpVal(field(a, c.f)); const y = cmpVal(field(b, c.f)); return (x > y ? 1 : x < y ? -1 : 0) * (c.dir === 'desc' ? -1 : 1); });
  const lim = cons.find((c) => c.kind === 'limit') as { n: number } | undefined;
  if (lim) docs = docs.slice(0, lim.n);
  const list = docs.map(([p, d]) => snapDoc(p, d));
  return { docs: list, empty: !list.length, size: list.length, forEach: (f: (d: unknown) => void) => list.forEach(f), metadata: { hasPendingWrites: false, fromCache: false }, docChanges: () => [] };
}

export async function getDoc(r: DocRef) { return snapDoc(r.path, all()[r.path]); }
export async function getDocs(q: Q | CollRef) { return runQuery(q); }
export const getDocFromServer = getDoc;
export function onSnapshot(target: DocRef | Q | CollRef, ...args: unknown[]) {
  const fns = args.filter((a) => typeof a === 'function') as ((s: unknown) => void)[];
  const next = fns[0];
  let last = '';
  const fire = () => {
    const s = target.type === 'document' ? snapDoc(target.path, all()[target.path]) : runQuery(target);
    const key = target.type === 'document' ? JSON.stringify(all()[target.path] ?? null) : JSON.stringify((s as ReturnType<typeof runQuery>).docs.map((d) => [d.id, d.data()]));
    if (key === last) return;
    last = key;
    next(s);
  };
  setTimeout(fire, 0);
  return subscribe(fire);
}

function write(ops: ((s: Record<string, Data>) => void)[]) {
  const s = all();
  ops.forEach((o) => o(s));
  persist(KEY, s);
}
const setOp = (r: DocRef, d: Data, opt?: { merge?: boolean }) => (s: Record<string, Data>) => {
  const t: Data = opt?.merge ? { ...(s[r.path] ?? {}) } : {};
  mergeInto(t, d, !!opt?.merge);
  s[r.path] = t;
};
const updOp = (r: DocRef, d: Data) => (s: Record<string, Data>) => {
  if (!s[r.path]) throw new Error('No document to update: ' + r.path);
  const t = { ...s[r.path] };
  for (const [k, v] of Object.entries(d)) setPath(t, k, v);
  s[r.path] = t;
};
const delOp = (r: DocRef) => (s: Record<string, Data>) => void delete s[r.path];
export async function setDoc(r: DocRef, d: Data, opt?: { merge?: boolean }) { write([setOp(r, d, opt)]); }
export async function updateDoc(r: DocRef, d: Data) { write([updOp(r, d)]); }
export async function deleteDoc(r: DocRef) { write([delOp(r)]); }
export async function addDoc(c: CollRef, d: Data) { const r = doc(c); write([setOp(r, d)]); return r; }
export function writeBatch() {
  const ops: ((s: Record<string, Data>) => void)[] = [];
  const b = {
    set: (r: DocRef, d: Data, o?: { merge?: boolean }) => (ops.push(setOp(r, d, o)), b),
    update: (r: DocRef, d: Data) => (ops.push(updOp(r, d)), b),
    delete: (r: DocRef) => (ops.push(delOp(r)), b),
    commit: async () => write(ops),
  };
  return b;
}
export async function runTransaction<T>(_db: unknown, fn: (t: unknown) => Promise<T>) {
  const ops: ((s: Record<string, Data>) => void)[] = [];
  const t = { get: getDoc, set: (r: DocRef, d: Data, o?: { merge?: boolean }) => (ops.push(setOp(r, d, o)), t), update: (r: DocRef, d: Data) => (ops.push(updOp(r, d)), t), delete: (r: DocRef) => (ops.push(delOp(r)), t) };
  const out = await fn(t);
  write(ops);
  return out;
}
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const enableNetwork = async () => {};
export const disableNetwork = async () => {};
export type DocumentData = Data;
export type DocumentReference = DocRef;

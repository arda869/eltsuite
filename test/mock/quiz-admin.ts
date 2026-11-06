// The admin SDK's shape over the mock Firestore and Realtime Database, for the quiz service.
import * as fs from './firestore';
import * as rt from './database';

type Data = Record<string, unknown>;
const snap = async (path: string) => {
  const s = await fs.getDoc(fs.doc({}, path) as never);
  const r = docRef(path);
  return { exists: (s as { exists: () => boolean }).exists(), id: r.id, ref: r, data: () => (s as { data: () => Data | undefined }).data() };
};
function docRef(path: string): any {
  return {
    path,
    id: path.split('/').pop(),
    get: () => snap(path),
    set: (v: Data, o?: { merge?: boolean; mergeFields?: string[] }) => setDoc(path, v, o),
    update: (v: Data) => fs.updateDoc(fs.doc({}, path) as never, v),
    create: async (v: Data) => {
      if ((await snap(path)).exists) throw Error('Already exists');
      await fs.setDoc(fs.doc({}, path) as never, v);
    },
    collection: (c: string) => colRef(path + '/' + c),
  };
}
async function setDoc(path: string, v: Data, o?: { merge?: boolean; mergeFields?: string[] }) {
  const r = fs.doc({}, path) as never;
  if (o?.mergeFields) {
    const patch: Data = {};
    for (const f of o.mergeFields) patch[f] = f.split('.').reduce<unknown>((x, k) => (x as Data)?.[k], v);
    if ((await snap(path)).exists) return fs.updateDoc(r, patch);
    const nested: Data = {};
    for (const [k, x] of Object.entries(patch)) {
      const ks = k.split('.');
      let cur = nested;
      for (const p of ks.slice(0, -1)) cur = (cur[p] ??= {}) as Data;
      cur[ks[ks.length - 1]] = x;
    }
    return fs.setDoc(r, nested);
  }
  return fs.setDoc(r, v, o?.merge ? { merge: true } : undefined);
}
const colRef = (path: string): any => ({
  doc: (id?: string) => docRef(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
  where: (f: string, op: string, v: unknown) => ({ get: async () => wrap(await fs.getDocs(fs.query(fs.collection({}, path) as never, fs.where(f, op, v)))) }),
  get: async () => wrap(await fs.getDocs(fs.collection({}, path) as never)),
});
const wrap = (s: unknown) => ({ docs: (s as { docs: { id: string; ref: { path: string }; data: () => Data }[] }).docs.map((d) => ({ id: d.id, ref: docRef(d.ref.path), data: () => d.data(), exists: true })) });

export const adminDb = {
  doc: docRef,
  collection: colRef,
  batch: () => {
    const ops: (() => Promise<unknown>)[] = [];
    return {
      set: (r: { path: string }, v: Data, o?: { merge?: boolean; mergeFields?: string[] }) => ops.push(() => setDoc(r.path, v, o)),
      update: (r: { path: string }, v: Data) => ops.push(() => fs.updateDoc(fs.doc({}, r.path) as never, v)),
      delete: (r: { path: string }) => ops.push(() => fs.deleteDoc(fs.doc({}, r.path) as never)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  },
};

const rref = (path: string): any => ({
  child: (c: string) => rref(path + '/' + c),
  get: () => rt.get(rt.ref({}, path)),
  set: async (v: unknown) => {
    if (v && typeof v === 'object' && '__inc' in (v as Data)) {
      const cur = Number((await rt.get(rt.ref({}, path))).val()) || 0;
      return rt.set(rt.ref({}, path), cur + Number((v as Data).__inc));
    }
    return rt.set(rt.ref({}, path), v);
  },
  update: (v: Data) => rt.update(rt.ref({}, path), v),
  remove: () => rt.remove(rt.ref({}, path)),
});
export const adminRtdb = { ref: rref };

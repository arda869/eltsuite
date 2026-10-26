import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { get, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update, type DatabaseReference } from 'firebase/database';
import { rtdb } from '../lib/firebase';

// Live shared documents: a Yjs document kept in the Realtime Database. Every change is a small
// update appended to a list; a client that finds the list long folds it into one snapshot.
// Who is in the document, and where their cursor is, travels the same way (awareness).

const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const collabRef = (key: string, sub = '') => ref(rtdb, `collab/${key.replace(/[.#$[\]]/g, '_')}${sub ? '/' + sub : ''}`);

export class RtdbProvider {
  doc: Y.Doc;
  awareness: Awareness;
  synced = false;
  private key: string;
  private uid: string;
  private offs: (() => void)[] = [];
  private seen = new Set<string>();
  private pending: Uint8Array[] = [];
  private timer = 0;
  private onSynced: ((p: RtdbProvider) => void)[] = [];
  private awRef: DatabaseReference;
  private dead = false;

  constructor(key: string, doc: Y.Doc, uid: string) {
    this.key = key;
    this.doc = doc;
    this.uid = uid;
    this.awareness = new Awareness(doc);
    this.awRef = collabRef(key, `aw/${doc.clientID}`);
    doc.on('update', this.onUpdate);
    this.awareness.on('update', this.onAwareness);
    void this.start();
  }

  whenSynced(f: (p: RtdbProvider) => void) {
    if (this.synced) f(this);
    else this.onSynced.push(f);
  }

  private async start() {
    const [snap, list] = await Promise.all([get(collabRef(this.key, 'snap')).catch(() => null), get(collabRef(this.key, 'u')).catch(() => null)]);
    if (this.dead) return;
    Y.transact(
      this.doc,
      () => {
        const s = snap?.val() as { s?: string } | null;
        if (s?.s) Y.applyUpdate(this.doc, unb64(s.s), this);
        const all = (list?.val() ?? {}) as Record<string, { u: string }>;
        for (const [k, v] of Object.entries(all)) {
          this.seen.add(k);
          if (v?.u) Y.applyUpdate(this.doc, unb64(v.u), this);
        }
      },
      this,
    );
    this.synced = true;
    this.onSynced.splice(0).forEach((f) => f(this));
    // New changes from everyone else.
    this.offs.push(
      onChildAdded(collabRef(this.key, 'u'), (c) => {
        if (!c.key || this.seen.has(c.key)) return;
        this.seen.add(c.key);
        const v = c.val() as { u?: string; by?: string; c?: number };
        if (v?.u && v.c !== this.doc.clientID) Y.applyUpdate(this.doc, unb64(v.u), this);
      }),
    );
    // Fold a long list into one snapshot, keeping only what was read.
    if (this.seen.size > 250) void this.compact();
    // Who is here.
    const aw = collabRef(this.key, 'aw');
    const apply = (c: { key: string | null; val: () => unknown }) => {
      const v = c.val() as { a?: string } | null;
      if (c.key && Number(c.key) !== this.doc.clientID && v?.a) applyAwarenessUpdate(this.awareness, unb64(v.a), this);
    };
    this.offs.push(onChildAdded(aw, apply), onChildChanged(aw, apply), onChildRemoved(aw, (c) => c.key && removeAwarenessStates(this.awareness, [Number(c.key)], this)));
    onDisconnect(this.awRef).remove().catch(() => {});
    this.onAwareness({ added: [], updated: [this.doc.clientID], removed: [] }, 'local');
  }

  private onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin === this || this.dead) return;
    this.pending.push(u);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(this.flush, 120); // typing sends a few updates a second, not one per key
  };

  private flush = () => {
    if (!this.pending.length) return;
    const u = this.pending.length === 1 ? this.pending[0] : Y.mergeUpdates(this.pending);
    this.pending = [];
    const r = push(collabRef(this.key, 'u'));
    if (r.key) this.seen.add(r.key);
    set(r, { u: b64(u), by: this.uid, c: this.doc.clientID, at: serverTimestamp() }).catch((e) => console.error('collab', e));
  };

  private onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this || this.dead) return;
    if (![...added, ...updated, ...removed].includes(this.doc.clientID)) return;
    set(this.awRef, { a: b64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])), at: serverTimestamp() }).catch(() => {});
  };

  async compact() {
    const keys = [...this.seen];
    const patch: Record<string, unknown> = { snap: { s: b64(Y.encodeStateAsUpdate(this.doc)), at: serverTimestamp(), by: this.uid } };
    keys.forEach((k) => (patch['u/' + k] = null));
    await update(collabRef(this.key), patch).catch(() => {});
  }

  destroy() {
    this.flush();
    this.dead = true;
    window.clearTimeout(this.timer);
    this.offs.forEach((f) => f());
    this.doc.off('update', this.onUpdate);
    this.awareness.off('update', this.onAwareness);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    remove(this.awRef).catch(() => {});
    this.awareness.destroy();
  }
}

// The first person to open an empty document fills it with the teacher's starting text.
export async function claimStart(key: string) {
  const r = await runTransaction(collabRef(key, 'init'), (cur) => (cur ? undefined : { at: Date.now() })).catch(() => null);
  return !!r?.committed;
}

// Live flags for a document: locked by the teacher, shared with the group.
export function watchFlags(key: string, cb: (f: { lock?: boolean; shared?: boolean }) => void) {
  return onValue(collabRef(key, 'flags'), (s) => cb((s.val() as { lock?: boolean; shared?: boolean }) ?? {}));
}
export const setFlag = (key: string, k: 'lock' | 'shared', v: boolean) => set(collabRef(key, `flags/${k}`), v || null);

import { useEffect, useState } from 'react';
import { collection, doc, increment, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

// Support tickets: an organisation's admins (and the owner) tell us what is wrong or what they
// would like changed, with screenshots. The owner sees every ticket; an admin sees their
// organisation's. scripts/tickets.mjs copies the open ones, screenshots and all, to the
// support-tickets branch, where they are read and worked on; it can also answer one.
//
// tickets/{id}              the ticket
// tickets/{id}/shots/{sid}  one screenshot, as a data URL (no file storage on the free plan)
// tickets/{id}/notes/{nid}  the conversation under it

export type TicketStatus = 'open' | 'doing' | 'done';
export type TicketKind = 'bug' | 'change' | 'question';
export type TicketUrgency = 'low' | 'normal' | 'urgent';
export type Ticket = {
  id: string;
  title: string;
  body: string;
  kind: TicketKind;
  urgency: TicketUrgency;
  status: TicketStatus;
  by: string;
  byName: string;
  byEmail: string;
  org: string | null;
  orgName: string;
  where: string; // the page they were on, or the app it is about
  shots: number;
  notes: number;
  escalated?: { thread: string; at: number; byName: string }; // handed to Claude by a super admin
  at: number;
  updatedAt: number;
};
export type Shot = { id: string; data: string; w: number; h: number; note: string | null; at: number };
export type Note = { id: string; by: string; byName: string; text: string; at: number; status?: TicketStatus };

export const STATUSES: { k: TicketStatus; label: string }[] = [
  { k: 'open', label: 'Open' },
  { k: 'doing', label: 'Being worked on' },
  { k: 'done', label: 'Done' },
];
export const KINDS: { k: TicketKind; label: string }[] = [
  { k: 'bug', label: 'Something is wrong' },
  { k: 'change', label: 'A change or new idea' },
  { k: 'question', label: 'A question' },
];
export const URGENCIES: { k: TicketUrgency; label: string }[] = [
  { k: 'low', label: 'When there’s time' },
  { k: 'normal', label: 'Soon' },
  { k: 'urgent', label: 'Urgent' },
];
export const statusLabel = (s: TicketStatus) => STATUSES.find((x) => x.k === s)?.label ?? s;
export const kindLabel = (k: TicketKind) => KINDS.find((x) => x.k === k)?.label ?? k;
export const MAX_SHOTS = 10;

// An id that reads well when someone mentions it: the day, then four letters.
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rand = (n: number) => Array.from({ length: n }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
const newTicketId = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand(4)}`;
};

const ticketOf = (id: string, d: Record<string, unknown>): Ticket => ({ shots: 0, notes: 0, where: '', orgName: '', byEmail: '', kind: 'bug', urgency: 'normal', ...(d as Partial<Ticket>), id }) as Ticket;

// The owner sees every ticket; an admin, the tickets of the organisations they run.
export function useTickets(owner: boolean, orgIds: string[] | null) {
  const [list, setList] = useState<Ticket[] | null>(null);
  const key = orgIds?.join() ?? '';
  useEffect(() => {
    if (!owner && orgIds === null) return;
    const qs = owner ? [collection(db, 'tickets')] : (orgIds ?? []).map((o) => query(collection(db, 'tickets'), where('org', '==', o)));
    if (!qs.length) return setList([]);
    const parts = new Map<number, Ticket[]>();
    const offs = qs.map((q, i) =>
      onSnapshot(
        q,
        (s) => {
          parts.set(i, s.docs.map((d) => ticketOf(d.id, d.data())));
          setList([...parts.values()].flat().sort((a, b) => b.updatedAt - a.updatedAt));
        },
        () => (parts.set(i, []), setList([...parts.values()].flat())),
      ),
    );
    return () => offs.forEach((o) => o());
  }, [owner, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

export function useTicketParts(id: string) {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  useEffect(() => {
    const a = onSnapshot(
      collection(db, 'tickets', id, 'shots'),
      (s) => setShots(s.docs.map((d) => ({ ...(d.data() as Omit<Shot, 'id'>), note: (d.data().note as string | undefined) ?? null, id: d.id })).sort((x, y) => x.at - y.at || x.id.localeCompare(y.id))),
      () => setShots([]),
    );
    const b = onSnapshot(
      collection(db, 'tickets', id, 'notes'),
      (s) => setNotes(s.docs.map((d) => ({ ...(d.data() as Omit<Note, 'id'>), id: d.id })).sort((x, y) => x.at - y.at)),
      () => setNotes([]),
    );
    return () => (a(), b());
  }, [id]);
  return { shots, notes };
}

// A screenshot small enough for one database document: sharp PNG when it fits, else JPEG, and
// smaller until it does.
const LIMIT = 900_000;
export type NewShot = { data: string; w: number; h: number };
export async function toShot(f: Blob): Promise<NewShot> {
  const bmp = await createImageBitmap(f);
  let max = 2400;
  for (let i = 0; i < 6; i++) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    if (png.length < LIMIT) return { data: png, w: c.width, h: c.height };
    const jpg = c.toDataURL('image/jpeg', 0.85);
    if (jpg.length < LIMIT) return { data: jpg, w: c.width, h: c.height };
    max = Math.round(Math.max(c.width, c.height) * 0.75);
  }
  throw new Error('This picture is too big. Try a smaller one.');
}

async function saveShots(id: string, uid: string, shots: NewShot[], note: string | null) {
  const at = Date.now();
  // One at a time: a ticket's screenshots can come to several megabytes.
  for (const [i, s] of shots.entries()) await setDoc(doc(db, 'tickets', id, 'shots', `${at}-${i}`), { ...s, by: uid, note, at: at + i });
}

export async function openTicket(t: Omit<Ticket, 'id' | 'status' | 'shots' | 'notes' | 'at' | 'updatedAt'>, shots: NewShot[]) {
  const id = newTicketId();
  const now = Date.now();
  await setDoc(doc(db, 'tickets', id), { ...t, status: 'open', shots: shots.length, notes: 0, at: now, updatedAt: now });
  await saveShots(id, t.by, shots, null);
  return id;
}

export async function addNote(t: Ticket, me: { uid: string; name: string }, text: string, shots: NewShot[], status?: TicketStatus) {
  const nid = `${Date.now()}-${rand(4)}`;
  const at = Date.now();
  await setDoc(doc(db, 'tickets', t.id, 'notes', nid), { by: me.uid, byName: me.name, text, at, ...(status && status !== t.status ? { status } : {}) });
  if (shots.length) await saveShots(t.id, me.uid, shots, nid);
  await updateDoc(doc(db, 'tickets', t.id), { notes: increment(1), shots: increment(shots.length), updatedAt: at, ...(status ? { status } : {}) });
}

import { useEffect, useState } from 'react';
import { collection, deleteDoc, deleteField, doc, getDoc, increment, onSnapshot, query, setDoc, updateDoc, where, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';

// Invitation codes: ELT Suite is open by invitation for now. A super admin makes a code (for
// anyone, or for an organisation), and an organisation's admins make codes for their organisation.
// A new teacher types the code in on the sign-in page ("I have an invitation") to make their
// account; a code for an organisation also makes them one of its teachers. A code can be used a
// set number of times, until a date, and only by one email if it names one. See firestore.rules.

export type InviteCode = {
  code: string;
  org?: string;
  orgName?: string;
  email?: string; // only this email can use it; the mail job sends it there
  name?: string;
  maxUses: number;
  uses: number;
  usedBy?: Record<string, { name: string; email: string; at: number }>;
  expires?: number; // ms; 0 or missing: no end
  off?: boolean;
  by: string;
  byName: string;
  at: number;
  mailed?: number;
};

// Letters and digits that cannot be mistaken for each other: no 0/O, 1/I/L.
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ABC[b % ABC.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
// What a person types, made into the stored form: capitals, one dash in the middle.
export function cleanCode(typed: string) {
  const s = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export const DAY_MS = 864e5;

export async function makeCode(o: { org?: { id: string; name: string } | null; email?: string; name?: string; maxUses: number; days: number; me: { uid: string; name: string } }) {
  const code = newCode();
  const email = (o.email ?? '').trim().toLowerCase();
  await setDoc(doc(db, 'inviteCodes', code), {
    ...(o.org ? { org: o.org.id, orgName: o.org.name } : {}),
    ...(email ? { email } : {}),
    ...((o.name ?? '').trim() ? { name: o.name!.trim().slice(0, 80) } : {}),
    maxUses: Math.max(1, Math.min(500, Math.round(o.maxUses) || 1)),
    uses: 0,
    usedBy: {},
    expires: o.days > 0 ? Date.now() + o.days * DAY_MS : 0,
    by: o.me.uid,
    byName: o.me.name.slice(0, 80),
    at: Date.now(),
  });
  return code;
}

// Every code (a super admin), or one organisation's (its admins).
export function useCodes(on: boolean, orgId?: string | null) {
  const [list, setList] = useState<InviteCode[] | null>(null);
  useEffect(() => {
    if (!on) return;
    const q = orgId ? query(collection(db, 'inviteCodes'), where('org', '==', orgId)) : collection(db, 'inviteCodes');
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as Omit<InviteCode, 'code'>), code: d.id })).sort((a, b) => b.at - a.at)),
      () => setList([]),
    );
  }, [on, orgId]);
  return list;
}

export const setCodeOff = (code: string, off: boolean) => updateDoc(doc(db, 'inviteCodes', code), { off });
export const deleteCode = (code: string) => deleteDoc(doc(db, 'inviteCodes', code));
// The mail job sends it again on its next run (every 15 minutes).
export const resendCode = (code: string) => updateDoc(doc(db, 'inviteCodes', code), { mailed: deleteField() });
export const codeLink = (code: string) => `${window.location.origin}/?code=${encodeURIComponent(code)}`;

// Why a code cannot be used now, or '' when it can.
export function codeProblem(c: InviteCode, email?: string) {
  if (c.off) return 'This invitation code has been turned off.';
  if ((c.uses ?? 0) >= (c.maxUses ?? 1)) return 'This invitation code has been used up.';
  if (c.expires && c.expires < Date.now()) return 'This invitation code has run out.';
  if (c.email && email && c.email !== email.trim().toLowerCase()) return `This invitation code is for ${c.email}.`;
  return '';
}
export const codeState = (c: InviteCode): 'open' | 'used' | 'expired' | 'off' => (c.off ? 'off' : (c.uses ?? 0) >= (c.maxUses ?? 1) ? 'used' : c.expires && c.expires < Date.now() ? 'expired' : 'open');

// Looking a code up, before there is an account (the code is the secret: see firestore.rules).
export async function readCode(typed: string): Promise<InviteCode | null> {
  const code = cleanCode(typed);
  if (code.length < 8) return null;
  const s = await getDoc(doc(db, 'inviteCodes', code)).catch(() => null);
  return s?.exists() ? { ...(s.data() as Omit<InviteCode, 'code'>), code: s.id } : null;
}

// The code a person typed in, kept until their account is made (sign-in with Google leaves the page).
const KEY = 'll.inviteCode';
export const keepCode = (code: string) => {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    /* fine */
  }
};
export const keptCode = () => {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export const forgetCode = () => {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(NAME);
  } catch {
    /* fine */
  }
};
// The name typed on the form, for the profile made the moment the account exists.
const NAME = 'll.newName';
export const keepName = (name: string) => {
  try {
    sessionStorage.setItem(NAME, name.trim().slice(0, 80));
  } catch {
    /* fine */
  }
};
export const keptName = () => {
  try {
    return sessionStorage.getItem(NAME) ?? '';
  } catch {
    return '';
  }
};

// Making the account with the code, in one write: the profile, one use of the code and, for an
// organisation's code, the place in the organisation.
export function spendCode(b: WriteBatch, c: InviteCode, me: { uid: string; name: string; email: string }) {
  b.update(doc(db, 'inviteCodes', c.code), { uses: increment(1), [`usedBy.${me.uid}`]: { name: me.name.slice(0, 80), email: me.email.toLowerCase(), at: Date.now() } });
  if (c.org) {
    b.update(doc(db, 'orgs', c.org), { [`teachers.${me.uid}`]: { name: me.name || c.name || me.email, email: me.email.toLowerCase(), code: c.code } });
    b.set(doc(db, 'accounts', me.uid), { org: c.org, code: c.code });
  }
}

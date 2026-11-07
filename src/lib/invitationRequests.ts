import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc, type Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from './firebase';
import { makeCode, type InviteAccess } from './codes';

// Invitation requests: a teacher asks for an invitation on the public homepage, before they have an
// account. A super admin sees them in Super Admin → Invitation codes and sends an invitation code
// to the email (the mail job emails it), or deletes the request. See firestore.rules.

export type InvitationRequest = {
  id: string;
  name: string;
  email: string;
  place?: string;
  teaches?: string;
  note?: string;
  at: number; // ms
  invited?: string; // the code made for them
  invitedAt?: number;
  invitedBy?: string;
};

export const EMAIL_OK = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export async function askForInvitation(r: { name: string; email: string; place: string; teaches: string; note: string }) {
  await httpsCallable<typeof r, { requested: boolean }>(getFunctions(app, 'us-central1'), 'requestInvitation')(r);
}

const ms = (v: unknown) => (typeof v === 'number' ? v : v && typeof (v as Timestamp).toMillis === 'function' ? (v as Timestamp).toMillis() : Date.now());

// Every request, newest first (super admins only).
export function useInvitationRequests(on: boolean) {
  const [list, setList] = useState<InvitationRequest[] | null>(null);
  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      collection(db, 'invitationRequests'),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as Omit<InvitationRequest, 'id'>), id: d.id, at: ms(d.data().at) })).sort((a, b) => b.at - a.at)),
      () => setList([]),
    );
  }, [on]);
  return list;
}

// Makes a one-person code for their email (emailed within 15 minutes) and marks the request.
export async function inviteFromRequest(r: InvitationRequest, me: { uid: string; name: string }, access: InviteAccess = {}) {
  const code = await makeCode({ email: r.email, name: r.name, maxUses: 1, days: 30, me, ...access });
  await updateDoc(doc(db, 'invitationRequests', r.id), { invited: code, invitedAt: Date.now(), invitedBy: me.name.slice(0, 80) });
  return code;
}

export const deleteInvitationRequest = (id: string) => deleteDoc(doc(db, 'invitationRequests', id));

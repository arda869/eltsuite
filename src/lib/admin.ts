import { useEffect, useState } from 'react';
import { addDoc, collection, deleteField, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { OWNER_EMAIL } from './phonAudio';

// Running ELT Suite: every teacher's account (plan, space, paused or not, which apps they have),
// organisations with their own admins, and switches for the apps. Only the app's owner changes
// these; an organisation's admins see their organisation.

export type Plan = 'free' | 'teacher' | 'school';
export const PLANS: { k: Plan; label: string; gb: number; about: string }[] = [
  { k: 'free', label: 'Free', gb: 1, about: '1 GB, every app' },
  { k: 'teacher', label: 'Teacher', gb: 10, about: '10 GB, for one teacher' },
  { k: 'school', label: 'School', gb: 50, about: '50 GB a teacher, through an organisation' },
];
export type Account = { plan?: Plan; limitGb?: number; suspended?: boolean; org?: string | null; features?: Record<string, boolean>; name?: string; email?: string; note?: string };
// logo: the square mark, for small places; wide: the long logo, for worksheets and invitations.
export type Brand = { color?: string; logo?: string; wide?: string };
// A logo as a PNG data URL, transparency kept, no bigger than max on its longest side.
export async function logoToData(f: Blob, max: number): Promise<string> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = c.toDataURL('image/png');
  // A photo-like logo can be large as a PNG: then a JPEG on white.
  if (png.length < 220_000) return png;
  const g = c.getContext('2d')!;
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
// What an organisation decides for its teachers and their classes.
export type NameChoice = 'first' | 'initial' | 'full' | 'nick';
export type EmailChoice = 'off' | 'optional' | 'required';
export const NAME_CHOICES: { v: NameChoice; label: string }[] = [
  { v: 'first', label: 'First name only' },
  { v: 'initial', label: 'First name and initial' },
  { v: 'full', label: 'Full name' },
  { v: 'nick', label: 'A nickname the teacher gives' },
];
export const EMAIL_CHOICES: { v: EmailChoice; label: string }[] = [
  { v: 'off', label: 'Not collected' },
  { v: 'optional', label: 'Optional' },
  { v: 'required', label: 'Required' },
];
// What teachers in an organisation may choose; every choice when the organisation leaves it open.
export const nameChoicesOf = (p?: OrgPolicy | null): NameChoice[] => (p?.nameChoices?.length ? p.nameChoices : p?.names ? [p.names] : NAME_CHOICES.map((c) => c.v));
export const emailChoicesOf = (p?: OrgPolicy | null): EmailChoice[] => (p?.emailChoices?.length ? p.emailChoices : p?.learnerEmails ? [p.learnerEmails === 'none' ? 'off' : p.learnerEmails] : EMAIL_CHOICES.map((c) => c.v));
// The settings a new class in the organisation starts with.
export function classDefaults(p?: OrgPolicy | null) {
  const n = nameChoicesOf(p);
  const e = emailChoicesOf(p);
  return { ...(n.length < NAME_CHOICES.length ? { profile: { names: n.includes('full') ? 'full' : n[0] } } : {}), ...(e.length < EMAIL_CHOICES.length ? { accounts: { email: e.includes('optional') ? 'optional' : e[0] } } : {}) };
}
export type OrgPolicy = {
  createClasses?: boolean; // false: admins make the classes for their teachers
  seeEmails?: boolean; // whether teachers see their learners' emails
  learnerEmails?: 'none' | 'optional' | 'required'; // learners join with a PIN, and an email when asked for
  names?: 'full' | 'first' | 'initial'; // older: one way names show; now nameChoices
  nameChoices?: NameChoice[]; // the ways of showing learners' names teachers may choose from (none: all)
  emailChoices?: EmailChoice[]; // the learner-email settings teachers may choose from (none: all)
  apps?: Record<string, boolean>; // apps on or off for its teachers
  profiles?: boolean; // teachers are asked for a profile their colleagues see
  externalTrainees?: boolean; // teacher trainers may add teachers from outside the organisation to training classes
};
export type Org = { id: string; name: string; plan: Plan; limitGb: number; adminEmails: string[]; teachers: Record<string, { name: string; email: string; title?: string; gb?: number; trainer?: boolean; invite?: string }>; perTeacherGb?: number; drives?: Record<string, { name: string; quotaGb: number }>; brand?: Brand; outside?: 'anyone' | 'org'; policy?: OrgPolicy; allow?: { trainers?: boolean; apps?: Record<string, boolean> }; createdAt?: unknown }; // allow: what the owner lets the organisation turn on
export type Teacher = { uid: string; name: string; email: string; createdAt?: number; usedBytes?: number }; // usedBytes: what their files take, as their app last measured

export const APP_KEYS: { k: string; name: string }[] = [
  { k: 'classes', name: 'Classes' },
  { k: 'files', name: 'Files' },
  { k: 'messages', name: 'Messages' },
  { k: 'colleagues', name: 'Colleagues' },
];

const orgOf = (id: string, d: Record<string, unknown>): Org => {
  const x = d as Partial<Org>;
  return { ...x, id, name: x.name ?? 'Organisation', plan: x.plan ?? 'school', limitGb: x.limitGb ?? 50, adminEmails: x.adminEmails ?? [], teachers: x.teachers ?? {} } as Org;
};
const lower = (s?: string | null) => (s ?? '').trim().toLowerCase();
export const isOwnerEmail = (e?: string | null) => lower(e) === OWNER_EMAIL;

// This account's own settings: its plan, its space and whether it is paused.
export function useAccount(uid?: string) {
  const [a, setA] = useState<Account | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'accounts', uid),
      (s) => setA((s.data() as Account) ?? {}),
      () => setA({}),
    );
  }, [uid]);
  return a;
}
export const limitBytes = (a: Account | null) => (a?.limitGb ?? PLANS.find((p) => p.k === (a?.plan ?? 'free'))?.gb ?? 1) * 1024 * 1024 * 1024;

export function useFeatures() {
  const [f, setF] = useState<Record<string, boolean>>({});
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'admin', 'features'),
        (s) => setF(((s.data() ?? {}) as { apps?: Record<string, boolean> }).apps ?? {}),
        () => setF({}),
      ),
    [],
  );
  return f;
}
// Whether an app is on for this teacher: their own switch, then the one for everyone.
export function useAppOn() {
  const { user } = useAuth();
  const acc = useAccount(user?.uid);
  const all = useFeatures();
  const org = useMyOrg();
  // The owner's switch for one teacher decides first; then what the owner allows the organisation,
  // then what the organisation allows its teachers; otherwise the switch for everyone.
  return (k: string) => {
    if (isOwnerEmail(user?.email)) return true;
    if (acc?.features?.[k] !== undefined) return acc.features[k];
    if (org?.allow?.apps?.[k] === false || org?.policy?.apps?.[k] === false) return false;
    if (org?.allow?.apps?.[k] === true) return true;
    return all[k] ?? true;
  };
}
export const setFeature = (k: string, on: boolean) => setDoc(doc(db, 'admin', 'features'), { apps: { [k]: on } }, { merge: true });

// ------------------------------------------------------------------ the owner's lists
export function useTeachers(on: boolean) {
  const [list, setList] = useState<Teacher[] | null>(null);
  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'teacher')),
      (s) => setList(s.docs.map((d) => ({ uid: d.id, name: String(d.data().displayName ?? ''), email: String(d.data().email ?? ''), createdAt: d.data().createdAt?.toMillis?.(), usedBytes: Number(d.data().space?.bytes ?? 0) || undefined })).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))),
      () => setList([]),
    );
  }, [on]);
  return list;
}
export function useAccounts(on: boolean) {
  const [m, setM] = useState<Record<string, Account>>({});
  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      collection(db, 'accounts'),
      (s) => setM(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Account]))),
      () => setM({}),
    );
  }, [on]);
  return m;
}
// A teacher's classes and the learners in them.
export async function classCount(uid: string) {
  const s = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', uid))).catch(() => null);
  const live = s ? s.docs.filter((d) => d.data().status !== 'deleted') : [];
  return { classes: live.length, learners: live.reduce((n, d) => n + Number(d.data().learnerCount ?? 0), 0) };
}
// Each teacher's app notes how much space their files take, for Super Admin to see.
let lastSpace = -1;
export function noteSpace(uid: string, bytes: number) {
  if (!uid || bytes < 0 || Math.abs(bytes - lastSpace) < Math.max(50_000, lastSpace * 0.01)) return;
  lastSpace = bytes;
  void updateDoc(doc(db, 'users', uid), { space: { bytes, at: Date.now() } }).catch(() => {});
}
export const saveAccount = (t: Teacher, p: Partial<Account>) => setDoc(doc(db, 'accounts', t.uid), { ...p, name: t.name, email: t.email }, { merge: true });

// Organisations: the owner sees all; an admin sees the ones they run.
export function useOrgs(owner: boolean, email?: string | null) {
  const [list, setList] = useState<Org[] | null>(null);
  useEffect(() => {
    if (!email) return;
    const q = owner ? collection(db, 'orgs') : query(collection(db, 'orgs'), where('adminEmails', 'array-contains', lower(email)));
    return onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => orgOf(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
      () => setList([]),
    );
  }, [owner, email]);
  return list;
}
export const newOrg = (name: string) => addDoc(collection(db, 'orgs'), { name: name.trim(), plan: 'school', limitGb: 50, adminEmails: [], teachers: {}, createdAt: serverTimestamp() });
export const saveOrg = (id: string, p: Partial<Omit<Org, 'id'>>) => updateDoc(doc(db, 'orgs', id), p);
export const addOrgAdmin = (o: Org, email: string) => updateDoc(doc(db, 'orgs', o.id), { adminEmails: [...new Set([...o.adminEmails, lower(email)])] });
export const removeOrgAdmin = (o: Org, email: string) => updateDoc(doc(db, 'orgs', o.id), { adminEmails: o.adminEmails.filter((e) => e !== email) });
// A teacher in an organisation takes its plan and space.
export async function setTeacherOrg(t: Teacher, org: Org | null, from?: Org | null) {
  if (from && from.id !== org?.id) await updateDoc(doc(db, 'orgs', from.id), { [`teachers.${t.uid}`]: deleteField() });
  if (org) await updateDoc(doc(db, 'orgs', org.id), { [`teachers.${t.uid}`]: { name: t.name, email: t.email } });
  await saveAccount(t, org ? { org: org.id, plan: org.plan, limitGb: org.limitGb } : { org: null });
}
export const removeOrg = async (o: Org) => {
  await Promise.all(Object.keys(o.teachers).map((uid) => setDoc(doc(db, 'accounts', uid), { org: null }, { merge: true })));
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'orgs', o.id));
};

// The organisation this teacher belongs to, for its branding and rules.
export function useMyOrg() {
  const { user } = useAuth();
  const acc = useAccount(user?.uid);
  const [o, setO] = useState<Org | null>(null);
  useEffect(() => {
    if (!acc?.org) return setO(null);
    return onSnapshot(
      doc(db, 'orgs', acc.org),
      (s) => {
        const v = s.exists() ? orgOf(s.id, s.data()) : null;
        rememberOrg(v);
        setO(v);
      },
      () => setO(null),
    );
  }, [acc?.org]);
  return o;
}
let myOrgCache: Org | null = null;
export const rememberOrg = (o: Org | null) => void (myOrgCache = o);
export const currentOrg = () => myOrgCache;
export const saveBrand = (o: Org, brand: Brand) => updateDoc(doc(db, 'orgs', o.id), { brand });
export const saveOutside = (o: Org, outside: 'anyone' | 'org') => updateDoc(doc(db, 'orgs', o.id), { outside });
// Keys set to undefined are dropped, so a setting can go back to the teacher.
export const savePolicy = (o: Org, p: OrgPolicy) => updateDoc(doc(db, 'orgs', o.id), { policy: JSON.parse(JSON.stringify({ ...(o.policy ?? {}), ...p })) });

// The organisation's shared drive: folders its admins keep, open to its teachers to view or edit.
export type DriveAccess = { all: 'view' | 'edit' | 'none'; people: Record<string, 'view' | 'edit' | 'none'> };
export type DriveFolder = { id: string; name: string; org: string; drive?: string; access: DriveAccess; memberIds: string[] };
export function useDrive(org?: Org | null) {
  const [list, setList] = useState<DriveFolder[] | null>(null);
  useEffect(() => {
    if (!org) return;
    return onSnapshot(
      query(collection(db, 'sharedFolders'), where('org', '==', org.id)),
      (s) => setList(s.docs.map((d) => { const x = d.data() as Omit<DriveFolder, 'id'>; return { ...x, access: x.access ?? { all: 'view', people: {} }, id: d.id }; })),
      () => setList([]),
    );
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}
const membersFor = (org: Org, access: DriveAccess, me: string) => {
  const members: Record<string, { role: 'edit' | 'view'; name: string; kind: 'teacher' }> = {};
  for (const [uid, t] of Object.entries(org.teachers)) {
    if (uid === me) continue;
    const r = access.people[uid] ?? access.all;
    if (r !== 'none') members[uid] = { role: r, name: t.name || t.email, kind: 'teacher' };
  }
  return { members, memberIds: Object.keys(members) };
};
export async function newDriveFolder(org: Org, me: { uid: string }, name: string, all: DriveAccess['all'] = 'view', drive = 'main') {
  const access: DriveAccess = { all, people: {} };
  await addDoc(collection(db, 'sharedFolders'), { owner: me.uid, ownerName: org.name, name: name.trim() || 'Folder', org: org.id, drive, access, ...membersFor(org, access, me.uid), createdAt: serverTimestamp() });
}
export const saveDriveAccess = (org: Org, f: DriveFolder, me: { uid: string }, access: DriveAccess) => updateDoc(doc(db, 'sharedFolders', f.id), { access, ...membersFor(org, access, me.uid) });
export const setJobTitle = (o: Org, uid: string, title: string) => updateDoc(doc(db, 'orgs', o.id), { [`teachers.${uid}.title`]: title.trim() });
// A teacher trainer makes teacher training classes, with the organisation's teachers in them.
export const setTrainer = (o: Org, uid: string, on: boolean) => updateDoc(doc(db, 'orgs', o.id), { [`teachers.${uid}.trainer`]: on });
export const isTrainerIn = (o: Org | null, uid?: string) => !!o && !!uid && !!o.allow?.trainers && !!o.teachers[uid]?.trainer;

// Teachers in an organisation are colleagues of each other, always: each teacher's app writes
// its own side, with the organisation and the job title.
export function useOrgColleagues() {
  const { user, profile } = useAuth();
  const org = useMyOrg();
  useEffect(() => {
    rememberOrg(org);
    if (!org || !user || profile?.role !== 'teacher') return;
    void (async () => {
      const mine = await getDocs(collection(db, 'users', user.uid, 'colleagues')).catch(() => null);
      const have = new Map((mine?.docs ?? []).map((d) => [d.id, d.data()]));
      await Promise.all(
        Object.entries(org.teachers)
          .filter(([uid]) => uid !== user.uid)
          .filter(([uid, t]) => have.get(uid)?.org !== org.id || (have.get(uid)?.title ?? '') !== (t.title ?? ''))
          .map(([uid, t]) => setDoc(doc(db, 'users', user.uid, 'colleagues', uid), { name: t.name || t.email, org: org.id, orgName: org.name, title: t.title ?? '', at: (have.get(uid)?.at as number) ?? Date.now() }, { merge: true }).catch(() => {})),
      );
    })();
  }, [org, user, profile?.role]);
  return org;
}

// A teacher's profile for their organisation.
export type TeacherProfile = { about?: string; hobbies?: string; languages?: string; teaching?: string; org?: string };
export function useTeacherProfile(uid?: string) {
  const [p, setP] = useState<TeacherProfile | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'teacherProfiles', uid),
      (s) => setP(s.exists() ? (s.data() as TeacherProfile) : null),
      () => setP(null),
    );
  }, [uid]);
  return p;
}
export const saveTeacherProfile = (uid: string, p: TeacherProfile) => setDoc(doc(db, 'teacherProfiles', uid), p, { merge: true });

// How much space a teacher has: their organisation decides for its teachers, otherwise their plan.
export function useSpaceLimit() {
  const { user } = useAuth();
  const acc = useAccount(user?.uid);
  const org = useMyOrg();
  const gb = org ? org.teachers[user?.uid ?? '']?.gb ?? org.perTeacherGb ?? 1 : acc?.limitGb ?? PLANS.find((p) => p.k === (acc?.plan ?? 'free'))?.gb ?? 1;
  return { bytes: gb * 1024 * 1024 * 1024, gb, org: org?.name };
}
export const saveDrives = (o: Org, drives: NonNullable<Org['drives']>) => updateDoc(doc(db, 'orgs', o.id), { drives });
export const savePerTeacher = (o: Org, gb: number) => updateDoc(doc(db, 'orgs', o.id), { perTeacherGb: gb });
export const setTeacherGb = (o: Org, uid: string, gb: number | null) => updateDoc(doc(db, 'orgs', o.id), { [`teachers.${uid}.gb`]: gb === null ? deleteField() : gb });
// Space used by the files in a drive's folders.
export async function driveUse(folderIds: string[]) {
  let n = 0;
  for (const id of folderIds) {
    const s = await getDocs(query(collection(db, 'sharedDocs'), where('folder', '==', id))).catch(() => null);
    s?.docs.forEach((d) => (n += Number(d.data().size ?? 0)));
  }
  return n;
}

// ------------------------------------------------------------------ invitations
// An admin adds teachers by name and email; each gets an email (scripts/mail.mjs) with a link to
// /invite/{id}: to finish a new account, or, with an account already, to say yes or no.
export type OrgInvite = { id: string; org: string; orgName: string; color?: string; logo?: string; email: string; name: string; title?: string; admin?: boolean; by: string; byName: string; at: number; status: 'pending' | 'accepted' | 'declined'; mailed?: number; existing?: boolean; uid?: string; answeredAt?: number };
export const ADMIN_CAN = [
  'Which apps you have, and how much space',
  'Whether you create your own classes, or they create them for you',
  'Class settings for learners: emails, and how names show',
  'Whether you can add colleagues from outside the organisation',
  'Which shared folders you can view or change',
  'Your job title, and whether you are a teacher trainer',
];
export const ADMIN_SEE = 'Your name, email, job title and the profile you write, if they ask for one, and the class lists of your classes. Not your lessons, files or messages, unless you share them.';

export async function inviteTeachers(o: Org, rows: { name: string; email: string; title?: string; admin?: boolean }[], by: { uid: string; name: string }) {
  let n = 0;
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) continue;
    await addDoc(collection(db, 'orgInvites'), { org: o.id, orgName: o.name, color: o.brand?.color ?? '', logo: o.brand?.wide || o.brand?.logo || '', email, name: r.name.trim(), title: (r.title ?? '').trim(), ...(r.admin ? { admin: true } : {}), by: by.uid, byName: by.name, at: Date.now(), status: 'pending' });
    n++;
  }
  return n;
}
export function useOrgInvites(o: Org | null) {
  const [list, setList] = useState<OrgInvite[]>([]);
  useEffect(() => {
    if (!o) return;
    return onSnapshot(
      query(collection(db, 'orgInvites'), where('org', '==', o.id)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrgInvite, 'id'>) })).sort((a, b) => b.at - a.at)),
      () => setList([]),
    );
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}
export const cancelInvite = async (id: string) => (await import('firebase/firestore')).deleteDoc(doc(db, 'orgInvites', id));
export const resendInvite = (id: string) => updateDoc(doc(db, 'orgInvites', id), { mailed: deleteField() });
export const inviteLink = (id: string) => `${window.location.origin}/invite/${id}`;
export function useInvite(id?: string) {
  const [inv, setInv] = useState<OrgInvite | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, 'orgInvites', id),
      (s) => setInv(s.exists() ? { id: s.id, ...(s.data() as Omit<OrgInvite, 'id'>) } : null),
      () => setInv(null),
    );
  }, [id]);
  return inv;
}
// Saying yes: the teacher adds themselves to the organisation, as the invitation allows.
export async function acceptInvite(inv: OrgInvite, me: { uid: string; name: string; email: string }) {
  const { writeBatch } = await import('firebase/firestore');
  const b = writeBatch(db);
  const { arrayUnion } = await import('firebase/firestore');
  // An invitation as an admin also makes them one of the organisation's admins.
  b.update(doc(db, 'orgs', inv.org), { [`teachers.${me.uid}`]: { name: me.name || inv.name, email: me.email.toLowerCase(), ...(inv.title ? { title: inv.title } : {}), invite: inv.id }, ...(inv.admin ? { adminEmails: arrayUnion(me.email.toLowerCase()) } : {}) });
  b.set(doc(db, 'accounts', me.uid), { org: inv.org, invite: inv.id }, { merge: true });
  b.update(doc(db, 'orgInvites', inv.id), { status: 'accepted', uid: me.uid, answeredAt: Date.now() });
  await b.commit();
}
export const declineInvite = (inv: OrgInvite, uid: string) => updateDoc(doc(db, 'orgInvites', inv.id), { status: 'declined', uid, answeredAt: Date.now() });

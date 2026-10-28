import { PLANS, type Account, type Org, type OrgClass, type OrgInvite, type Teacher } from '../../lib/admin';
import { GB, daysSince, millis, plural } from './ui';

// What needs an admin's attention, worked out from what is already there: nothing extra is stored.

export type Attention = { k: string; n: number; title: string; text: string; go: { tab: string; f?: string }; act: string; low?: boolean };

export const WAIT_DAYS = 7;
const names = (l: string[]) => (l.length <= 2 ? l.join(' and ') : `${l.slice(0, 2).join(', ')} and ${plural(l.length - 2, 'other')}`);
const today = () => new Date().toISOString().slice(0, 10);

// A teacher's classes: the ones they own and the ones they co-teach.
export const teachesIn = (c: OrgClass, uid: string) => c.teacherId === uid || c.coTeachers?.[uid]?.role === 'co';
export const orgGbOf = (org: Org, uid: string) => org.teachers[uid]?.gb ?? org.perTeacherGb ?? 1;
export const givenGb = (org: Org) => Object.keys(org.teachers).reduce((n, uid) => n + orgGbOf(org, uid), 0) + Object.values(org.drives ?? {}).reduce((n, d) => n + (d.quotaGb ?? 0), 0);
export const classEnded = (c: OrgClass) => c.status === 'active' && !!c.dates?.end && c.dates.end < today();

export function orgAttention(org: Org, classes: OrgClass[], accounts: Record<string, Account>, invites: OrgInvite[]): Attention[] {
  const out: Attention[] = [];
  const active = classes.filter((c) => c.status === 'active');
  const nameOf = (uid: string) => org.teachers[uid]?.name || org.teachers[uid]?.email || 'A teacher';
  const old = invites.filter((i) => i.status === 'pending' && daysSince(i.at) >= WAIT_DAYS);
  if (old.length) out.push({ k: 'invites', n: old.length, title: old.length === 1 ? 'invitation waiting more than a week' : 'invitations waiting more than a week', text: names(old.map((i) => i.name || i.email)), go: { tab: 'invites', f: 'old' }, act: 'See invitations' });
  const full = Object.keys(org.teachers).filter((uid) => accounts[uid]?.over || (accounts[uid]?.usedBytes ?? 0) >= orgGbOf(org, uid) * GB * 0.9);
  if (full.length) out.push({ k: 'space', n: full.length, title: full.length === 1 ? 'teacher nearly out of space' : 'teachers nearly out of space', text: `${names(full.map(nameOf))}. Give more space, or ask them to tidy their files.`, go: { tab: 'teachers', f: 'space' }, act: 'See teachers' });
  const given = givenGb(org);
  if (given > org.limitGb) out.push({ k: 'given', n: given - org.limitGb, title: 'GB more given out than the organisation has', text: `Teachers and the library have ${given} GB between them; ${org.name} has ${org.limitGb} GB.`, go: { tab: 'space' }, act: 'Plan and space' });
  const idle = Object.keys(org.teachers).filter((uid) => !active.some((c) => teachesIn(c, uid)));
  if (idle.length) out.push({ k: 'idle', n: idle.length, title: idle.length === 1 ? 'teacher without a class' : 'teachers without a class', text: names(idle.map(nameOf)), go: { tab: 'teachers', f: 'noclass' }, act: 'See teachers' });
  const empty = active.filter((c) => !c.learnerCount);
  if (empty.length) out.push({ k: 'empty', n: empty.length, title: empty.length === 1 ? 'class without learners' : 'classes without learners', text: names(empty.map((c) => c.name)), go: { tab: 'classes', f: 'empty' }, act: 'See classes' });
  const ended = active.filter(classEnded);
  if (ended.length) out.push({ k: 'ended', n: ended.length, title: ended.length === 1 ? 'class past its finish date' : 'classes past their finish date', text: `${names(ended.map((c) => c.name))}. Their teachers can archive them.`, go: { tab: 'classes', f: 'ended' }, act: 'See classes', low: true });
  const lonely = org.adminEmails.filter((e) => !Object.values(org.teachers).some((t) => t.email.toLowerCase() === e));
  if (lonely.length) out.push({ k: 'admins', n: lonely.length, title: lonely.length === 1 ? 'admin not yet a teacher here' : 'admins not yet teachers here', text: names(lonely), go: { tab: 'admins' }, act: 'See admins', low: true });
  if (org.allow?.trainers && !Object.values(org.teachers).some((t) => t.trainer)) out.push({ k: 'trainers', n: 0, title: 'No teacher trainers yet', text: 'Teacher training classes need a trainer. Choose one in Teachers.', go: { tab: 'teachers' }, act: 'Choose trainers', low: true });
  return out;
}

// Setting up a new organisation, step by step. Gone when every step is done.
export function orgSetup(org: Org, folders: number, invites: OrgInvite[]) {
  return [
    { k: 'brand', done: !!(org.brand?.logo || org.brand?.wide), label: 'Add your logo and colour', tab: 'brand' },
    { k: 'teachers', done: Object.keys(org.teachers).length > 1 || invites.length > 0, label: 'Invite your teachers', tab: 'invites' },
    { k: 'rules', done: !!org.policy && Object.keys(org.policy).length > 0, label: 'Choose the rules for classes and learners', tab: 'rules' },
    { k: 'library', done: folders > 0, label: 'Make a folder in the library', tab: 'library' },
  ];
}

export function limitGbOf(a: Account | undefined, orgs: Org[], uid: string) {
  const o = orgs.find((x) => x.id === a?.org);
  if (o) return orgGbOf(o, uid);
  return a?.limitGb ?? PLANS.find((p) => p.k === (a?.plan ?? 'free'))?.gb ?? 1;
}
export const usedOf = (a: Account | undefined, t?: Teacher) => a?.usedBytes ?? t?.usedBytes ?? 0;

export function superAttention(teachers: Teacher[], accounts: Record<string, Account>, orgs: Org[], classes: OrgClass[], invites: OrgInvite[]): Attention[] {
  const out: Attention[] = [];
  const nm = (t: Teacher) => t.name || t.email;
  const full = teachers.filter((t) => accounts[t.uid]?.over);
  if (full.length) out.push({ k: 'full', n: full.length, title: full.length === 1 ? 'account is full' : 'accounts are full', text: `${names(full.map(nm))} can’t add files until they have more space.`, go: { tab: 'teachers', f: 'full' }, act: 'See teachers' });
  const near = teachers.filter((t) => !accounts[t.uid]?.over && usedOf(accounts[t.uid], t) >= limitGbOf(accounts[t.uid], orgs, t.uid) * GB * 0.9);
  if (near.length) out.push({ k: 'near', n: near.length, title: near.length === 1 ? 'account nearly full' : 'accounts nearly full', text: names(near.map(nm)), go: { tab: 'teachers', f: 'near' }, act: 'See teachers' });
  const noAdmin = orgs.filter((o) => !o.adminEmails.length);
  if (noAdmin.length) out.push({ k: 'noadmin', n: noAdmin.length, title: noAdmin.length === 1 ? 'organisation without an admin' : 'organisations without an admin', text: names(noAdmin.map((o) => o.name)), go: { tab: 'orgs', f: 'noadmin' }, act: 'See organisations' });
  const over = orgs.filter((o) => givenGb(o) > o.limitGb);
  if (over.length) out.push({ k: 'over', n: over.length, title: over.length === 1 ? 'organisation gives out more space than it has' : 'organisations give out more space than they have', text: names(over.map((o) => o.name)), go: { tab: 'orgs', f: 'over' }, act: 'See organisations' });
  const quiet = teachers.filter((t) => daysSince(t.createdAt) >= WAIT_DAYS && !classes.some((c) => c.status === 'active' && teachesIn(c, t.uid)));
  if (quiet.length) out.push({ k: 'quiet', n: quiet.length, title: quiet.length === 1 ? 'teacher without a class after a week' : 'teachers without a class after a week', text: names(quiet.map(nm)), go: { tab: 'teachers', f: 'noclass' }, act: 'See teachers', low: true });
  const old = invites.filter((i) => i.status === 'pending' && daysSince(i.at) >= WAIT_DAYS);
  if (old.length) out.push({ k: 'invites', n: old.length, title: old.length === 1 ? 'invitation waiting more than a week' : 'invitations waiting more than a week', text: names([...new Set(old.map((i) => i.orgName))]), go: { tab: 'orgs' }, act: 'See organisations', low: true });
  return out;
}

export const classMillis = (c: OrgClass) => millis(c.createdAt);

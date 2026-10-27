import { saveXlsx, type Report } from '../../lib/reportFiles';
import { PLANS, type Account, type Org, type OrgClass, type OrgInvite, type Teacher } from '../../lib/admin';
import { givenGb, limitGbOf, orgGbOf, teachesIn, usedOf } from './attention';
import { GB, dateStr, millis } from './ui';

// Spreadsheets for the people who run a school: one workbook, a sheet for each list.

const gb = (bytes: number) => Math.round((bytes / GB) * 100) / 100;
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().match(/^#[0-9a-f]{6}$/i)?.[0] ?? '#5d6f80';

export function orgTeachersSheet(org: Org, classes: OrgClass[], accounts: Record<string, Account>, only?: string[]): Report {
  const rows = Object.entries(org.teachers)
    .filter(([uid]) => !only || only.includes(uid))
    .sort((a, b) => (a[1].name || a[1].email).localeCompare(b[1].name || b[1].email))
    .map(([uid, t]) => {
      const mine = classes.filter((c) => c.status === 'active' && teachesIn(c, uid));
      return [t.name || '', t.email, t.title ?? '', (t.tags ?? []).map((x) => org.tags?.[x]?.name ?? '').filter(Boolean).join(', '), t.trainer ? 'Yes' : '', org.adminEmails.includes(t.email.toLowerCase()) ? 'Yes' : '', mine.length, mine.reduce((n, c) => n + (c.learnerCount ?? 0), 0), gb(accounts[uid]?.usedBytes ?? 0), orgGbOf(org, uid)];
    });
  return { title: 'Teachers', context: org.name, summary: [['Teachers', String(rows.length)]], columns: ['Name', 'Email', 'Job title', 'Tags', 'Teacher trainer', 'Admin', 'Classes', 'Learners', 'Space used (GB)', 'Space given (GB)'], rows };
}

export function orgClassesSheet(org: Org, classes: OrgClass[], only?: string[]): Report {
  const nm = (uid: string) => org.teachers[uid]?.name || org.teachers[uid]?.email || '';
  const rows = classes
    .filter((c) => !only || only.includes(c.id))
    .map((c) => [c.name, nm(c.teacherId), Object.values(c.coTeachers ?? {}).filter((x) => x.role === 'co').map((x) => x.name).join(', '), c.level, c.kind === 'training' ? 'Teacher training' : 'Language class', c.classCode, c.learnerCount ?? 0, c.status === 'archived' ? 'Archived' : 'Active', c.dates?.start ?? '', c.dates?.end ?? '', dateStr(millis(c.createdAt))]);
  return { title: 'Classes', context: org.name, summary: [['Classes', String(rows.length)], ['Learners', String(rows.reduce((n, r) => n + Number(r[6]), 0))]], columns: ['Class', 'Teacher', 'Co-teachers', 'Level', 'Kind', 'Class code', 'Learners', 'Status', 'Starts', 'Finishes', 'Created'], rows };
}

export function orgInvitesSheet(org: Org, invites: OrgInvite[]): Report {
  const st = (i: OrgInvite) => (i.status === 'accepted' ? 'Joined' : i.status === 'declined' ? 'Said no' : 'Waiting');
  return { title: 'Invitations', context: org.name, columns: ['Name', 'Email', 'Job title', 'Admin', 'Status', 'Sent', 'Answered', 'Invited by'], rows: invites.map((i) => [i.name, i.email, i.title ?? '', i.admin ? 'Yes' : '', st(i), dateStr(i.at), dateStr(i.answeredAt), i.byName]) };
}

export async function saveOrgWorkbook(org: Org, classes: OrgClass[], accounts: Record<string, Account>, invites: OrgInvite[], first: 'teachers' | 'classes' | 'invites' = 'teachers', only?: string[]) {
  const t = orgTeachersSheet(org, classes, accounts, first === 'teachers' ? only : undefined);
  const c = orgClassesSheet(org, classes, first === 'classes' ? only : undefined);
  const i = orgInvitesSheet(org, invites);
  const [head, ...rest] = first === 'classes' ? [c, t, i] : first === 'invites' ? [i, t, c] : [t, c, i];
  await saveXlsx({ ...head, sheets: rest }, org.brand?.color ?? accent());
}

export async function saveSuperWorkbook(teachers: Teacher[], accounts: Record<string, Account>, orgs: Org[], classes: OrgClass[], invites: OrgInvite[], only?: string[]) {
  const orgName = (id?: string | null) => orgs.find((o) => o.id === id)?.name ?? '';
  const t: Report = {
    title: 'Teachers',
    context: 'ELT Suite',
    columns: ['Name', 'Email', 'Signed up', 'Organisation', 'Plan', 'Classes', 'Learners', 'Space used (GB)', 'Space (GB)', 'Full', 'Paused'],
    rows: teachers
      .filter((x) => !only || only.includes(x.uid))
      .map((x) => {
        const a = accounts[x.uid];
        const mine = classes.filter((c) => c.status === 'active' && teachesIn(c, x.uid));
        return [x.name, x.email, dateStr(x.createdAt), orgName(a?.org), a?.org ? 'School' : PLANS.find((p) => p.k === (a?.plan ?? 'free'))?.label ?? 'Free', mine.length, mine.reduce((n, c) => n + (c.learnerCount ?? 0), 0), gb(usedOf(a, x)), limitGbOf(a, orgs, x.uid), a?.over ? 'Yes' : '', a?.suspended ? 'Yes' : ''];
      }),
  };
  const o: Report = {
    title: 'Organisations',
    context: 'ELT Suite',
    columns: ['Organisation', 'Plan', 'Space (GB)', 'Given out (GB)', 'Teachers', 'Admins', 'Classes', 'Learners', 'Invitations waiting'],
    rows: orgs.map((x) => {
      const cls = classes.filter((c) => c.org === x.id && c.status === 'active');
      return [x.name, PLANS.find((p) => p.k === x.plan)?.label ?? x.plan, x.limitGb, givenGb(x), Object.keys(x.teachers).length, x.adminEmails.length, cls.length, cls.reduce((n, c) => n + (c.learnerCount ?? 0), 0), invites.filter((i) => i.org === x.id && i.status === 'pending').length];
    }),
  };
  await saveXlsx({ ...t, sheets: [o] }, accent());
}

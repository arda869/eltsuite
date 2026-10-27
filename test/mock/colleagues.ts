// ?colleagues : demo colleagues for the Colleagues page. An organisation (Harbour School) with
// six teachers and their profiles, two colleagues from outside it, who is around, a few things
// shared each way, a class taught together and an open invitation link.
import { Timestamp, doc, setDoc, updateDoc } from './firestore';
import { set } from './database';

const H = 3600e3;
const D = 24 * H;
type T = { id: string; name: string; email: string; title: string; face: string; fields?: Record<string, string> };
const ORG: T[] = [
  { id: 't-lena', name: 'Lena Park', email: 'lena@harbour.example', title: 'Head of English', face: 'fox', fields: { about: 'I have taught in Seoul, Lisbon and now Hong Kong. I love building speaking lessons around real stories, and I am always happy to look at a lesson plan with you.', teaching: '2011', languages: 'English, Korean, Portuguese', hobbies: 'Hiking, film photography, pottery' } },
  { id: 't-tomas', name: 'Tomás Rivera', email: 'tomas@harbour.example', title: 'Senior Teacher, IELTS', face: 'owl', fields: { about: 'Exam classes are my thing: IELTS and Cambridge B2 First. Ask me about writing feedback that learners actually read.', teaching: '2015', languages: 'English, Spanish', hobbies: 'Football, cooking, jazz' } },
  { id: 't-amira', name: 'Amira Haddad', email: 'amira@harbour.example', title: 'Teacher trainer', face: 'bird', fields: { about: 'I run the CELTA-style induction for new teachers and observe lessons each term.', teaching: '2009', languages: 'English, Arabic, French', hobbies: 'Running, poetry' } },
  { id: 't-wei', name: 'Wei Chen', email: 'wei@harbour.example', title: 'Young learners coordinator', face: 'panda', fields: { about: 'Phonics, songs and stories for our youngest learners.', teaching: '2018', languages: 'English, Cantonese, Mandarin', hobbies: 'Drawing, board games' } },
  { id: 't-sophie', name: 'Sophie Laurent', email: 'sophie@harbour.example', title: 'Teacher', face: 'rabbit' },
  { id: 't-kofi', name: 'Kofi Mensah', email: 'kofi@harbour.example', title: 'Teacher, business English', face: 'lion', fields: { about: 'Business English and presentation skills for adult learners.', languages: 'English, Twi', hobbies: 'Chess, cycling' } },
];
const OUTSIDE: T[] = [
  { id: 't-daniel', name: 'Daniel Brooks', email: 'daniel@riverside.example', title: '', face: 'bear' },
  { id: 't-yuki', name: 'Yuki Tanaka', email: 'yuki@sakura.example', title: '', face: 'whale' },
];

export async function seedColleagues() {
  const now = Date.now();
  const me = 'teacher1';
  const demo = JSON.parse(localStorage.getItem('mockdemo') || '{}') as { classId?: string };
  await setDoc(doc({}, 'orgs', 'o1'), {
    name: 'Harbour School',
    plan: 'school',
    limitGb: 50,
    adminEmails: ['lena@harbour.example'],
    teachers: Object.fromEntries([[me, { name: 'Arda', email: 'teacher@example.com', title: 'Director of Studies' }], ...ORG.map((t) => [t.id, { name: t.name, email: t.email, title: t.title }])]),
    policy: { profiles: true },
    drives: {},
  });
  await setDoc(doc({}, 'accounts', me), { org: 'o1' }, { merge: true });
  for (const t of [...ORG, ...OUTSIDE]) {
    await setDoc(doc({}, 'users', t.id), { role: 'teacher', displayName: t.name, email: t.email });
    await setDoc(doc({}, 'faces', t.id), { avatar: t.face, by: t.id });
  }
  for (const t of ORG) {
    await setDoc(doc({}, 'teacherProfiles', t.id), { org: 'o1', avatar: t.face, ...(t.fields ? { fields: t.fields } : {}) });
    await setDoc(doc({}, 'users', me, 'colleagues', t.id), { name: t.name, org: 'o1', orgName: 'Harbour School', title: t.title, at: now - 200 * D });
  }
  for (const [i, t] of OUTSIDE.entries()) await setDoc(doc({}, 'users', me, 'colleagues', t.id), { name: t.name, email: t.email, at: now - (40 + i * 90) * D, via: 'demo' });
  await setDoc(doc({}, 'colleagueLinks', 'demolink0001demolink0001'), { from: me, name: 'Arda', email: 'teacher@example.com', at: now - 3 * D, org: 'o1', orgOnly: false });

  // Who is around: online, in class, on a call, away, do not disturb, last seen.
  const st: Record<string, unknown> = {
    'presence/t-lena': { state: 'online', at: now, set: 'auto' },
    'presence/t-tomas': { state: 'online', at: now, cls: 'B2 Evening', set: 'auto' },
    'presence/t-amira': { state: 'online', at: now, call: true, set: 'auto' },
    'presence/t-wei': { state: 'away', at: now - 20 * 60e3, set: 'auto' },
    'presence/t-kofi': { state: 'offline', at: now - 3 * H },
    'presence/t-daniel': { state: 'online', at: now, set: 'busy' },
    'presence/t-yuki': { state: 'offline', at: now - 2 * D },
  };
  for (const [k, v] of Object.entries(st)) await set({ path: k }, v);

  // Shared each way: read-only copies, and collaborative documents.
  const share = (id: string, owner: T | null, kind: string, title: string, people: string[], ago: number) =>
    setDoc(doc({}, 'shares', id), { owner: owner?.id ?? me, ownerName: owner?.name ?? 'Arda', kind, title, mode: 'people', people, src: {}, count: 4, at: now - ago, updated: now - ago });
  await share('sh-travel', ORG[0], 'lesson', 'Talking about travel', [me], 2 * D);
  await share('sh-writing', ORG[1], 'task', 'IELTS Task 2: opinion essay plan', [me, 't-lena'], 5 * D);
  await share('sh-songs', ORG[3], 'media', 'Phonics song: short a', [me], 9 * D);
  await share('sh-mine', null, 'lesson', 'Present perfect: experiences', ['t-lena', 't-tomas'], 1 * D);
  const sdoc = (id: string, owner: T | null, kind: string, title: string, members: Record<string, { role: string; name: string }>, ago: number) =>
    setDoc(doc({}, 'sharedDocs', id), { owner: owner?.id ?? me, ownerName: owner?.name ?? 'Arda', kind, title, docKey: 'f' + id, members: Object.fromEntries(Object.entries(members).map(([k, m]) => [k, { ...m, kind: 'teacher' }])), memberIds: Object.keys(members), createdAt: Timestamp.fromMillis(now - ago - D), updatedAt: Timestamp.fromMillis(now - ago) });
  await sdoc('sd-rubric', ORG[0], 'doc', 'Speaking rubric, B2', { [me]: { role: 'edit', name: 'Arda' } }, 1 * D + 3 * H);
  await sdoc('sd-induction', ORG[2], 'slides', 'New teacher induction, week 1', { [me]: { role: 'comment', name: 'Arda' } }, 12 * D);
  await sdoc('sd-plan', null, 'doc', 'Term plan: adult general English', { 't-lena': { role: 'edit', name: 'Lena Park' }, 't-kofi': { role: 'view', name: 'Kofi Mensah' } }, 4 * D);
  await sdoc('sd-daniel', OUTSIDE[0], 'flash', 'Phrasal verbs for travel', { [me]: { role: 'view', name: 'Arda' } }, 20 * D);

  // A class taught together: Tomás co-teaches the demo class, and Arda co-teaches Lena's.
  if (demo.classId) await updateDoc(doc({}, 'classes', demo.classId), { coTeachers: { 't-tomas': { role: 'co', email: 'tomas@harbour.example', name: 'Tomás Rivera' } }, teacherIds: ['t-tomas'] });
  await setDoc(doc({}, 'classes', 'c-b2evening'), { teacherId: 't-lena', teacherName: 'Lena Park', name: 'B2 Evening', level: 'B2', themeColor: 'teal', classCode: 'B2E-118', status: 'active', learnerCount: 0, org: 'o1', coTeachers: { [me]: { role: 'co', email: 'teacher@example.com', name: 'Arda' } }, teacherIds: [me], createdAt: Timestamp.fromMillis(now - 60 * D) });
  localStorage.setItem('mockcolleagues', '1');
}

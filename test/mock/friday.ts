// Isolated sample data for citation and invitation regression checks.
import { doc, setDoc, Timestamp } from './firestore';
export async function seedFriday() {
  for (const [id, title] of [['friday-language', 'Language teaching'], ['friday-research', 'Classroom research']]) {
    await setDoc(doc({}, 'sharedDocs', id), { owner: 'teacher1', ownerName: 'Arda', title, kind: 'pd', docKey: id, members: {}, memberIds: [], updatedAt: Timestamp.now() });
  }
  await setDoc(doc({}, 'sharedDocs', 'friday-language', 'sources', 'th-2006'), { type: 'book', title: 'An A–Z of ELT', authors: [{ first: 'Scott', last: 'Thornbury' }], year: '2006', publisher: 'Macmillan', order: 0 });
  await setDoc(doc({}, 'sharedDocs', 'friday-research', 'sources', 'nu-1992'), { type: 'book', title: 'Research Methods in Language Learning', authors: [{ first: 'David', last: 'Nunan' }], year: '1992', publisher: 'Cambridge University Press', order: 0 });
  await setDoc(doc({}, 'orgInvites', 'friday-invite'), { org: 'friday-school', orgName: 'Example Academy', email: 'teacher@example.com', name: 'Arda', by: 'sample-admin', byName: 'Alex Lee', status: 'pending', at: Date.now(), existing: true });
}
export async function seedFridayBrand() {
  await setDoc(doc({}, 'orgs', 'friday-brand'), { name: 'Example Academy', plan: 'school', adminEmails: ['teacher@example.com'], teachers: { teacher1: { name: 'Arda', email: 'teacher@example.com' } }, drives: {}, policy: {}, brand: { color: '#2f7f6f' } });
  await setDoc(doc({}, 'accounts', 'teacher1'), { org: 'friday-brand' }, { merge: true });
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-information-gap',
  firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
});
const visitor = env.unauthenticatedContext().firestore();
const author = env.authenticatedContext('author', { email: 'author@example.test', email_verified: true }).firestore();
const other = env.authenticatedContext('other', { email: 'other@example.test', email_verified: true }).firestore();
const editor = env.authenticatedContext('editor', { email: 'editor@example.test', email_verified: true }).firestore();
const article = { title: 'A classroom story', standfirst: 'What I learned', body: 'This is the body.', section: 'Essays', topic: 'Teaching', authorUid: 'author', authorName: 'Author', status: 'draft', createdAt: 1, updatedAt: 1 };
const thread = { title: 'A question', body: 'What do you think?', topic: 'Teaching', authorUid: 'author', authorName: 'Author', status: 'visible', createdAt: 1, updatedAt: 1 };
let checks = 0;
async function yes(label, work) { await assertSucceeds(work()); checks++; console.log('PASS', label); }
async function no(label, work) { await assertFails(work()); checks++; console.log('PASS', label); }
try {
  await env.withSecurityRulesDisabled(async admin => {
    await setDoc(doc(admin.firestore(), 'tigEditors/editor'), { email: 'editor@example.test', addedAt: 1 });
  });
  await yes('Author saves a private draft', () => setDoc(doc(author, 'tigArticles/a'), article));
  await no('Visitor cannot read draft', () => getDoc(doc(visitor, 'tigArticles/a')));
  await no('Another teacher cannot read draft', () => getDoc(doc(other, 'tigArticles/a')));
  await yes('Author can read own draft', () => getDoc(doc(author, 'tigArticles/a')));
  await no('Author cannot publish directly', () => updateDoc(doc(author, 'tigArticles/a'), { status: 'published' }));
  await yes('Editor can review draft', () => getDoc(doc(editor, 'tigArticles/a')));
  await yes('Editor publishes', () => updateDoc(doc(editor, 'tigArticles/a'), { status: 'published', publishedAt: 2 }));
  await yes('Visitor reads published article', () => getDoc(doc(visitor, 'tigArticles/a')));
  await yes('Visitor queries published articles', () => getDocs(query(collection(visitor, 'tigArticles'), where('status', '==', 'published'))));
  await no('Visitor cannot list every article', () => getDocs(collection(visitor, 'tigArticles')));
  await no('Another teacher cannot forge author', () => setDoc(doc(other, 'tigArticles/forged'), article));
  await yes('Teacher starts conversation', () => setDoc(doc(author, 'tigThreads/t'), thread));
  await yes('Visitor sees visible conversations', () => getDocs(query(collection(visitor, 'tigThreads'), where('status', '==', 'visible'))));
  await no('Teacher cannot hide conversation', () => updateDoc(doc(author, 'tigThreads/t'), { status: 'hidden' }));
  await yes('Teacher adds a reply', () => setDoc(doc(other, 'tigThreads/t/replies/r'), { body: 'A reply', authorUid: 'other', authorName: 'Other', status: 'visible', createdAt: 2 }));
  await no('Teacher cannot forge reply author', () => setDoc(doc(other, 'tigThreads/t/replies/forged'), { body: 'A reply', authorUid: 'author', authorName: 'Author', status: 'visible', createdAt: 2 }));
  await yes('Editor hides conversation', () => updateDoc(doc(editor, 'tigThreads/t'), { status: 'hidden' }));
  await no('Visitor cannot read hidden conversation', () => getDoc(doc(visitor, 'tigThreads/t')));
  await no('Visitor cannot read its replies', () => getDoc(doc(visitor, 'tigThreads/t/replies/r')));
  await yes('Author submits a pitch', () => setDoc(doc(author, 'tigPitches/p'), { title: 'Idea', summary: 'A classroom account', authorUid: 'author', authorName: 'Author', status: 'new', createdAt: 2 }));
  await no('Another teacher cannot read pitch', () => getDoc(doc(other, 'tigPitches/p')));
  await yes('Editor can review pitch', () => getDoc(doc(editor, 'tigPitches/p')));
  await no('Visitor cannot create editor role', () => setDoc(doc(visitor, 'tigEditors/visitor'), { email: 'visitor@example.test', addedAt: 3 }));
  assert.equal(checks, 23);
  console.log(`${checks} Information Gap access checks passed`);
} finally { await env.cleanup(); }

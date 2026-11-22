import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:5184';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const teacher = await context.newPage();
  await teacher.goto(`${base}/dev.html?seed&as=teacher`);
  await teacher.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await teacher.evaluate(() => localStorage.setItem('rll.fixture', JSON.stringify({ code: '482193', run: { runId: 'fixture-run', resourceId: 'fixture-resource', title: 'Standalone conversation lesson', edition: 1, status: 'lobby', currentTaskId: null, taskIds: ['task-1'], taskTitles: { 'task-1': 'First task' }, startedAt: Date.now(), endedAt: null, participantCount: 0, joinOpen: true, expired: false }, participants: [], answers: [] })));
  await teacher.goto(`${base}/resource-hub/lesson/live/fixture-run`);
  await teacher.getByText('482193').waitFor();
  assert.equal(await teacher.getByRole('img', { name: /QR code to join lesson/ }).count(), 1);

  const learner = await context.newPage();
  await learner.goto(`${base}/lesson-join/482193`);
  await learner.getByRole('heading', { name: 'Ready to learn together?' }).waitFor();
  await learner.getByLabel('Your name').fill('Mia');
  await learner.getByRole('button', { name: 'Join lesson' }).click();
  await learner.getByRole('heading', { name: 'You’re in!' }).waitFor();
  await teacher.getByText('Mia').waitFor({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'Start first task' }).click();
  await learner.getByRole('heading', { name: 'First task' }).waitFor({ timeout: 10000 });
  await learner.getByRole('button', { name: 'Send answer' }).click();
  await teacher.getByText('0 / 1').waitFor({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'End lesson' }).click();
  await teacher.getByRole('dialog', { name: 'Finish this session?' }).getByRole('button', { name: 'End and save results' }).click();
  await teacher.getByRole('heading', { name: 'Lesson finished' }).waitFor();
  await teacher.getByRole('link', { name: 'View results' }).click();
  await teacher.getByRole('heading', { name: 'Previous live lessons' }).waitFor();
  await teacher.getByRole('button', { name: /First task/ }).click();
  await teacher.getByText('Question 1').first().waitFor();
  // A personal Lesson file offers the same entry point; a Class-origin copy does not.
  await teacher.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    const baseDoc = { owner: 'teacher1', ownerName: 'Teacher', title: 'My standalone lesson', kind: 'lesson', docKey: 'fixture-doc-key', members: {}, memberIds: [] };
    await setDoc(doc(db, 'sharedDocs', 'standalone-file'), baseDoc);
    await setDoc(doc(db, 'sharedDocs', 'class-origin-file'), { ...baseDoc, title: 'Copied from Class', originClassId: 'class-1' });
    await setDoc(doc(db, 'sharedDocs', 'standalone-file', 'tasks', 'task-1'), { order: 0, kind: 'task', title: 'First task', instructions: 'Choose the best answer.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Say hello.' }] }] } });
    const fixture = JSON.parse(localStorage.getItem('rll.fixture'));
    fixture.run = { ...fixture.run, runId: 'file-run', fileId: 'standalone-file', resourceId: null, sourceKind: 'file', edition: null, status: 'lobby', currentTaskId: null, endedAt: null };
    fixture.participants = []; fixture.answers = [];
    localStorage.setItem('rll.fixture', JSON.stringify(fixture));
  });
  await teacher.goto(`${base}/doc/standalone-file`);
  await teacher.getByRole('button', { name: 'Start live lesson' }).waitFor();
  await teacher.getByRole('button', { name: 'Start live lesson' }).click();
  await teacher.getByText('482193').waitFor();
  assert.match(teacher.url(), /\/resource-hub\/lesson\/live\/file-run/);
  await teacher.goto(`${base}/doc/class-origin-file`);
  await teacher.locator('.lf-side').waitFor();
  assert.equal(await teacher.getByRole('button', { name: 'Start live lesson' }).count(), 0);
  console.log('PASS Resource Hub and personal Lesson file live entry, guest join, task, submit, end, history, and Class-origin gate (mock callable).');
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:5184';
const screenshots = process.env.SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
const vite = process.env.TEST_BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', '5184'], { stdio: 'ignore', detached: true });
if (vite) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(base).then(response => response.ok, () => false)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) { process.kill(-vite.pid); throw new Error('The local lesson preview server did not start.'); }
}
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
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-lesson-teacher-lobby.png` });

  const learner = await context.newPage();
  await learner.goto(`${base}/lesson-join/482193`);
  await learner.getByRole('heading', { name: 'Ready to learn together?' }).waitFor();
  await learner.getByLabel('Your name').fill('Mia');
  await learner.getByRole('button', { name: 'Join lesson' }).click();
  await learner.getByRole('heading', { name: 'You’re in!' }).waitFor();
  await teacher.getByText('Mia').waitFor({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'Start first task' }).click();
  await learner.getByRole('heading', { name: 'First task' }).waitFor({ timeout: 10000 });
  if (screenshots) await learner.screenshot({ path: `${screenshots}/live-lesson-learner-task.png` });
  await learner.getByRole('button', { name: 'Send answer' }).click();
  await teacher.getByText('0 / 1').waitFor({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'End lesson' }).click();
  await teacher.getByRole('dialog', { name: 'Finish this session?' }).getByRole('button', { name: 'End and save results' }).click();
  await teacher.getByRole('heading', { name: 'Lesson finished' }).waitFor();
  await teacher.getByRole('link', { name: 'View results' }).click();
  await teacher.getByRole('heading', { name: 'Previous live lessons' }).waitFor();
  await teacher.getByRole('button', { name: /First task/ }).click();
  await teacher.getByText('Question 1').first().waitFor();
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-lesson-teaching-history.png` });
  // A personal Lesson file offers the same entry point; a Class-origin copy does not.
  await teacher.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    const baseDoc = { owner: 'teacher1', ownerName: 'Teacher', title: 'My standalone lesson', kind: 'lesson', standaloneLesson: true, docKey: 'fixture-doc-key', members: {}, memberIds: [] };
    await setDoc(doc(db, 'sharedDocs', 'standalone-file'), baseDoc);
    await setDoc(doc(db, 'sharedDocs', 'class-origin-file'), { ...baseDoc, title: 'Copied from Class', standaloneLesson: false, originClassId: 'class-1' });
    await setDoc(doc(db, 'sharedDocs', 'legacy-file'), { owner: 'teacher1', ownerName: 'Teacher', title: 'Older Class copy', kind: 'lesson', docKey: 'legacy-fixture-key', members: {}, memberIds: [] });
    await setDoc(doc(db, 'sharedDocs', 'standalone-file', 'tasks', 'task-1'), { order: 0, kind: 'task', title: 'First task', instructions: 'Choose the best answer.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Say hello.' }] }] } });
    const fixture = JSON.parse(localStorage.getItem('rll.fixture'));
    fixture.run = { ...fixture.run, runId: 'file-run', fileId: 'standalone-file', resourceId: null, sourceKind: 'file', edition: null, status: 'lobby', currentTaskId: null, endedAt: null };
    fixture.participants = []; fixture.answers = [];
    localStorage.setItem('rll.fixture', JSON.stringify(fixture));
  });
  await teacher.goto(`${base}/doc/standalone-file`);
  await teacher.getByRole('button', { name: 'Invite learners', exact: true }).waitFor();
  const header = await teacher.locator('.dp-bar').boundingBox();
  const view = await teacher.getByRole('radiogroup', { name: 'Lesson view' }).boundingBox();
  const outline = await teacher.locator('.lf-side').boundingBox();
  const shell = await teacher.locator('.dp.k-lesson').boundingBox();
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-lesson-file-layout.png` });
  assert.ok(header && view && outline && view.y >= header.y && view.y + view.height <= header.y + header.height, 'Digital, Paper and Learner preview belong in the document header');
  assert.ok(shell && outline && Math.abs(outline.y + outline.height - (shell.y + shell.height)) <= 2, 'the lesson outline should fill its available height above Messages');
  await teacher.getByRole('button', { name: '+ Add' }).click();
  await teacher.getByRole('menuitem', { name: 'New task' }).waitFor();
  await teacher.keyboard.press('Escape');
  await teacher.locator('.lf-ai-tools > summary').click();
  await teacher.getByRole('button', { name: 'Discuss with Teacher’s Companion' }).waitFor();
  await teacher.locator('.lf-ai-tools > summary').click();
  await teacher.getByRole('radio', { name: 'Paper' }).click();
  await teacher.locator('.lf-split').waitFor();
  await teacher.getByRole('radio', { name: /Learner preview/ }).click();
  await teacher.locator('.lf-learner-preview').waitFor();
  await teacher.getByRole('radio', { name: 'Digital' }).click();
  await teacher.locator('.lf-task').waitFor();
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-lesson-file-entry.png` });
  await teacher.getByRole('button', { name: 'Invite learners', exact: true }).click();
  await teacher.getByText('482193').waitFor();
  assert.match(teacher.url(), /\/resource-hub\/lesson\/live\/file-run/);
  await teacher.goto(`${base}/doc/class-origin-file`);
  await teacher.locator('.lf-side').waitFor();
  assert.equal(await teacher.getByRole('button', { name: 'Invite learners', exact: true }).count(), 0);
  await teacher.goto(`${base}/doc/legacy-file`);
  await teacher.locator('.lf-side').waitFor();
  assert.equal(await teacher.getByRole('button', { name: 'Invite learners', exact: true }).count(), 0);
  console.log('PASS Resource Hub and personal Lesson file live entry, guest join, task, submit, end, history, and Class-origin gate (mock callable).');
} finally {
  await browser.close();
  if (vite) { try { process.kill(-vite.pid); } catch { vite.kill(); } }
}

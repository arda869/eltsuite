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
  if (screenshots) await learner.screenshot({ path: `${screenshots}/live-lesson-learner-join.png` });
  await learner.getByLabel('Your name').fill('Mia');
  await learner.getByRole('button', { name: 'Join lesson' }).click();
  await learner.getByRole('heading', { name: 'You’re in!' }).waitFor();
  assert.equal(await learner.getByRole('group', { name: 'Tell your teacher' }).getByRole('button').count(), 3);
  await learner.getByRole('button', { name: 'Raise your hand' }).click();
  await teacher.getByText('Hand raised').waitFor({ timeout: 10000 });
  await learner.getByRole('button', { name: 'I’m stuck: tell your teacher' }).click();
  await teacher.getByText('Needs help').waitFor({ timeout: 10000 });
  await learner.getByRole('button', { name: 'Send a reaction' }).click();
  await learner.getByRole('button', { name: 'Got it' }).click();
  await teacher.getByText('Got it').waitFor({ timeout: 10000 });
  if (screenshots) await learner.screenshot({ path: `${screenshots}/live-lesson-learner-waiting.png` });
  await teacher.getByText('Mia').waitFor({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'Start first task' }).click();
  await learner.getByRole('heading', { name: 'First task' }).waitFor({ timeout: 10000 });
  const spacing = await learner.evaluate(() => {
    const status = document.querySelector('.rll-session-presence')?.getBoundingClientRect();
    const frame = document.querySelector('.rll-session .task-frame')?.getBoundingClientRect();
    const controls = document.querySelector('.rll-live-float')?.getBoundingClientRect();
    return { gap: frame.top - status.bottom, controlsLeft: controls.left };
  });
  assert.ok(spacing.gap >= 6 && spacing.gap <= 14, `live status and task use one compact gap: ${JSON.stringify(spacing)}`);
  assert.ok(spacing.controlsLeft <= 20, `learner controls stay at bottom left: ${JSON.stringify(spacing)}`);
  await learner.getByRole('button', { name: 'Hide the task list' }).click();
  assert.equal(await learner.locator('#rll-task-list').isVisible(), false);
  await learner.getByRole('button', { name: 'Show the task list' }).click();
  assert.equal(await learner.locator('#rll-task-list').isVisible(), true);
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
  const classLesson = await teacher.evaluate(async () => {
    const fixture = JSON.parse(localStorage.getItem('mockdemo'));
    const { db } = await import('/src/lib/firebase.ts');
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    await setDoc(doc(db, 'classes', fixture.classId, 'live', 'state'), { teaching: true, itemId: fixture.itemId, taskId: fixture.taskId || '', teacherName: 'Teacher' });
    return fixture.itemId;
  });
  await learner.goto(`${base}/learn/${classLesson}?as=Mia`);
  const classSignals = learner.getByRole('group', { name: 'Tell your teacher' });
  await classSignals.waitFor();
  assert.equal(await classSignals.getByRole('button').count(), 3);
  const classSpacing = await learner.evaluate(() => {
    const status = document.querySelector('.center-col > .live-who')?.getBoundingClientRect();
    const frame = document.querySelector('.center-col > .task-frame')?.getBoundingClientRect();
    const controls = document.querySelector('.live-float')?.getBoundingClientRect();
    return { gap: frame && status ? frame.top - status.bottom : null, left: controls?.left };
  });
  assert.ok(classSpacing.gap >= 6 && classSpacing.gap <= 14, `Class status and task have a compact gap: ${JSON.stringify(classSpacing)}`);
  assert.ok(classSpacing.left <= 20, `Class learner controls stay at bottom left: ${JSON.stringify(classSpacing)}`);
  if (screenshots) await learner.screenshot({ path: `${screenshots}/live-class-learner-task.png` });
  await learner.setViewportSize({ width: 390, height: 844 });
  assert.ok((await learner.locator('.live-float').boundingBox()).x <= 20, 'Class learner signals stay bottom left on phones');
  await learner.setViewportSize({ width: 1280, height: 850 });
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
  await teacher.getByRole('button', { name: 'Lesson', exact: true }).waitFor();
  const header = await teacher.locator('.dp-bar').boundingBox();
  const view = await teacher.getByRole('radiogroup', { name: 'Lesson view' }).boundingBox();
  const outline = await teacher.locator('.lf-side').boundingBox();
  const shell = await teacher.locator('.dp.k-lesson').boundingBox();
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-lesson-file-layout.png` });
  assert.ok(header && view && outline && view.y >= header.y && view.y + view.height <= header.y + header.height, 'Digital, Paper and Learner preview belong in the document header');
  assert.ok(shell && outline && Math.abs(outline.y + outline.height - (shell.y + shell.height)) <= 2, `the lesson outline should fill its available height above Messages: ${JSON.stringify({shell,outline})}`);
  await teacher.getByRole('button', { name: 'Lesson', exact: true }).click();
  await teacher.getByRole('menuitem', { name: /Invite learners/ }).waitFor();
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
  await teacher.getByRole('button', { name: 'Lesson', exact: true }).click();
  await teacher.getByRole('menuitem', { name: /Invite learners/ }).click();
  const invite = teacher.getByRole('dialog', { name: 'Invite learners live' });
  await invite.getByText('482193', { exact: true }).waitFor();
  assert.match(teacher.url(), /\/doc\/standalone-file/, 'invitation opens over the real file editor');
  await invite.getByRole('img', { name: /QR code to join lesson/ }).waitFor();
  const encodedLink = `${base}/lesson-join/482193`;
  assert.equal(await invite.locator('.rll-invite-link span').innerText(), encodedLink, 'invitation displays the actual join route');
  assert.match(await invite.getByRole('img', { name: /QR code to join lesson/ }).getAttribute('src') || '', /^data:image\/png;base64,/, 'invitation generates a QR image');
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-standalone-lesson-invite.png` });
  await teacher.setViewportSize({ width: 390, height: 844 });
  const mobileInvite = await invite.boundingBox();
  assert.ok(mobileInvite && mobileInvite.x >= 0 && mobileInvite.x + mobileInvite.width <= 390, `invitation fits on a phone: ${JSON.stringify(mobileInvite)}`);
  if (screenshots) await teacher.screenshot({ path: `${screenshots}/live-standalone-lesson-invite-mobile.png` });
  await teacher.setViewportSize({ width: 1280, height: 850 });
  // The production auth SDK persists sign-in across tabs. The local mock defaults
  // to sessionStorage to isolate teacher/learner tabs, so opt this teacher into
  // its cross-tab localStorage fallback before opening the projector tab.
  await teacher.evaluate(() => localStorage.setItem('mockuid', 'teacher1'));
  const projectorPage = context.waitForEvent('page');
  await invite.getByRole('link', { name: 'Show on classroom screen' }).click();
  const projector = await projectorPage;
  await projector.getByRole('heading', { name: 'Join the lesson.' }).waitFor();
  await projector.getByText('482193', { exact: true }).waitFor();
  await projector.getByRole('img', { name: /QR code to join lesson/ }).waitFor();
  assert.match(await projector.getByRole('img', { name: /QR code to join lesson/ }).getAttribute('src') || '', /^data:image\/png;base64,/, 'projector generates a QR image');
  if (screenshots) await projector.screenshot({ path: `${screenshots}/live-standalone-lesson-projector.png` });
  await projector.close();
  await invite.getByRole('button', { name: 'View room' }).click();
  await teacher.getByText('482193').waitFor();
  assert.match(teacher.url(), /\/resource-hub\/lesson\/live\/file-run/);
  await teacher.goto(`${base}/doc/class-origin-file`);
  await teacher.locator('.lf-side').waitFor();
  await teacher.getByRole('button', { name: 'Lesson', exact: true }).click();
  assert.equal(await teacher.getByRole('menuitem', { name: /Invite learners/ }).count(), 0);
  await teacher.keyboard.press('Escape');
  await teacher.goto(`${base}/doc/legacy-file`);
  await teacher.locator('.lf-side').waitFor();
  await teacher.getByRole('button', { name: 'Lesson', exact: true }).click();
  assert.equal(await teacher.getByRole('menuitem', { name: /Invite learners/ }).count(), 0);
  console.log('PASS Resource Hub and personal Lesson file live entry, guest join, task, submit, end, history, and Class-origin gate (mock callable).');
} finally {
  await browser.close();
  if (vite) { try { process.kill(-vite.pid); } catch { vite.kill(); } }
}

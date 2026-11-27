// Real editor journey with Firebase stand-ins. Run: node test/suite-script-structure-ui.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const port = '5377', base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', port, '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
let browser, page;
try {
  for (let i = 0; i < 120; i++) {
    if (await fetch(base + '/test/document-tools-check.ts').then(r => r.text(), () => '').then(text => text.includes('@tiptap_core.js'))) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  page = await browser.newPage({ viewport: { width: 1460, height: 940 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/dev.html?seed&as=teacher');
  await page.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.mockdemo; }, null, { timeout: 180000 });
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 180000 });
  const scene = await page.evaluate(async () => {
    const demo = JSON.parse(localStorage.mockdemo);
    const { doc, setDoc, serverTimestamp } = await import('/test/mock/firestore.ts');
    const { addTask, taskRef, saveNotes } = await import('/src/lib/tasks.ts');
    const lessonId = 'suite-structure-journey';
    await setDoc(doc({}, 'classes', demo.classId, 'items', lessonId), { type: 'lesson', title: 'SuiteScript structure journey', order: 90, hidden: false, locked: false, updatedAt: serverTimestamp() });
    const content = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    const plain = await addTask(demo.classId, lessonId, 0, 'task', { title: 'Lead in', instructions: '', content: content('Lead in original.') });
    const a = await addTask(demo.classId, lessonId, 1, 'task', { title: 'Partner exchange', instructions: '', content: content('Learner A original.') });
    const b = await addTask(demo.classId, lessonId, 2, 'task', { title: 'Partner exchange', instructions: '', content: content('Learner B original.') });
    await setDoc(taskRef(demo.classId, lessonId, a), { variants: [b], variant: 'A' }, { merge: true });
    await setDoc(taskRef(demo.classId, lessonId, b), { family: a, variant: 'B' }, { merge: true });
    await saveNotes(demo.classId, lessonId, a, 'Private A note');
    await saveNotes(demo.classId, lessonId, b, 'Private B note');
    return { classId: demo.classId, lessonId, plain, a, b };
  });
  await page.goto(`${base}/class/${scene.classId}/lesson/${scene.lessonId}?as=teacher`);
  await page.getByRole('button', { name: 'Partner exchange', exact: false }).first().click();
  await page.getByRole('button', { name: 'More: groups, export, shortcuts' }).click();
  await page.getByRole('menuitem', { name: 'Edit lesson as SuiteScript…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit activity as SuiteScript' });
  await dialog.getByText('Which learner version should this script edit?').waitFor();
  mkdirSync('outputs/suite-script', { recursive: true });
  await page.screenshot({ path: 'outputs/suite-script/structure-version-scope.png' });
  await dialog.getByRole('combobox').selectOption({ label: 'Learner B' });
  await dialog.getByRole('button', { name: 'Open script' }).click();
  const source = dialog.getByRole('textbox', { name: 'SuiteScript source' });
  await source.waitFor();
  const initial = await source.inputValue();
  assert.match(initial, /Learner B original\./);
  assert.doesNotMatch(initial, /Learner A original\./);
  assert.match(initial, /Private B note/);
  assert.doesNotMatch(initial, /Private A note/);
  await page.screenshot({ path: 'outputs/suite-script/structure-editor-activity.png' });
  await source.fill(initial.replace('Learner B original.', 'Learner B revised.'));
  await dialog.getByRole('button', { name: 'Apply to activity' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const persisted = await page.evaluate(async scene => {
    const { getDoc } = await import('/test/mock/firestore.ts');
    const { taskRef, notesRef } = await import('/src/lib/tasks.ts');
    const { bodyRef } = await import('/src/lib/groups.ts');
    const read = async id => ({ task: (await getDoc(taskRef(scene.classId, scene.lessonId, id))).data(), body: (await getDoc(bodyRef(scene.classId, scene.lessonId, id))).data(), notes: (await getDoc(notesRef(scene.classId, scene.lessonId, id))).data() });
    return { a: await read(scene.a), b: await read(scene.b), plain: await read(scene.plain) };
  }, scene);
  assert.match(JSON.stringify(persisted.b.body), /Learner B revised\./);
  assert.doesNotMatch(JSON.stringify(persisted.b.task), /Learner B revised\./, 'restricted B content must stay out of its public task row');
  assert.match(JSON.stringify(persisted.a.body ?? persisted.a.task), /Learner A original\./);
  assert.match(JSON.stringify(persisted.plain.task), /Lead in original\./);
  assert.match(JSON.stringify(persisted.a.notes), /Private A note/);
  assert.match(JSON.stringify(persisted.b.notes), /Private B note/);
  await page.evaluate(async scene => {
    const { addTask } = await import('/src/lib/tasks.ts');
    const { communicativeFixture } = await import('/test/communicative-fixtures.ts');
    return addTask(scene.classId, scene.lessonId, 3, 'task', { title: 'Private cue cards', instructions: '', content: { type: 'doc', content: [communicativeFixture('cue')] } });
  }, scene);
  await page.reload();
  await page.getByRole('button', { name: 'Private cue cards', exact: false }).first().click();
  await page.getByRole('button', { name: 'More: groups, export, shortcuts' }).click();
  await page.getByRole('menuitem', { name: 'Edit selected task as SuiteScript…' }).click();
  const cueDialog = page.getByRole('dialog', { name: 'Edit task as SuiteScript' });
  await cueDialog.getByRole('textbox', { name: 'SuiteScript source' }).waitFor();
  const learnerPreview = await cueDialog.locator('.ss-source__preview').innerText();
  assert.doesNotMatch(learnerPreview, /full set of cards|Teacher view/);
  assert.equal((learnerPreview.match(/Your private budget is \d+ tokens/g) ?? []).length, 1, 'learner preview must show one assigned card, not the teacher set');
  await cueDialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Lead in', exact: false }).first().click();
  await page.getByRole('button', { name: 'More: groups, export, shortcuts' }).click();
  await page.getByRole('menuitem', { name: 'Edit selected task as SuiteScript…' }).click();
  const staleDialog = page.getByRole('dialog', { name: 'Edit task as SuiteScript' });
  const staleSource = staleDialog.getByRole('textbox', { name: 'SuiteScript source' });
  await staleSource.waitFor();
  await staleSource.fill((await staleSource.inputValue()).replace('Lead in original.', 'Should not overwrite.'));
  await page.evaluate(async scene => { const { saveNotes } = await import('/src/lib/tasks.ts'); await saveNotes(scene.classId, scene.lessonId, scene.plain, 'Edited in another window.'); }, scene);
  await staleDialog.getByRole('button', { name: 'Apply to task' }).click();
  await staleDialog.getByRole('alert').getByText(/changed while SuiteScript was open/).waitFor();
  page.once('dialog', confirm => confirm.accept());
  await staleDialog.getByRole('button', { name: 'Cancel' }).click();
  // Resource Hub uses a revision-checked draft and retains the unselected A section.
  await page.evaluate(() => { const auth = JSON.parse(localStorage.mockauth); auth.teacher1.email = 'ardanurioglu@gmail.com'; localStorage.setItem('mockauth', JSON.stringify(auth)); });
  await page.goto(base + '/dev.html?as=teacher');
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  const hub = await page.evaluate(async () => {
    const { blankResourceDraft, addLearnerVersion } = await import('/src/resourceHub/hubEditorData.ts');
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    const draft = blankResourceDraft('teacher1');
    draft.id = 'suite-structure-hub-journey';
    draft.title = 'Partner exchange from Hub';
    draft.summary = 'A safe A/B resource.';
    const a = draft.sections.find(section => section.audience === 'learner');
    a.title = 'Partner exchange';
    a.content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hub A original.' }] }] };
    const created = addLearnerVersion(draft.sections, a.id);
    draft.sections = created.sections;
    const b = draft.sections.find(section => section.id === created.id);
    b.content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hub B original.' }] }] };
    draft.sections.push({ id: `${a.id}-notes`, title: 'A notes', audience: 'teacher', kind: 'notes', instructions: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hub private A.' }] }] } });
    draft.sections.push({ id: `${b.id}-notes`, title: 'B notes', audience: 'teacher', kind: 'notes', instructions: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hub private B.' }] }] } });
    await setDoc(doc({}, 'resourceHubDrafts', draft.id), draft);
    return { id: draft.id, a: a.id, b: b.id };
  });
  await page.goto(`${base}/resource-hub/admin/${hub.id}`);
  await page.getByRole('button', { name: 'SuiteScript activity' }).click();
  const hubDialog = page.getByRole('dialog', { name: 'Edit activity as SuiteScript' });
  await hubDialog.getByRole('combobox').selectOption({ label: 'Learner B' });
  await hubDialog.getByRole('button', { name: 'Open script' }).click();
  const hubSource = hubDialog.getByRole('textbox', { name: 'SuiteScript source' });
  await hubSource.waitFor();
  const hubInitial = await hubSource.inputValue();
  assert.match(hubInitial, /Hub B original\./);
  assert.doesNotMatch(hubInitial, /Hub A original\./);
  await page.screenshot({ path: 'outputs/suite-script/structure-editor-resource-hub.png' });
  await hubSource.fill(hubInitial.replace('Hub B original.', 'Hub B revised.'));
  await hubDialog.getByRole('button', { name: 'Apply to activity' }).click();
  await hubDialog.waitFor({ state: 'hidden' });
  const hubSaved = await page.evaluate(async id => { const { getDoc, doc } = await import('/test/mock/firestore.ts'); return (await getDoc(doc({}, 'resourceHubDrafts', id))).data(); }, hub.id);
  assert.match(JSON.stringify(hubSaved.sections.find(section => section.id === hub.b)), /Hub B revised\./);
  assert.match(JSON.stringify(hubSaved.sections.find(section => section.id === hub.a)), /Hub A original\./);
  assert.match(JSON.stringify(hubSaved.sections.find(section => section.id === `${hub.a}-notes`)), /Hub private A\./);
  assert.match(JSON.stringify(hubSaved.sections.find(section => section.id === `${hub.b}-notes`)), /Hub private B\./);
  assert.deepEqual(errors, []);
  console.log('PASS Class and Resource Hub whole-activity SuiteScript selected Learner B, changed only B, retained A and private notes; screenshots captured. Browser with mocked Firebase.');
} catch (error) {
  if (page) { mkdirSync('outputs/suite-script', { recursive: true }); await page.screenshot({ path: 'outputs/suite-script/structure-editor-failure.png' }); }
  throw error;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
}

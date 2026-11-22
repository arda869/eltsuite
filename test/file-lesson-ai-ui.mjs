import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:5186';
const vite = process.env.TEST_BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', '5186'], { stdio: 'ignore', detached: true });
if (vite) {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (await fetch(base).then(response => response.ok, () => false)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) { process.kill(-vite.pid); throw Error('Local test server did not start'); }
}
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    await setDoc(doc(db, 'aiPilot', 'teacher1'), { enabled: true });
    await setDoc(doc(db, 'sharedDocs', 'standalone-ai-file'), { owner: 'teacher1', ownerName: 'Teacher', title: 'Yesterday', kind: 'lesson', standaloneLesson: true, docKey: 'fixture-key', members: {}, memberIds: [] });
    await setDoc(doc(db, 'sharedDocs', 'standalone-ai-file', 'tasks', 'first'), { order: 0, kind: 'task', title: 'First task', instructions: 'Complete it.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello.' }] }] } });
    localStorage.setItem('fileAi.fixture', JSON.stringify({ result: { title: 'A new question', instructions: 'Choose the answer.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The answer is ' }, { type: 'gap', attrs: { id: 'new-gap', answers: [] } }] }] }, key: { 'new-gap': { kind: 'gap', answers: ['blue'] } }, notes: 'Ask why blue fits.' } }));
  });
  await page.goto(`${base}/doc/standalone-ai-file`);
  await page.locator('.lf-ai-tools > summary').click();
  await page.getByRole('button', { name: 'Create a task with AI' }).click();
  await page.getByRole('dialog', { name: 'Create a task with AI' }).getByRole('button', { name: 'Generate draft' }).click();
  await page.getByRole('heading', { name: 'A new question' }).waitFor();
  assert.equal(await page.locator('.lf-row').count(), 1, 'reviewing does not add a task');
  await page.getByRole('button', { name: 'Close AI tool' }).click();
  await page.locator('.lf-ai-tools > summary').click();
  await page.getByRole('button', { name: 'Resume AI draft' }).click();
  await page.getByRole('heading', { name: 'A new question' }).waitFor();
  await page.getByRole('button', { name: 'Add task to lesson' }).click();
  await page.getByRole('button', { name: /A new question/ }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /A new question/ }).click();
  await page.getByText('The answer is').waitFor();
  await page.getByText('Teacher notes').waitFor();
  const saved = await page.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const { doc, getDoc } = await import('/test/mock/firestore.ts');
    const { splitKey } = await import('/src/lib/questions.ts');
    const keys = Object.keys(JSON.parse(localStorage.getItem('mockfs') || '{}')).filter(key => key.startsWith('sharedDocs/standalone-ai-file/tasks/ai_'));
    const row = await getDoc(doc(db, keys[0]));
    return { title: row.data()?.title, key: splitKey(row.data()?.content).key['new-gap'] };
  });
  assert.equal(saved.title, 'A new question');
  assert.deepEqual(saved.key.answers, ['blue']);
  console.log('PASS standalone file AI menu, blank optional direction, reviewed draft, explicit Apply, and reloaded task/key (mock callable).');
} finally {
  await browser.close();
  if (vite) { try { process.kill(-vite.pid); } catch { vite.kill(); } }
}

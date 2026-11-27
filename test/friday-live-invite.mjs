// Focused, mocked-browser check for Friday's classroom QR and pop-out controls.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://localhost:5197';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', '5197', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80 && !await fetch(base).then(r => r.ok, () => false); i++) await new Promise(r => setTimeout(r, 500));
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/dev.html?seed&as=teacher');
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  const klass = await page.evaluate(id => JSON.parse(localStorage.getItem('mockfs'))[`classes/${id}`], demo.classId);

  await page.goto(`${base}/class/${demo.classId}`);
  await page.getByRole('button', { name: 'Project QR' }).click();
  await page.getByRole('dialog', { name: /Invite learners/ }).locator('img').waitFor();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('join-projector'), null, { timeout: 5000 });
  if (process.env.FRIDAY_SCREENSHOTS) { mkdirSync('outputs/friday-live-invite', { recursive: true }); await page.screenshot({ path: 'outputs/friday-live-invite/class-qr.png' }); }
  if (!await page.getByRole('dialog').getByText(klass.classCode).count()) throw Error('Class code missing from projection');
  await page.getByRole('button', { name: /Close learner invitation/ }).click();
  if (await page.getByRole('dialog', { name: /Invite learners/ }).count()) throw Error('Projection did not close');

  const questionTaskId = await page.evaluate(({ classId, itemId }) => Object.entries(JSON.parse(localStorage.getItem('mockfs')))
    .find(([path, value]) => path.startsWith(`classes/${classId}/items/${itemId}/tasks/`) && path.split('/').length === 6 && value.title === 'Notice the rule')?.[0].split('/')[5], demo);
  if (!questionTaskId) throw Error('Sample question task missing');
  await page.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}?task=${questionTaskId}`);
  await page.getByRole('textbox', { name: 'Task title', exact: true }).waitFor();
  await page.locator('.mode-btn').click();
  await page.getByRole('menuitemradio', { name: /Teaching/ }).click();
  await page.getByRole('button', { name: 'Project QR' }).click();
  await page.getByRole('dialog', { name: /Invite learners/ }).locator('img').waitFor();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('join-projector'), null, { timeout: 5000 });
  if (process.env.FRIDAY_SCREENSHOTS) await page.screenshot({ path: 'outputs/friday-live-invite/lesson-qr.png' });
  const url = await page.evaluate(async d => (await import('/src/lib/site.ts')).lessonJoinLink(d.code, d.classId, d.itemId), { code: klass.classCode, ...demo });
  if (!url.includes(`lesson=${encodeURIComponent(demo.itemId)}`)) throw Error('Lesson QR does not target lesson');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: /Invite learners/ }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Pop out controls' }).waitFor();
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Pop out controls' }).click()]);
  await popup.locator('.live-popout-shell .live-panel').waitFor();
  if (process.env.FRIDAY_SCREENSHOTS) await popup.screenshot({ path: 'outputs/friday-live-invite/live-controls.png' });
  await popup.locator('.lg-q').first().click();
  await popup.getByRole('button', { name: 'Show this answer to the class' }).click();
  await page.waitForFunction(({ classId, taskId }) => JSON.parse(localStorage.getItem('mockfs'))[`classes/${classId}/live/state`]?.revealedQs?.[taskId]?.length === 1, { classId: demo.classId, taskId: questionTaskId });
  if (!await page.getByText('Live controls are in a separate window.').count()) throw Error('Main window did not show dock state');
  await popup.getByRole('button', { name: 'Dock back' }).click();
  await page.getByRole('button', { name: 'Pop out controls' }).waitFor();
  const [popup2] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Pop out controls' }).click()]);
  await popup2.locator('.live-popout-shell .live-panel').waitFor();
  await popup2.close();
  await page.getByRole('button', { name: 'Pop out controls' }).waitFor();
  await page.evaluate(() => { window.__originalOpen = window.open; window.open = () => null; });
  await page.getByRole('button', { name: 'Pop out controls' }).click();
  await page.getByRole('alert').filter({ hasText: 'blocked the separate window' }).waitFor();
  await page.evaluate(() => { window.open = window.__originalOpen; });

  const learner = await ctx.newPage();
  await learner.goto(`${base}/join?code=${encodeURIComponent(klass.classCode)}&class=${encodeURIComponent(demo.classId)}&lesson=${encodeURIComponent(demo.itemId)}`);
  await learner.getByRole('textbox', { name: 'Your full name' }).fill('Mia Chan');
  for (const [i, digit] of [...demo.pins.find(p => p.name === 'Mia Chan').pin].entries()) await learner.getByRole('textbox', { name: `PIN digit ${i + 1}` }).fill(digit);
  await learner.getByRole('button', { name: 'Join class' }).click();
  await learner.waitForURL(`${base}/learn/${demo.itemId}`);
  await learner.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}`);
  if (await learner.getByRole('button', { name: 'Pop out controls' }).count()) throw Error('Learner could open teacher controls');

  const manual = await ctx.newPage();
  await manual.goto(`${base}/join`);
  await manual.getByRole('textbox', { name: 'Class code' }).fill(klass.classCode);
  await manual.getByRole('textbox', { name: 'Your full name' }).fill('Leo Wong');
  for (const [i, digit] of [...demo.pins.find(p => p.name === 'Leo Wong').pin].entries()) await manual.getByRole('textbox', { name: `PIN digit ${i + 1}` }).fill(digit);
  await manual.getByRole('button', { name: 'Join class' }).click();
  await manual.getByRole('dialog', { name: 'Choose a profile picture' }).getByRole('button', { name: 'Later' }).click();
  await manual.getByRole('dialog', { name: 'Choose a profile picture' }).waitFor({ state: 'hidden' });
  await manual.getByRole('link', { name: 'Join lesson' }).click();
  await manual.waitForURL(`${base}/learn/${demo.itemId}`);
  console.log('Friday QR and pop-out: mocked browser journey passed');
} finally {
  await browser?.close();
  vite.kill();
}

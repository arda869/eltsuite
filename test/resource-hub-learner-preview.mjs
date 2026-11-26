import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5198';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await page.evaluate(() => {
    const accounts = JSON.parse(localStorage.getItem('mockauth'));
    accounts.teacher1.email = 'ardanurioglu@gmail.com';
    localStorage.setItem('mockauth', JSON.stringify(accounts));
  });
  await page.goto(`${base}/resource-hub/admin`);
  await page.getByRole('button', { name: '+ New lesson' }).click();
  await page.locator('.task-pick').filter({ hasText: 'Teacher notes' }).first().click();
  await page.getByRole('textbox', { name: 'Teacher notes' }).fill('PRIVATE TEACHER GUIDANCE');
  await page.locator('.task-pick').filter({ hasText: 'Learner task' }).first().click();
  await page.getByRole('textbox', { name: 'Learner task' }).fill('Only Learner A reads this.');
  await page.locator('.task-insert').last().locator('summary').click();
  await page.getByRole('button', { name: 'A/B version' }).last().click();
  await page.getByRole('textbox', { name: 'Learner task' }).fill('Only Learner B reads this.');
  await page.getByRole('radio', { name: 'Paper' }).click();
  const preview = page.getByLabel('Live activity preview');
  await preview.getByRole('tab', { name: 'Learner' }).click();
  const learner = preview.getByRole('tabpanel', { name: 'Learner view' });
  assert.match(await learner.innerText(), /Only Learner B reads this/);
  assert.doesNotMatch(await learner.innerText(), /Only Learner A reads this|PRIVATE TEACHER GUIDANCE/);
  await preview.getByRole('button', { name: 'Learner A' }).click();
  assert.match(await learner.innerText(), /Only Learner A reads this/);
  assert.doesNotMatch(await learner.innerText(), /Only Learner B reads this|PRIVATE TEACHER GUIDANCE/);
  await page.getByRole('radio', { name: 'Digital' }).click();
  await page.getByRole('radio', { name: 'Paper' }).click();
  assert.match(await learner.innerText(), /Only Learner A reads this/, 'selected version survives view changes');
  console.log('PASS Resource Hub learner preview isolates A/B content and private teacher notes.');
} finally { await browser.close(); }

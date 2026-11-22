import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5198';
const screenshots = process.env.SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await page.evaluate(() => {
    const accounts = JSON.parse(localStorage.getItem('mockauth'));
    accounts.teacher1.email = 'ardanurioglu@gmail.com';
    localStorage.setItem('mockauth', JSON.stringify(accounts));
  });
  await page.goto(`${base}/resource-hub/admin`);
  await page.getByRole('button', { name: '+ New lesson' }).click();
  await page.getByRole('button', { name: 'Details and filters' }).click();
  await page.getByLabel('Title', { exact: true }).fill('A4 preview test lesson');
  await page.getByLabel('Language focus').fill('past simple');
  await page.getByLabel('Short summary').fill('A complete lesson to check page breaks.');
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  await page.getByRole('button', { name: /Learner task/ }).first().click();
  await page.locator('.rhe-task-editor [contenteditable]').fill(Array.from({ length: 80 }, (_, index) => `Question ${index + 1}: Write a detailed answer about the experience and explain why it matters.`).join('\n'));
  await page.waitForFunction(() => {
    const host = document.querySelector('.rhe-a4-pages');
    return Number(host?.dataset.pageCount) >= 2 && host.querySelectorAll('canvas.rhe-a4-page').length === Number(host.dataset.pageCount);
  }, null, { timeout: 30000 });
  const pages = await page.locator('canvas.rhe-a4-page').evaluateAll(items => items.map(item => ({ width: item.width, height: item.height })));
  assert.ok(pages.length >= 2, 'all A4 sheets should appear');
  assert.ok(pages.every(({ width, height }) => Math.abs(width / height - 210 / 297) < 0.02), 'each rendered sheet should have A4 proportions');
  if (screenshots) await page.screenshot({ path: `${screenshots}/resource-hub-a4-editor.png` });
  await page.getByRole('button', { name: 'Expand ↗' }).click();
  await page.getByRole('dialog', { name: 'Large activity preview' }).waitFor();
  await page.waitForFunction(() => {
    const host = document.querySelector('.rhe-preview-overlay .rhe-a4-pages');
    return Number(host?.dataset.pageCount) >= 2 && host.querySelectorAll('canvas.rhe-a4-page').length === Number(host.dataset.pageCount);
  }, null, { timeout: 30000 });
  if (screenshots) await page.screenshot({ path: `${screenshots}/resource-hub-a4-expanded.png` });
  await page.getByRole('button', { name: 'Close large preview' }).click();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByLabel(/I checked the learner tasks/).check();
  await page.getByRole('button', { name: 'Publish edition' }).click();
  const publishedLink = page.getByRole('link', { name: 'View published page' });
  await publishedLink.waitFor();
  const [published] = await Promise.all([context.waitForEvent('page'), publishedLink.click()]);
  await published.waitForLoadState('networkidle');
  assert.match(published.url(), /\/resource-hub\?activity=lesson-/);
  // The local Firebase stand-in keeps its active user in sessionStorage; a new
  // noopener tab starts with no mock user. Real Firebase persists auth across tabs.
  await published.evaluate(() => sessionStorage.setItem('mockuid', 'teacher1'));
  await published.reload();
  await published.getByRole('heading', { name: 'A4 preview test lesson' }).waitFor();
  await published.getByRole('button', { name: /Print lesson pages/ }).waitFor();
  await published.getByRole('button', { name: /Copy tasks to a Class/ }).waitFor();
  if (screenshots) await published.screenshot({ path: `${screenshots}/resource-hub-teacher-page.png` });
  await published.getByRole('button', { name: /Print lesson pages/ }).click();
  if (screenshots) await published.screenshot({ path: `${screenshots}/resource-hub-print-pack.png` });
  await published.getByRole('button', { name: 'Preview PDF' }).click();
  await published.locator('.pv[role="dialog"]').waitFor();
  const [download] = await Promise.all([published.waitForEvent('download'), published.locator('.pv button[aria-label="Download"]').click()]);
  assert.match(download.suggestedFilename(), /A4 preview test lesson/i);
  await published.locator('.pv button[aria-label="Close"]').click();
  await published.getByRole('button', { name: 'Close without saving' }).click();
  await published.getByRole('button', { name: 'Cancel' }).click();
  await published.getByRole('button', { name: /Copy tasks to a Class/ }).click();
  await published.locator('.rh-class-card').first().click();
  await published.getByRole('button', { name: 'Copy 1 task' }).click();
  await published.getByRole('heading', { name: /Ready to edit in/ }).waitFor();
  await published.getByRole('link', { name: /Open editable lesson/ }).waitFor();
  console.log(`PASS Resource Hub Lesson creation, ${pages.length} A4 preview sheets, publication, PDF download, and Class copy.`);
} finally { await browser.close(); }

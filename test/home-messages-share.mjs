// Browser regression for the teacher's first screen, a saved message, and Collab access.
// Run with the Firebase stand-ins in test/vite.config.ts on port 5184.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE || 'http://127.0.0.1:5184';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(90000);
try {
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('mockdemo') || '{}').packId);
  await page.goto(`${base}/`);
  await page.getByRole('region', { name: 'Your classes' }).getByRole('link', { name: /Demo class/i }).waitFor();
  assert(!(await page.getByRole('region', { name: 'Your classes' }).innerText()).includes('No classes yet'));
  console.log('PASS Home shows the teacher’s class');

  await page.goto(`${base}/messages`);
  await page.getByRole('heading', { name: 'Messages', exact: true }).waitFor();
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByRole('button', { name: /Notes to self/ }).click();
  await page.getByRole('region', { name: 'Message history' }).waitFor();
  const message = `Release check ${Date.now()}`;
  await page.locator('.chat-box .ProseMirror').fill(message);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('region', { name: 'Message history' }).getByText(message).waitFor();
  await page.reload();
  await page.getByRole('region', { name: 'Message history' }).getByText(message).waitFor();
  console.log('PASS Message saves and is visible after reload');

  await page.goto(`${base}/`);
  const [docPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Collab document/i }).click(),
  ]);
  await docPage.waitForURL(/\/doc\//);
  await docPage.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = docPage.getByRole('dialog', { name: /Share/ });
  await dialog.getByRole('textbox', { name: 'Find people' }).fill('Mia');
  await dialog.getByRole('button', { name: /Mia Chan/ }).click();
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: 'Share with 1 person' }).click();
  await dialog.getByText('Shared with Mia.').waitFor();
  assert((await dialog.innerText()).includes('Mia Chan'));
  await docPage.reload();
  await docPage.getByRole('button', { name: 'Share', exact: true }).click();
  assert((await docPage.getByRole('dialog', { name: /Share/ }).innerText()).includes('Mia Chan'));
  console.log('PASS Collab access saves and remains after reload');
} finally {
  await browser.close();
}

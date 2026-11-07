// A slow class roster must not hold back colleagues in the Collab share picker.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE || 'http://127.0.0.1:5184';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
try {
  await page.goto(`${base}/dev.html?seed&colleagues&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockcolleagues'));
  await page.goto(`${base}/`);
  const [docPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Collab document/i }).click(),
  ]);
  await docPage.waitForURL(/\/doc\//);
  await docPage.evaluate(() => sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'query', path: 'classes/', count: 10, delay: 3500 }])));
  await docPage.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = docPage.getByRole('dialog', { name: /Share/ });
  await dialog.getByRole('textbox', { name: 'Find people' }).fill('Lena');
  await dialog.getByRole('button', { name: /Lena Park/ }).waitFor({ timeout: 2000 });
  assert(await dialog.getByRole('status').isVisible(), 'The class rosters should still be loading');
  console.log('PASS colleague appears before delayed class rosters');
  await dialog.getByRole('textbox', { name: 'Find people' }).fill('Mia');
  await dialog.getByRole('button', { name: /Mia Chan/ }).waitFor();
  console.log('PASS learner appears once her class roster arrives');
  await dialog.getByRole('button', { name: /Mia Chan/ }).click();
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: 'Share with 1 person' }).click();
  await docPage.getByRole('button', { name: 'Share', exact: true }).waitFor();
  assert.equal(await docPage.getByRole('button', { name: 'Share', exact: true }).getAttribute('data-shared'), 'true');
  console.log('PASS shared document changes Share icon state');
} finally {
  await browser.close();
}

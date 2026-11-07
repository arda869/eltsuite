// Super Admin opens its navigation while the organisations query is still loading.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE || 'http://127.0.0.1:5184';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
try {
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem('mockauth'));
    auth.teacher1.email = 'ardanurioglu@gmail.com';
    localStorage.setItem('mockauth', JSON.stringify(auth));
    sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'listen-orgs-all', path: 'orgs', count: 4, delay: 12000 }]));
  });
  await page.goto(`${base}/admin`);
  await page.getByRole('navigation', { name: 'Super Admin' }).waitFor({ timeout: 10000 });
  assert(await page.getByText('Loading organisations and activity…').isVisible());
  assert(!(await page.locator('body').innerText()).includes('Opening Super Admin…'));
  console.log('PASS Super Admin navigation opens while data is loading');
  await page.getByRole('heading', { name: 'What do you need to do?' }).waitFor();
  await page.getByRole('link', { name: /Teachers/ }).click();
  await page.getByRole('heading', { name: 'Teachers', exact: true }).waitFor();
  console.log('PASS deeper admin section opens after lazy load');
} finally {
  await browser.close();
}

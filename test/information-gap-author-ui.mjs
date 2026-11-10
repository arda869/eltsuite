import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5198/account', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Join free' }).click();
  await page.getByLabel('Your name').fill('Test Writer');
  await page.getByLabel('Email').fill(`writer-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('testPass123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'My writing' }).last().waitFor();
  await page.getByRole('link', { name: 'My writing' }).last().click();
  await page.getByRole('link', { name: 'New article' }).click({ timeout: 15000 }).catch(async error => {
    throw new Error(`${error.message}\nCurrent page: ${page.url()}\nVisible text: ${(await page.locator('body').innerText()).slice(0, 1200)}\nBrowser errors: ${errors.join(' | ')}`);
  });
  await page.getByLabel('Title').fill('Testing a classroom idea');
  await page.getByLabel('Short introduction').fill('A practical account from the classroom.');
  await page.getByLabel('Topic').fill('Methodology');
  await page.getByLabel('Article').fill('This is a draft that teachers can read after publication.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByRole('heading', { name: 'Edit article' }).waitFor();
  const draftUrl = page.url();
  assert.match(draftUrl, /\/write\/[^/]+$/);
  await Promise.all([
    page.waitForEvent('framenavigated'),
    page.getByRole('button', { name: 'Send to editors' }).click(),
  ]);
  await page.goto(draftUrl, { waitUntil: 'domcontentloaded' });
  await page.getByText('This article has been sent to the editors.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save draft' }).count(), 0);
  await page.goto('http://127.0.0.1:5198/write', { waitUntil: 'domcontentloaded' });
  await page.getByText('Essays · submitted').waitFor();
  await page.goto('http://127.0.0.1:5198/thread/new', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your question').fill('How do you use wait time?');
  await page.getByLabel('Topic').fill('Classroom interaction');
  await page.getByLabel('A little more context').fill('I am curious what teachers do after asking a difficult question.');
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.getByRole('heading', { name: 'How do you use wait time?' }).waitFor();
  await page.getByLabel('Add your perspective').fill('I count to five before I invite an answer.');
  await page.getByRole('button', { name: 'Post reply' }).click();
  await page.getByText('I count to five before I invite an answer.').waitFor();
  await page.goto('http://127.0.0.1:5198/pitch', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Working title').fill('A piece about wait time');
  await page.getByLabel('What would you like to write about?').fill('I would compare two classes and reflect on who gets to speak.');
  await page.getByRole('button', { name: 'Send idea' }).click();
  await page.getByRole('heading', { name: 'My writing' }).waitFor();
  await page.getByText('A piece about wait time').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS signup, draft, submit, conversation, reply, pitch');
} finally { await browser.close(); }

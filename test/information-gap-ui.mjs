import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const firestore = 'http://127.0.0.1:8080/v1/projects/demo-information-gap/databases/(default)/documents';
const value = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v };
async function seed(path, data) {
  const res = await fetch(`${firestore}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value(data).mapValue) });
  assert(res.ok, await res.text());
}
await seed('tigArticles/ui-article', { title: 'What our classroom questions reveal', standfirst: 'A practical reflection on listening to learners.', body: 'Good questions make thinking visible.\n\nTeachers can notice where learners hesitate.', section: 'Essays', topic: 'Methodology', authorUid: 'writer', authorName: 'Example Author', status: 'published', createdAt: 1, updatedAt: 1, publishedAt: 1 });
await seed('tigThreads/ui-thread', { title: 'How do you invite quieter learners in?', body: 'What has worked for your groups?', topic: 'Participation', authorUid: 'writer', authorName: 'Example Author', status: 'visible', createdAt: 1, updatedAt: 1 });
await seed('tigLessons/ui-lesson', { title: 'A conversation lesson', description: 'A lesson to practise asking follow-up questions.', url: 'https://eltsuite.com/', level: 'B1', authorName: 'Example Author', createdAt: 1 });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5198/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'What our classroom questions reveal' }).waitFor();
  assert(await page.getByRole('link', { name: 'How do you invite quieter learners in?' }).isVisible());
  await page.screenshot({ path: '/tmp/elt-ig-fixture-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Essays', exact: true }).click();
  await page.getByRole('link', { name: 'What our classroom questions reveal' }).click();
  await page.getByText('Teachers can notice where learners hesitate.').waitFor();
  await page.goto('http://127.0.0.1:5198/conversations', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'How do you invite quieter learners in?' }).click();
  await page.getByText('What has worked for your groups?').waitFor();
  await page.goto('http://127.0.0.1:5198/lessons', { waitUntil: 'domcontentloaded' });
  await page.getByText('A conversation lesson').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Open in ELT Suite' }).getAttribute('target'), '_blank');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5198/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'What our classroom questions reveal' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/elt-ig-fixture-mobile.png', fullPage: true });
  console.log('PASS public reading, section navigation, conversation, shared lesson, mobile width');
} finally { await browser.close(); }

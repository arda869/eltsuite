// A young learners' lesson in the real teacher editor and learner page, against the Firebase stand-ins.
// Start Vite with test/vite.config.ts first. YL_OUT chooses the screenshot folder.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.STYLE_BASE || 'http://localhost:5184';
const OUT = process.env.YL_OUT || 'work/young-journey';
await mkdir(OUT, { recursive: true });
const SRC = `# Animals and colours

## Task 1: Which animal?
[[mcq]]
Which animal says “moo”?
- a cat
* a cow
- a dog
[[/mcq]]

## Task 2: Finish the sentences
The {{cat}} is on the mat. I {{?*am|is|are}} seven. She {{?have|*has}} a bike.

## Task 3: Match the opposites
[[match]]
big = small
hot = cold
happy = sad
[[/match]]

## Task 4: Use the words
[[wordbank extra=blue]]

The sky is {{drag:grey}} today. I wear a {{drag:hat}}.

## Task 5: Make a sentence
[[order]]
I can swim very well
[[/order]]
`;
const b = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
p.setDefaultTimeout(30000);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const ok = (m) => console.log('PASS', m);
try {
  await p.goto(`${BASE}/dev.html?seed&as=teacher`);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('mockdemo') || '{}').packId, null, { timeout: 120000 });
  const demo = await p.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  const itemId = await p.evaluate(async ({ classId, src }) => {
    const { importLesson } = await import('/src/lib/textformat.ts');
    const { createLessonFromImport } = await import('/src/lib/transfer.ts');
    const { getClass, updateClass } = await import('/src/lib/classes.ts');
    const { updateDoc, doc } = await import('/test/mock/firestore.ts');
    await updateClass(await getClass(classId), { lessonStyle: 'young' });
    const pk = importLesson(src);
    const id = await createLessonFromImport(classId, null, pk.title, pk.tasks);
    await updateDoc(doc({}, 'classes', classId, 'items', id), { hidden: false });
    return id;
  }, { classId: demo.classId, src: SRC });
  const before = await p.evaluate((cid) => Object.fromEntries(Object.entries(JSON.parse(localStorage.mockfs)).filter(([k]) => k.startsWith(`classes/${cid}/items/`))), demo.classId);

  await p.goto(`${BASE}/class/${demo.classId}/lesson/${itemId}`);
  await p.locator('.task-frame[data-lesson-style="young"] .ProseMirror').first().waitFor();
  await p.waitForTimeout(1200);
  await p.locator('.task-frame').screenshot({ path: `${OUT}/editor-edit.png` });
  ok('Teacher editor opens in a young class');
  await p.keyboard.press('Control+Shift+P');
  await p.locator('.task-frame .task-body .opt').first().waitFor();
  await p.locator('.task-frame .task-body .opt').nth(1).click();
  await p.waitForTimeout(300);
  await p.locator('.task-frame').screenshot({ path: `${OUT}/editor-preview.png` });
  await p.getByRole('button', { name: 'Check answers', exact: true }).click();
  await p.locator('.task-frame .opt.right').first().waitFor();
  await p.waitForTimeout(900);
  await p.locator('.task-frame').screenshot({ path: `${OUT}/editor-preview-checked.png` });
  ok('Teacher preview: choose, check and see the result');

  // Learner page
  await p.goto(`${BASE}/learn/${itemId}?as=Mia`);
  await p.locator('.task-frame[data-lesson-style="young"] .task-body').waitFor();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/learner-1.png` });
  await p.locator('.task-body .opt').nth(1).click();
  await p.getByRole('button', { name: /^Check/ }).click();
  await p.locator('.task-body .opt.right').first().waitFor();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/learner-1-checked.png` });
  ok('Learner answers and checks a choice task');
  const next = p.getByRole('button', { name: 'Next task', exact: true });
  await next.click();
  await p.locator('.task-body [data-qid] input.gap-input').first().waitFor();
  await p.locator('.task-body input.gap-input').first().fill('cat');
  await p.locator('.task-body .slash-choice').nth(0).locator('.slash-opt').first().click();
  await p.locator('.task-body .slash-choice').nth(1).locator('.slash-opt').nth(1).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/learner-2.png` });
  await p.getByRole('button', { name: /^Check/ }).click();
  await p.locator('.task-body .gap-result').first().waitFor();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/learner-2-checked.png` });
  await next.click();
  await p.locator('.task-body .match-q').waitFor();
  await p.locator('.match-left .match-item').first().click();
  await p.locator('.match-right .match-item').first().click();
  await p.locator('.match-left .match-item').nth(1).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/learner-3.png` });
  await next.click();
  await p.locator('.task-body .word-bank').waitFor();
  await p.locator('.word-bank .bank-word').first().click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/learner-4-picked.png` });
  await p.locator('.task-body .drop-slot').first().click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/learner-4.png` });
  await next.click();
  await p.locator('.task-body .order-q').waitFor();
  await p.locator('.order-pool .bank-word').first().click();
  await p.locator('.order-pool .bank-word').first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/learner-5.png` });
  ok('Learner works through gaps, matching, word bank and word order');
  await p.setViewportSize({ width: 820, height: 1180 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/learner-5-portrait.png` });
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPad portrait scrolls sideways');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/learner-5-phone.png` });
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Phone scrolls sideways');
  ok('No sideways scrolling on iPad portrait or phone');
  const after = await p.evaluate((cid) => Object.fromEntries(Object.entries(JSON.parse(localStorage.mockfs)).filter(([k]) => k.startsWith(`classes/${cid}/items/`) && !k.includes('/answers') && !k.includes('/progress'))), demo.classId);
  for (const [k, v] of Object.entries(before)) if (!k.includes('/answers') && !k.includes('/progress')) assert.deepEqual(JSON.stringify(after[k]?.content ?? null), JSON.stringify(v?.content ?? null), `Lesson content changed: ${k}`);
  ok('Lesson content unchanged by viewing and answering');
  assert.deepEqual(errors, []);
  ok('No page errors');
} catch (e) {
  await p.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
  console.log('FAIL', p.url(), errors.join('\n'));
  throw e;
} finally {
  await b.close();
}

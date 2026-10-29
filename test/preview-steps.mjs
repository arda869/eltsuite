// Four fixes: the home page on a phone, the worksheet editor sliding open and closed, Exam settings
// only in exams, and a PDF whose pages are missing.
export default async function steps({ p, shot, say, demo, BASE }) {
  // Home on a phone.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(5000);
  await shot('home-phone');
  const edges = await p.evaluate(() => [...document.querySelectorAll('.home main > *, .home > *')].slice(0, 12).map((e) => `${e.className || e.tagName}:${Math.round(e.getBoundingClientRect().left)}-${Math.round(innerWidth - e.getBoundingClientRect().right)}`));
  say('home edges', edges.join(' '));
  await p.evaluate(() => window.scrollTo(0, 700));
  await p.waitForTimeout(500);
  await shot('home-phone-lower');

  // Worksheet view.
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.evaluate(() => localStorage.setItem('ll.sheetView', '1'));
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.waitForSelector('.sh-split', { timeout: 30000 });
  await p.waitForTimeout(2500);
  await shot('sheet-open');
  await p.click('.sh-desk', { position: { x: 8, y: 300 } });
  await p.waitForTimeout(140);
  await shot('sheet-closing');
  await p.waitForTimeout(600);
  await shot('sheet-closed');
  say('cols closed', await p.$eval('.sh-split', (e) => getComputedStyle(e).gridTemplateColumns));
  await p.locator('.sh-block.pick').nth(1).click();
  await p.waitForTimeout(160);
  await shot('sheet-opening');
  await p.waitForTimeout(600);
  say('cols open', await p.$eval('.sh-split', (e) => getComputedStyle(e).gridTemplateColumns));
  await p.evaluate(() => localStorage.setItem('ll.sheetView', ''));

  // Exam settings: none in a lesson.
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.waitForTimeout(3500);
  say('folds in a lesson', (await p.locator('.fold-h').allInnerTexts()).join(' | ').slice(0, 300));
  await p.evaluate(async ({ c, i }) => (await import('/src/lib/classes.ts')).updateItem(c, i, { type: 'exam' }), { c: demo.classId, i: demo.itemId });
  await p.waitForTimeout(1500);
  say('folds in an exam', (await p.locator('.fold-h').allInnerTexts()).join(' | ').slice(0, 300));
}

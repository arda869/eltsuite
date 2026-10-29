// Teach live only for lessons: the mode menu on a lesson, then on the same item as homework.
export default async function steps({ p, shot, say, demo, BASE }) {
  const open = async () => {
    await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
    await p.waitForSelector('.mode-btn', { timeout: 30000 });
    await p.waitForTimeout(1500);
    await p.click('.mode-btn');
    await p.waitForTimeout(400);
    say('menu', (await p.locator('.mode-list').innerText()).replace(/\n+/g, ' | '));
  };
  await open();
  await shot('lesson-menu');
  await p.evaluate(async ({ c, i }) => {
    const m = await import('/src/lib/classes.ts');
    await m.updateItem(c, i, { type: 'homework' });
  }, { c: demo.classId, i: demo.itemId });
  await open();
  await shot('homework-menu');
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}?teach=1`);
  await p.waitForTimeout(4000);
  say('homework with ?teach=1, mode', await p.locator('.mode-btn').innerText());
}

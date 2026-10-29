// What test/preview.mjs does, step by step: pictures side by side, in a lesson and in Collab.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, shot, demo, BASE }) {
  p.on('pageerror', (e) => say('CRASH', e.message));
  const mk = await ctx.newPage();
  for (const [n, c] of [['a', '#c8764a'], ['b', '#3667a6'], ['c', '#4f7a55']]) {
    await mk.setContent(`<body style="margin:0"><div style="width:800px;height:600px;background:${c}"></div></body>`);
    writeFileSync(`preview-out/${n}.png`, await mk.screenshot({ clip: { x: 0, y: 0, width: 800, height: 600 } }));
  }
  await mk.close();
  // Collab: three pictures at once land side by side.
  const [tab] = await Promise.all([ctx.waitForEvent('page'), (async () => { await p.goto(`${BASE}/collab`); await p.getByRole('button', { name: 'New document' }).first().click(); })()]);
  tab.on('pageerror', (e) => say('CRASH tab', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.locator('.ProseMirror').first().waitFor({ timeout: 30000 });
  await tab.waitForTimeout(2500);
  await tab.locator('.ProseMirror').first().click();
  await tab.keyboard.type('Three pictures:');
  await tab.keyboard.press('Enter');
  const inp = await tab.evaluateHandle(() => document.querySelector('input[type=file][accept^="image"]'));
  const [chooser] = await Promise.all([tab.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null), tab.evaluate(() => window.dispatchEvent(new CustomEvent('ll:pick-files')))]);
  // Drop the files straight onto the document, as a teacher would.
  const dt = await tab.evaluateHandle(async () => {
    const d = new DataTransfer();
    for (const [n, c] of [['a', '#c8764a'], ['b', '#3667a6'], ['c', '#4f7a55']]) {
      const cv = document.createElement('canvas');
      cv.width = 400; cv.height = 300;
      const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 400, 300);
      const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
      d.items.add(new File([b], n + '.png', { type: 'image/png' }));
    }
    return d;
  });
  const box = await tab.locator('.ProseMirror').first().boundingBox();
  await tab.locator('.ProseMirror').first().dispatchEvent('drop', { dataTransfer: dt, clientX: box.x + 40, clientY: box.y + 80 });
  await tab.waitForTimeout(2500);
  say('pictures in one line', await tab.evaluate(() => [...document.querySelectorAll('.ProseMirror p')].map((p) => p.querySelectorAll('.pic-node').length).filter(Boolean).join(',')));
  await tab.screenshot({ path: 'preview-out/01-collab-three.png' });
  // A fourth on its own line, then joined to the row with "Next to the picture before".
  await tab.keyboard.press('End');
  await tab.keyboard.press('Enter');
  await tab.keyboard.press('Enter');
  const dt2 = await tab.evaluateHandle(async () => { const d = new DataTransfer(); const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = '#8b3d6b'; g.fillRect(0, 0, 400, 300); const b = await new Promise((r) => cv.toBlob(r, 'image/png')); d.items.add(new File([b], 'd.png', { type: 'image/png' })); return d; });
  const last = await tab.locator('.ProseMirror p').last().boundingBox();
  await tab.locator('.ProseMirror').first().dispatchEvent('drop', { dataTransfer: dt2, clientX: last.x + 10, clientY: last.y + 5 });
  await tab.waitForTimeout(2000);
  await tab.screenshot({ path: 'preview-out/02-collab-fourth.png' });
  await tab.locator('.pic-node').last().click();
  await tab.waitForTimeout(500);
  await tab.screenshot({ path: 'preview-out/03-pic-settings.png' });
  const join = tab.getByRole('button', { name: 'Next to the picture before' });
  say('join button', await join.count());
  if (await join.count()) await join.click();
  await tab.waitForTimeout(800);
  say('after joining', await tab.evaluate(() => [...document.querySelectorAll('.ProseMirror p')].map((p) => p.querySelectorAll('.pic-node').length).filter(Boolean).join(',')));
  await tab.screenshot({ path: 'preview-out/04-collab-joined.png' });
}

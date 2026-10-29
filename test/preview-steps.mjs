// What test/preview.mjs does, step by step: a PDF's name in full, zoom past 100%, and a recording on the page.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, BASE }) {
  const mk = await ctx.newPage();
  await mk.setContent('<h1 style="font:30px Arial;margin:80px">Unit 1 · Free time</h1><p style="margin:0 80px;font:16px Georgia">Maya lives in Lisbon.</p>');
  writeFileSync('preview-out/Present simple and continuous worksheet.pdf', await mk.pdf({ format: 'A4' }));
  await mk.close();
  await p.goto(`${BASE}/archive`);
  await p.locator('text=+ New').first().waitFor({ timeout: 20000 });
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.setInputFiles('input[accept="application/pdf,.pdf"]', 'preview-out/Present simple and continuous worksheet.pdf')]);
  tab.on('pageerror', (e) => say('CRASH', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.locator('.pdff').waitFor({ timeout: 30000 });
  await tab.waitForTimeout(3000);
  const s = async (n) => (await tab.screenshot({ path: `preview-out/${n}.png` }), say('shot', n));
  await s('01-name');
  say('title', await tab.locator('.dp-title').evaluate((e) => e.value + ' | ' + e.scrollWidth + ' > ' + e.clientWidth));
  for (let i = 0; i < 5; i++) await tab.getByRole('button', { name: 'Bigger' }).click();
  await tab.waitForTimeout(1500);
  say('zoom', await tab.locator('.pdff-zv').innerText(), 'block', await tab.locator('.pdf-block').evaluate((e) => e.getBoundingClientRect().width), 'page area', await tab.locator('.pdff-page').evaluate((e) => e.clientWidth + ' scroll ' + e.scrollWidth));
  await s('02-zoom-150');
  await tab.locator('.pdff-zv').click();
  await tab.waitForTimeout(800);
  await tab.getByRole('button', { name: 'Recording' }).click();
  await tab.waitForTimeout(300);
  const pg = await tab.locator('.pdf-page').first().boundingBox();
  await tab.mouse.click(pg.x + pg.width * 0.5, pg.y + pg.height * 0.3);
  await tab.waitForTimeout(1500);
  await s('03-recording');
  say('media blocks', await tab.locator('.pdf-box .media-node, .pdf-box [data-media], .pdf-box .md-start-btn').count());
}

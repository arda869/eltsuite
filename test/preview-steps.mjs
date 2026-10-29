// What test/preview.mjs does, step by step: a teacher opens a PDF in Files and writes on it.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, shot, say, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  // a three-page worksheet as a PDF
  const mk = await ctx.newPage();
  await mk.setContent(`<style>body{font:15px Georgia;margin:0} .pg{height:1040px;padding:60px 70px;box-sizing:border-box;page-break-after:always} h1{font:bold 26px Arial} p{line-height:1.7} .gap{display:inline-block;width:120px;border-bottom:1px solid #000}</style>
  ${[1, 2, 3].map((n) => `<div class="pg"><h1>Unit ${n} · Free time</h1><p>Read the text and answer the questions.</p><p>Maya lives in Lisbon. Every Saturday she goes to the market with her brother. They buy fruit, bread and fish. After that they have coffee in a small café near the river.</p><p>1 Where does Maya live? <span class="gap"></span></p><p>2 Who does she go with? <span class="gap"></span></p><p>3 What do they buy? <span class="gap"></span></p><p>4 Where do they have coffee? <span class="gap"></span></p></div>`).join('')}`);
  writeFileSync('preview-out/sample.pdf', await mk.pdf({ format: 'A4' }));
  await mk.close();
  await p.goto(`${BASE}/archive`);
  await p.locator('text=+ New').first().waitFor({ timeout: 20000 });
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.setInputFiles('input[accept="application/pdf,.pdf"]', 'preview-out/sample.pdf')]);
  tab.on('pageerror', (e) => say('CRASH', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.waitForLoadState();
  await tab.locator('.pdff').waitFor({ timeout: 30000 });
  await tab.waitForTimeout(3500);
  const s = async (name) => (await tab.screenshot({ path: `preview-out/${name}.png` }), say('shot', name));
  await s('01-opened');
  // a text box
  await tab.getByRole('radio', { name: /Text box/ }).click().catch((e) => say('text', e.message));
  await tab.waitForTimeout(300);
  const pg = await tab.locator('.pdf-page').first().boundingBox();
  await tab.mouse.click(pg.x + pg.width * 0.62, pg.y + pg.height * 0.36);
  await tab.waitForTimeout(500);
  await tab.keyboard.type('Lisbon');
  await tab.waitForTimeout(400);
  await s('02-text-box');
  // a highlight
  await tab.getByRole('radio', { name: /Highlight/ }).click().catch((e) => say('mark', e.message));
  await tab.waitForTimeout(300);
  await tab.mouse.move(pg.x + pg.width * 0.1, pg.y + pg.height * 0.2);
  await tab.mouse.down();
  await tab.mouse.move(pg.x + pg.width * 0.5, pg.y + pg.height * 0.23, { steps: 6 });
  await tab.mouse.up();
  await tab.waitForTimeout(400);
  await s('03-highlight');
  // drawing
  await tab.getByRole('radio', { name: /Draw/ }).click().catch((e) => say('draw', e.message));
  await tab.waitForTimeout(300);
  await tab.mouse.move(pg.x + pg.width * 0.7, pg.y + pg.height * 0.5);
  await tab.mouse.down();
  for (let k = 0; k < 20; k++) await tab.mouse.move(pg.x + pg.width * (0.7 + k * 0.006), pg.y + pg.height * (0.5 + Math.sin(k / 2) * 0.01));
  await tab.mouse.up();
  await tab.waitForTimeout(400);
  await s('04-draw');
  // the question menu
  await tab.getByRole('radio', { name: /Select/ }).click().catch(() => {});
  await tab.locator('.pdf-tb:has-text("Question")').click().catch((e) => say('question', e.message));
  await tab.waitForTimeout(500);
  await s('05-question-menu');
  await tab.keyboard.press('Escape');
  // the box toolbar
  await tab.locator('.pdf-box').first().hover().catch(() => {});
  await tab.waitForTimeout(400);
  await s('06-box-bar');
  // scrolled to page 2
  await tab.locator('.pdff-rail button').nth(1).click().catch(() => {});
  await tab.waitForTimeout(1500);
  await s('07-page-2');
  // a smaller screen
  await tab.setViewportSize({ width: 900, height: 1100 });
  await tab.waitForTimeout(1000);
  await s('08-tablet');
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.waitForTimeout(1000);
  await s('09-phone');
  say('toolbar', (await tab.locator('.pdff-bar').innerText()).replace(/\s+/g, ' '));
}

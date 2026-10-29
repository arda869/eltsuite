// What test/preview.mjs does, step by step: the Design app, from a new file to a labelled picture.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, shot, BASE }) {
  p.on('pageerror', (e) => say('CRASH', e.message));
  // A picture to work with: a kitchen-ish scene drawn in a page.
  const mk = await ctx.newPage();
  await mk.setViewportSize({ width: 1200, height: 900 });
  await mk.setContent(`<body style="margin:0"><div style="width:1200px;height:900px;background:linear-gradient(#f4efe6 0 62%,#d9cbb4 62%);position:relative;font:0/0 a">
    <div style="position:absolute;left:80px;top:140px;width:260px;height:520px;background:#cfe0ef;border:8px solid #6d8fb3;border-radius:14px"></div>
    <div style="position:absolute;left:420px;top:380px;width:420px;height:180px;background:#8b6f4e;border-radius:8px"></div>
    <div style="position:absolute;left:470px;top:320px;width:110px;height:60px;background:#b64a3c;border-radius:50% 50% 8px 8px"></div>
    <div style="position:absolute;left:900px;top:200px;width:200px;height:360px;background:#ecebe7;border:6px solid #a9a49d"></div>
    <div style="position:absolute;left:620px;top:120px;width:120px;height:120px;border-radius:50%;background:#ffd84d"></div></div></body>`);
  writeFileSync('preview-out/kitchen.png', await mk.screenshot());
  await mk.close();
  await p.setViewportSize({ width: 1500, height: 940 });
  await p.goto(`${BASE}/design`);
  await p.waitForTimeout(2500);
  await shot('01-app');
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'New design' }).first().click()]);
  tab.on('pageerror', (e) => say('CRASH tab', e.message));
  tab.on('console', (m) => m.type() === 'error' && say('console', m.text().slice(0, 200)));
  await tab.setViewportSize({ width: 1500, height: 940 });
  await tab.locator('.dz-start').waitFor({ timeout: 30000 });
  await tab.waitForTimeout(2500);
  const s = async (n) => (await tab.screenshot({ path: `preview-out/${n}.png` }), say('shot', n));
  await s('02-start');
  await tab.locator('.dz-start-card', { hasText: 'Label the picture' }).click();
  await tab.locator('.dz-paper canvas').waitFor({ timeout: 20000 });
  await tab.waitForTimeout(3000);
  await s('03-label-template');
  // Select the frame and put the picture in it.
  const box = await tab.locator('.dz-paper').boundingBox();
  const z = box.width / 794;
  await tab.mouse.click(box.x + 400 * z, box.y + 450 * z);
  await tab.waitForTimeout(400);
  await tab.locator('.dz-railb', { hasText: 'Pictures' }).click();
  await tab.waitForTimeout(400);
  await tab.setInputFiles('.dz-drawer input[type=file]', 'preview-out/kitchen.png');
  await tab.waitForTimeout(3500);
  await s('04-picture-in-frame');
  // Adjustments panel on the picture.
  await tab.locator('.dz-props').evaluate((e) => (e.scrollTop = 400));
  await tab.waitForTimeout(300);
  await s('05-picture-props');
  // The teaching tools, and a learners' copy.
  await tab.locator('.dz-railb', { hasText: 'Teaching' }).click();
  await tab.waitForTimeout(500);
  await tab.getByRole('checkbox', { name: /Learners’ copy/ }).check();
  await tab.waitForTimeout(800);
  await s('06-learners-copy');
  await tab.getByRole('checkbox', { name: /Learners’ copy/ }).uncheck();
  // A speech bubble and some text.
  await tab.locator('.dz-railb', { hasText: 'Elements' }).click();
  await tab.waitForTimeout(400);
  await tab.getByRole('button', { name: 'Speech bubble' }).click();
  await tab.waitForTimeout(300);
  await tab.keyboard.type('What’s in your kitchen?');
  await tab.mouse.click(box.x + 30, box.y + box.height - 30);
  await tab.waitForTimeout(800);
  await s('07-bubble');
  await tab.locator('.dz-railb', { hasText: 'Text' }).click();
  await tab.waitForTimeout(600);
  await s('08-text-drawer');
  await tab.locator('.dz-railb', { hasText: 'People' }).click();
  await tab.waitForTimeout(600);
  await tab.getByRole('button', { name: /Add Maya/ }).click();
  await tab.waitForTimeout(1200);
  await s('09-people');
  await tab.locator('.dz-railb', { hasText: 'Layers' }).click();
  await tab.waitForTimeout(500);
  await s('10-layers');
  // Downloads.
  await tab.getByRole('button', { name: 'Download' }).click();
  await tab.waitForTimeout(400);
  await s('11-download-menu');
  const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 30000 }), tab.getByRole('menuitem', { name: /Learners’ copy/ }).click()]);
  say('pdf', dl.suggestedFilename());
  await dl.saveAs('preview-out/learners.pdf');
  // Templates drawer, flashcards added.
  await tab.locator('.dz-railb', { hasText: 'Templates' }).click();
  await tab.waitForTimeout(800);
  await tab.locator('.dz-tpl', { hasText: 'Flashcards' }).click();
  await tab.waitForTimeout(2500);
  await s('12-flashcards');
}

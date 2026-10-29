// What test/preview.mjs does, step by step: Design's editing tools, one after another.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, BASE }) {
  const mk = await ctx.newPage();
  await mk.setViewportSize({ width: 1000, height: 700 });
  await mk.setContent(`<body style="margin:0;background:#fff"><div style="width:1000px;height:700px;position:relative;background:#ffffff">
    <div style="position:absolute;left:260px;top:120px;width:480px;height:460px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffcf6b,#e0882f)"></div>
    <div style="position:absolute;left:470px;top:60px;width:40px;height:90px;background:#6b4a2b;border-radius:10px"></div></div></body>`);
  writeFileSync('preview-out/orange.png', await mk.screenshot());
  await mk.close();
  await p.setViewportSize({ width: 1500, height: 940 });
  await p.goto(`${BASE}/design`);
  await p.waitForTimeout(2000);
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'New design' }).first().click()]);
  tab.on('pageerror', (e) => say('CRASH', e.message));
  tab.on('console', (m) => m.type() === 'error' && say('console', m.text().slice(0, 200)));
  await tab.setViewportSize({ width: 1500, height: 940 });
  await tab.locator('.dz-start').waitFor({ timeout: 30000 });
  const s = async (n) => (await tab.screenshot({ path: `preview-out/${n}.png` }), say('shot', n));
  const count = async () => { if (!(await tab.locator('.dz-layers').count())) await tab.locator('.dz-railb', { hasText: 'Layers' }).click(); await tab.waitForTimeout(300); return tab.locator('.dz-layers li').count(); };
  await tab.locator('.dz-start-card', { hasText: 'Classroom poster' }).click();
  await tab.locator('.dz-paper canvas').waitFor({ timeout: 20000 });
  await tab.waitForTimeout(2500);
  const box = await tab.locator('.dz-paper').boundingBox();
  const z = box.width / 794;
  const at = (x, y) => [box.x + x * z, box.y + y * z];
  // The picture into the frame.
  await tab.mouse.click(...at(400, 540));
  await tab.locator('.dz-railb', { hasText: 'Pictures' }).click();
  await tab.setInputFiles('.dz-drawer input[type=file]', 'preview-out/orange.png');
  await tab.waitForTimeout(3000);
  await s('01-poster');
  // Crop: double-click the picture, drag it, done.
  await tab.mouse.dblclick(...at(400, 540));
  await tab.waitForTimeout(600);
  await s('02-crop');
  await tab.mouse.move(...at(400, 540));
  await tab.mouse.down();
  await tab.mouse.move(...at(470, 580), { steps: 8 });
  await tab.mouse.up();
  await tab.waitForTimeout(300);
  await s('03-crop-moved');
  await tab.getByRole('button', { name: 'Done' }).click();
  // A star, turned.
  await tab.locator('.dz-railb', { hasText: 'Elements' }).click();
  await tab.getByRole('button', { name: 'Star' }).click();
  await tab.waitForTimeout(400);
  const rot = await tab.locator('.dz-rot').boundingBox();
  await tab.mouse.move(rot.x + 13, rot.y + 13);
  await tab.mouse.down();
  await tab.mouse.move(rot.x + 120, rot.y - 40, { steps: 10 });
  await tab.mouse.up();
  say('star turned', await tab.locator('.dz-props input[aria-label="↻"]').inputValue());
  // Resize it from a corner.
  const h = tab.locator('.dz-sel.one .dz-h').nth(4);
  const hb = await h.boundingBox();
  await tab.mouse.move(hb.x + 6, hb.y + 6);
  await tab.mouse.down();
  await tab.mouse.move(hb.x + 80, hb.y + 80, { steps: 8 });
  await tab.mouse.up();
  say('star size', await tab.locator('.dz-props input[aria-label="W"]').inputValue(), await tab.locator('.dz-props input[aria-label="H"]').inputValue());
  await s('04-star');
  // Text: press T, type, click away.
  await tab.mouse.click(box.x - 20, box.y + 40);
  await tab.keyboard.press('t');
  await tab.waitForTimeout(300);
  await tab.keyboard.type('Be kind. Be brave.');
  await tab.mouse.click(box.x - 20, box.y + 40);
  await tab.waitForTimeout(500);
  await s('05-text');
  // Blur part of the picture.
  await tab.mouse.click(...at(400, 540));
  await tab.locator('.dz-railb', { hasText: 'Teaching' }).click();
  await tab.getByRole('button', { name: 'Pixels' }).click();
  await tab.waitForTimeout(800);
  await s('06-pixels');
  // Draw.
  await tab.locator('.dz-railb', { hasText: 'Draw' }).click();
  await tab.mouse.move(...at(120, 1000));
  await tab.mouse.down();
  for (let i = 0; i < 20; i++) await tab.mouse.move(...at(120 + i * 25, 1000 + Math.sin(i / 2) * 30));
  await tab.mouse.up();
  await tab.waitForTimeout(400);
  await tab.getByRole('button', { name: 'Highlighter' }).click();
  await tab.mouse.move(...at(120, 120));
  await tab.mouse.down();
  await tab.mouse.move(...at(680, 130), { steps: 15 });
  await tab.mouse.up();
  await tab.waitForTimeout(400);
  await s('07-drawn');
  await tab.locator('.dz-toolnote button').click();
  const n1 = await count();
  await tab.keyboard.press('Control+z');
  await tab.waitForTimeout(600);
  const n2 = await count();
  say('undo', n1, '→', n2);
  await s('08-layers');
  // Learner A and B: the title only for B.
  await tab.locator('.dz-layers .dz-lname', { hasText: 'Be kind' }).click();
  await tab.locator('.dz-railb', { hasText: 'Teaching' }).click();
  await tab.getByRole('button', { name: 'Only B' }).click();
  await tab.getByRole('radio', { name: 'Learner A', exact: true }).click();
  await tab.waitForTimeout(600);
  await s('09-learner-a');
  await tab.getByRole('radio', { name: 'Everything', exact: true }).click();
  // Take away the background of the picture.
  await tab.mouse.click(...at(400, 540));
  await tab.waitForTimeout(300);
  await tab.getByRole('button', { name: 'Take away the background' }).first().click();
  await tab.mouse.click(...at(140, 360));
  await tab.waitForTimeout(3000);
  await s('10-background-gone');
  await tab.keyboard.press('Escape');
  await tab.keyboard.press('Escape');
  // Free pictures.
  await tab.locator('.dz-railb', { hasText: 'Pictures' }).click();
  await tab.getByRole('tab', { name: 'Free pictures' }).click();
  await tab.getByLabel('Search for pictures').fill('kitchen');
  await tab.keyboard.press('Enter');
  await tab.waitForTimeout(5000);
  say('web pictures', await tab.locator('.dz-pics.web button').count());
  await s('11-free-pictures');
  // Cut into cards.
  await tab.getByRole('button', { name: 'Download' }).click();
  await tab.getByRole('menuitem', { name: /Cut into cards/ }).click();
  await tab.waitForTimeout(300);
  await s('12-cards-dialog');
  const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 30000 }), tab.getByRole('button', { name: 'Download the cards' }).click()]);
  await dl.saveAs('preview-out/cards.pdf');
  say('cards', dl.suggestedFilename());
  const [dl2] = await Promise.all([tab.waitForEvent('download', { timeout: 30000 }), (async () => { await tab.getByRole('button', { name: 'Download' }).click(); await tab.getByRole('menuitem', { name: /Picture \(PNG\)/ }).click(); })()]);
  await dl2.saveAs('preview-out/page.png');
  say('png', dl2.suggestedFilename());
}

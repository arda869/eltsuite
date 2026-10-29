// What test/preview.mjs does, step by step: any file in Files, its download page, and a Word file
// turned into a Collab document.
import { writeFileSync, readFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, shot, BASE }) {
  p.on('pageerror', (e) => say('CRASH', e.message));
  writeFileSync('preview-out/Unit 4 Travel.docx', Buffer.from(readFileSync('test/preview-fixture.b64', 'utf8'), 'base64'));
  writeFileSync('preview-out/Marks term 1.xlsx', Buffer.from('PK fake spreadsheet bytes '.repeat(400)));
  await p.goto(`${BASE}/archive`);
  await p.locator('text=+ New').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.locator('text=+ New').first().click();
  await p.waitForTimeout(500);
  await shot('01-new-menu');
  await p.keyboard.press('Escape');
  await p.setInputFiles('input[type=file][multiple]:not([accept])', 'preview-out/Marks term 1.xlsx');
  await p.waitForTimeout(2500);
  await shot('02-uploaded');
  say('file tiles', await p.locator('.fk-file').count());
  // The Word file: the question first.
  await p.setInputFiles('input[type=file][multiple]:not([accept])', 'preview-out/Unit 4 Travel.docx');
  await p.locator('.ma-word').waitFor({ timeout: 10000 });
  await p.waitForTimeout(1500);
  await shot('03-word-question', p.locator('.ma-word'));
  say('lost', await p.locator('.ma-word li').allInnerTexts());
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'Make a Collab document' }).click()]);
  tab.on('pageerror', (e) => say('CRASH tab', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.locator('.ProseMirror').first().waitFor({ timeout: 30000 });
  await tab.waitForTimeout(4000);
  await tab.screenshot({ path: 'preview-out/04-collab.png' });
  say('collab text', (await tab.locator('.ProseMirror').first().innerText()).slice(0, 400));
  say('collab parts', await tab.locator('.ProseMirror h1, .ProseMirror h2, .ProseMirror li, .ProseMirror table, .ProseMirror img').count());
  // The spreadsheet's page, as people it's shared with see it.
  await p.bringToFront();
  await p.locator('.fk-file').first().click({ button: 'right' });
  await p.waitForTimeout(500);
  await shot('05-menu');
  const [pg] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('menuitem', { name: /Open its page/ }).click()]);
  await pg.setViewportSize({ width: 1280, height: 800 });
  await pg.locator('.af-card').waitFor({ timeout: 20000 });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: 'preview-out/06-download-page.png' });
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.getByRole('button', { name: 'Download' }).click()]);
  say('downloaded', dl.suggestedFilename(), (readFileSync(await dl.path()).length));
}

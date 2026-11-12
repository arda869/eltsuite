// Browser journeys use local Firebase/model stand-ins, not live AI or production accounts.
// Keep the source-reader checks alongside the task-level import journey used in production.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { zipSync, strToU8 } from 'fflate';

const base = process.env.MATERIAL_TEST_URL || 'http://localhost:5193';
let server = null;
if (!await fetch(base).then(r => r.ok, () => false)) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', new URL(base).port], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) { if (await fetch(base).then(r => r.ok, () => false)) break; await new Promise(r => setTimeout(r, 500)); }
}
let browser;
try {
  process.env.PR282_BASE = base;
  await import('./pr282-import-ui.mjs');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.getItem('mockdemo'); }, null, { timeout: 120000 });
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  await page.evaluate(async () => { const { doc, setDoc } = await import('/test/mock/firestore.ts'); await setDoc(doc({}, 'aiPilot', 'teacher1'), { enabled: true }); });
  await page.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}`);
  await page.locator('.task-editor').waitFor();
  await page.locator('.task-insert').last().locator('summary').click();
  await page.getByRole('button', { name: 'Import a task' }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Import a task' });
  await dialog.waitFor();

  const files = [
    { name: 'sample.docx', entries: { 'word/document.xml': '<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>DOCX Invitation Saturday</w:t></w:r></w:p></w:body></w:document>' }, expected: 'DOCX Invitation Saturday' },
    { name: 'sample.pptx', entries: { 'ppt/slides/slide1.xml': '<p:sld xmlns:p="presentation" xmlns:a="drawing"><a:p><a:r><a:t>PPTX Invitation Saturday</a:t></a:r></a:p></p:sld>' }, expected: 'PPTX Invitation Saturday' },
    { name: 'sample.xlsx', entries: { 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>XLSX Invitation Saturday</t></is></c></row></sheetData></worksheet>' }, expected: 'XLSX Invitation Saturday' },
  ];
  for (const f of files) {
    const buffer = Buffer.from(zipSync(Object.fromEntries(Object.entries(f.entries).map(([name, value]) => [name, strToU8(value)]))));
    await dialog.getByLabel('Upload existing materials').setInputFiles({ name: f.name, mimeType: 'application/octet-stream', buffer });
    await dialog.getByRole('region', { name: 'Selected source' }).getByText(f.name).waitFor();
    await dialog.getByText('Review extracted text and page previews').click();
    assert.match(await dialog.locator('.mi-source').innerText(), new RegExp(f.expected));
    await dialog.getByRole('button', { name: 'Remove source' }).click();
  }

  let remoteRequests = 0;
  await page.route('https://import-tracker.invalid/**', route => { remoteRequests++; return route.abort(); });
  await dialog.getByLabel('Upload existing materials').setInputFiles({ name: 'source.html', mimeType: 'text/html', buffer: Buffer.from('<p>HTML Invitation Saturday</p><img src="https://import-tracker.invalid/pixel"><script>window.badImport=true</script>') });
  await dialog.getByRole('region', { name: 'Selected source' }).getByText('source.html').waitFor();
  assert.match(await dialog.locator('.mi-source').textContent() || '', /HTML Invitation Saturday/);
  assert.equal(await page.evaluate(() => window.badImport), undefined);
  assert.equal(remoteRequests, 0);
  await dialog.getByRole('button', { name: 'Remove source' }).click();

  await dialog.getByLabel('Upload existing materials').setInputFiles('test/fixtures/import-shapes.jpg');
  await dialog.locator('.mi-shot').first().waitFor();
  await dialog.getByRole('button', { name: 'Remove screenshot or picture 1' }).click();
  assert.equal(await dialog.locator('.mi-shot').count(), 0);
  await page.goto(`${base}/class/${demo.classId}/assistant`);
  assert.equal(await page.getByRole('button', { name: 'Import existing materials' }).count(), 0, 'lesson assistant must not offer lesson-level import');
  await page.goto(`${base}/class/${demo.classId}`);
  assert.equal(await page.getByRole('button', { name: 'Import existing materials' }).count(), 0, 'lessons tab must not offer lesson-level import');
  console.log('PASS: task import journey, DOCX/PPTX/XLSX/HTML/image/PDF readers and removed lesson-level entry points. AI/Firebase simulated.');
  await context.close();
} finally {
  await browser?.close();
  if (server) try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
}

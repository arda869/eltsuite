// Run against the isolated test server on port 5186. This exercises the browser
// source-picker and saved-task journey; AI and Firebase are mocked by dev.html.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PR282_BASE || 'http://localhost:5186';
mkdirSync('outputs/pr282', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return true; }, null, { timeout: 120000 });
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  await page.evaluate(async () => {
    const { doc, setDoc } = await import('/test/mock/firestore.ts');
    await setDoc(doc({}, 'aiPilot', 'teacher1'), { enabled: true });
  });
  await page.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}`);
  await page.waitForLoadState('networkidle');
  await page.locator('.task-editor').waitFor();
  const insert = page.locator('.task-insert').last();
  await insert.locator('summary').click();
  await insert.getByRole('button', { name: 'Import a task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a task' });
  await dialog.waitFor();

  // Paste two screenshots in one clipboard event.
  await dialog.evaluate(async (el) => {
    const bytes = await (await fetch('/test/fixtures/import-shapes.jpg')).arrayBuffer();
    const data = new DataTransfer();
    for (let i = 1; i <= 2; i++) data.items.add(new File([bytes], `Screenshot ${i}.jpg`, { type: 'image/jpeg' }));
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }));
  });
  await dialog.locator('.mi-shot').nth(1).waitFor({ timeout: 30000 });
  assert.equal(await dialog.locator('.mi-shot').count(), 2);
  await dialog.getByRole('button', { name: 'Remove screenshot or picture 1' }).click();
  assert.equal(await dialog.locator('.mi-shot').count(), 1);

  // Drop one more picture into the same import.
  await dialog.locator('.mi-drop').evaluate(async (el) => {
    const bytes = await (await fetch('/test/fixtures/import-shapes.jpg')).arrayBuffer();
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'Dropped.jpg', { type: 'image/jpeg' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  await dialog.locator('.mi-shot').nth(1).waitFor({ timeout: 30000 });

  // Exercise countdown and crop. The display stream is a fixture because a
  // headless browser cannot approve Chrome's real share-window picker.
  await page.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = 'red'; ctx.fillRect(50, 50, 150, 150);
      ctx.fillStyle = 'blue'; ctx.fillRect(300, 50, 150, 150);
      window.__pr282Capture = canvas;
      return canvas.captureStream(10);
    };
  });
  await dialog.getByRole('button', { name: 'Take a screenshot' }).click();
  await dialog.getByRole('status').filter({ hasText: 'Bring the material into view' }).waitFor();
  const crop = page.getByRole('dialog', { name: 'Choose the part to import' });
  await crop.waitFor({ timeout: 30000 });
  const image = await crop.getByRole('img', { name: 'The screenshot you took' }).boundingBox();
  assert.ok(image);
  await page.mouse.move(image.x + 20, image.y + 20);
  await page.mouse.down();
  await page.mouse.move(image.x + 180, image.y + 180, { steps: 8 });
  await page.mouse.up();
  await crop.getByRole('button', { name: 'Use this part' }).click();
  await dialog.locator('.mi-shot').nth(2).waitFor({ timeout: 30000 });
  await dialog.screenshot({ path: 'outputs/pr282/import-screenshots.png' });

  // A PDF replaces the picture batch and can be turned into a saved task.
  const pdfPage = await context.newPage();
  await pdfPage.setContent('<html><body><h1>Weather</h1><p>Complete: The sky is ___.</p><p>Answers: blue.</p></body></html>');
  const pdf = await pdfPage.pdf();
  await pdfPage.close();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'Weather.pdf', mimeType: 'application/pdf', buffer: pdf });
  await dialog.getByRole('region', { name: 'Selected source' }).getByText('Weather.pdf').waitFor({ timeout: 30000 });
  await dialog.getByLabel('I have permission to use and adapt these materials.').check();
  assert.ok(await dialog.getByRole('button', { name: 'Make the task' }).isEnabled());
  await dialog.getByRole('button', { name: 'Make the task' }).click();
  await dialog.getByText('2. Review your rebuilt materials').waitFor({ timeout: 30000 });
  await dialog.screenshot({ path: 'outputs/pr282/import-review.png' });
  await dialog.getByLabel('I’ve checked the content, answer keys and import notes.').check();
  await dialog.getByRole('button', { name: 'Add reviewed task' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 30000 });
  const request = await page.evaluate(() => JSON.parse(localStorage.getItem('mockMaterialRequest')));
  assert.equal(request.scope, 'task');
  assert.equal(request.source.name, 'Weather.pdf');
  const fs = await page.evaluate(() => JSON.parse(localStorage.getItem('mockfs')));
  assert.ok(Object.entries(fs).some(([key, value]) => key.startsWith(`classes/${demo.classId}/items/${demo.itemId}/tasks/`) && value.title === 'Read the invitation'));
  writeFileSync('outputs/pr282/import-ui-results.json', JSON.stringify({ source: request.source.name, scope: request.scope, taskAdded: true }, null, 2));
  console.log('Isolated import UI journey passed');
  await context.close();
} finally {
  await browser.close();
}

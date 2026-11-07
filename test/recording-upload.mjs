// Browser journey with Firebase stand-ins: keep the lesson open, draft a script,
// save the upload, and attach it back to the lesson.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE || 'http://127.0.0.1:5184';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const lesson = await context.newPage();
lesson.setDefaultTimeout(90000);
function wav() {
  const rate = 16000, length = rate * 2, data = Buffer.alloc(44 + length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) data.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 3000), 44 + i * 2);
  return data;
}
try {
  await lesson.goto(`${base}/dev.html?seed&as=teacher`);
  await lesson.waitForFunction(() => !!JSON.parse(localStorage.getItem('mockdemo') || '{}').itemId);
  const demo = await lesson.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  await lesson.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}`);
  await lesson.getByRole('button', { name: 'Everything you can add, with pictures' }).click();
  await lesson.getByRole('dialog', { name: 'Add to the task' }).getByRole('button', { name: /Listening and pronunciation/ }).click();
  await lesson.getByRole('dialog', { name: 'Add to the task' }).getByRole('button', { name: /Sound or video A sound or video/ }).click();
  const upload = lesson.getByRole('button', { name: 'Upload sound or video' });
  await upload.waitFor();
  const [studio] = await Promise.all([context.waitForEvent('page'), upload.click()]);
  await studio.waitForURL(/\/studio\/sound\/new\?/);
  assert.match(lesson.url(), /\/lesson\//);
  assert.equal(await lesson.getByRole('button', { name: 'Upload sound or video' }).count(), 1);
  console.log('PASS Recording upload opens a second tab and leaves the lesson open');

  await studio.locator('input[type="file"]').setInputFiles({ name: 'Test speech.wav', mimeType: 'audio/wav', buffer: wav() });
  await studio.getByText('Could you explain that?').first().waitFor();
  assert(await studio.getByText('Of course.').count());
  await studio.getByRole('textbox', { name: /Script at 0:00/ }).first().fill('Reviewed classroom words.');
  console.log('PASS Uploaded recording gets an editable script from the transcription stand-in');

  await studio.getByRole('button', { name: 'Save', exact: true }).click();
  await studio.getByRole('dialog', { name: 'Save the recording' }).getByRole('button', { name: 'Save', exact: true }).click();
  await studio.getByText('The recording and its script were added to your lesson.').waitFor();
  await lesson.getByRole('button', { name: 'Edit in Recordings' }).waitFor();
  const scripts = await studio.evaluate(() => Object.entries(JSON.parse(localStorage.getItem('mockfs') || '{}')).filter(([key]) => key.includes('/archive/')).map(([, value]) => value.script || []));
  assert(scripts.some(lines => lines.some(line => line.text === 'Reviewed classroom words.')));
  console.log('PASS Saved audio and script return to the open lesson');
} finally {
  await browser.close();
}

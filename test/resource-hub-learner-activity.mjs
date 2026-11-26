import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5198';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'));
  await page.evaluate(async () => {
    const transformed = await fetch('/src/main.tsx').then(response => response.text());
    const reactUrl = transformed.match(/from "(\/@fs[^\"]+\/deps\/react\.js[^\"]*)"/)?.[1];
    const domUrl = transformed.match(/from "(\/@fs[^\"]+\/deps\/react-dom_client\.js[^\"]*)"/)?.[1];
    if (!reactUrl || !domUrl) throw new Error('The local React modules could not be found.');
    const React = await import(reactUrl);
    const ReactDOM = await import(domUrl);
    const { LocalActivity, LocalLearnerPreviewMode } = await import('/src/communicative/LocalActivity.tsx');
    const card = (id, title, text) => ({ type: 'pickCard', attrs: { activityItemId: id, title }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    const node = { type: 'communicativeActivity', attrs: { id: 'preview-private-cues', kind: 'cue', instruction: 'Read only your own card.', settings: { mode: 'class' } }, content: [card('a', 'Role A', 'Private number 37.'), card('b', 'Role B', 'Private number 59.')] };
    const host = document.createElement('div');
    host.id = 'local-learner-preview-fixture';
    document.body.append(host);
    ReactDOM.default.createRoot(host).render(React.default.createElement(LocalLearnerPreviewMode.Provider, { value: 0 }, React.default.createElement(LocalActivity, { node })));
  });
  const preview = page.locator('#local-learner-preview-fixture');
  await preview.locator('.ca-cues .ca-private').waitFor();
  assert.equal(await preview.locator('.ca-cues .ca-private').count(), 1, 'learner preview contains one assigned private card');
  const text = await preview.innerText();
  assert.ok(/37|59/.test(text) && !(/37/.test(text) && /59/.test(text)), 'other learner card stays hidden');
  assert.equal(await preview.getByRole('radio', { name: 'Teacher view' }).count(), 0, 'learner preview cannot select teacher controls');
  console.log('PASS Resource Hub communicative learner projection hides other cards and teacher controls.');
} finally { await browser.close(); }

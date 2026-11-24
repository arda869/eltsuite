// Black-and-white printing uses a picture's black-and-white version; colour printing never does.
// Also: activity types and references print with their current labels.
// Needs the dev server on 5197 (as the other print tests).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
const p = await b.newPage();
try {
  await p.goto('http://localhost:5197/dev.html?seed&as=teacher');
  await p.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.getItem('mockdemo'); }, null, { timeout: 180000 });
  const r = await p.evaluate(async () => {
    const W = await import('/src/lib/worksheet.ts'), H = await import('/src/lib/worksheetHtml.ts'), P = await import('/src/communicative/print.ts');
    const pic = { type: 'picture', attrs: { src: 'https://example.org/colour.jpg', bw: 'https://example.org/line.png', alt: 'A market', size: 'm' } };
    const act = { id: 'aid-1', name: 'Activation', colour: '#b4442e', icon: 'activation' };
    const tasks = [
      { id: 't1', title: 'Warm up', instructions: 'Talk.', identity: act, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Talk.' }] }] } },
      { id: 't2', title: 'Look', instructions: 'Look.', content: { type: 'doc', content: [{ type: 'paragraph', content: [pic, { type: 'text', text: ' Use the words from ' }, { type: 'activityRef', attrs: { kind: 'activity', anchor: 't1' } }, { type: 'text', text: '. ' }, { type: 'activityRef', attrs: { kind: 'version', version: 'A' } }, { type: 'text', text: ' starts.' }] }] } },
    ];
    const items = W.flattenWithSections(tasks);
    const base = { header: false, key: false, qr: false, paper: 'A4', columns: 1, accent: '#1f6aa5' };
    const colour = H.worksheetHtml('Test', items, { ...base, mono: false }), mono = H.worksheetHtml('Test', items, { ...base, mono: true });
    const card = { id: 'c', kind: 'memory', instruction: 'Find pairs.', items: [{ id: 'i', title: 'Cat', match: 'Gato', picture: { src: 'https://example.org/cat.jpg', bw: 'https://example.org/cat-line.png', alt: 'Cat' } }], settings: { mode: 'class' } };
    return {
      colourBw: colour.includes('line.png'), colourColour: colour.includes('colour.jpg'), monoBw: mono.includes('line.png') && mono.includes('bw-version'),
      collected: W.collectPictures(items).some((x) => x.src.endsWith('line.png')),
      cardsMono: P.printActivity(card, { mono: true }).map((x) => x.html).join('').includes('cat-line.png'),
      cardsColour: P.printActivity(card, {}).map((x) => x.html).join('').includes('cat-line.png'),
      identity: colour.includes('class="ex-aid"') && colour.includes('Activation'),
      ref: /class="aref[^"]*"[^>]*>.*Activation/.test(colour), sign: colour.includes('class="vsign" data-v="A"'),
    };
  });
  assert.ok(r.colourColour && !r.colourBw, 'colour print uses the colour picture');
  assert.ok(r.monoBw, 'black-and-white print uses the black-and-white version');
  assert.ok(r.collected, 'the version is loaded with the other pictures');
  assert.ok(r.cardsMono && !r.cardsColour, 'activity cards use the version only in black and white');
  assert.ok(r.identity && r.ref && r.sign, 'activity types, references and the A sign print');
  console.log('PASS black-and-white picture versions and references on paper');
} finally { await b.close(); }

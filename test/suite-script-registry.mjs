// Run with Vite's test fixture: npx vite --config test/vite.config.ts --port 5184
// This exercises the actual TaskEditor insertion menu and its Tiptap schema.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.STYLE_BASE || 'http://localhost:5184';
const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto(`${base}/test/lesson-style-check.html`);
  await page.waitForFunction(() => window.COMMANDS && window.SUITE_TYPES && document.querySelector('.ProseMirror')?.editor);
  const result = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror').editor;
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
    const labels = window.SUITE_TYPES;
    const issues = [];
    const tested = [];
    const unsupported = [];
    const serializedByKey = {};
    const keys = window.COMMANDS.map(command => command.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length) issues.push(`Duplicate menu keys: ${duplicates.join(', ')}`);
    const external = {
      image: 'opens the picture picker',
      pdf: 'opens the PDF picker',
      'tt-org': 'requires organisation-defined forms',
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const roundTrip = (name, content, required = true) => {
      try {
        const text = window.toSuiteScript(content, labels);
        serializedByKey[name] = text;
        if (!text.startsWith('SuiteScript v1\n')) throw Error('missing plain-text header');
        const parsed = window.parseSuiteScript(String(text), labels); // plain-text-only intermediary
        if (parsed.errors.length) throw Error(parsed.errors.join('; '));
        if (!same(content, parsed.content)) throw Error(`changed JSON; original=${JSON.stringify(content).slice(0, 260)}; parsed=${JSON.stringify(parsed.content).slice(0, 260)}; source=${text.slice(0, 220)}`);
        const valid = editor.schema.nodeFromJSON({ type: 'doc', content: parsed.content });
        valid.check();
        tested.push(name);
      } catch (error) {
        (required ? issues : unsupported).push(`${name}: ${String(error)}`);
      }
    };
    for (const command of window.COMMANDS) {
      if (external[command.key]) { unsupported.push(`${command.key}: ${external[command.key]}`); continue; }
      editor.commands.setContent(empty);
      try { command.run(editor); }
      catch (error) { issues.push(`${command.key}: insertion threw ${String(error)}`); continue; }
      const doc = editor.getJSON();
      if (same(doc, empty)) { unsupported.push(`${command.key}: no node inserted in the blank editor`); continue; }
      roundTrip(command.key, doc.content);
    }
    // Every registered SuiteScript label must come from a real insertion command,
    // and each native question/communicative type must retain its labelled form.
    const nativeTypes = Object.entries(labels);
    const unlabelled = [];
    for (const [key, label] of nativeTypes) {
      if (!window.COMMANDS.some(command => command.label === label)) issues.push(`${key}: label ${label} is absent from the menu`);
      else if (!Object.entries(serializedByKey).some(([commandKey, source]) => window.COMMANDS.find(command => command.key === commandKey)?.label === label && source.includes(`@question(type: ${JSON.stringify(label)}`))) unlabelled.push(`${key}: ${label}`);
    }
    // These marks and paired/native nodes are important even where no one-click
    // insertion command creates them with representative content.
    const cases = {
      marks: [{ type: 'paragraph', content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: 'under', marks: [{ type: 'underline' }] },
        { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] },
        { type: 'hardBreak' },
        { type: 'text', text: '@speaker' },
      ] }],
      'choice:radio': [{ type: 'paragraph', content: [{ type: 'choice', attrs: { id: 'matrix-choice', display: 'radio', options: ['one', 'two'], correct: 1 } }] }],
      'gap:letters': [{ type: 'paragraph', content: [{ type: 'gap', attrs: { id: 'matrix-gap', answer: 'hello', letters: true } }] }],
    };
    for (const [name, content] of Object.entries(cases)) roundTrip(name, content);
    return { menuCount: keys.length, labels: nativeTypes.length, tested, unsupported, unlabelled, issues };
  });
  console.log(JSON.stringify({ menuCount: result.menuCount, nativeLabels: result.labels, passed: result.tested.length, unsupported: result.unsupported, unlabelled: result.unlabelled, issues: result.issues }, null, 2));
  assert.deepEqual(result.unsupported, [
    'pdf: opens the PDF picker',
    'tt-org: requires organisation-defined forms',
    'image: opens the picture picker',
  ]);
  assert.equal(result.tested.length, result.menuCount - result.unsupported.length + 3, 'each instantiable menu command and three native fixtures must round-trip');
  assert.equal(result.labels, 52, 'native type registry changed; review the labelled matrix');
  assert.deepEqual(result.unlabelled, [], 'every registered native type must serialize with its menu label');
  assert.deepEqual(result.issues, []);
} finally {
  await browser.close();
}

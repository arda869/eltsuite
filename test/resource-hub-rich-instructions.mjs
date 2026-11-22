import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Run with the local Vite server, as in the other Resource Hub browser checks.
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5197'}/dev.html?seed&as=teacher`);
  const result = await page.evaluate(async () => {
    const { publishedTasks } = await import('/src/resourceHub/resourceTasks.ts');
    const { flattenTask } = await import('/src/lib/worksheet.ts');
    const { makeEditorResourcePdf } = await import('/src/resourceHub/ResourceRichPdf.ts');
    const doc = (text, bold = false) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] }] });
    const section = { id: 'learner', title: 'A task', audience: 'learner', kind: 'task', instructions: 'Online directions', instrDoc: doc('Bold online directions', true), printInstructions: 'Paper directions', printInstrDoc: doc('Bold paper directions', true), content: doc('Task body') };
    const activity = { id: 'otp-050', title: 'Test activity', editorSections: [section] };
    const copied = publishedTasks(activity, new Set(['learner']))[0];
    const printed = flattenTask(copied);
    const blankSection = { ...section, printInstructions: '', printInstrDoc: null };
    const fallback = flattenTask(publishedTasks({ ...activity, editorSections: [blankSection] }, new Set(['learner']))[0]);
    const bytes = await makeEditorResourcePdf({ activity, learnerIds: ['learner'], teacherIds: [], copies: 1, paper: 'a4', colour: 'mono' });
    return { copied, printed: { instructions: printed.instructions, instrRuns: printed.instrRuns }, fallback: { instructions: fallback.instructions, instrRuns: fallback.instrRuns }, bytes: Array.from(bytes) };
  });
  assert.deepEqual(result.copied.instrDoc.content[0].content[0].marks, [{ type: 'bold' }]);
  assert.deepEqual(result.copied.print.instrDoc.content[0].content[0].marks, [{ type: 'bold' }]);
  assert.match(JSON.stringify(result.printed.instrRuns), /Bold paper directions/);
  assert.doesNotMatch(JSON.stringify(result.printed.instrRuns), /Bold online directions/);
  assert.match(JSON.stringify(result.fallback.instrRuns), /Bold online directions/, 'A blank paper field falls back to the on-screen rich instruction');
  const pdf = await getDocument({ data: new Uint8Array(result.bytes), useSystemFonts: true }).promise;
  const strings = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    strings.push(...content.items.map(item => item.str));
  }
  const pdfText = strings.join(' ');
  assert.match(pdfText, /Bold paper directions/);
  assert.doesNotMatch(pdfText, /Bold online directions/);
  console.log('PASS Resource Hub rich on-screen and paper instructions, Class copy/print override, blank paper fallback, and PDF output.');
} finally { await browser.close(); }

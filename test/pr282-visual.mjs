// Visual acceptance fixture for question numbering across all lesson styles.
// Run against test/vite.config.ts on port 5186 after starting the test server.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';

const base = process.env.PR282_BASE || 'http://localhost:5186';
const out = 'outputs/pr282';
mkdirSync(out, { recursive: true });
const picture = '/test/fixtures/import-shapes.jpg';
const t = (text) => ({ type: 'text', text });
const gap = (id, attrs = {}) => ({ type: 'gap', attrs: { id, answers: ['answer'], ...attrs } });
const p = (...content) => ({ type: 'paragraph', content });
const line = (...content) => ({ type: 'listItem', content: [p(...content)] });
const choice = (id, options, display = 'radio') => ({ type: 'choice', attrs: { id, options, correct: 0, display } });
const task = {
  title: 'Every question format',
  instructions: 'Read each question and give your answer.',
  content: { type: 'doc', content: [
    { type: 'orderedList', attrs: { start: 1, listType: '1' }, content: [
      line(t('One gap: '), gap('list-one')),
      line(t('One more: '), gap('list-two')),
    ] },
    { type: 'orderedList', attrs: { start: 1, listType: '1' }, content: [
      line(t('Two gaps: '), gap('list-a'), t(' and '), gap('list-b')),
    ] },
    p(t('Gap fill: '), gap('gap')),
    p(t('Letter gaps: '), gap('letters', { letters: true, pattern: 'c_t', answers: ['cat'] })),
    p(t('Word formation: '), gap('form', { stem: 'DECIDE', answers: ['decision'] })),
    p(t('Multiple choice in line: '), choice('inline', ['go', 'went', 'gone'], 'dropdown')),
    p(t('Multiple choice as a list: '), choice('list', ['one', 'two', 'three'])),
    p(t('True or false: '), choice('tf', ['True', 'False'])),
    p(t('True, false or not given: '), choice('tfng', ['True', 'False', 'Not given'])),
    { type: 'mcq', attrs: { id: 'mcq', prompt: 'Choose the best answer.', options: ['First', 'Second', 'Third'], correct: 0 } },
    { type: 'match', attrs: { id: 'match', pairs: [{ left: 'Sun', right: 'Day' }, { left: 'Moon', right: 'Night' }], extras: [] } },
    { type: 'wordbank', attrs: { words: ['apple', 'banana', 'cherry'], extras: [] } },
    p(t('Drag a word: '), { type: 'dropgap', attrs: { id: 'drop', answer: 'apple' } }),
    { type: 'pq', attrs: { id: 'statements', kind: 'matching', data: { options: ['A', 'B', 'C', 'D'], names: ['Anna', 'Ben', 'Cara', 'Dan'], statements: [{ text: 'Likes music', answer: 0 }, { text: 'Likes sport', answer: 1 }] } } },
    { type: 'pq', attrs: { id: 'label', kind: 'label', data: { image: picture, imageSize: 'm', points: [{ x: 25, y: 35, label: 'circle' }, { x: 70, y: 55, label: 'square' }], extras: [] } } },
    { type: 'pq', attrs: { id: 'speaking', kind: 'speaking', data: { prompt: 'Compare the pictures.', images: [picture], imageSize: 's', questions: ['What do you see?'], timer: 60, pairs: true } } },
    { type: 'subTask', attrs: { id: 'paper-part', instr: 'Tap the answer.', paperInstr: 'Circle the answer.' }, content: [p(t('The answer is '), gap('paper-gap'))] },
  ] },
};
const single = { title: 'One question', instructions: 'Complete the sentence.', content: { type: 'doc', content: [p(t('I can '), gap('only-one'))] } };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/dev.html?seed&as=teacher`);
  await page.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.getItem('mockdemo'); }, null, { timeout: 120000 });
  await page.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 30000 });
  const demo = await page.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  await page.evaluate(({ demo, task, single }) => {
    const fs = JSON.parse(localStorage.getItem('mockfs'));
    const root = `classes/${demo.classId}/items/${demo.itemId}/tasks/`;
    for (const key of Object.keys(fs)) if (key.startsWith(root)) delete fs[key];
    fs[root + 'qa-all'] = { kind: 'task', order: 0, title: task.title, instructions: task.instructions, content: task.content, hidden: false, locked: false };
    fs[root + 'qa-single'] = { kind: 'task', order: 1, title: single.title, instructions: single.instructions, content: single.content, hidden: false, locked: false };
    localStorage.setItem('mockfs', JSON.stringify(fs));
  }, { demo, task, single });
  const lesson = `${base}/class/${demo.classId}/lesson/${demo.itemId}`;
  const results = [];
  for (const style of ['adult', 'young', 'teen', 'exam']) {
    await page.evaluate(({ classId, style }) => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs[`classes/${classId}`].lessonStyle = style;
      localStorage.setItem('mockfs', JSON.stringify(fs));
    }, { classId: demo.classId, style });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(lesson);
      await page.locator('.task-editor').waitFor({ timeout: 30000 });
      await page.locator('.mode-btn').click();
      await page.getByRole('menuitemradio', { name: /^Learner view/ }).click();
      await page.locator('.task-frame').waitFor();
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `${out}/${style}-${width}-learner.png`, fullPage: true });
      const learner = await page.evaluate(() => {
        const root = document.querySelector('.task-frame');
        const matching = [...root.querySelectorAll('.pq-mm-row')].map(row => {
          const text = row.querySelector('.pq-mm-text')?.getBoundingClientRect();
          const opts = row.querySelector('.pq-mm-opts')?.getBoundingClientRect();
          return { text: text?.toJSON(), opts: opts?.toJSON(), row: row.getBoundingClientRect().toJSON() };
        });
        return {
          style: root?.getAttribute('data-lesson-style'),
          numbers: [...root.querySelectorAll('.q-num')].map(el => el.textContent.trim()),
          labelPicture: !!root.querySelector('[data-qid="label"] img'),
          speakingPicture: !!root.querySelector('.pq-speak .pq-photos.size-s img'),
          labelSize: !!root.querySelector('.pq-label-stage.size-m img'),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
          matching,
        };
      });
      assert.equal(learner.style, style);
      assert.equal(learner.horizontalOverflow, false, `${style} ${width}: horizontal overflow`);
      assert.ok(learner.labelPicture && learner.labelSize && learner.speakingPicture, `${style} ${width}: picture or chosen size is missing`);
      assert.ok(learner.matching.every(({ text, opts }) => Math.abs(text.y - opts.y) < 45), `${style} ${width}: statement matching choices drift from statements`);
      await page.locator('.pq-mm-q').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${style}-${width}-matching.png` });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('.mode-btn').click();
      await page.getByRole('menuitemradio', { name: /^Editing/ }).click();
      await page.getByRole('radio', { name: 'Worksheet: the lesson as printed pages' }).click();
      await page.locator('.sh-left .sh-hit').first().waitFor();
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `${out}/${style}-${width}-worksheet.png`, fullPage: true });
      results.push({ style, width, learner });
    }
    const html = await page.evaluate(async ({ task, single, style }) => {
      const { flattenTask } = await import('/src/lib/worksheet.ts');
      const { worksheetHtml } = await import('/src/lib/worksheetHtml.ts');
      return worksheetHtml('Question formats', [{ kind: 'task', task: flattenTask(task, style) }, { kind: 'task', task: flattenTask(single, style) }], { lessonStyle: style, header: true, key: true, paper: 'A4', columns: 1, className: 'QA class', level: 'B1', origin: location.origin });
    }, { task, single, style });
    const print = await context.newPage();
    await print.route(`${base}/pr282-print-${style}`, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await print.goto(`${base}/pr282-print-${style}`);
    await print.waitForFunction(() => window.__laidOut === true, null, { timeout: 30000 });
    await print.screenshot({ path: `${out}/${style}-paper.png`, fullPage: true });
    await print.pdf({ path: `${out}/${style}.pdf`, printBackground: true, preferCSSPageSize: true });
    const paper = await print.evaluate(() => ({
      pages: document.querySelectorAll('.page:not(.key-page)').length,
      numbers: [...document.querySelectorAll('.page:not(.key-page) .qn')].map(el => el.textContent.trim()),
      optionLetters: document.querySelectorAll('.page:not(.key-page) .ml').length,
      key: document.querySelector('.key-page')?.textContent || '',
      paperInstruction: document.body.textContent.includes('Circle the answer.'),
      screenInstructionOnPaper: document.querySelector('#pages')?.textContent.includes('Tap the answer.'),
      singleNumber: [...document.querySelectorAll('.page:not(.key-page) .unit')].find(el => el.textContent.includes('One question'))?.querySelector('.qn')?.textContent || '',
    }));
    assert.ok(paper.optionLetters > 0, `${style}: no styled option letters on paper`);
    assert.ok(paper.key.includes('1a') && paper.key.includes('1b'), `${style}: two-gap key missing 1a/1b`);
    assert.ok(paper.paperInstruction && !paper.screenInstructionOnPaper, `${style}: On paper instruction did not replace screen instruction`);
    assert.equal(paper.singleNumber, '', `${style}: single question has a number`);
    results.push({ style, paper });
    await print.close();
  }
  const paperOnly = { title: 'On paper', instructions: 'Answer on screen.', content: { type: 'doc', content: [
    { type: 'subTask', attrs: { id: 'word-part', instr: 'Tap the answer.', paperInstr: 'Circle the answer.' }, content: [p(t('Choose '), gap('word-gap'))] },
  ] } };
  const wordBytes = await page.evaluate(async (task) => {
    const { flattenTask, lessonDocx } = await import('/src/lib/worksheet.ts');
    const blob = await lessonDocx('Paper instructions', [{ kind: 'task', task: flattenTask(task, 'adult') }], { lessonStyle: 'adult', header: true, key: false, paper: 'A4', columns: 1, className: 'QA class', level: 'B1', origin: location.origin });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, paperOnly);
  const wordXml = new TextDecoder().decode(unzipSync(Uint8Array.from(wordBytes))['word/document.xml']);
  assert.match(wordXml, /Circle the answer/);
  assert.doesNotMatch(wordXml, /Tap the answer/);
  writeFileSync(`${out}/paper-instruction.docx`, Buffer.from(wordBytes));

  const longTask = { title: 'Long task', instructions: 'Read the complete text.', content: { type: 'doc', content: Array.from({ length: 65 }, (_, i) => p(t(`Paragraph ${i + 1}. The teacher has written a complete section of reading material. The next paragraph must continue on another page without covering the page band or footer.`))) } };
  const longHtml = await page.evaluate(async (task) => {
    const { flattenTask } = await import('/src/lib/worksheet.ts');
    const { worksheetHtml } = await import('/src/lib/worksheetHtml.ts');
    return worksheetHtml('Long task', [{ kind: 'task', task: flattenTask(task, 'adult') }], { lessonStyle: 'adult', header: true, key: false, paper: 'A4', columns: 1, className: 'QA class', level: 'B1', origin: location.origin });
  }, longTask);
  const longPage = await context.newPage();
  await longPage.route(`${base}/pr282-long`, route => route.fulfill({ status: 200, contentType: 'text/html', body: longHtml }));
  await longPage.goto(`${base}/pr282-long`);
  await longPage.waitForFunction(() => window.__laidOut === true, null, { timeout: 30000 });
  const longResult = await longPage.evaluate(() => ({
    pages: document.querySelectorAll('.page').length,
    paragraphs: [...document.querySelectorAll('.page .unit p')].filter(el => /^Paragraph \d+\./.test(el.textContent || '')).length,
    clipped: [...document.querySelectorAll('.page .unit p')].filter(el => /^Paragraph \d+\./.test(el.textContent || '') && el.getBoundingClientRect().bottom > (el.closest('.page')?.querySelector('.foot')?.getBoundingClientRect().top || Infinity) + 1).length,
  }));
  assert.ok(longResult.pages >= 2 && longResult.paragraphs >= 65, 'long task must flow across pages without losing paragraphs');
  assert.equal(longResult.clipped, 0, 'long task paragraph reaches beneath a footer');
  await longPage.screenshot({ path: `${out}/long-task-paper.png`, fullPage: true });
  await longPage.pdf({ path: `${out}/long-task.pdf`, printBackground: true, preferCSSPageSize: true });
  await longPage.close();
  await page.evaluate(({ demo, longTask }) => {
    const fs = JSON.parse(localStorage.getItem('mockfs'));
    fs[`classes/${demo.classId}`].lessonStyle = 'adult';
    fs[`classes/${demo.classId}/items/${demo.itemId}/tasks/qa-all`].content = longTask.content;
    localStorage.setItem('mockfs', JSON.stringify(fs));
  }, { demo, longTask });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(lesson);
  await page.locator('.task-editor').waitFor();
  await page.getByRole('radio', { name: 'Worksheet: the lesson as printed pages' }).click();
  await page.locator('.sh-sheet').nth(1).waitFor();
  await page.waitForTimeout(1500);
  const editing = await page.evaluate(() => {
    const editor = document.querySelector('.sh-right .task-editor')?.getBoundingClientRect();
    const nextPage = document.querySelectorAll('.sh-sheet')[1]?.getBoundingClientRect();
    return { editor: editor?.toJSON(), nextPage: nextPage?.toJSON() };
  });
  assert.ok(editing.editor && editing.nextPage && editing.editor.left >= editing.nextPage.right - 2, 'the next worksheet page overlaps the task editor');
  await page.screenshot({ path: `${out}/long-task-editor.png`, fullPage: true });
  results.push({ wordPaperInstruction: true, longResult, editing });
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`Visual fixture passed; screenshots and PDFs in ${out}`);
  await context.close();
} finally {
  await browser.close();
}

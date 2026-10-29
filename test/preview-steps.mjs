// What test/preview.mjs does, step by step: a task with no title or instruction, starting with sub-tasks.
export default async function steps({ p, ctx, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(1500);
  const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
  const html = await p.evaluate(async ({ a, b }) => {
    const ws = await import('/src/lib/worksheet.ts');
    const wh = await import('/src/lib/worksheetHtml.ts');
    const tasks = [
      { kind: 'task', title: '', instructions: '', content: { type: 'doc', content: [{ type: 'subTask', attrs: { instr: 'Read the text and underline the verbs.' }, content: a }, { type: 'subTask', attrs: { instr: 'Now write three sentences about your weekend.' }, content: b }] } },
      { kind: 'task', title: 'With a title', instructions: 'Match the words.', content: { type: 'doc', content: [{ type: 'subTask', attrs: { instr: 'First, the nouns.' }, content: a }] } },
    ];
    return wh.worksheetHtml('Sub-tasks', ws.flattenWithSections(tasks), { header: true, accent: '#2f7a5a', className: 'Test', level: 'B1' });
  }, { a: [para('I went to the cinema. We watched a film and ate popcorn.')], b: [para('1 ______________________')] });
  const w = await ctx.newPage();
  await w.setViewportSize({ width: 900, height: 1200 });
  await w.setContent(html.replace(/__autoPrint/g, '__noPrint'), { waitUntil: 'load' });
  await w.waitForTimeout(2500);
  await w.screenshot({ path: 'preview-out/sheet.png', fullPage: false });
  say('first head', await w.locator('.ex-head').first().innerText());
}

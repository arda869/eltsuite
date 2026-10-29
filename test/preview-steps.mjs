// What test/preview.mjs does, step by step: a task longer than a page, printed under a section heading.
export default async function steps({ p, ctx, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(1500);
  const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
  const lines = (n, w) => Array.from({ length: n }, (_, i) => para(`${i + 1}. ${w} He works at night, from 8.00 p.m. to 6.00 in the morning, and sleeps in the day.`));
  const cases = {
    box: [{ type: 'textBox', attrs: { style: 'paper', tone: 'grey' }, content: lines(48, 'In the box:') }],
    paras: lines(70, 'Line'),
    mixed: [para('Read the interview.'), { type: 'textBox', attrs: { style: 'paper', tone: 'grey' }, content: lines(44, 'Interview:') }, para('Now answer the questions.')],
  };
  for (const [name, content] of Object.entries(cases)) {
    const html = await p.evaluate(async ({ content }) => {
      const ws = await import('/src/lib/worksheet.ts');
      const wh = await import('/src/lib/worksheetHtml.ts');
      const tasks = [
        { kind: 'section', title: 'Grammar' },
        { kind: 'task', title: 'He works at night', instructions: 'Read the interview and answer.', content: { type: 'doc', content } },
        { kind: 'task', title: 'Second task', instructions: 'The second task.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECOND TASK HERE' }] }] } },
      ];
      return wh.worksheetHtml('Long task', ws.flattenWithSections(tasks), { header: true, accent: '#2f7a5a', className: 'Test', level: 'B1' });
    }, { content });
    const w = await ctx.newPage();
    await w.setViewportSize({ width: 900, height: 1200 });
    await w.setContent(html.replace(/__autoPrint/g, '__noPrint'), { waitUntil: 'load' });
    await w.waitForTimeout(2500);
    const pages = await w.locator('.page').evaluateAll((ps) => ps.map((pg) => (pg.querySelector('.cols')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)));
    say(name, 'pages', pages.length, JSON.stringify(pages));
    await w.screenshot({ path: `preview-out/${name}.png`, fullPage: true });
    await w.close();
  }
}

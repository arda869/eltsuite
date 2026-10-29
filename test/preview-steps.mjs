// Dragging a paragraph into a sub-task, by its handle.
export default async function steps({ p, shot, say, demo, BASE }) {
  await p.evaluate(() => localStorage.setItem('ll.sheetView', ''));
  const para = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
  const taskId = await p.evaluate(async ({ c, i, content }) => {
    const t = await import('/src/lib/tasks.ts');
    return await t.addTask(c, i, 99, 'task', { title: 'Drag test', instructions: 'Move the line into part a.', content });
  }, { c: demo.classId, i: demo.itemId, content: { type: 'doc', content: [para('MOVE ME into the sub-task.'), { type: 'subTask', attrs: { id: 'st1', instr: 'Part a' }, content: [para('First line of part a.'), para('Second line of part a.')] }, para('After the sub-task.')] } });
  say('task', taskId);
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}?task=${taskId}`);
  await p.waitForSelector('.subtask-node', { timeout: 30000 });
  await p.waitForTimeout(1500);
  const line = p.locator('.ProseMirror > p:has-text("MOVE ME")');
  await line.hover();
  await p.waitForTimeout(400);
  await shot('before');
  const handle = p.locator('.block-handle').first();
  const target = p.locator('.st-ed-body p:has-text("Second line")');
  const tb = await target.boundingBox();
  await handle.dragTo(target, { targetPosition: { x: 40, y: tb.height - 2 } });
  await p.waitForTimeout(800);
  await shot('after');
  say('inside the sub-task', (await p.locator('.st-ed-body').innerText()).replace(/\n+/g, ' | '));
  say('top level', (await p.locator('.ProseMirror > p').allInnerTexts()).join(' | '));
}

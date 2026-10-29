// What test/preview.mjs does, step by step: sub-tasks in a lesson, on screen and on paper.
export default async function steps({ p, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  // make sure we are in Digital
  const dig = p.getByRole('radio', { name: /Digital/ });
  if (await dig.count()) await dig.click();
  await wait(600);
  // the third task in the list
  await p.locator('.task-row').nth(3).click();
  await wait(1500);
  const ed = p.locator('.frame-body .task-editor .ProseMirror').first();
  await ed.click();
  await p.keyboard.press('Control+End');
  await p.keyboard.press('Enter');
  const sub = async (instr, text) => {
    await p.keyboard.type('/sub', { delay: 40 });
    await wait(900);
    await p.keyboard.press('Enter');
    await wait(700);
    await p.keyboard.type(text, { delay: 10 });
    const inputs = p.locator('.st-instr-input');
    await inputs.last().fill(instr);
    await wait(300);
    await p.locator('.st-ed-body').last().click();
    await p.keyboard.press('Control+End');
  };
  await sub('Read the email again. Underline every present perfect.', 'I have just arrived in Lisbon.');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Control+End');
  await sub('Now write three sentences about your week.', 'This week I have…');
  await wait(1500);
  await shot('editor-subtasks');
  say('subtask nodes', await p.locator('.subtask-node').count());

  // learner view
  await p.getByRole('button', { name: /Editing/ }).first().click();
  await wait(400);
  await p.getByRole('menuitemradio', { name: /Learner view/ }).click().catch((e) => say('learner view', e.message));
  await wait(1500);
  await shot('learner-a-only');
  say('visible subtasks', await p.locator('.subtask').count(), 'next buttons', await p.locator('.st-next').count());
  await p.locator('.st-next').first().click().catch((e) => say('next', e.message));
  await wait(700);
  await shot('learner-a-and-b');

  // back to editing, then the worksheet
  await p.getByRole('button', { name: /Learner view/ }).first().click().catch(() => {});
  await wait(300);
  await p.getByRole('menuitemradio', { name: /Editing/ }).click().catch((e) => say('editing', e.message));
  await wait(1000);
  await p.getByRole('radio', { name: /Worksheet/ }).click();
  await p.locator('.sh-split').waitFor({ timeout: 10000 });
  await wait(2500);
  await shot('worksheet-subtasks');
}

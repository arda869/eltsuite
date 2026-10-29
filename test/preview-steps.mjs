// What test/preview.mjs does, step by step: the text toolbar in the lesson editor and its › arrow.
export default async function steps({ p, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  p.on('pageerror', (e) => say('CRASH', e.message));
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  const dig = p.getByRole('radio', { name: /Digital/ });
  if (await dig.count()) await dig.click();
  await p.locator('.task-row').nth(4).click();
  await wait(1500);
  const bar = p.locator('.frame-body .task-editor .toolbar').first();
  const crop = async (name) => {
    const b = await bar.boundingBox();
    await p.screenshot({ path: `preview-out/${name}.png`, clip: { x: Math.max(0, b.x - 20), y: Math.max(0, b.y - 20), width: Math.min(1440, b.width + 40), height: b.height + 260 } });
    say('shot', name, 'bar', Math.round(b.width), 'x', Math.round(b.height));
  };
  await crop('01-bar');
  say('tools', await bar.locator('button.tool').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label')).join(' | ')));
  const arrow = bar.locator('.tb-more-arrow');
  say('arrow', await arrow.count());
  await arrow.click().catch((e) => say('arrow', e.message));
  await wait(400);
  await crop('02-bar-open');
  await arrow.click().catch(() => {});
  await wait(400);
  await crop('03-bar-closed-again');
  await p.locator('.frame-body .task-editor .ProseMirror').first().click();
  await bar.locator('[aria-label="Pronunciation"]').click().catch((e) => say('pron', e.message));
  await wait(500);
  await crop('04-pron');
  await p.setViewportSize({ width: 1100, height: 900 });
  await wait(800);
  await crop('05-narrow');
}

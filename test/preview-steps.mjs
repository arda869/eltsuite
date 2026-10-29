// What test/preview.mjs does, step by step: the app pages laid out again, and the Storyboards app.
export default async function steps({ p, shot, BASE }) {
  for (const path of ['/pdf', '/storyboard', '/design']) {
    await p.goto(BASE + path);
    await p.waitForTimeout(2500);
    await shot(path.slice(1));
  }
  await p.locator('[aria-label="Apps"], button:has-text("Apps")').first().click().catch(() => {});
  await p.waitForTimeout(500);
  await shot('apps');
}

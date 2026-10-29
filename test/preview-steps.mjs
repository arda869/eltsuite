// What test/preview.mjs does, step by step: Super Admin's teacher drawer has "Sign in as".
export default async function steps({ p, shot, say, BASE }) {
  p.on('pageerror', (e) => say('CRASH', e.message));
  await p.goto(`${BASE}/admin?tab=teachers`);
  await p.waitForTimeout(3000);
  await p.locator('.hq-row-open').first().click().catch((e) => say('row', e.message));
  await p.waitForTimeout(1000);
  await shot('drawer');
  say('button', await p.locator('button:has-text("Sign in as")').count());
}

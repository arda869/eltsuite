// The public homepage in the app's own style, desktop and phone, and the invitation request form;
// then Super Admin → Invitation codes, where requests arrive.
export default async function steps({ p, ctx, shot, say, BASE }) {
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  g.on('pageerror', (e) => say('CRASH', e.message));
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    await g.setViewportSize({ width: w, height: h });
    await g.goto(BASE + '/'); await g.waitForTimeout(2500);
    say(tag, 'overflow', await g.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await shot('home-' + tag, g);
    for (let y = 0; y < 14000; y += 600) { await g.evaluate((y) => scrollTo(0, y), y); await g.waitForTimeout(80); }
    await g.evaluate(() => document.getElementById('teach')?.scrollIntoView()); await g.waitForTimeout(4500);
    await shot('live-' + tag, g);
    await g.screenshot({ path: `preview-out/${tag === 'desktop' ? '20' : '21'}-home-${tag}-full.png`, fullPage: true });
  }
  await g.setViewportSize({ width: 1440, height: 900 });
  await g.goto(BASE + '/#invite'); await g.waitForTimeout(1500);
  const form = g.locator('#invite form');
  await form.getByLabel('Your name').fill('Sam Reed');
  await form.getByLabel('Email').fill('sam@example.com');
  await form.getByLabel(/Who you teach/).selectOption('Adults');
  await form.getByRole('button', { name: 'Ask for an invitation' }).click();
  await g.waitForTimeout(800);
  await g.evaluate(() => document.getElementById('invite')?.scrollIntoView());
  await shot('invite-sent', g);
  for (const path of ['/pricing', '/about', '/signin', '/signin?invite']) {
    await g.goto(BASE + path); await g.waitForTimeout(1200);
    await shot(path.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root', g);
  }
  await g.emulateMedia({ colorScheme: 'dark' });
  await g.goto(BASE + '/'); await g.waitForTimeout(1500);
  await shot('home-dark', g);
  await guest.close();
  await p.goto(BASE + '/admin?tab=codes'); await p.waitForTimeout(2500);
  await shot('admin-codes', p);
}

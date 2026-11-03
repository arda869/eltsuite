// The public homepage at computer, tablet and phone sizes, light and dark, top of page and the
// whole page.
export default async function steps({ ctx, shot, say, BASE }) {
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  g.on('pageerror', (e) => say('CRASH', e.message));
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [1024, 1366, 'tablet'], [390, 844, 'phone']]) {
    await g.setViewportSize({ width: w, height: h });
    await g.goto(BASE + '/'); await g.waitForTimeout(3000);
    say(tag, 'overflow', await g.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await shot('home-' + tag, g);
    await g.screenshot({ path: `preview-out/full-home-${tag}.png`, fullPage: true });
  }
  await g.setViewportSize({ width: 1440, height: 900 });
  await g.emulateMedia({ colorScheme: 'dark' });
  await g.goto(BASE + '/'); await g.waitForTimeout(3000);
  await shot('home-dark', g);
  await guest.close();
}

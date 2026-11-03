// Survey: the public website signed out, and the main teacher screens signed in, at computer and
// phone sizes. For each page it logs how much of the width the content uses, whether the page
// scrolls, and the fonts the logo uses, so layout and logo differences show up in the log.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const measure = async (tag) => {
    const m = await p.evaluate(() => {
      const se = document.scrollingElement;
      const main = document.querySelector('main, .page, .content, #root > div');
      const r = main ? main.getBoundingClientRect() : { left: 0, width: 0 };
      // The widest block that holds most of the text: how far in from each side it starts.
      let best = null;
      for (const el of document.querySelectorAll('main *, .page *, #root > div > *')) {
        const b = el.getBoundingClientRect();
        if (b.height < 120 || b.width < 200) continue;
        if (!best || b.width > best.width) best = b;
      }
      const logos = [...document.querySelectorAll('.wordmark .wm-name, .suite-mark, .suite-k, [aria-label="ELT Suite"]')].map((e) => {
        const cs = getComputedStyle(e.querySelector('b') || e);
        return `${e.className}: ${cs.fontFamily.split(',')[0]} ${cs.fontWeight}`;
      });
      const viewport = document.querySelector('meta[name=viewport]')?.content;
      const ta = [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent).map((t) => `${t.rows}r/${Math.round(t.getBoundingClientRect().height)}px`);
      return {
        scroll: se.scrollHeight - innerHeight,
        widest: best ? `${Math.round(best.left)}..${Math.round(innerWidth - best.right)} (${Math.round(best.width)}/${innerWidth})` : 'none',
        main: `${Math.round(r.left)} w${Math.round(r.width)}`,
        logos: [...new Set(logos)].join(' | '),
        viewport,
        textareas: ta.slice(0, 6).join(' '),
      };
    });
    say('MEASURE', tag, JSON.stringify(m));
  };
  const visit = async (path, name, wait = 2500) => {
    await p.goto(BASE + path);
    await p.waitForTimeout(wait);
    await measure(name);
    await shot(name);
  };

  // Signed in (the seed has signed us in as the teacher).
  const cls = demo.classId, item = demo.itemId;
  for (const [path, name] of [
    ['/', 'home'],
    ['/classes', 'classes'],
    [`/class/${cls}`, 'class'],
    [`/class/${cls}/lesson/${item}`, 'lesson-editor'],
    ['/games', 'games'],
    ['/archive', 'resources'],
    ['/collab', 'collab'],
    ['/development', 'development'],
    ['/linguistics', 'linguistics'],
    ['/observations', 'observations'],
    ['/messages', 'messages'],
    ['/settings', 'settings'],
    ['/timetable', 'timetable'],
    ['/colleagues', 'colleagues'],
  ]) {
    try { await visit(path, name); } catch (e) { say('FAILED', name, e.message); }
  }
  // The New menu in Resources, and whether a click elsewhere closes it.
  try {
    await p.goto(BASE + '/archive');
    await p.waitForTimeout(2000);
    await p.click('text=+ New');
    await p.waitForTimeout(400);
    await shot('resources-new-menu');
    await p.mouse.click(1300, 860);
    await p.waitForTimeout(400);
    say('MENU after outside click', await p.locator('[role=menu]').count());
  } catch (e) { say('FAILED menu', e.message); }

  await p.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of [['/', 'phone-home'], [`/class/${cls}`, 'phone-class'], ['/games', 'phone-games']]) {
    try { await visit(path, name); } catch (e) { say('FAILED', name, e.message); }
  }

  // Signed out: a fresh browser with nobody signed in.
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  const oldP = p;
  for (const [path, name, w] of [
    ['/', 'public-home', 1440], ['/explore', 'public-explore', 1440], ['/pricing', 'public-pricing', 1440],
    ['/about', 'public-about', 1440], ['/signin', 'public-signin', 1440], ['/contact', 'public-contact', 1440],
    ['/nope', 'public-404', 1440], ['/', 'public-home-phone', 390],
  ]) {
    try {
      await g.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await g.goto(BASE + path);
      await g.waitForTimeout(2500);
      await shot(name, g);
      await g.screenshot({ path: `preview-out/full-${name}.png`, fullPage: true });
    } catch (e) { say('FAILED', name, e.message); }
  }
  void oldP;
  await guest.close();
}

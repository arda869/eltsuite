// What test/preview.mjs does, step by step: an audit of all of ELT Suite. Every page, as a teacher or a
// learner, on a computer or a phone (chosen by the preview branch's name: audit-td, audit-tp, audit-ld,
// audit-lp), clicking every button that is safe to click and writing down everything that goes wrong.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, demo, BASE }) {
  const branch = process.env.GITHUB_REF_NAME ?? 'preview/audit-td';
  const code = (branch.match(/audit-(\w\w)/) ?? [, 'td'])[1];
  const learner = code[0] === 'l';
  const phone = code[1] === 'p';
  const t0 = Date.now();
  const late = () => Date.now() - t0 > 17 * 60 * 1000;
  const W = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await p.setViewportSize(W);
  if (learner) {
    await p.goto(`${BASE}/dev.html?as=Mia`);
    await p.waitForTimeout(2500);
  }
  const fresh = await p.evaluate(() => JSON.parse(localStorage.getItem('mockdemo') || '{}')).catch(() => ({}));
  const { classId, itemId } = demo;
  const packId = fresh.packId ?? demo.packId;
  const pages = learner
    ? ['/', `/learn/${itemId}`, `/learn/${packId}`, `/recap/${itemId}`, '/discuss', '/messages', '/settings']
    : ['/', '/classes', `/class/${classId}`, `/class/${classId}/lesson/${itemId}`, `/class/${classId}/lesson/${packId}`, '/timetable', '/rooms', '/archive', '/collab', '/reading', '/pdf', '/design', '/recordings', '/library', '/colleagues', '/messages', '/settings', '/guide', '/tour', '/storyboard/library', '/admin', '/org-admin', '/'];
  const errs = [];
  let where = '';
  const note = (kind, m) => {
    const line = `${kind} [${where}] ${String(m).replace(/\s+/g, ' ').slice(0, 260)}`;
    if (!errs.includes(line)) errs.push(line), say(line);
  };
  p.on('pageerror', (e) => note('CRASH', e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::|DevTools|favicon|Future Flag|daily|ERR_|CORS|fonts\.g/i.test(m.text()) && note('CONSOLE', m.text()));
  p.on('dialog', (d) => (note('BROWSER DIALOG', d.message()), d.dismiss().catch(() => {})));
  // A new tab (a new document, say): its page is visited too, later.
  const extra = [];
  ctx.on('page', async (np) => {
    if (np === p) return;
    await np.waitForURL(/\/doc\/|\/studio\/|\/class\//, { timeout: 8000 }).catch(() => {});
    const u = np.url().replace(BASE, '');
    if (u.startsWith('/') && !pages.includes(u) && !extra.includes(u)) extra.push(u), pages.push(u), say('queued', u);
    setTimeout(() => np.close().catch(() => {}), 500);
  });
  const SKIP = /delete|remove|sign out|log out|leave|end (the )?(call|lesson|class)|archive (this|the)|reset|clear|block|unshare|stop sharing|revoke|kick|ban|discard|take back|cancel invitation|turn off|disconnect|install|print|download|^messages$|all chats/i;
  const safeName = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'home';
  let n = 0;
  for (let pi = 0; pi < pages.length; pi++) {
    const path = pages[pi];
    if (late()) {
      say('OUT OF TIME before', path);
      break;
    }
    where = path;
    try {
      await p.goto(BASE + path, { timeout: 30000 });
    } catch (e) {
      note('LOAD', e.message);
      continue;
    }
    await p.waitForTimeout(3000);
    const file = `preview-out/${String(++n).padStart(2, '0')}-${safeName(path)}.png`;
    await p.screenshot({ path: file }).catch(() => {});
    // Wider than the screen, on a phone: what sticks out.
    const wide = await p.evaluate(() => {
      const w = innerWidth;
      if (document.documentElement.scrollWidth <= w + 2) return [];
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > w + 2 && r.width > 0 && getComputedStyle(el).position !== 'fixed' && !el.closest('[aria-hidden=true]')) {
          const cs = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '';
          out.push(`${el.tagName.toLowerCase()}${cs} ${Math.round(r.right)}px`);
        }
        if (out.length > 6) break;
      }
      return [document.documentElement.scrollWidth + 'px wide', ...out];
    });
    if (wide.length) note('TOO WIDE', wide.join(', '));
    // Small things to tap, on a phone.
    if (phone) {
      const small = await p.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && (r.width < 24 || r.height < 24); }).length);
      if (small > 3) note('SMALL TAP TARGETS', small + ' buttons or links under 24px');
    }
    // Every button, one by one, coming back to the page after each.
    const total = await p.locator('main button:visible, [role=main] button:visible, button:visible').count().catch(() => 0);
    const limit = Math.min(total, phone ? 30 : 45);
    let clicked = 0;
    let shots = 0;
    for (let i = 0; i < limit && !late(); i++) {
      const b = p.locator('button:visible').nth(i);
      const label = ((await b.getAttribute('aria-label', { timeout: 800 }).catch(() => null)) || (await b.innerText({ timeout: 800 }).catch(() => '')) || '').trim().split('\n')[0].slice(0, 50);
      if (!label || SKIP.test(label)) continue;
      const before = errs.length;
      const url = p.url();
      try {
        await b.click({ timeout: 1500 });
        clicked++;
        await p.waitForTimeout(350);
      } catch {
        continue;
      }
      // A dialog, menu or panel that opened: a picture of it, to look at.
      const opened = await p.locator('.scrim:visible, [role=dialog]:visible, [role=menu]:visible, [role=alertdialog]:visible').count().catch(() => 0);
      if (opened && shots < (phone ? 6 : 10)) {
        shots++;
        await p.screenshot({ path: `preview-out/d-${String(n).padStart(2, '0')}-${safeName(label)}.png` }).catch(() => {});
      }
      if (errs.length > before) {
        say('  after clicking', JSON.stringify(label));
        await p.screenshot({ path: `preview-out/zz-${safeName(path)}-${safeName(label)}.png` }).catch(() => {});
      }
      // Close what opened, and come back if it went somewhere else.
      for (let k = 0; k < 2; k++) await p.keyboard.press('Escape').catch(() => {});
      if (p.url() !== url) {
        await p.goto(url).catch(() => {});
        await p.waitForTimeout(1500);
      }
    }
    say('page', path, 'buttons', total, 'clicked', clicked);
  }
  say('SUMMARY', code, 'problems', errs.length, 'minutes', Math.round((Date.now() - t0) / 60000));
  writeFileSync('preview-out/problems.txt', errs.join('\n'));
}

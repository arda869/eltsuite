// Product pictures for the public homepage: real screens with the demo data, at twice the pixels,
// without the Messages bar. Saved as preview-out/landing-*.png.
export default async function steps({ ctx, say, demo, BASE }) {
  const safe = async (name, fn) => { try { await fn(); } catch (e) { say('FAILED', name, e.message.split('\n')[0]); } };
  const browser = ctx.browser();
  const state = await ctx.storageState();
  const hi = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: state });
  const q = await hi.newPage();
  const hide = async (page) => page.addStyleTag({ content: '.dock-bar,.ai-activity-dock,.help-fab,[class*="toast"]{display:none!important}' }).catch(() => {});
  const grab = async (page, name) => { await hide(page); await page.waitForTimeout(600); await page.screenshot({ path: `preview-out/landing-${name}.png` }); say('landing', name); };
  await q.goto(`${BASE}/dev.html?as=teacher`); await q.waitForTimeout(2500);
  const cls = demo.classId, item = demo.itemId;
  await safe('editor', async () => { await q.goto(`${BASE}/class/${cls}/lesson/${item}`); await q.waitForTimeout(3500); await grab(q, 'editor'); });
  await safe('class', async () => { await q.goto(`${BASE}/class/${cls}`); await q.waitForTimeout(3000); await grab(q, 'class'); });
  await safe('home', async () => { await q.goto(`${BASE}/`); await q.waitForTimeout(3000); await grab(q, 'home'); });
  await safe('development', async () => { await q.goto(`${BASE}/development`); await q.waitForTimeout(3000); await grab(q, 'development'); });
  await safe('games', async () => { await q.goto(`${BASE}/games`); await q.waitForTimeout(2500); await grab(q, 'games'); });
  await safe('game', async () => {
    await q.setViewportSize({ width: 1200, height: 760 });
    await q.goto(`${BASE}/test/games-gallery.html?type=show&theme=garden`); await q.waitForTimeout(1500);
    await q.getByRole('button', { name: /library/ }).first().click(); await q.waitForTimeout(350);
    await grab(q, 'game');
    await q.setViewportSize({ width: 1440, height: 900 });
  });
  await safe('young', async () => {
    await q.setViewportSize({ width: 1000, height: 760 });
    await q.goto(`${BASE}/test/young-gallery.html?style=young`); await q.waitForTimeout(2000);
    await q.locator('.opt').nth(1).click().catch(() => {}); await q.waitForTimeout(500);
    await grab(q, 'young');
    await q.setViewportSize({ width: 1440, height: 900 });
  });
  await safe('collab', async () => {
    await q.goto(`${BASE}/archive`); await q.waitForTimeout(2000);
    await q.click('text=+ New');
    const [tab] = await Promise.all([hi.waitForEvent('page'), q.click('[role=menuitem]:has-text("Collab document")')]);
    await tab.waitForLoadState(); await tab.setViewportSize({ width: 1440, height: 900 });
    const ed = tab.getByRole('textbox', { name: 'Document text', exact: true });
    await ed.waitFor(); await ed.click();
    await tab.keyboard.type('Speaking lesson: giving opinions (B1)');
    await tab.keyboard.press('Enter');
    await tab.keyboard.type('Learners agree on one proposal for a new community space. Partner A has the facts about cost; Partner B knows what older neighbours want. They need to give reasons, not just preferences.');
    await tab.keyboard.press('Enter');
    await tab.keyboard.type('/studio-plan'); await tab.waitForTimeout(400); await tab.getByRole('option').first().click(); await tab.waitForTimeout(600);
    const form = tab.locator('[data-studio-kind="plan"]');
    await form.getByRole('textbox', { name: /title/ }).fill('Lesson 8 · Expressing and justifying opinions').catch(() => {});
    const boxes = form.locator('textarea');
    const lines = ['B1 English for Communication · eight adults · 60 minutes', 'Give and justify an opinion; respond to a different view', '“I see your point, but…” · “The main reason is…” · stress on reasons', 'Notice (8) · rehearse in pairs (12) · role cards A/B (20) · agree a proposal (15) · feedback (5)'];
    for (let i = 0; i < lines.length; i++) await boxes.nth(i).fill(lines[i]).catch(() => {});
    await tab.evaluate(() => window.scrollTo(0, 0)); await tab.waitForTimeout(500);
    await grab(tab, 'collab');
    await tab.close();
  });
  await hi.close();
}

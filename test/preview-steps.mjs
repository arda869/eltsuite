// Pictures for the homepage: the sound editor with tracks, the live answers pane, and a sentence
// marked the way classes mark pronunciation (definition open). Twice the pixels.
export default async function steps({ p, ctx, say, BASE }) {
  const safe = async (name, fn) => { try { await fn(); } catch (e) { say('FAILED', name, e.message.split('\n')[0]); await p.screenshot({ path: `preview-out/zz-${name}.png` }).catch(() => {}); } };
  const hi = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const q = await hi.newPage();
  q.on('pageerror', (e) => say('CRASH', e.message));
  const hide = (page) => page.addStyleTag({ content: '.dock-bar,.ai-activity-dock,.help-fab,[class*="toast"]{display:none!important}' }).catch(() => {});
  await q.goto(`${BASE}/dev.html?as=teacher`); await q.waitForTimeout(2500);

  await safe('marks', async () => {
    const m4 = await ctx.browser().newContext({ viewport: { width: 760, height: 520 }, deviceScaleFactor: 4, storageState: await ctx.storageState() });
    const r = await m4.newPage();
    await r.goto(`${BASE}/test/landing-gallery.html?show=marks`); await r.waitForTimeout(2500);
    await r.locator('.def-trigger').first().hover(); await r.waitForTimeout(800);
    await r.screenshot({ path: 'preview-out/landing-marks.png' }); say('landing marks');
    await m4.close();
  });
  await safe('live', async () => {
    await q.setViewportSize({ width: 1440, height: 900 });
    await q.goto(`${BASE}/test/landing-gallery.html?show=live`); await q.waitForTimeout(3500);
    await hide(q); await q.screenshot({ path: 'preview-out/landing-live.png' }); say('landing live');
  });
  await safe('audio', async () => {
    q.setDefaultTimeout(60000);
    await q.setViewportSize({ width: 1440, height: 900 });
    await q.goto(`${BASE}/test/speech/fixture.html?as=teacher&savedStudio`);
    for (let i = 0; i < 8; i++) { await q.waitForTimeout(1000); say('audio at', q.url(), (await q.locator('body').innerText().catch(() => '')).slice(0, 120).replace(/\n/g, ' | ')); }
    await q.evaluate(() => sessionStorage.setItem('mockStemDelayMs', '300'));
    await q.getByRole('button', { name: 'Create song', exact: true }).click();
    const d = q.getByRole('dialog', { name: 'Create a classroom song' });
    await d.getByRole('radio', { name: 'Adults', exact: true }).check(); await d.getByRole('button', { name: 'Next: music' }).click();
    await d.getByRole('radio', { name: 'Pop', exact: true }).check(); await d.getByRole('radio', { name: '30 seconds', exact: true }).check(); await d.getByRole('button', { name: 'Next: lyrics' }).click();
    await d.getByLabel('Lyrics', { exact: true }).fill('I see your point, but what about the cost?');
    await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check(); await d.getByRole('button', { name: 'Create song', exact: true }).click();
    await d.getByRole('button', { name: 'Add song to timeline' }).waitFor();
    await q.waitForFunction(() => { const b = [...document.querySelectorAll('dialog button')].find((x) => x.textContent?.includes('Add song to timeline')); return b && !b.disabled; }, null, { timeout: 60000 });
    await d.getByRole('button', { name: 'Add song to timeline' }).click(); await d.waitFor({ state: 'hidden' });
    await q.waitForTimeout(1500);
    await hide(q); await q.screenshot({ path: 'preview-out/landing-audio.png' }); say('landing audio');
  });
  await hi.close();
}

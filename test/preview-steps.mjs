// The sound editor with a song's separate tracks on the timeline, at twice the pixels.
export default async function steps({ ctx, say, BASE }) {
  const hi = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
  const q = await hi.newPage(); q.setDefaultTimeout(60000);
  try {
    await q.goto(`${BASE}/test/speech/fixture.html?as=teacher&savedStudio`); await q.waitForTimeout(3000);
    await q.evaluate(() => sessionStorage.setItem('mockStemDelayMs', '300'));
    await q.getByRole('button', { name: 'Create song', exact: true }).click();
    const d = q.getByRole('dialog', { name: 'Create a classroom song' });
    await d.getByRole('radio', { name: 'Adults', exact: true }).check(); await d.getByRole('button', { name: 'Next: music' }).click();
    await d.getByRole('radio', { name: 'Pop', exact: true }).check(); await d.getByRole('radio', { name: '30 seconds', exact: true }).check(); await d.getByRole('button', { name: 'Next: lyrics' }).click();
    await d.getByLabel('Lyrics', { exact: true }).fill('I see your point, but what about the cost?');
    await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check(); await d.getByRole('button', { name: 'Create song', exact: true }).click();
    for (let i = 0; i < 90; i++) {
      const add = d.getByRole('button', { name: 'Add song to timeline' });
      if (await add.isVisible().catch(() => false) && await add.isEnabled().catch(() => false)) break;
      const ret = q.getByRole('button', { name: /Return to task|Review result/ }).first();
      if (await ret.isVisible().catch(() => false)) await ret.click().catch(() => {});
      await q.waitForTimeout(1000);
    }
    await d.getByRole('button', { name: 'Full song', exact: true }).click().catch(() => {});
    await d.getByRole('button', { name: 'Add song to timeline' }).click(); await d.waitFor({ state: 'hidden' });
    await q.waitForTimeout(2000);
    await q.addStyleTag({ content: '.dock-bar,.ai-activity-dock,.help-fab,[class*="toast"]{display:none!important}' });
    await q.waitForTimeout(400);
    await q.screenshot({ path: 'preview-out/landing-audio.png' }); say('landing audio');
  } catch (e) { say('FAILED audio', e.message.split('\n')[0]); await q.screenshot({ path: 'preview-out/zz-audio.png' }).catch(() => {}); }
  await hi.close();
}

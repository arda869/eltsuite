// What test/preview.mjs does, step by step: the apps menu, regrouped, and the tab's icon in each app.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(BASE + '/pdf');
  await p.waitForTimeout(3000);
  p.on('console', (m) => say('console', m.text().slice(0, 200)));
  say('appAt', await p.evaluate(async () => { const m = await import('/src/components/AppGrid.tsx'); const a = m.appAt('/pdf'); m.setAppFavicon(a); return (a?.k ?? 'none') + ' ' + (document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? '').slice(0, 40) + ' links ' + document.querySelectorAll('link[rel~="icon"]').length; }).catch((e) => 'ERR ' + e.message));
  say('icon on /pdf', (await p.evaluate(() => document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? '')).slice(0, 60));
  await p.getByRole('button', { name: 'Apps' }).click();
  await p.waitForTimeout(500);
  await shot('apps', p.locator('.apps-pop'));
  await p.locator('.avatar').click();
  await p.waitForTimeout(300);
  say('apps menu after account opens', await p.locator('.apps-pop').count());
  await p.goto(BASE + '/');
  await p.waitForTimeout(2500);
  say('icon on /', (await p.evaluate(() => document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? '')).slice(0, 60));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + '/design');
  await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Apps' }).click();
  await p.waitForTimeout(500);
  await shot('apps-phone');
}

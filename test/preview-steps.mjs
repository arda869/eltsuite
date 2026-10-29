// Design is off by default: the Design page says so, and Files' New menu doesn't offer it.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/design`);
  await p.waitForTimeout(4000);
  await shot('design-off');
  say('page', (await p.locator('main').innerText().catch(() => '')).slice(0, 200));
}

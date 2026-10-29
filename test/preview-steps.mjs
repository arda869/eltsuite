// Messages: no gap at the bottom; a chat's menu by long press (phone) and right-click (computer).
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'Hi', name: 'Sam Lee', by: 'sam1' }, seen: { [uid]: 0 } });
  });
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${BASE}/messages`);
    await p.waitForTimeout(2500);
    say(tag, 'gap under the box', await p.evaluate(() => Math.round(innerHeight - document.querySelector('.msg').getBoundingClientRect().bottom)), 'page scroll', await p.evaluate(() => document.scrollingElement.scrollHeight - innerHeight));
    await shot(tag + '-list');
  }
  await p.click('.msg-row', { button: 'right' });
  await p.waitForTimeout(400);
  say('menu', (await p.locator('.ctx-menu').innerText().catch(() => 'none')).replace(/\n+/g, ' | '));
  await shot('right-click');
}

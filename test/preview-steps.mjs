// Messages on a phone: the list fits the screen; the GIF button and picker (no Tenor key here).
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'I am just casually sending a message to myself to see how long lines look in the list', name: 'Arda', by: uid }, seen: { [uid]: now } });
    await fs.setDoc(fs.doc(db, 'chats', 'tchat2'), { members: [uid, 'a', 'b', 'c', 'd', 'e', 'f'], names: { [uid]: 'Arda', a: 'Ana', b: 'Ken', c: 'Leo', d: 'Mia', e: 'Sara', f: 'Tom Christopherson' }, roles: { [uid]: 'teacher' }, kind: 'group', createdBy: uid, at: now - 9e6, lastAt: now - 9e6, last: { text: 'I am replying back to myself', name: 'Arda', by: uid }, seen: { [uid]: now } });
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/messages`);
  await p.waitForTimeout(3000);
  await shot('list-phone');
  say('widths', await p.evaluate(() => `page ${document.documentElement.scrollWidth}/${innerWidth}; side ${Math.round(document.querySelector('.msg-side').getBoundingClientRect().right)}`));
  await p.goto(`${BASE}/messages?c=tchat1`);
  await p.waitForTimeout(2500);
  await p.click('button[aria-label="GIF"]');
  await p.waitForTimeout(600);
  await shot('gif-picker');
  say('picker', (await p.locator('.gif-pop').innerText()).replace(/\n+/g, ' | '));
}

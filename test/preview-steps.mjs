// The space between a message's words and its time.
export default async function steps({ p, shot, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    const para = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'x', name: 'Arda', by: uid }, seen: { [uid]: now }, read: { sam1: now } });
    const col = fs.collection(db, 'chats', 'tchat1', 'msgs');
    for (const [by, t, ago] of [['sam1', 'The speaking task is ready.', 8e5], [uid, 'Great, thank you.', 6e5], [uid, 'I’ll add the pictures tonight, and the answer key for part b too.', 3e5], ['sam1', 'Perfect', 2e5]]) await fs.addDoc(col, { by, name: by === uid ? 'Arda' : 'Sam Lee', role: 'teacher', at: now - ago, text: t, content: para(t) });
  });
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${BASE}/messages?c=tchat1`);
    await p.waitForTimeout(3000);
    await shot(tag, p.locator('.bub').first().locator('xpath=..'));
  }
}

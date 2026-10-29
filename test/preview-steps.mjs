// On a phone: the chat list fits; calls as cards; a tap on a message opens its menu above it; GIFs.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    const para = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'I am just casually sending a message to myself to see how long lines look in the list', name: 'Arda', by: uid }, seen: { [uid]: now }, read: { sam1: now }, call: { url: 'x', room: 'r', kind: 'audio', by: 'sam1', byName: 'Sam', at: now - 3e5, ended: now - 3e5 + 20000 } });
    const col = fs.collection(db, 'chats', 'tchat1', 'msgs');
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 8e5, text: 'This is a test', content: para('This is a test') });
    await fs.addDoc(col, { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 7e5, text: 'Hi there', content: para('Hi there') });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 6e5, text: 'Started a video call', call: { kind: 'video', at: now - 6e5 } });
    await fs.addDoc(col, { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 3e5, text: 'Started an audio call', call: { kind: 'audio', at: now - 3e5 } });
    await fs.addDoc(col, { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 1000, text: 'Shall we plan the speaking task?', content: para('Shall we plan the speaking task?') });
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/messages`);
  await p.waitForTimeout(2500);
  await shot('list-phone');
  await p.goto(`${BASE}/messages?c=tchat1`);
  await p.waitForTimeout(3000);
  await shot('chat-phone');
  await p.locator('.bub.theirs .bub-box').last().click({ position: { x: 20, y: 12 } });
  await p.waitForTimeout(400);
  await shot('tapped-theirs');
  await p.locator('.bub.mine .bub-box').first().click({ position: { x: 20, y: 12 } });
  await p.waitForTimeout(400);
  say('menus open', await p.locator('.bub.sel').count());
  await shot('tapped-mine');
  await p.click('.chat-head', { position: { x: 200, y: 20 } }).catch(() => {});
  await p.waitForTimeout(300);
  say('after tap elsewhere', await p.locator('.bub.sel').count());
}

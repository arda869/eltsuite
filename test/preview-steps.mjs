// The message box: one line, with record, share, formatting and send inside; it grows when the
// words reach the buttons. On a phone and on a computer, and the small chat window's buttons.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'Hi', name: 'Sam Lee', by: 'sam1' }, seen: { [uid]: now } });
    await fs.addDoc(fs.collection(db, 'chats', 'tchat1', 'msgs'), { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 1000, text: 'Hi', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] } });
  });
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${BASE}/messages?c=tchat1`);
    await p.waitForSelector('.chat-box', { timeout: 20000 });
    await p.waitForTimeout(1500);
    const box = p.locator('.chat-compose');
    say(tag, 'empty box height', Math.round((await p.locator('.chat-box').boundingBox()).height), 'buttons', (await p.locator('.chat-in button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).join(', '));
    await shot(tag + '-empty', box);
    await p.click('.chat-box .ProseMirror');
    await p.keyboard.type('Shall we meet at four?');
    await p.waitForTimeout(300);
    say(tag, 'short', Math.round((await p.locator('.chat-box').boundingBox()).height), await p.locator('.chat-box.tall').count());
    await p.keyboard.type(' I want to plan the speaking task for Monday and look at the new unit together, if you have time.');
    await p.waitForTimeout(400);
    say(tag, 'long', Math.round((await p.locator('.chat-box').boundingBox()).height), await p.locator('.chat-box.tall').count());
    await shot(tag + '-long', box);
    await p.keyboard.press('Control+A');
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(300);
    say(tag, 'cleared', Math.round((await p.locator('.chat-box').boundingBox()).height), await p.locator('.chat-box.tall').count());
  }
  // The small chat window on a computer.
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2000);
  await p.evaluate(async () => (await import('/src/components/ChatDock.tsx')).dockOpen('tchat1'));
  await p.waitForTimeout(1500);
  say('window buttons', (await p.locator('.dock-win .dock-head button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).join(', '));
  await shot('dock', p.locator('.dock-win').first());
}

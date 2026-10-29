// Messages: ticks (sent, delivered, read), message info, forwarding in a frame, and the read
// receipts switch.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const uid = auth.currentUser.uid;
    const now = Date.now();
    const para = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'x', name: 'Arda', by: uid }, seen: { [uid]: now }, read: { sam1: now - 5e5 }, got: { sam1: now - 2e5 } });
    await fs.setDoc(fs.doc(db, 'chats', 'tchat2'), { members: [uid, 'jo1'], names: { [uid]: 'Arda', jo1: 'Jo Park' }, roles: { [uid]: 'teacher', jo1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 9e5, seen: { [uid]: now } });
    const col = fs.collection(db, 'chats', 'tchat1', 'msgs');
    await fs.addDoc(col, { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 8e5, text: 'The speaking task is ready. Have a look before Monday.', content: para('The speaking task is ready. Have a look before Monday.') });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 6e5, text: 'Great, thank you.', content: para('Great, thank you.') });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 3e5, text: 'I’ll add the pictures tonight.', content: para('I’ll add the pictures tonight.') });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 1000, text: 'See you at four.', content: para('See you at four.') });
  });
  await p.goto(`${BASE}/messages?c=tchat1`);
  await p.waitForTimeout(3500);
  say('ticks', (await p.locator('.bub-ticks').evaluateAll((t) => t.map((x) => x.getAttribute('aria-label')))).join(', '));
  await shot('ticks', p.locator('.chat-msgs, .chat-scroll, main').first());
  // Message info, from the message's tools.
  const lastMine = p.locator('.bub.mine').last();
  await lastMine.hover();
  await p.waitForTimeout(300);
  await lastMine.locator('button[aria-label="Message info"]').click();
  await p.waitForTimeout(500);
  say('info', (await p.locator('.mi-dialog').innerText()).replace(/\n+/g, ' | '));
  await shot('info', p.locator('.mi-dialog'));
  await p.click('.mi-dialog button:has-text("Close")');
  // Forward Sam's message to Jo.
  const theirs = p.locator('.bub.theirs').first();
  await theirs.hover();
  await p.waitForTimeout(300);
  await theirs.locator('button[aria-label="Forward"]').click();
  await p.waitForSelector('.fw-dialog');
  await shot('forward-dialog', p.locator('.fw-dialog'));
  await p.click('.fw-list label:has-text("Jo Park")');
  await p.click('.fw-dialog button.primary');
  await p.waitForTimeout(1200);
  await p.goto(`${BASE}/messages?c=tchat2`);
  await p.waitForTimeout(3000);
  say('forwarded', (await p.locator('.bub').last().innerText()).replace(/\n+/g, ' | '));
  await shot('forwarded');
  // The switch.
  await p.click('button[aria-label="Message settings"]');
  await p.waitForTimeout(300);
  await shot('settings', p.locator('.msg-set-menu'));
}

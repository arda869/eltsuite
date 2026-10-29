// Messages: long lines wrap, a call as a card, a file from Files with a preview, and on a phone a
// banner for a new message that a swipe sends away.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(2500);
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 120>>stream
BT /F1 34 Tf 60 760 Td (Unit 1 Travel) Tj ET
BT /F1 14 Tf 60 720 Td (Read the text and answer the questions.) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  await p.evaluate(async (text) => {
    const { auth, db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const sd = await import('/src/lib/sharedDocs.ts');
    const pd = await import('/src/pdf/pdfData.ts');
    const uid = auth.currentUser.uid;
    const bytes = new TextEncoder().encode(text);
    const id = await sd.newSharedDoc({ uid, name: 'Arda' }, 'pdf', 'American English File 3 – Unit 1');
    await pd.saveFilePdf(id, bytes, await pd.pageSizes(await pd.openPdf(bytes.slice())));
    const now = Date.now();
    await fs.setDoc(fs.doc(db, 'chats', 'tchat1'), { members: [uid, 'sam1'], names: { [uid]: 'Arda', sam1: 'Sam Lee' }, roles: { [uid]: 'teacher', sam1: 'teacher' }, kind: 'dm', createdBy: uid, at: now - 9e5, lastAt: now - 1000, last: { text: 'Here it is', name: 'Arda', by: uid }, seen: { [uid]: now } });
    const col = fs.collection(db, 'chats', 'tchat1', 'msgs');
    const long = 'gcloud projects add-iam-policy-binding lesson-lit --member=serviceAccount:954464859210-compute@developer.gserviceaccount.com --role=roles/eventarc.eventReceiver';
    await fs.addDoc(col, { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now - 8e5, text: long, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] } });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 6e5, text: 'Started a video call', call: { kind: 'video', at: now - 6e5 } });
    await fs.updateDoc(fs.doc(db, 'chats', 'tchat1'), { call: { url: 'https://x.daily.co/r', room: 'r', kind: 'video', by: uid, byName: 'Arda', at: now - 6e5, ended: now - 6e5 + 14 * 60000, declined: [] } });
    await fs.addDoc(col, { by: uid, name: 'Arda', role: 'teacher', at: now - 1000, text: `I shared a PDF with you. ${location.origin}/doc/${id}`, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Here’s the unit for Monday.' }] }] }, file: { id, title: 'American English File 3 – Unit 1', kind: 'pdf', ownerName: 'Arda' } });
  }, pdf);
  await p.goto(`${BASE}/messages?c=tchat1`);
  await p.waitForTimeout(4000);
  await shot('chat-desktop');
  // A phone, away from Messages: a new message arrives.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/messages?c=tchat1`);
  await p.waitForTimeout(2500);
  await shot('chat-phone');
  say('minimise on phone', await p.locator('.chat-min:visible').count());
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(3000);
  await p.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const now = Date.now();
    await fs.addDoc(fs.collection(db, 'chats', 'tchat1', 'msgs'), { by: 'sam1', name: 'Sam Lee', role: 'teacher', at: now, text: 'Thanks! Can we meet at 4 to plan the speaking task?' });
    await fs.updateDoc(fs.doc(db, 'chats', 'tchat1'), { lastAt: now, last: { text: 'Thanks! Can we meet at 4 to plan the speaking task?', name: 'Sam Lee', by: 'sam1' } });
  });
  await p.waitForTimeout(900);
  await shot('banner');
  say('banner', await p.locator('.msg-banner').count());
  const b = await p.locator('.msg-banner').boundingBox();
  if (b) {
    await p.mouse.move(b.x + 40, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 5 });
    await shot('banner-swiping');
    await p.mouse.move(b.x + 220, b.y + b.height / 2, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(500);
    say('after swipe', await p.locator('.msg-banner').count());
  }
}

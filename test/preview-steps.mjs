// The worksheet editor sliding, the PDF view's width and zoom, the PDF viewer and the back button,
// and the sign-in page on a phone.
export default async function steps({ p, shot, say, demo, BASE }) {
  // Worksheet view: the editor slides closed and open.
  await p.evaluate(() => localStorage.setItem('ll.sheetView', '1'));
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.waitForSelector('.sh-split', { timeout: 30000 });
  await p.waitForTimeout(2500);
  const w = () => p.$eval('.sh-right', (e) => Math.round(e.getBoundingClientRect().width));
  say('right open', await w());
  await p.click('.sh-desk', { position: { x: 8, y: 300 } });
  await p.waitForTimeout(110);
  say('right while closing', await w());
  await shot('sheet-closing');
  await p.waitForTimeout(600);
  say('right closed', await w());
  await p.locator('.sh-block.pick').nth(1).click();
  await p.waitForTimeout(110);
  say('right while opening', await w());
  await shot('sheet-opening');
  await p.waitForTimeout(600);
  say('right open again', await w());

  // A PDF in Files: the full width, and zoomed in.
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
  const id = await p.evaluate(async (text) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const sd = await import('/src/lib/sharedDocs.ts');
    const pd = await import('/src/pdf/pdfData.ts');
    const bytes = new TextEncoder().encode(text);
    const pages = await pd.pageSizes(await pd.openPdf(bytes.slice()));
    const id = await sd.newSharedDoc({ uid: auth.currentUser.uid, name: 'Arda' }, 'pdf', 'American English File');
    await pd.saveFilePdf(id, bytes, pages);
    return id;
  }, pdf);
  await p.goto(`${BASE}/doc/${id}`);
  await p.waitForTimeout(6000);
  await shot('pdf-fit');
  say('pdf page box', await p.$eval('.pdff-page', (e) => `${Math.round(e.getBoundingClientRect().left)}–${Math.round(e.getBoundingClientRect().right)} of ${innerWidth}`).catch((e) => e.message));
  for (let i = 0; i < 5; i++) await p.click('.pdff-zoom button[aria-label="Bigger"]');
  await p.waitForTimeout(1500);
  await shot('pdf-zoom-150');

  // A question asked over the PDF viewer comes on top of it.
  await p.evaluate(async () => void (await import('/src/lib/ask.tsx')).ask('This PDF isn’t saved in your Files. You can make it again at any time.'));
  await p.waitForTimeout(400);
  say('question layer', await p.$eval('.ask-scrim', (e) => getComputedStyle(e).zIndex), 'viewer layer 80');
  await p.keyboard.press('Escape');

  // The sign-in page on a phone.
  await p.evaluate(async () => (await import('/src/lib/firebase.ts')).auth.signOut());
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(4000);
  await shot('signin-phone');
  say('signin widths', await p.evaluate(() => `page ${document.documentElement.scrollWidth} / screen ${innerWidth}; ` + [...document.querySelectorAll('.signin > *, .signin .intro > *')].map((e) => `${e.className || e.tagName}:${Math.round(e.getBoundingClientRect().left)}|${Math.round(innerWidth - e.getBoundingClientRect().right)}`).join(' ')));
  await p.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(400);
  await shot('signin-phone-lower');
}

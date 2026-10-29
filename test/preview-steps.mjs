// The worksheet editor sliding, the PDF view's width and zoom, the PDF viewer and the back button,
// and the sign-in page on a phone.
export default async function steps({ p, shot, say, demo, BASE }) {
  // The sign-in page on a phone.
  await p.evaluate(async () => { const { auth } = await import('/src/lib/firebase.ts'); const m = await import('/test/mock/auth.ts'); await m.signOut(auth); });
  await p.setViewportSize({ width: 360, height: 780 });
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(4000);
  await shot('signin-phone');
  say('signin widths', await p.evaluate(() => `page ${document.documentElement.scrollWidth} / screen ${innerWidth}; ` + [...document.querySelectorAll('.signin > *, .signin .intro > *')].map((e) => `${e.className || e.tagName}:${Math.round(e.getBoundingClientRect().left)}|${Math.round(innerWidth - e.getBoundingClientRect().right)}`).join(' ')));
  await p.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(400);
  await shot('signin-phone-lower');
}

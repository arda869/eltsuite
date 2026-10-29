// learn.eltsuite.com: the learners' home page (signed out), on a computer and a phone, and the
// class code's new link on the class page.
export default async function steps({ p, shot, say, demo, BASE }) {
  await p.goto(`${BASE}/class/${demo.classId}`);
  await p.waitForSelector('.code-chip', { timeout: 30000 });
  await p.waitForTimeout(1000);
  await shot('class-code', p.locator('.class-meta'));
  await p.evaluate(async () => { const { auth } = await import('/src/lib/firebase.ts'); const m = await import('/test/mock/auth.ts'); await m.signOut(auth); });
  await p.goto(`${BASE}/?site=learn&code=${'ABC-123'}`);
  await p.waitForTimeout(3500);
  await shot('learn-home');
  await p.setViewportSize({ width: 375, height: 812 });
  await p.waitForTimeout(800);
  await shot('learn-home-phone');
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(300);
  await shot('learn-home-phone-lower');
  say('learn page', (await p.locator('.signin').innerText()).replace(/\n+/g, ' | ').slice(0, 400));
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/?site=main`);
  await p.waitForTimeout(2500);
  say('teacher sign-in has', await p.locator('a:has-text("I’m a learner")').getAttribute('href'));
}

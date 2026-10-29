// Timetable: repeats as in a calendar, and guests from outside by email.
export default async function steps({ p, shot, say, BASE }) {
  await p.goto(`${BASE}/timetable`);
  await p.waitForSelector('.ttb-new', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.click('.ttb-new');
  await p.waitForSelector('.ttb-dialog');
  await p.click('.ttb-dialog button[role=radio]:has-text("A meeting")');
  await p.fill('.ttb-dialog input[placeholder^="For example"]', 'Planning with the publisher');
  // Repeat: every week, on Tuesday and Thursday, 8 times.
  await p.click('.ttb-rep button[aria-haspopup]');
  await p.waitForTimeout(300);
  await shot('repeat-menu');
  await p.locator('[role=option]:has-text("Every week on")').first().click().catch(async (e) => say('no option', e.message));
  await p.waitForTimeout(300);
  const tue = p.locator('.ttb-days button[aria-label="Tuesday"]');
  const thu = p.locator('.ttb-days button[aria-label="Thursday"]');
  if ((await tue.getAttribute('aria-pressed')) !== 'true') await tue.click();
  if ((await thu.getAttribute('aria-pressed')) !== 'true') await thu.click();
  await p.fill('.ttb-rep-row input[aria-label="How many times"]', '8');
  await p.fill('.ttb-guests input', 'sam@example.com, jo@publisher.co.uk');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  say('summary', await p.locator('.ttb-rep-box .hint').innerText());
  await p.locator('.ttb-dialog').evaluate((e) => (e.scrollTop = 0));
  await shot('dialog-top', p.locator('.ttb-dialog'));
  await p.locator('.ttb-dialog').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await shot('dialog-bottom', p.locator('.ttb-dialog'));
  // Monthly options.
  await p.click('.ttb-rep button[aria-haspopup]').catch(() => {});
  await p.locator('[role=option]:has-text("Every month")').first().click().catch(() => {});
  await p.waitForTimeout(300);
  say('monthly', (await p.locator('.ttb-rep-box').innerText()).replace(/\n+/g, ' | '));
  await shot('monthly', p.locator('.ttb-rep'));
  await p.click('.ttb-rep button[aria-haspopup]').catch(() => {});
  await p.locator('[role=option]:has-text("Every week on")').first().click().catch(() => {});
  await p.waitForTimeout(200);
  if ((await tue.getAttribute('aria-pressed')) !== 'true') await tue.click();
  if ((await thu.getAttribute('aria-pressed')) !== 'true') await thu.click();
  await p.click('.ttb-dialog button[type=submit]');
  await p.waitForTimeout(2500);
  await shot('week-view');
  const saved = await p.evaluate(async () => {
    const { db } = await import('/src/lib/firebase.ts');
    const fs = await import('/test/mock/firestore.ts');
    const q = await fs.getDocs(fs.collection(db, 'sessions'));
    return q.docs.map((d) => d.data()).filter((d) => d.title === 'Planning with the publisher').map((d) => ({ repeat: d.repeat, guests: d.guests, hasGuests: d.hasGuests, guest: d.guest, start: new Date(d.start).toString() }));
  }).catch((e) => e.message);
  say('saved', JSON.stringify(saved));
  const ev = p.locator('.ttb-ev:has-text("Planning with the publisher"), [class*="ev"]:has-text("Planning with the publisher")').first();
  await ev.click().catch((e) => say('no event', e.message));
  await p.waitForTimeout(800);
  await shot('card');
  say('card', (await p.locator('.ttb-card-rep').first().innerText().catch(() => 'none')));
}

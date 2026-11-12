// Screenshots of the real app for the public website, with the fictional class in test/landing-seed.ts.
// Start the mock app first:  node node_modules/vite/bin/vite.js --config test/vite.config.ts --port 5391
// Then:  node test/landing-shots.mjs [names…] [--webp]
// Without --webp the PNGs go to outputs/landing-shots for review; with it, each is also saved to
// public/landing as a 2x WebP plus a smaller one for phones. --from-png converts the PNGs already
// in outputs/landing-shots without capturing again. CHROME=<path> picks the browser.
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5391';
const args = process.argv.slice(2), webp = args.includes('--webp'), only = args.filter((a) => !a.startsWith('--'));
const root = new URL('..', import.meta.url).pathname;
const raw = root + 'outputs/landing-shots/';
mkdirSync(raw, { recursive: true });

// Real Tatoeba sentences for “your point”, as the corpus search returns them (functions/linguistics/tatoeba.js).
const corpus = JSON.parse(readFileSync(root + 'test/fixtures/landing/tatoeba-your-point.json', 'utf8'));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
await ctx.addInitScript((lines) => { window.__corpusFixture = lines; }, corpus);
if (args.includes('--from-png')) {
  for (const f of readdirSync(raw).filter((f) => f.endsWith('.png'))) {
    const name = f.slice(0, -4);
    if (only.length && !only.includes(name)) continue;
    const png = readFileSync(raw + f);
    writeFileSync(root + `public/landing/${name}.webp`, await toWebp(png, 2400));
    writeFileSync(root + `public/landing/${name}-sm.webp`, await toWebp(png, 1100, 0.8));
    console.log('converted', name);
  }
  await browser.close();
  process.exit(0);
}
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await p.goto(BASE + '/?seed&colleagues');
await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 30000 });
const demo = await p.evaluate(async () => (await import('/test/landing-seed.ts')).seedLanding());
console.log('seeded', demo.classId, demo.itemId);

const quiet = async () => {
  await p.addStyleTag({ content: '.dock-bar,.dock-wins,.feature-discovery,.fd-tip{display:none!important} *{caret-color:transparent!important}' });
  await p.waitForTimeout(600);
};
const go = async (path, wait = 2500) => {
  await p.goto(BASE + path);
  await p.waitForFunction(() => !document.querySelector('.loader'), null, { timeout: 20000 }).catch(() => console.log('still loading', path));
  await p.waitForTimeout(wait);
  await quiet();
};
const click = async (name, opts = {}) => p.getByRole(opts.role || 'button', { name, exact: opts.exact ?? false }).first().click({ timeout: 6000 });

// The part of each 1440×900 screen the website shows (CSS px). Whole-app captures shrunk into a column
// are too small to read, so each shot keeps only what its section is about. editor stays whole: it is
// the laptop on the homepage; editor-focus is its crop for the other pages.
const FOCUS = {
  'editor-focus': { x: 0, y: 72, width: 1176, height: 786 },
  'editor-language': { x: 0, y: 72, width: 1176, height: 786 },
  'editor-speaking': { x: 0, y: 72, width: 1176, height: 786 },
  teach: { x: 240, y: 78, width: 1200, height: 800 },
  class: { x: 0, y: 72, width: 1440, height: 792 },
  reports: { x: 0, y: 72, width: 1440, height: 816 },
  portfolio: { x: 0, y: 336, width: 1440, height: 564 },
  development: { x: 0, y: 228, width: 1176, height: 672 },
  coach: { x: 0, y: 228, width: 1440, height: 672 },
  concordance: { x: 120, y: 36, width: 1008, height: 864 },
  'collab-editor': { x: 0, y: 0, width: 1440, height: 630 },
};

const shots = {
  // The lesson editor on the lead-in task: aims, the dialogue recording, a question and teaching notes.
  async editor() { await p.setViewportSize({ width: 1440, height: 900 }); await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 6000); },
  async 'editor-focus'() { await p.setViewportSize({ width: 1440, height: 900 }); await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 6000); },
  async 'editor-language'() { await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000); await p.getByText('Notice the language').first().click(); await p.waitForTimeout(1500); },
  async 'editor-speaking'() { await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000); await p.getByText('One space. Two priorities.').first().click(); await p.waitForTimeout(1500); },
  async class() { await go(`/class/${demo.classId}`, 3000); },
  async reports() { await go(`/class/${demo.classId}?tab=reports`, 3000); },
  async portfolio() { await go(`/class/${demo.classId}?tab=portfolio`, 3000); await p.getByText('Maya Patel').first().click(); await p.waitForTimeout(1500); },
  // Teaching the lesson live: learners' answers to the lead-in question arrive in the live panel.
  async teach() {
    await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000);
    await click('Editing');
    await p.getByRole('menuitemradio', { name: /Teaching/ }).click();
    await p.waitForTimeout(800);
    await p.getByRole('switch', { name: 'Start teaching' }).click().catch(() => {});
    await p.waitForTimeout(3000);
    await quiet();
  },
  // Rooms: every class has its own video room, ready to start.
  async rooms() { await go('/rooms', 4000); },
  async sound() { await go(`/studio/sound/x?class=${demo.classId}&media=${demo.mediaId}`, 6000); },
  // The real Speech composer, with a fictional dialogue typed in.
  async speech() {
    await go(`/studio/sound/x?class=${demo.classId}&media=${demo.mediaId}`, 6000);
    await click('Create speech');
    await p.getByLabel('Speaker 1 name').fill('Flo');
    await p.getByLabel('Speaker 2 name').fill('Dan');
    for (const [i, [, text]] of [['', '(thoughtful) So, what should we do with the empty shop on the corner?'], ['', 'I think a reading room would be better, because the library is so far away.'], ['', 'I see your point, but what about the cost?'], ['', '(laughs) Well, it fits our budget.']].entries()) {
      if (i) await click('+ Add line', { exact: true });
      await p.getByLabel(`Dialogue line ${i + 1}`).fill(text);
    }
    await p.waitForTimeout(800);
  },
  // The real Song composer on its first step.
  async song() {
    await go(`/studio/sound/x?class=${demo.classId}&media=${demo.mediaId}`, 6000);
    await click('Create song');
    await p.waitForTimeout(2000);
  },
  async concordance() {
    await go('/linguistics?new=corpus', 3000);
    await p.getByLabel('Investigation title').fill('How do learners hear “your point”?');
    await p.getByLabel('Word or phrase').fill('your point');
    await click('Search examples');
    await p.waitForTimeout(2000);
    await p.getByText(/Concordance · page 1/).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await p.evaluate(() => scrollBy(0, -120));
    await p.waitForTimeout(800);
  },
  async collab() { await go('/collab', 2500); await p.getByText('Term plan').first().click(); await p.waitForTimeout(4000); await quiet(); },
  async 'collab-editor'() {
    await go('/doc/sd-plan');
    const editor = p.locator('.ProseMirror[contenteditable="true"]').first();
    await editor.fill('Expressing and justifying opinions');
    for (const line of ['Lesson aim: give an opinion, support it with a reason and respond to a partner.', 'Before class', 'Choose two proposals for the neighbourhood shop. Give each partner one proposal to read.', 'During the discussion', 'Listen for “I see your point” and “What about…?” Note one example to revisit together.']) {
      await editor.press('Enter');
      await p.keyboard.insertText(line);
    }
    await editor.blur();
    await quiet();
  },
  async development() { await go('/development', 3000); },
  async coach() { await go('/development?section=coach', 3000); },
  async observation() { await go('/observations', 2500); await click('New observation'); await p.waitForTimeout(1500); },
  async games() { await go('/games', 2500); },
  async video() { await go('/studio/video/new', 4000); },
  // The same lesson three ways, for the homepage: the worksheet view in the editor, the print preview
  // (what comes out of the printer) and the learner's phone.
  async worksheet() {
    await p.setViewportSize({ width: 1440, height: 900 });
    await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000);
    await p.getByRole('radio', { name: /Worksheet: the lesson as printed pages/ }).click();
    await p.waitForTimeout(3000);
    await quiet();
  },
  // The printed page on its own: the worksheet view with no task selected, tools hidden, and the QR
  // label showing the live address (as it prints from eltsuite.com).
  async paper() {
    await p.setViewportSize({ width: 1440, height: 2000 });
    await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000);
    await p.getByRole('radio', { name: /Worksheet: the lesson as printed pages/ }).click();
    await p.waitForTimeout(1500);
    await p.locator('.sh-desk').click({ position: { x: 6, y: 6 } });
    await p.waitForTimeout(1500);
    await p.addStyleTag({ content: '.sh-tools,.sh-grip,.sh-del,.sh-add,.sh-after,.sh-note,.sh-left-bar{display:none!important}.sh-block,.sh-block.on,.sh-block:hover{outline:0!important;box-shadow:none!important;background:transparent!important}' });
    await p.evaluate(() => {
      const walk = (root) => { root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); if (el.classList?.contains('qr-url')) el.textContent = 'eltsuite.com'; }); };
      walk(document);
    });
    await p.mouse.move(2, 1990);
    await p.waitForTimeout(800);
    await quiet();
    const box = await p.locator('.sh-sheet').first().boundingBox();
    if (box) await p.evaluate((b) => { window.__clip = b; }, box);
  },
  async print() {
    await p.setViewportSize({ width: 1440, height: 900 });
    await go(`/class/${demo.classId}/lesson/${demo.itemId}`, 5000);
    await p.getByRole('radio', { name: /Worksheet: the lesson as printed pages/ }).click();
    await p.waitForTimeout(1500);
    await click('Print or PDF');
    await p.waitForTimeout(5000);
    await quiet();
  },
  async 'learner-phone'() {
    const l = demo.learners[0];
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate((uid) => sessionStorage.setItem('mockuid', uid), l.uid);
    await go(`/learn/${demo.itemId}`, 5000);
    await p.evaluate(() => sessionStorage.setItem('mockuid', 'teacher1'));
  },
  // Teacher's Companion with a saved conversation about the same class (seedCompanion).
  async companion() {
    await p.evaluate(async () => (await import('/test/landing-seed.ts')).seedCompanion());
    await go('/messages?c=teaching-coach', 4000);
    await p.getByRole('button', { name: 'History' }).first().click();
    await p.getByRole('button', { name: /A quiet opinions discussion/ }).first().click();
    await p.waitForTimeout(2500);
    await p.locator('.coach-chat-message').last().scrollIntoViewIfNeeded().catch(() => {});
    await quiet();
  },
  async learner() {
    const l = demo.learners[0];
    await p.evaluate((uid) => sessionStorage.setItem('mockuid', uid), l.uid);
    await go(`/learn/${demo.itemId}`, 5000);
    await p.evaluate(() => sessionStorage.setItem('mockuid', 'teacher1'));
  },
};

async function toWebp(png, width, quality = 0.84) {
  const page = await ctx.newPage();
  const data = await page.evaluate(async ({ b64, width, quality }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round(img.height * width / img.width);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', quality).split(',')[1];
  }, { b64: png.toString('base64'), width, quality });
  await page.close();
  return Buffer.from(data, 'base64');
}

for (const [name, run] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await Promise.race([run(), new Promise((_, no) => setTimeout(() => no(Error('timed out')), 60000))]);
    const clip = name === 'paper' ? await p.evaluate(() => window.__clip) : FOCUS[name] ?? null;
    const png = await p.screenshot({ timeout: 20000, animations: 'disabled', ...(clip ? { clip } : {}) });
    writeFileSync(raw + name + '.png', png);
    await p.setViewportSize({ width: 1440, height: 900 });
    if (webp) {
      writeFileSync(root + `public/landing/${name}.webp`, await toWebp(png, clip && name !== 'paper' ? Math.min(2400, clip.width * 2) : 2400));
      writeFileSync(root + `public/landing/${name}-sm.webp`, await toWebp(png, 1100, 0.8));
    }
    console.log('saved', name);
  } catch (e) { console.log('failed', name, e.message.split('\n')[0]); }
}
await browser.close();

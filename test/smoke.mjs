// Smoke tests: the journeys teachers and learners take most, run in a real browser against the
// app with stand-ins for Firebase (test/vite.config.ts). Run with: npm run smoke
// Each journey fails on a crash in the page, a missing screen, or something that does not stay.
// With --a11y, each main screen is also checked for accessibility problems (axe-core).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const BASE = 'http://localhost:5184';
const A11Y = process.argv.includes('--a11y');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const OWNER = 'ardanurioglu@gmail.com';

// ------------------------------------------------------------------ the app
async function up() {
  const vite = spawn('npx', ['vite', '--config', 'test/vite.config.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return vite;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The test server did not start:\n' + log);
}

// ------------------------------------------------------------------ helpers
const NOISE = [/Future Flag/, /Failed to load resource/, /ERR_TUNNEL|ERR_NAME|ERR_INTERNET|net::/, /Download the React DevTools/];
async function session(browser, { as = 'teacher', owner = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  const watch = (pg) => {
    pg.on('pageerror', (e) => errors.push('Crash: ' + e.message));
    pg.on('console', (m) => m.type() === 'error' && !NOISE.some((n) => n.test(m.text())) && errors.push('Error: ' + m.text().slice(0, 240)));
  };
  ctx.on('page', watch);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dev.html?seed&as=teacher`);
  await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 30000 });
  if (owner) await p.evaluate((e) => { const a = JSON.parse(localStorage.getItem('mockauth')); a.teacher1.email = e; localStorage.setItem('mockauth', JSON.stringify(a)); }, OWNER);
  if (as !== 'teacher') await p.goto(`${BASE}/dev.html?as=${as}`);
  const demo = await p.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  return { ctx, p, errors, demo };
}
const see = async (p, sel, what, timeout = 15000) => {
  try {
    await p.locator(sel).first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`Not shown: ${what} (${sel})`);
  }
};
const count = (p, sel) => p.locator(sel).count();
async function newFile(s, label) {
  await s.p.goto(`${BASE}/archive`);
  await see(s.p, 'text=+ New', 'the New button in Files');
  await s.p.click('text=+ New');
  const [tab] = await Promise.all([s.ctx.waitForEvent('page'), s.p.click(`[role=menuitem]:has-text("${label}")`)]);
  await tab.waitForLoadState();
  return tab;
}
// The "/" menu: wait until it lists what was typed, as a slow machine takes longer.
async function slash(p, words) {
  await p.keyboard.type('/' + words, { delay: 30 });
  await p.locator('.slash-float').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(600);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(800);
}
async function axe(p, name, out) {
  if (!A11Y) return;
  await p.addScriptTag({ content: readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
  const r = await p.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'], runOnly: ['wcag2a', 'wcag2aa'] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, where: v.nodes.slice(0, 3).map((x) => x.target.join(' ')) }));
  });
  out.push(...r.map((v) => ({ page: name, ...v })));
}

// ------------------------------------------------------------------ the journeys
const A11Y_FOUND = [];
const J = {
  'Teacher home': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/');
    await see(s.p, '.hm-hero', 'the home dashboard');
    await see(s.p, 'text=Demo class', 'the demo class on the dashboard');
    await axe(s.p, 'Home', A11Y_FOUND);
    await s.p.goto(BASE + '/classes');
    await see(s.p, 'text=Demo class', 'the demo class in Classes');
    await axe(s.p, 'Classes', A11Y_FOUND);
    return s;
  },
  'Class and learners': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}`);
    await see(s.p, '.page-title, h1', 'the class page');
    await s.p.click('nav.tabs button:has-text("Learners")');
    await see(s.p, 'text=Mia Chan', 'the learners list');
    await axe(s.p, 'Class', A11Y_FOUND);
    return s;
  },
  'Lesson: diagram with a gap stays': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await see(s.p, '.ProseMirror', 'the lesson editor');
    await axe(s.p, 'Lesson editor', A11Y_FOUND);
    await s.p.locator('.ProseMirror').nth(1).click();
    await s.p.keyboard.press('Control+End');
    await slash(s.p, 'Flow chart');
    if (!(await count(s.p, '.dg-node'))) {
      // Once more, in case the first keys went in before the editor was ready.
      await s.p.locator('.ProseMirror').nth(1).click();
      await s.p.keyboard.press('Control+End');
      await slash(s.p, 'Flow chart');
    }
    await see(s.p, '.dg-node', 'the diagram in the editor');
    await s.p.locator('.dg-node .dg-cell-body p').nth(1).click();
    await s.p.keyboard.press('End');
    await s.p.keyboard.type(' and ');
    await slash(s.p, 'Gap fill');
    await s.p.keyboard.type('coffee');
    await s.p.keyboard.press('Enter');
    await s.p.waitForTimeout(3000);
    if (!(await count(s.p, '.dg-node'))) throw new Error('The diagram went away after it was added');
    await s.p.reload();
    await see(s.p, '.dg-node', 'the diagram after reloading');
    await s.p.keyboard.press('Control+Shift+P');
    await see(s.p, '.dg .gap, .dg input, .dg [class*=gap]', 'the gap inside the diagram for learners');
    return s;
  },
  'Files: every kind opens': async (b) => {
    const s = await session(b);
    for (const [label, sel] of [['Collab document', '.ProseMirror'], ['Flashcards', 'text=Design the cards'], ['PD reading', 'text=CITATION STYLE']]) {
      const tab = await newFile(s, label);
      await see(tab, sel, `a new ${label}`);
      await tab.close();
    }
    await s.p.goto(`${BASE}/archive`);
    await see(s.p, '.ma-card', 'the files in Files');
    await axe(s.p, 'Files', A11Y_FOUND);
    // Opening a file again, by double-clicking it.
    const card = s.p.locator('.ma-files .ma-card:has-text("flashcards")').first();
    const [tab] = await Promise.all([s.ctx.waitForEvent('page', { timeout: 8000 }), card.dblclick()]);
    await see(tab, 'text=Design the cards', 'flashcards opened from Files');
    return s;
  },
  'Collab document keeps a diagram': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    await see(d, '.ProseMirror', 'the document');
    await d.click('.ProseMirror');
    await d.keyboard.type('Plan for Monday');
    await d.keyboard.press('Enter');
    await slash(d, 'Mind map');
    await see(d, '.dg-node', 'the mind map');
    await d.waitForTimeout(3000);
    await d.reload();
    await see(d, '.dg-node', 'the mind map after reloading');
    await see(d, 'text=Plan for Monday', 'the text after reloading');
    await axe(d, 'Collab document', A11Y_FOUND);
    return s;
  },
  'Messages': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/messages`);
    await see(s.p, 'main, .msg, [class*=msg]', 'Messages');
    await axe(s.p, 'Messages', A11Y_FOUND);
    return s;
  },
  'Settings': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/settings`);
    await see(s.p, 'text=Profile', 'Settings');
    await axe(s.p, 'Settings', A11Y_FOUND);
    return s;
  },
  'Colleagues': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/colleagues`);
    await see(s.p, 'h1:has-text("Colleagues")', 'Colleagues');
    return s;
  },
  'Super Admin and an organisation': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, 'text=Organisations', 'Super Admin');
    await axe(s.p, 'Super Admin', A11Y_FOUND);
    await s.p.click('text=Organisations');
    await s.p.fill('.adm-new input', 'Test School');
    await s.p.click('button:has-text("Create")');
    await s.p.click('.adm-org');
    for (const t of ['Classes', 'Library', 'Rules', 'Branding', 'Plan and space', 'Admins', 'Teachers']) {
      await s.p.click(`.adm-tabs >> text=${t}`);
      await s.p.waitForTimeout(250);
    }
    await see(s.p, 'text=Invite teachers', 'the organisation');
    await axe(s.p, 'Organisation', A11Y_FOUND);
    return s;
  },
  'Organisation library: a lesson copied to a class': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['orgs/o1'] = { name: 'Harbour School', plan: 'school', limitGb: 50, adminEmails: ['teacher@example.com'], teachers: { teacher1: { name: 'Arda', email: 'teacher@example.com' } }, brand: { color: '#2f6f8f' }, drives: {} };
      fs['accounts/teacher1'] = { ...(fs['accounts/teacher1'] ?? {}), org: 'o1' };
      fs['sharedFolders/f1'] = { owner: 'teacher1', ownerName: 'Harbour School', name: 'Level 1 lessons', org: 'o1', drive: 'main', access: { all: 'view', tags: {}, people: {} }, own: false, members: {}, memberIds: [] };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(`${BASE}/library`);
    await see(s.p, 'text=Level 1 lessons', 'the library folder');
    await s.p.click('button:has-text("+ New")');
    const [t] = await Promise.all([s.ctx.waitForEvent('page'), s.p.click('[role=menuitem]:has-text("Exam")')]);
    await see(t, 'button:has-text("+ Task")', 'the new exam');
    await t.click('button:has-text("+ Task")');
    await t.waitForTimeout(800);
    await t.close();
    await see(s.p, '.ma-card', 'the exam in the library');
    await s.p.click('.ma-card');
    await axe(s.p, 'Organisation library', A11Y_FOUND);
    await s.p.click('.ma-selbar button:has-text("Copy to a class")');
    const [c] = await Promise.all([s.ctx.waitForEvent('page', { timeout: 15000 }), s.p.click('.dialog button:has-text("Demo")')]);
    await see(c, 'text=Exam', 'the exam in the class');
    return s;
  },
  'Super Admin is the owner’s alone': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, 'text=only for the owner', 'the closed Super Admin');
    return s;
  },
  'Learner signs in and opens the lesson': async (b) => {
    const s = await session(b, { as: 'Mia' });
    await s.p.goto(BASE + '/');
    // A slow machine can show the sign-in before the learner's account is ready: once more.
    if (!(await s.p.locator('text=Present perfect').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false))) {
      await s.p.goto(`${BASE}/dev.html?as=Mia`);
      await s.p.waitForTimeout(1500);
      await s.p.goto(BASE + '/');
    }
    await see(s.p, 'text=Present perfect', 'the lesson on the learner home page');
    await axe(s.p, 'Learner home', A11Y_FOUND);
    return s;
  },
  'An invitation that is gone': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/invite/nothing-here`);
    await see(s.p, 'text=not there any more', 'the gone invitation');
    return s;
  },
};

// ------------------------------------------------------------------ run
const vite = await up();
const browser = await chromium.launch();
// A first visit, so the server has prepared every page before the journeys start.
{
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/dev.html?seed&as=teacher`, { timeout: 180000 });
  await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 180000 }).catch(() => {});
  for (const u of ['/archive', '/admin', '/messages', '/settings']) await p.goto(BASE + u, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await c.close();
}
const results = [];
try {
  for (const [name, run] of Object.entries(J)) {
    if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) continue;
    const t = Date.now();
    let s;
    let err = '';
    try {
      s = await run(browser);
      if (s.errors.length) err = s.errors.slice(0, 3).join('\n   ');
    } catch (e) {
      err = e.message.split('\n')[0] + (s?.errors?.length ? '\n   ' + s.errors.slice(0, 2).join('\n   ') : '');
    }
    await s?.ctx.close().catch(() => {});
    results.push({ name, ok: !err, err, ms: Date.now() - t });
    console.log(`${err ? '✗' : '✓'} ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)${err ? '\n   ' + err : ''}`);
  }
} finally {
  await browser.close();
  try {
    process.kill(-vite.pid);
  } catch {
    vite.kill();
  }
}
if (A11Y) {
  const serious = A11Y_FOUND.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  console.log(`\nAccessibility: ${A11Y_FOUND.length} problems, ${serious.length} serious or critical`);
  for (const v of A11Y_FOUND) console.log(`  [${v.impact}] ${v.page}: ${v.help} (${v.id}, ${v.n}) ${v.where.join(' | ')}`);
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} journeys passed`);
const a11yBad = A11Y ? A11Y_FOUND.filter((v) => v.impact === 'critical' || v.impact === 'serious').length : 0;
if (a11yBad) console.log(`${a11yBad} serious accessibility problems: fix them before deploying.`);
process.exit(bad.length || a11yBad ? 1 : 0);

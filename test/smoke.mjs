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
  'Timetable: a class added, and Rooms': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/timetable`);
    await see(s.p, '.ttb-grid, .ttb-sched', 'the timetable');
    // The full form, from New.
    await s.p.click('.ttb-new');
    await see(s.p, '.ttb-dialog', 'the new session dialog');
    await s.p.fill('.ttb-dialog input[placeholder^="The lesson"], .ttb-dialog .field input:not([type])', 'Speaking club');
    await s.p.click('.ttb-dialog button[type=submit]');
    await s.p.keyboard.press('a');
    await see(s.p, '.ttb-srow:has-text("Speaking club")', 'the session in the schedule');
    // Dragging across the hours of a day adds one there, with the quick card.
    await s.p.keyboard.press('d');
    await see(s.p, '.ttb-col', 'the day view');
    // An hour clear of the session above, which starts at the next hour from now.
    const hr = await s.p.evaluate(() => (new Date().getHours() < 12 ? 15 : 6));
    await s.p.locator('.ttb-scroll').evaluate((el, h) => (el.scrollTop = (h - 1) * 48), hr);
    const box = await s.p.locator('.ttb-col').first().boundingBox();
    await s.p.mouse.move(box.x + 60, box.y + hr * 48 + 4);
    await s.p.mouse.down();
    await s.p.mouse.move(box.x + 60, box.y + hr * 48 + 30, { steps: 3 });
    await s.p.mouse.move(box.x + 60, box.y + (hr + 1) * 48 + 20, { steps: 5 });
    await s.p.mouse.up();
    await see(s.p, '.ttb-quick', 'the quick card after a drag');
    await s.p.keyboard.type('Reading group');
    await s.p.keyboard.press('Enter');
    await see(s.p, '.ttb-ev:has-text("Reading group")', 'the dragged session in the day');
    await s.p.waitForTimeout(700); // the cards and the note fade in: check the colours once they are in
    await axe(s.p, 'Timetable', A11Y_FOUND);
    await s.p.click('.ttb-ev:has-text("Reading group")');
    await see(s.p, '.ttb-card', 'the session card');
    await s.p.waitForTimeout(700);
    await axe(s.p, 'Timetable card', A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    await s.p.goto(`${BASE}/rooms`);
    await see(s.p, 'text=Class video rooms', 'Rooms');
    await axe(s.p, 'Rooms', A11Y_FOUND);
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
    // No colleagues yet: the invitation.
    await s.p.goto(`${BASE}/colleagues`);
    await see(s.p, 'h1:has-text("Colleagues")', 'Colleagues');
    await see(s.p, 'button:has-text("Make an invitation link")', 'the invitation when there are no colleagues');
    // With an organisation and colleagues (test/mock/colleagues.ts).
    await s.p.goto(`${BASE}/dev.html?seed&colleagues&as=teacher`);
    await s.p.waitForFunction(() => !!localStorage.getItem('mockcolleagues'), null, { timeout: 30000 });
    await s.p.goto(`${BASE}/colleagues`);
    await see(s.p, '.clg-group-h:has-text("Harbour School")', 'the organisation group');
    await see(s.p, '.clg-around .clg-card:has-text("Lena Park")', 'who is around now');
    await axe(s.p, 'Colleagues', A11Y_FOUND);
    await s.p.click('.clg-row-main:has-text("Lena Park")');
    await see(s.p, 'h3:has-text("About Lena")', 'her profile');
    await see(s.p, '.clg-thing:has-text("Speaking rubric")', 'what she shared');
    await see(s.p, '.clg-tiles button[aria-label="Video call"]', 'the call buttons');
    await axe(s.p, 'Colleague', A11Y_FOUND);
    await s.p.fill('.clg-search input', 'spanish');
    await see(s.p, '.clg-row:has-text("Tomás Rivera") .clg-mark', 'a search by language');
    await s.p.click('.clg-row-main:has-text("Tomás Rivera")');
    // Message opens the chat in a window from the bottom, on the same page.
    await s.p.click('.clg-tiles .clg-tile-msg');
    await see(s.p, '.dock-win[data-win^="dm_"]', 'the chat window from the bottom');
    if (!new URL(s.p.url()).pathname.startsWith('/colleagues')) throw new Error('Message left the Colleagues page');
    return s;
  },
  'Super Admin and an organisation': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, '.hq-nav-i:has-text("Organisations")', 'Super Admin');
    await axe(s.p, 'Super Admin', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Teachers")');
    await see(s.p, '.hq-table', 'every teacher');
    await s.p.click('.hq-table tbody tr >> nth=0');
    await see(s.p, '.hq-drawer', 'one teacher, in the side panel');
    await axe(s.p, 'Super Admin: a teacher', A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    await s.p.click('.hq-nav-i:has-text("Organisations")');
    await s.p.click('button:has-text("New organisation")');
    await s.p.fill('.hq-sheet input', 'Test School');
    await s.p.click('.hq-sheet button:has-text("Create")');
    await see(s.p, 'h1:has-text("Admins")', 'the new organisation, at its admins');
    for (const t of ['Activity', 'Teachers', 'Invitations', 'Invitation codes', 'Classes', 'Library', 'Rules', 'Branding', 'Plan and limits', 'Overview']) {
      await s.p.click(`.hq-nav-i:has-text("${t}")`);
      await see(s.p, `h1:has-text("${t === 'Overview' ? 'Test School' : t}")`, `the ${t} page`);
    }
    await axe(s.p, 'Organisation', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Invitations")');
    await s.p.click('.hq-head button:has-text("Invite teachers")');
    await see(s.p, '.hq-sheet:has-text("Invite teachers")', 'the invitation form');
    return s;
  },
  'Organisation admin: teachers, invitations and classes': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      const now = Date.now();
      fs['users/teacher2'] = { role: 'teacher', displayName: 'Sofia Rossi', email: 'sofia@school.org', createdAt: { __ts: now - 9e8 } };
      fs['accounts/teacher2'] = { org: 'o1', usedBytes: 4.8 * 1024 ** 3 };
      fs['accounts/teacher1'] = { ...(fs['accounts/teacher1'] ?? {}), org: 'o1' };
      fs['orgs/o1'] = { name: 'Harbour School', plan: 'school', limitGb: 50, perTeacherGb: 5, adminEmails: ['teacher@example.com'], teachers: { teacher1: { name: 'Arda', email: 'teacher@example.com' }, teacher2: { name: 'Sofia Rossi', email: 'sofia@school.org', title: 'Senior teacher' } }, tags: { t1: { name: 'Exams team' } }, brand: { color: '#2f6f8f' }, allow: { trainers: true } };
      fs['orgInvites/i1'] = { org: 'o1', orgName: 'Harbour School', email: 'tom@school.org', name: 'Tom Becker', by: 'teacher1', byName: 'Arda', at: now - 10 * 864e5, status: 'pending', mailed: now - 10 * 864e5 };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(`${BASE}/org-admin`);
    await see(s.p, '.hq-ledger:has-text("invitation waiting more than a week")', 'what needs a look');
    await see(s.p, '.hq-ledger:has-text("nearly out of space")', 'a teacher nearly out of space');
    await axe(s.p, 'Organisation admin: overview', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Teachers")');
    await s.p.click('.hq-table tbody tr:has-text("Sofia Rossi") .hq-check');
    await see(s.p, '.hq-bulk:has-text("1 teacher selected")', 'the bar for the selected teachers');
    await s.p.click('.hq-table tbody tr:has-text("Sofia Rossi") .hq-row-open');
    await see(s.p, '.hq-drawer:has-text("Senior teacher"), .hq-drawer input[value="Senior teacher"]', 'Sofia in the side panel');
    await axe(s.p, 'Organisation admin: a teacher', A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    await s.p.click('.hq-nav-i:has-text("Invitations")');
    await s.p.click('.hq-head button:has-text("Invite teachers")');
    await s.p.click('.hq-sheet button:has-text("From a list")');
    await s.p.fill('.hq-sheet textarea', 'Priya Nair, priya@school.org\nSofia Rossi, sofia@school.org\nTom Becker, tom@school.org');
    await see(s.p, '.hq-inv-check:has-text("1 teacher ready, 2 left out")', 'the list checked before sending');
    await s.p.click('.hq-sheet button:has-text("Invite")');
    await see(s.p, '.hq-table:has-text("priya@school.org")', 'the new invitation');
    await axe(s.p, 'Organisation admin: invitations', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Classes")');
    await s.p.click('.hq-head button:has-text("New class")');
    await s.p.fill('.hq-sheet input[placeholder^="For example"]', 'Saturday FCE');
    await s.p.click('.hq-sheet .field:has-text("Teacher") .sel');
    await s.p.click('.sel-list .sel-o:has-text("Sofia Rossi")');
    await s.p.click('.hq-sheet button:has-text("Create the class")');
    await see(s.p, 'h1:has-text("Saturday FCE")', 'the new class, with its learners');
    await axe(s.p, 'Organisation admin: a class', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Activity")');
    await see(s.p, '.hq-ev:has-text("invited Priya Nair")', 'the invitation in Activity');
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
  'Support tickets: an admin opens one with pasted screenshots, the owner answers': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['orgs/o1'] = { name: 'Harbour School', plan: 'school', limitGb: 50, adminEmails: ['teacher@example.com'], teachers: { teacher1: { name: 'Arda', email: 'teacher@example.com' } } };
      fs['accounts/teacher1'] = { ...(fs['accounts/teacher1'] ?? {}), org: 'o1' };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(`${BASE}/support`);
    await see(s.p, 'h1:has-text("Support tickets")', 'Support tickets');
    await s.p.click('.hq-head button:has-text("New ticket")');
    await s.p.fill('.hq-sheet input[name="title"]', 'The timetable shows Monday twice');
    await s.p.fill('.hq-sheet textarea[name="description"]', 'Open the timetable, week view.');
    // Two screenshots pasted, as from the clipboard.
    await s.p.evaluate(async () => {
      const shot = async (color) => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 200;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, 320, 200);
        return new File([await new Promise((r) => c.toBlob(r, 'image/png'))], 'shot.png', { type: 'image/png' });
      };
      const dt = new DataTransfer();
      dt.items.add(await shot('#c8764a'));
      dt.items.add(await shot('#3667a6'));
      document.querySelector('.hq-sheet textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await see(s.p, '.hq-sheet .hq-tk-pic >> nth=1', 'both pasted screenshots');
    await axe(s.p, 'Support tickets: new ticket', A11Y_FOUND);
    await s.p.click('.hq-sheet button:has-text("Send the ticket")');
    await see(s.p, '.hq-drawer:has-text("The timetable shows Monday twice") .hq-tk-pic >> nth=1', 'the ticket with its screenshots');
    await axe(s.p, 'Support tickets: a ticket', A11Y_FOUND);
    await s.p.click('.hq-drawer .hq-tk-pic >> nth=0');
    await see(s.p, '.hq-tk-big img', 'a screenshot, big');
    await s.p.keyboard.press('Escape');
    await see(s.p, '.hq-drawer', 'the ticket, still open behind it');
    await s.p.keyboard.press('Escape');
    await see(s.p, '.hq-table:has-text("The timetable shows Monday twice")', 'the ticket in the list');
    // A super admin finds it in Super Admin, answers, hands it to Claude and marks it done.
    await s.p.evaluate((e) => { const a = JSON.parse(localStorage.getItem('mockauth')); a.teacher1.email = e; localStorage.setItem('mockauth', JSON.stringify(a)); }, OWNER);
    await s.p.goto(`${BASE}/support`);
    await see(s.p, '.hq-nav-i.on:has-text("Support tickets")', 'Super Admin, at the support tickets');
    await s.p.click('.hq-table tbody tr:has-text("Monday twice")');
    await s.p.fill('.hq-drawer textarea[name="reply"]', 'Fixed, thank you.');
    await s.p.click('.hq-drawer .hq-tk-zone button:has-text("Send")');
    await see(s.p, '.hq-tk-notes:has-text("Fixed, thank you.")', 'the answer');
    await s.p.click('.hq-drawer button:has-text("Ask Claude")');
    await s.p.fill('.hq-drawer textarea[name="claude"]', 'Week view only.');
    await s.p.click('.hq-drawer button:has-text("Send to Claude")');
    await see(s.p, '.hq-drawer:has-text("With Claude")', 'the ticket, with Claude');
    await s.p.click('.hq-drawer button:has-text("Mark done")');
    await see(s.p, '.hq-drawer .hq-tk-st.done', 'the ticket, done');
    await s.p.click('.hq-drawer a:has-text("Open the conversation")');
    await see(s.p, '.cl-msg.admin:has-text("Week view only.")', 'the conversation with Claude');
    await see(s.p, '.cl-msg.wait', 'waiting for Claude');
    await axe(s.p, 'Super Admin: Claude', A11Y_FOUND);
    await s.p.click('.hq-nav-i:has-text("Super admins")');
    await s.p.fill('.hq-addrow input[name="email"]', 'sofia@school.org');
    await s.p.click('.hq-addrow button:has-text("Add")');
    await s.p.click('.dialog button:has-text("Make them a super admin")');
    await see(s.p, '.hq-supers:has-text("sofia@school.org")', 'the new super admin');
    await axe(s.p, 'Super Admin: super admins', A11Y_FOUND);
    return s;
  },
  'Super admins: one made by another opens Super Admin': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['superAdmins/teacher@example.com'] = { name: 'Arda', by: 'x', byName: 'The owner', at: Date.now() };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, '.hq-nav-i:has-text("Super admins")', 'Super Admin, for a super admin');
    return s;
  },
  'Support tickets in a window, from any page': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.goto(`${BASE}/classes`);
    await s.p.click('.sf-tab');
    await see(s.p, '.sf-win h1:has-text("Support tickets")', 'the support window');
    await s.p.click('.sf-win button:has-text("New ticket")');
    await see(s.p, '.sf-win .hq-sheet', 'the new ticket form, inside the window');
    await axe(s.p, 'Support window', A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    await s.p.click('.sf-x');
    await see(s.p, '.sf-tab', 'the tab again');
    return s;
  },
  'Invitation codes: a super admin makes one': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['superAdmins/teacher@example.com'] = { name: 'Arda', by: 'x', byName: 'The owner', at: Date.now() };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(`${BASE}/admin?tab=codes`);
    await see(s.p, 'h1:has-text("Invitation codes")', 'the invitation codes page');
    await s.p.click('button:has-text("Make code")');
    await see(s.p, '.ic-code.big', 'the new code');
    await see(s.p, '.ic-list .ic-row', 'the code in the list');
    await axe(s.p, 'Super Admin: invitation codes', A11Y_FOUND);
    return s;
  },
  'Super Admin is the owner’s alone': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, 'text=only for the super admins', 'the closed Super Admin');
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

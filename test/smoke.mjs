// Smoke tests: the journeys teachers and learners take most, run in a real browser against the
// app with stand-ins for Firebase (test/vite.config.ts). Run with: npm run smoke
// Each journey fails on a crash in the page, a missing screen, or something that does not stay.
// With --a11y, each main screen is also checked for accessibility problems (axe-core).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const BASE = `http://localhost:${process.env.SMOKE_PORT || '5184'}`;
const A11Y = process.argv.includes('--a11y');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const OWNER = 'ardanurioglu@gmail.com';

// ------------------------------------------------------------------ the app
async function up() {
  const vite = spawn('npx', ['vite', '--config', 'test/vite.config.ts', '--port', new URL(BASE).port], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
  'Speech: saved previews, line controls and reordering': async (b) => {
    const s=await session(b,{owner:true});
    await s.p.goto(BASE+'/admin?tab=defaults');
    await see(s.p,'text=Dialogue voice previews','voice preview uploads');
    const wav=Buffer.alloc(44+48000*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
    for(let i=0;i<48000;i++)wav.writeInt16LE(Math.round(Math.sin(i*.1)*1500),44+i*2);
    await s.p.getByLabel('Upload marin preview',{exact:true}).setInputFiles({name:'Marin sample.wav',mimeType:'audio/wav',buffer:wav});
    await see(s.p,'text=marin preview saved.','saved preview',45000).catch(async e=>{throw Error(e.message+' '+(await s.p.locator('body').innerText()).slice(-2000)+' '+s.errors.join(';'));});
    await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher');
    await s.p.getByRole('button',{name:'Create speech',exact:true}).click();
    await s.p.getByRole('button',{name:'Preview voice for Speaker A',exact:true}).click();
    await see(s.p,'text=■ Stop','saved voice playback');
    if(await s.p.getByLabel('Speaker 1 accent',{exact:true}).count())throw Error('Accent control should be removed');
    await s.p.getByLabel('Dialogue line 1',{exact:true}).fill('First take.');
    await s.p.getByLabel('Dialogue line 1',{exact:true}).press('End');await s.p.getByLabel('Dialogue line 1',{exact:true}).press('Enter');
    await s.p.getByLabel('Dialogue line 2',{exact:true}).fill('(laughs) Second take.');
    await s.p.getByRole('button',{name:'Move line 2. Use Arrow Up or Arrow Down to reorder.',exact:true}).press('ArrowUp');
    if(await s.p.getByLabel('Dialogue line 1',{exact:true}).inputValue()!=='(laughs) Second take.')throw Error('Keyboard reorder lost text');
    await s.p.locator('.speech-drag').first().dragTo(s.p.locator('.speech-script-row').nth(1));
    if(await s.p.getByLabel('Dialogue line 1',{exact:true}).inputValue()!=='First take.')throw Error('Drag reorder failed');
    await s.p.getByRole('button',{name:'Regenerate line 1',exact:true}).click();
    await s.p.getByRole('button',{name:'Listen to line 1',exact:true}).click();
    await axe(s.p,'Dialogue take table',A11Y_FOUND);
    return s;
  },
  'Speech: teacher training shares dialogue and speaking authoring': async (b) => {
    const s=await session(b);
    await s.p.evaluate(id=>{const data=JSON.parse(localStorage.getItem('mockfs'));data['classes/'+id].kind='training';localStorage.setItem('mockfs',JSON.stringify(data));},s.demo.classId);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/lesson/'+s.demo.itemId);
    await s.p.getByRole('button',{name:'+ New task',exact:true}).click();
    await s.p.locator('.ProseMirror').nth(1).click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'Language analysis');
    await see(s.p,'text=Target language','teacher-training language analysis');
    await s.p.getByRole('button',{name:'+ New task',exact:true}).click();
    await s.p.locator('.task-editor .editor-host .ProseMirror').first().click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'Speaking practice');
    await see(s.p,'.speak-setup','speaking practice in teacher training').catch(async e=>{throw Error(e.message+' '+(await s.p.locator('body').innerText()).slice(-5000)+' '+s.errors.join(';'));});
    return s;
  },
  'Speech: teacher setup, script writing, preview and speaker tracks': async (b) => {
    const s=await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await see(s.p,'.ProseMirror','the lesson editor');
    await s.p.getByRole('button',{name:'+ New task',exact:true}).click();
    await s.p.locator('.ProseMirror').nth(1).click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'Speaking practice');
    await see(s.p,'.speak-setup','the speaking task editor');
    await s.p.waitForTimeout(1000);
    await s.p.getByLabel('Feedback focus source',{exact:true}).click();await s.p.getByRole('option',{name:'Let the learner choose',exact:true}).click();
    await s.p.getByRole('button',{name:'+ Feedback option',exact:true}).click();
    await s.p.getByLabel('Feedback option 3',{exact:true}).fill('Giving reasons');
    await s.p.getByRole('button',{name:'Save speaking task',exact:true}).click();
    await see(s.p,'text=Speaking task saved and ready for learners.','saved speaking configuration');
    await axe(s.p,'Speaking teacher setup',A11Y_FOUND);
    await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher');
    await s.p.getByRole('button',{name:'Create speech',exact:true}).click();
    await s.p.getByRole('button',{name:'+ Add speaker',exact:true}).click();
    await s.p.getByRole('button',{name:'Preview voice for Speaker C',exact:true}).click();
    await s.p.getByLabel('Dialogue line 1',{exact:true}).fill('(hesitates) Is it Friday?');
    await s.p.getByLabel('Dialogue line 1',{exact:true}).press('End');await s.p.getByLabel('Dialogue line 1',{exact:true}).press('Enter');
    await s.p.getByLabel('Dialogue line 2',{exact:true}).fill('(laughs) Yes, Friday.');
    await s.p.getByLabel('Dialogue line 2',{exact:true}).press('End');await s.p.getByLabel('Dialogue line 2',{exact:true}).press('Enter');
    await s.p.getByLabel('Dialogue line 3',{exact:true}).fill('See you there.');
    await s.p.getByLabel('Line 3 speaker',{exact:true}).click();
    await s.p.getByRole('option',{name:'Speaker C',exact:true}).click();
    await s.p.getByRole('button',{name:'Create missing takes',exact:true}).click();
    await s.p.getByRole('button',{name:'Add to timeline',exact:true}).waitFor({state:'visible'});
    await axe(s.p,'Dialogue composer',A11Y_FOUND);
    await s.p.getByRole('button',{name:'Add to timeline',exact:true}).click();
    await see(s.p,'text=Speaker A · Is it Friday?','clean spoken captions');
    await see(s.p,'text=Speaker C · See you there.','the third speaker track');
    return s;
  },
  'Speech: learner choice, timed closing and private teacher monitoring': async (b) => {
    const s=await session(b);
    await s.p.goto(BASE+'/test/speech/fixture.html?as=Mia&mode=learner&focus=choice&fakeRtc');
    const start=s.p.getByRole('button',{name:'Start speaking',exact:true});await start.waitFor({state:'visible'});
    if(await start.isEnabled())throw Error('Learner choice must be explicit.');
    await s.p.getByRole('radio',{name:'Giving reasons',exact:true}).check();
    await axe(s.p,'Learner speaking brief',A11Y_FOUND);
    await start.click();
    await see(s.p,'.speak-feedback','feedback after automatic closing',15000);
    await s.p.getByText('Your conversation · 1 speaking turns').click();
    await see(s.p,'text=That sounds good. See you then!','the final farewell');
    await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher&mode=teacher&focus=choice');
    await s.p.locator('.speak-learner').filter({hasText:'Needs help'}).first().click();
    await see(s.p,'.speak-review','the teacher transcript');
    await axe(s.p,'Teacher speaking monitor',A11Y_FOUND);
    return s;
  },
  'File names, recycle bin and organisation sidebar': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/test/file-tools-check.html');
    await s.p.waitForFunction(() => /ALL PASSED|FAIL/.test(document.querySelector('#result')?.textContent || ''), null, { timeout: 30000 });
    const result = await s.p.locator('#result').innerText();
    if (result.includes('FAIL')) throw new Error(result);
    await s.p.goto(BASE + '/archive');
    await s.p.getByRole('button', { name: 'Apps', exact: true }).click();
    await see(s.p, '.apps-pop a[role="menuitem"]:has-text("Resources")', 'Resources in the app launcher');
    if (await s.p.locator('.apps-pop a[href="/library"]').count()) throw new Error('Organisation library still appears as a separate app.');
    if (await s.p.locator('.apps-pop a[href="/archive"]').innerText().then((text) => !text.includes('Resources'))) throw new Error('The Resources app still has its old name.');
    await s.p.keyboard.press('Escape');
    await see(s.p, 'nav[aria-label="Resources"] button:has-text("Personal Files")', 'personal files in the sidebar').catch(async (e) => { throw new Error(e.message + ' ' + s.errors.join(';') + ' ' + (await s.p.locator('body').innerText()).slice(0, 1000)); });
    await s.p.getByRole('button', { name: 'Recycle bin', exact: true }).click();
    await see(s.p, 'h1:has-text("Recycle bin")', 'the recycle bin');
    await s.p.locator('.file-bin-list li').filter({ hasText: 'Restore me' }).getByRole('button', { name: 'Restore', exact: true }).click();
    await s.p.locator('.file-bin-list li').filter({ hasText: 'Restore me' }).waitFor({ state: 'detached' });
    await s.p.locator('.file-bin-list li').filter({ hasText: 'Remove me' }).getByRole('button', { name: /^Permanently delete/ }).click();
    await s.p.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await see(s.p, 'text=Your recycle bin is empty', 'restored and permanently queued files removed from the bin');
    await axe(s.p, 'Recycle bin', A11Y_FOUND);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['orgs/o1'] = { name: 'Harbour School', adminEmails: ['teacher@example.com'], teachers: { teacher1: { name: 'Arda' } }, drives: {} };
      fs['accounts/teacher1'] = { org: 'o1' };
      fs['sharedFolders/drive-demo'] = { owner: 'teacher1', ownerName: 'Harbour School', name: 'Sample library', org: 'o1', members: {}, memberIds: [] };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.goto(BASE + '/library?f=drive-demo');
    await see(s.p, 'nav[aria-label="Organisation library"]', 'libraries inside Files');
    await see(s.p, '.ma-main h1', 'the selected organisation folder');
    await s.p.getByRole('button', { name: 'Apps', exact: true }).click();
    if (await s.p.locator('.apps-pop a[href="/library"]').count()) throw new Error('Organisation accounts still have a separate Library app.');
    await s.p.keyboard.press('Escape');
    await axe(s.p, 'Unified Files library', A11Y_FOUND);
    return s;
  },
  'Mobile messages use the whole visible screen': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['chats/mobile-check'] = { members: ['teacher1'], names: { teacher1: 'Arda' }, roles: { teacher1: 'teacher' }, kind: 'dm', createdBy: 'teacher1', at: Date.now(), lastAt: Date.now() };
      fs['chats/mobile-check/msgs/one'] = { by: 'teacher1', name: 'Arda', role: 'teacher', at: Date.now(), text: 'Short conversation', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Short conversation' }] }] } };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.setViewportSize({ width: 390, height: 844 });
    await s.p.goto(BASE + '/messages?c=mobile-check');
    await see(s.p, '.chat-compose', 'the mobile composer');
    const fits = async () => s.p.waitForFunction(() => {
      const chat = document.querySelector('.msg.has-chat')?.getBoundingClientRect();
      const composer = document.querySelector('.chat-compose')?.getBoundingClientRect();
      const vv = window.visualViewport;
      const bottom = (vv?.offsetTop || 0) + (vv?.height || innerHeight);
      return chat && composer && Math.abs(chat.bottom - bottom) <= 2 && Math.abs(composer.bottom - bottom) <= 2;
    });
    await fits();
    await s.p.screenshot({ path: '/tmp/eltsuite-mobile-chat-fixed.png' });
    await s.p.setViewportSize({ width: 390, height: 460 });
    await fits();
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      for (let n = 0; n < 55; n++) fs['chats/mobile-check/msgs/long-' + n] = { by: 'teacher1', name: 'Arda', role: 'teacher', at: Date.now() + n, text: 'Message ' + n + ' in a longer conversation.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Message ' + n + ' in a longer conversation.' }] }] } };
      localStorage.setItem('mockfs', JSON.stringify(fs));
    });
    await s.p.reload();
    await see(s.p, '.chat-compose', 'the composer with long history');
    await fits();
    const scrolls = await s.p.locator('.chat-body').evaluate((el) => el.scrollHeight > el.clientHeight);
    if (!scrolls) throw new Error('Long history does not scroll independently.');
    await axe(s.p, 'Mobile messages', A11Y_FOUND);
    return s;
  },

  'Mobile class creation and duplicate learner validation': async (b) => {
    const s = await session(b);
    await s.p.setViewportSize({ width: 390, height: 844 });
    await s.p.goto(BASE + '/class/' + s.demo.classId);
    await s.p.getByRole('button', { name: '+ New topic', exact: true }).click();
    await s.p.locator('.inline-add input').fill('Mobile audit topic');
    await s.p.locator('.inline-add').getByRole('button', { name: 'Add', exact: true }).click();
    await see(s.p, '.topic-name:has-text("Mobile audit topic")', 'the new mobile topic');
    await s.p.getByRole('button', { name: /^Learners/ }).click();
    await s.p.getByRole('button', { name: '+ Add learners', exact: true }).click();
    const field = s.p.getByRole('textbox', { name: 'One name per line', exact: true });
    if (!await field.evaluate(el => el === document.activeElement)) throw new Error('Learner form did not receive focus');
    await field.fill('Audit Name\naudit name');
    await s.p.getByRole('button', { name: 'Add 2 learners', exact: true }).click();
    await see(s.p, '.side-form [role=alert]', 'duplicate names explained beside the form');
    if (await s.p.locator('.learners table tbody tr').count() !== 6) throw new Error('Duplicate submission added learners');
    await field.fill('Audit Name');
    await s.p.getByRole('button', { name: 'Add 1 learner', exact: true }).click();
    await see(s.p, '.learners table:has-text("Audit Name")', 'one learner successfully added');
    return s;
  },
  'Three-day calendar across themes and screen sizes': async (b) => {
    const s = await session(b);
    for (const width of [390, 1300]) {
      await s.p.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark']) {
        await s.p.evaluate(t => localStorage.setItem('ll.theme', t), theme);
        await s.p.goto(BASE + '/timetable?day=2026-12-31');
        await s.p.getByRole('radio', { name: '3 days', exact: true }).click();
        await see(s.p, '.ttb-grid[data-cols="3"]', 'three calendar columns');
        if (await s.p.locator('.ttb-head-day').count() !== 3) throw new Error('Wrong number of days');
        await s.p.getByRole('button', { name: 'The 3 days after', exact: true }).click();
        await s.p.getByRole('button', { name: /January 3, open the day/ }).waitFor();
        const overflow = await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow) throw new Error('Calendar overflows at ' + width + ' in ' + theme);
        await s.p.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
        await axe(s.p, 'Calendar ' + width + ' ' + theme, A11Y_FOUND);
      }
    }
    await s.p.goto(BASE + '/timetable');
    await see(s.p, '.ttb-grid[data-cols="3"]', 'saved three-day preference');
    return s;
  },


  'Super Admin controls AI access, off by default': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access off for the owner');
    await s.p.goto(BASE + '/admin?tab=ai');
    const toggle = s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true });
    await toggle.waitFor();
    if (await toggle.getAttribute('aria-checked') !== 'false') throw Error('AI access was not off by default');
    await axe(s.p, 'Super Admin: AI access', A11Y_FOUND);
    await toggle.click();
    await see(s.p, '[role=status]:has-text("turned on")', 'grant saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await s.p.getByLabel('Topic', { exact: true }).waitFor();
    await s.p.goto(BASE + '/admin?tab=ai');
    await s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true }).click();
    await see(s.p, '[role=status]:has-text("turned off")', 'revocation saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access revoked');
    return s;
  },
  'Lesson assistant approval, private save and reopen': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs = JSON.parse(localStorage.getItem('mockfs')); fs['aiPilot/teacher1'] = { enabled: true }; localStorage.setItem('mockfs', JSON.stringify(fs)); });
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    const topicBox=s.p.getByLabel('Topic',{exact:true});
    const shortHeight=await topicBox.evaluate(el=>el.getBoundingClientRect().height);
    if(shortHeight>70) throw Error('Empty brief field is not compact');
    await topicBox.fill('Travel\nFood\nWork\nStudy');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)<=shortHeight) throw Error('Brief field did not expand');
    await topicBox.fill('Travel');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)>shortHeight+2) throw Error('Brief field did not shrink');
    await s.p.getByLabel('Objectives', { exact: true }).fill('Compare options and agree on a trip.');
    await s.p.getByLabel('Context', { exact: true }).fill('Adult B1 class working in pairs.');
    await s.p.getByRole('button', { name: 'Suggest an outline' }).click();
    await see(s.p, 'text=2. Review the outline', 'outline approval');
    if (await s.p.getByRole('button', { name: 'Save private draft' }).count()) throw Error('Plan created before approval');
    await s.p.getByRole('button', { name: 'Approve outline and make the plan' }).click();
    await s.p.getByRole('textbox', { name: 'Main aim', exact: true }).fill('Explain a choice with two reasons');
    await s.p.getByRole('button', { name: 'Learner materials', exact: true }).click();
    await see(s.p, 'text=Answer key or response criteria', 'separate learner material editor');
    await s.p.getByRole('button', { name: 'Save private draft' }).click();
    await see(s.p, 'text=Saved privately.', 'private save confirmation');
    await s.p.getByRole('button', { name: 'Start a new plan' }).click();
    await s.p.getByRole('button', { name: 'Open saved plans' }).click();
    await s.p.getByRole('button', { name: 'Choose a trip', exact: true }).click();
    await s.p.getByRole('button', { name: 'Teacher plan', exact: true }).click();
    if (await s.p.getByRole('textbox', { name: 'Main aim', exact: true }).inputValue() !== 'Explain a choice with two reasons') throw Error('Saved edits were lost');
    await s.p.getByRole('button',{name:'Prepare class activities'}).click();
    await see(s.p,'text=READY FOR YOUR REVIEW','activity review');
    if(await s.p.getByRole('heading',{name:'3. Review and edit'}).count()) throw Error('Step 3 remains visible in step 4');
    await s.p.getByRole('button',{name:'← Back to teaching plan'}).click();
    if(await s.p.locator('.ai-ready').count()) throw Error('Step 4 remains visible in step 3');
    await s.p.getByRole('textbox',{name:'Main aim',exact:true}).fill('Choose and justify a trip with clear reasons');
    await s.p.getByRole('button',{name:'Prepare class activities'}).click();
    await see(s.p,'text=READY FOR YOUR REVIEW','rebuilt activity review');
    await s.p.getByRole('button',{name:'Create lesson in Classes'}).click();
    await see(s.p,'text=Created in Classes, hidden','hidden creation');
    await axe(s.p, 'Lesson assistant', A11Y_FOUND);
    await s.p.setViewportSize({ width: 390, height: 844 });
    if (await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Assistant overflows on mobile');
    return s;
  },

  'Sound chart themes, page gestures and compact title': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    const title = d.locator('input.dp-title');
    await title.fill('Sound notes');
    await title.press('Enter');
    const compact = await title.evaluate((el) => el.getBoundingClientRect().width < el.parentElement.getBoundingClientRect().width);
    if (!compact) throw new Error('The title input stretches across its header.');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.click();
    await slash(d, 'phonemic');
    await see(d, '.ph-chart', 'the shared sound chart');
    await text.press('ControlOrMeta+End');
    await text.press('Enter');
    await slash(d, 'phonemic');
    const pagesFit = await d.locator('.ph-node:has(.ph-chart)').evaluateAll((blocks) => blocks.every((el) => {
      const paper = el.closest('.pg-paper');
      const scale = Number(paper.style.zoom);
      const top = (el.getBoundingClientRect().top - paper.getBoundingClientRect().top) / scale;
      const height = el.getBoundingClientRect().height / scale;
      return top + height <= (Math.floor(top / 1123) + 1) * 1123 - 96 + 1;
    }));
    if (!pagesFit) throw new Error('A sound chart crosses a page boundary.');
    for (const colour of ['black', 'white']) {
      await d.getByRole('menuitem', { name: 'View', exact: true }).click();
      await d.getByRole('menuitemradio', { name: 'Page colour: ' + colour, exact: true }).click();
      const colours = await d.locator('.ph-chart').first().evaluate((el) => ({ ink: getComputedStyle(el).color, paperInk: getComputedStyle(el.closest('.pg-paper')).color, background: getComputedStyle(el).backgroundImage }));
      if (colours.ink !== colours.paperInk || (colour === 'black' && colours.background.includes('255, 255, 255'))) throw new Error('Sound chart does not follow page appearance: ' + JSON.stringify(colours));
    }
    const contained = await d.locator('.ph-chart').first().evaluate((el) => {
      const chart = el.getBoundingClientRect();
      const content = el.closest('.pg-text').getBoundingClientRect();
      return chart.right <= content.right + 1 && chart.width <= content.width + 1 && el.scrollWidth <= el.clientWidth + 1;
    });
    if (!contained) throw new Error('The sound chart overflows the page.');
    await d.getByRole('menuitem', { name: 'View', exact: true }).click();
    await d.getByRole('menuitemradio', { name: 'Pageless', exact: true }).click();
    await see(d, '.ph-chart', 'charts after switching to pageless');
    if (await d.locator('.ph-chart').count() !== 2) throw new Error('A chart disappeared in pageless mode.');
    await d.getByRole('menuitem', { name: 'View', exact: true }).click();
    await d.getByRole('menuitemradio', { name: 'Pages', exact: true }).click();
    await see(d, '.pg-paper .ph-chart', 'charts after switching back to pages');
    if (await d.locator('.pg-page-info').count()) throw new Error('The paper-size label is still beside zoom.');
    const before = await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom));
    await d.locator('.pg-paper').dispatchEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -30 });
    await d.waitForFunction((old) => Number(document.querySelector('.pg-paper').style.zoom) > old, before);
    const after = await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom));
    await d.locator('.pg-paper').dispatchEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: false, deltaY: 30 });
    if (await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom)) !== after) throw new Error('Ordinary scrolling changed page zoom.');
    await axe(d, 'Responsive sound chart', A11Y_FOUND);
    return s;
  },
  'Document find, replace and format painter': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.fill('Notes and notes. Plain target.');
    await text.press('ControlOrMeta+Home');
    for (let i = 0; i < 5; i++) await text.press('Shift+ArrowRight');
    await d.getByRole('button', { name: /^Bold/ }).click();
    await d.getByRole('menuitem', { name: 'Format', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Copy text formatting', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Find and replace…/ }).click();
    const panel = d.getByRole('dialog', { name: 'Find and replace', exact: true });
    const find = panel.getByRole('textbox', { name: 'Find', exact: true });
    await find.fill('Plain target');
    await see(d, '.document-find-navigation:has-text("1 of 1 matches")', 'the formatting target match');
    await panel.getByRole('button', { name: 'Close find and replace', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Format', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Apply text formatting', exact: true }).click();
    await see(d, '.ProseMirror strong:has-text("Plain target")', 'the copied bold formatting');
    await text.press('ControlOrMeta+f');
    await find.fill('notes');
    await see(d, '.document-find-navigation:has-text("1 of 2 matches")', 'case-insensitive matches');
    await panel.getByRole('checkbox', { name: 'Match case', exact: true }).check();
    await see(d, '.document-find-navigation:has-text("1 of 1 matches")', 'case-sensitive matching');
    await panel.getByRole('checkbox', { name: 'Match case', exact: true }).uncheck();
    await panel.getByRole('textbox', { name: 'Replace with', exact: true }).fill('const J = {');
    await panel.getByRole('button', { name: 'Replace all', exact: true }).click();
    await see(d, '.ProseMirror:has-text("const J = { and const J = {. Plain target.")', 'literal replacement text');
    await panel.getByRole('button', { name: 'Close find and replace', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Undo/ }).click();
    await see(d, '.ProseMirror:has-text("Notes and notes. Plain target.")', 'one-step replace-all undo');
    await d.reload();
    await see(d, '.ProseMirror strong:has-text("Plain target")', 'the saved copied formatting');
    await axe(d, 'Document editing tools', A11Y_FOUND);
    return s;
  },

  'Advanced document export files': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/test/document-tools-check.html');
    await s.p.waitForFunction(() => ['pass', 'fail'].includes(document.documentElement.dataset.result), null, { timeout: 90000 });
    const result = await s.p.locator('pre').innerText();
    if (!result.startsWith('PASS')) throw new Error(result);
    return s;
  },
  'Document sections, page settings and version restore': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.fill('Original notes');
    await text.press('Tab');
    await see(d, '.ProseMirror p[data-indent="1"]', 'Tab indentation');
    await text.press('ControlOrMeta+Enter');
    await see(d, '[data-doc-page-break]', 'a page break');
    await text.press('Enter');
    await d.keyboard.type('A new section');
    await d.getByRole('menuitem', { name: 'Insert', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Section break', exact: true }).click();
    await see(d, '[data-doc-section]', 'a document section');
    await d.getByRole('menuitem', { name: 'Format', exact: true }).click();
    await d.getByRole('menuitemradio', { name: '2 columns', exact: true }).click();
    await see(d, '[data-doc-section][data-columns="2"]', 'section-specific columns');
    await d.getByRole('menuitem', { name: 'File', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Page setup…', exact: true }).click();
    await d.getByRole('textbox', { name: 'Page header', exact: true }).fill('Research notes');
    await d.getByRole('textbox', { name: 'Page footer', exact: true }).fill('Seminar');
    await d.getByRole('checkbox', { name: 'Show page numbers', exact: true }).check();
    await d.getByRole('spinbutton', { name: 'Starting page number', exact: true }).fill('4');
    await d.keyboard.press('Escape');
    await see(d, '.pg-running-header:has-text("Research notes")', 'the page header');
    await see(d, '.pg-running-footer:has-text("Seminar")', 'the page footer');
    await d.getByRole('menuitem', { name: 'File', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Version history…', exact: true }).click();
    const history = d.getByRole('dialog', { name: 'Version history', exact: true });
    await history.getByRole('textbox', { name: 'Version name', exact: true }).fill('Before edits');
    await history.getByRole('button', { name: 'Save version', exact: true }).click();
    await see(d, '.document-version-list:has-text("Before edits")', 'the saved version');
    await history.getByRole('button', { name: 'Close version history', exact: true }).click();
    await text.fill('Changed notes');
    await d.getByRole('menuitem', { name: 'File', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Version history…', exact: true }).click();
    await history.getByRole('button', { name: 'Restore this version', exact: true }).first().click();
    await d.getByRole('button', { name: 'Restore', exact: true }).click();
    await see(d, '.ProseMirror:has-text("Original notes")', 'restored document content');
    await see(d, '.document-version-list:has-text("Before restoring")', 'the recovery version saved before restore');
    await history.getByRole('button', { name: 'Close version history', exact: true }).click();
    await d.waitForTimeout(300);
    await d.reload();
    await see(d, '[data-doc-section][data-columns="2"]', 'saved sections after reload');
    await see(d, '.pg-running-header:has-text("Research notes")', 'saved header after reload');
    await axe(d, 'Advanced document structure', A11Y_FOUND);
    return s;
  },
  'Clipboard, font replacement and consistent lesson dropdowns': async (b) => {
    const s = await session(b);
    await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const d = await newFile(s, 'Collab document');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.fill('Clipboard sample');
    await text.press('ControlOrMeta+a');
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Copy/ }).click();
    await d.waitForFunction(async () => (await navigator.clipboard.readText()) === 'Clipboard sample');
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Cut/ }).click();
    await d.waitForFunction(() => document.querySelector('.ProseMirror').textContent.trim() === '');
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Paste without formatting/ }).click();
    await see(d, '.ProseMirror:has-text("Clipboard sample")', 'plain-text paste');
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Find and replace/ }).click();
    await d.getByRole('textbox', { name: 'Find', exact: true }).fill('Clipboard');
    await d.getByRole('button', { name: 'Replacement font', exact: true }).click();
    await d.getByRole('option', { name: 'Consolas', exact: true }).click();
    await d.getByRole('button', { name: 'Change font for all matches', exact: true }).click();
    await see(d, '.ProseMirror [data-font][style*="Consolas"]', 'font replacement');
    await d.getByRole('button', { name: 'Close find and replace', exact: true }).click();
    await s.p.goto(BASE + '/class/' + s.demo.classId);
    const picks = s.p.locator('.sel.type-pick');
    await picks.first().waitFor();
    const widths = await picks.evaluateAll((els) => els.map((el) => ({ width: el.getBoundingClientRect().width, clipped: el.querySelector('.sel-v').scrollWidth > el.querySelector('.sel-v').clientWidth })));
    if (widths.some((v) => v.clipped || Math.abs(v.width - widths[0].width) > 1)) throw new Error('Lesson dropdowns are clipped or different widths.');
    return s;
  },


  'Super Admin controls AI access, off by default': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access off for the owner');
    await s.p.goto(BASE + '/admin?tab=ai');
    const toggle = s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true });
    await toggle.waitFor();
    if (await toggle.getAttribute('aria-checked') !== 'false') throw Error('AI access was not off by default');
    await axe(s.p, 'Super Admin: AI access', A11Y_FOUND);
    await toggle.click();
    await see(s.p, '[role=status]:has-text("turned on")', 'grant saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await s.p.getByLabel('Topic', { exact: true }).waitFor();
    await s.p.goto(BASE + '/admin?tab=ai');
    await s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true }).click();
    await see(s.p, '[role=status]:has-text("turned off")', 'revocation saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access revoked');
    return s;
  },
  'Lesson assistant approval, private save and reopen': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs = JSON.parse(localStorage.getItem('mockfs')); fs['aiPilot/teacher1'] = { enabled: true }; localStorage.setItem('mockfs', JSON.stringify(fs)); });
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await s.p.getByLabel('Topic', { exact: true }).fill('Travel');
    await s.p.getByLabel('Objectives', { exact: true }).fill('Compare options and agree on a trip.');
    await s.p.getByLabel('Context', { exact: true }).fill('Adult B1 class working in pairs.');
    await s.p.getByRole('button', { name: 'Suggest an outline' }).click();
    await see(s.p, 'text=2. Review the outline', 'outline approval');
    if (await s.p.getByRole('button', { name: 'Save private draft' }).count()) throw Error('Plan created before approval');
    await s.p.getByRole('button', { name: 'Approve outline and make the plan' }).click();
    await s.p.getByRole('textbox', { name: 'Main aim', exact: true }).fill('Explain a choice with two reasons');
    await s.p.getByRole('button', { name: 'Learner materials', exact: true }).click();
    await see(s.p, 'text=Answer key or response criteria', 'separate learner material editor');
    await s.p.getByRole('button', { name: 'Save private draft' }).click();
    await see(s.p, 'text=Saved privately.', 'private save confirmation');
    await s.p.getByRole('button', { name: 'Start a new plan' }).click();
    await s.p.getByRole('button', { name: 'Open saved plans' }).click();
    await s.p.getByRole('button', { name: 'Choose a trip', exact: true }).click();
    await s.p.getByRole('button', { name: 'Teacher plan', exact: true }).click();
    if (await s.p.getByRole('textbox', { name: 'Main aim', exact: true }).inputValue() !== 'Explain a choice with two reasons') throw Error('Saved edits were lost');
    await axe(s.p, 'Lesson assistant', A11Y_FOUND);
    await s.p.setViewportSize({ width: 390, height: 844 });
    if (await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Assistant overflows on mobile');
    return s;
  },

  'Sound chart themes, page gestures and compact title': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    const title = d.locator('input.dp-title');
    await title.fill('Sound notes');
    await title.press('Enter');
    const compact = await title.evaluate((el) => el.getBoundingClientRect().width < el.parentElement.getBoundingClientRect().width);
    if (!compact) throw new Error('The title input stretches across its header.');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.click();
    await slash(d, 'phonemic');
    await see(d, '.ph-chart', 'the shared sound chart');
    await text.press('ControlOrMeta+End');
    await text.press('Enter');
    await slash(d, 'phonemic');
    const pagesFit = await d.locator('.ph-node:has(.ph-chart)').evaluateAll((blocks) => blocks.every((el) => {
      const paper = el.closest('.pg-paper');
      const scale = Number(paper.style.zoom);
      const top = (el.getBoundingClientRect().top - paper.getBoundingClientRect().top) / scale;
      const height = el.getBoundingClientRect().height / scale;
      return top + height <= (Math.floor(top / 1123) + 1) * 1123 - 96 + 1;
    }));
    if (!pagesFit) throw new Error('A sound chart crosses a page boundary.');
    for (const colour of ['black', 'white']) {
      await d.getByRole('menuitem', { name: 'View', exact: true }).click();
      await d.getByRole('menuitemradio', { name: 'Page colour: ' + colour, exact: true }).click();
      const colours = await d.locator('.ph-chart').first().evaluate((el) => ({ ink: getComputedStyle(el).color, paperInk: getComputedStyle(el.closest('.pg-paper')).color, background: getComputedStyle(el).backgroundImage }));
      if (colours.ink !== colours.paperInk || (colour === 'black' && colours.background.includes('255, 255, 255'))) throw new Error('Sound chart does not follow page appearance: ' + JSON.stringify(colours));
    }
    const contained = await d.locator('.ph-chart').first().evaluate((el) => {
      const chart = el.getBoundingClientRect();
      const content = el.closest('.pg-text').getBoundingClientRect();
      return chart.right <= content.right + 1 && chart.width <= content.width + 1 && el.scrollWidth <= el.clientWidth + 1;
    });
    if (!contained) throw new Error('The sound chart overflows the page.');
    await d.getByRole('menuitem', { name: 'View', exact: true }).click();
    await d.getByRole('menuitemradio', { name: 'Pageless', exact: true }).click();
    await see(d, '.ph-chart', 'charts after switching to pageless');
    if (await d.locator('.ph-chart').count() !== 2) throw new Error('A chart disappeared in pageless mode.');
    await d.getByRole('menuitem', { name: 'View', exact: true }).click();
    await d.getByRole('menuitemradio', { name: 'Pages', exact: true }).click();
    await see(d, '.pg-paper .ph-chart', 'charts after switching back to pages');
    if (await d.locator('.pg-page-info').count()) throw new Error('The paper-size label is still beside zoom.');
    const before = await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom));
    await d.locator('.pg-paper').dispatchEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -30 });
    await d.waitForFunction((old) => Number(document.querySelector('.pg-paper').style.zoom) > old, before);
    const after = await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom));
    await d.locator('.pg-paper').dispatchEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: false, deltaY: 30 });
    if (await d.locator('.pg-paper').evaluate((el) => Number(el.style.zoom)) !== after) throw new Error('Ordinary scrolling changed page zoom.');
    await axe(d, 'Responsive sound chart', A11Y_FOUND);
    return s;
  },
  'Document find, replace and format painter': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.fill('Notes and notes. Plain target.');
    await text.press('ControlOrMeta+Home');
    for (let i = 0; i < 5; i++) await text.press('Shift+ArrowRight');
    await d.getByRole('button', { name: /^Bold/ }).click();
    await d.getByRole('menuitem', { name: 'Format', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Copy text formatting', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Find and replace…/ }).click();
    const panel = d.getByRole('dialog', { name: 'Find and replace', exact: true });
    const find = panel.getByRole('textbox', { name: 'Find', exact: true });
    await find.fill('Plain target');
    await see(d, '.document-find-navigation:has-text("1 of 1 matches")', 'the formatting target match');
    await panel.getByRole('button', { name: 'Close find and replace', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Format', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Apply text formatting', exact: true }).click();
    await see(d, '.ProseMirror strong:has-text("Plain target")', 'the copied bold formatting');
    await text.press('ControlOrMeta+f');
    await find.fill('notes');
    await see(d, '.document-find-navigation:has-text("1 of 2 matches")', 'case-insensitive matches');
    await panel.getByRole('checkbox', { name: 'Match case', exact: true }).check();
    await see(d, '.document-find-navigation:has-text("1 of 1 matches")', 'case-sensitive matching');
    await panel.getByRole('checkbox', { name: 'Match case', exact: true }).uncheck();
    await panel.getByRole('textbox', { name: 'Replace with', exact: true }).fill('$&');
    await panel.getByRole('button', { name: 'Replace all', exact: true }).click();
    await see(d, '.ProseMirror:has-text("$& and $&. Plain target.")', 'literal replacement text');
    await panel.getByRole('button', { name: 'Close find and replace', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await d.getByRole('menuitem', { name: /^Undo/ }).click();
    await see(d, '.ProseMirror:has-text("Notes and notes. Plain target.")', 'one-step replace-all undo');
    await d.reload();
    await see(d, '.ProseMirror strong:has-text("Plain target")', 'the saved copied formatting');
    await axe(d, 'Document editing tools', A11Y_FOUND);
    return s;
  },
  'Document font size, page setup and zoom': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    await see(d, '.pg-paper', 'a paged document');
    const text = d.getByRole('textbox', { name: 'Document text', exact: true });
    await text.fill('Teaching notes');
    await text.press('ControlOrMeta+a');
    const size = d.getByRole('textbox', { name: 'Font size', exact: true });
    await size.fill('18');
    await size.press('Enter');
    await d.getByRole('button', { name: 'Increase font size', exact: true }).click();
    await see(d, '[data-font][style*="19pt"]', 'the selected text at 19 pt');
    await d.getByRole('menuitem', { name: 'File', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Page setup…', exact: true }).click();
    await d.getByRole('button', { name: 'Page orientation', exact: true }).click();
    await d.getByRole('option', { name: 'Landscape', exact: true }).click();
    await d.getByRole('button', { name: 'Line spacing', exact: true }).click();
    await d.getByRole('option', { name: 'Double', exact: true }).click();
    await text.click();
    await d.getByRole('slider', { name: 'Zoom slider', exact: true }).fill('75');
    const state = await d.locator('.pg-paper').evaluate((el) => ({ width: el.style.width, zoom: getComputedStyle(el).zoom, spacing: el.style.getPropertyValue('--pg-line-height') }));
    if (state.width !== '1123px' || Number(state.zoom) !== 0.75 || state.spacing !== '2') throw new Error('Page setup or zoom did not apply: ' + JSON.stringify(state));
    // The shared provider batches changes for 120 ms; allow its autosave to complete.
    await d.waitForTimeout(250);
    await d.reload();
    await see(d, '[data-font][style*="19pt"]', 'the saved font size');
    const saved = await d.locator('.pg-paper').evaluate((el) => ({ width: el.style.width, spacing: el.style.getPropertyValue('--pg-line-height') }));
    if (saved.width !== '1123px' || saved.spacing !== '2') throw new Error('Page settings did not survive reload.');
    const zoom = d.getByRole('button', { name: 'Zoom percentage', exact: true });
    for (const mode of ['Fill width', 'Fit page']) {
      await zoom.click();
      await d.getByRole('option', { name: mode, exact: true }).click();
      const bounds = await d.locator('.pg-paper').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const desk = el.closest('.pg-desk').getBoundingClientRect();
        return { width: rect.width, height: rect.height, available: desk.width - 48, visibleHeight: innerHeight - Math.max(0, desk.top) - 112 };
      });
      if (bounds.width > bounds.available + 1 || (mode === 'Fit page' && bounds.height > bounds.visibleHeight + 1)) throw new Error(mode + ' exceeds the available viewing area: ' + JSON.stringify(bounds));
    }
    const contrast = await d.locator('.pg-paper').evaluate((el) => getComputedStyle(el).backgroundColor !== getComputedStyle(el.closest('.pg-desk')).backgroundColor);
    if (!contrast) throw new Error('The sheet blends into the document canvas.');
    await axe(d, 'Document page tools', A11Y_FOUND);
    return s;
  },
  'Document menus, page appearance and citations': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/dev.html?as=teacher&friday');
    await see(s.p, '.hm-hero', 'the fixture session');
    const d = await newFile(s, 'Collab document');
    await see(d, '.pg-paper', 'pages by default');
    await d.getByRole('menuitem', { name: 'Insert', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Picture…', exact: true }).hover();
    const highlight = await d.locator('.document-menu-popup .ctx-item').evaluateAll((rows) => rows.filter((el) => getComputedStyle(el).boxShadow !== 'none').map((el) => el.textContent));
    if (highlight.length !== 1 || !highlight[0].includes('Picture')) throw new Error('The pointer and keyboard highlight different menu rows.');
    await d.keyboard.press('ArrowDown');
    const keyboardHighlight = await d.locator('.document-menu-popup .ctx-item').evaluateAll((rows) => rows.filter((el) => getComputedStyle(el).boxShadow !== 'none').length);
    if (keyboardHighlight !== 1) throw new Error('The menu shows more than one selection highlight.');
    await d.keyboard.press('Escape');
    await d.getByRole('textbox', { name: 'Document text', exact: true }).fill('Reading notes ');
    await d.getByRole('menuitem', { name: 'Insert', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Cite a source…', exact: true }).click();
    await see(d, 'text=Classroom research', 'journal grouping');
    await see(d, 'a[aria-label="Open journal: Language teaching"]', 'the journal link');
    await d.getByRole('searchbox', { name: 'Find a source' }).fill('Thornbury');
    await d.getByRole('textbox', { name: 'Page (optional)', exact: true }).fill('24');
    await d.getByRole('button', { name: 'Thornbury (2006) An A–Z of ELT', exact: true }).click();
    await see(d, '.cite:has-text("Thornbury, 2006, p. 24")', 'the inserted citation');
    await d.getByRole('menuitem', { name: 'Insert', exact: true }).click();
    await d.getByRole('menuitem', { name: 'Cite a source…', exact: true }).click();
    await d.getByRole('button', { name: 'Add the reference list at the end', exact: true }).click();
    await d.getByRole('button', { name: 'Document mode', exact: true }).click();
    await d.getByRole('option', { name: 'Viewing', exact: true }).click();
    await see(d, '.cd-view .cite:has-text("Thornbury, 2006, p. 24")', 'the citation in viewing mode');
    await see(d, '.cd-view .reflist:has-text("An A–Z of ELT")', 'the reference list in viewing mode');
    await d.getByRole('button', { name: 'Document mode', exact: true }).click();
    await d.getByRole('option', { name: 'Editing', exact: true }).click();
    await d.setViewportSize({ width: 760, height: 850 });
    // ResizeObserver moves whole groups into More on the next rendering frame.
    // Wait for that layout update before asserting the same no-overflow invariant.
    await d.waitForFunction(() => {
      const el = document.querySelector('[role="toolbar"][aria-label="Formatting"]');
      return el && el.scrollWidth <= el.clientWidth && getComputedStyle(el).flexWrap === 'nowrap';
    }, null, { timeout: 5000 });
    for (const [label, expected] of [['white', 'rgb(255, 255, 255)'], ['black', 'rgb(25, 24, 22)']]) {
      await d.getByRole('menuitem', { name: 'View', exact: true }).click();
      await d.getByRole('menuitemradio', { name: 'Page colour: ' + label, exact: true }).click();
      const actual = await d.locator('.pg-paper').evaluate((el) => getComputedStyle(el).backgroundColor);
      if (actual !== expected) throw new Error('Incorrect page colour: ' + actual);
    }
    await d.reload();
    await see(d, '.pg-paper[data-paper-theme="black"]', 'the saved page appearance');
    await see(d, '.cite:has-text("Thornbury, 2006, p. 24")', 'the saved citation');
    await s.p.goto(BASE + '/dev.html?as=teacher&friday-brand');
    await see(s.p, '.hm-hero', 'the organisation-brand fixture');
    await d.reload();
    await d.waitForFunction(() => document.documentElement.dataset.orgBrand === 'true');
    const brand = await d.locator('.dp').evaluate((el) => getComputedStyle(el).getPropertyValue('--dp').trim());
    if (brand !== '#2f7f6f') throw new Error('Document accent did not follow organisation colour: ' + brand);
    await axe(d, 'Collab menus', A11Y_FOUND);
    return s;
  },
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
    for (const [label, sel] of [['Collab document', '.ProseMirror'], ['Flashcards', 'text=Design the cards'], ['Reading Journal', 'text=CITATION STYLE']]) {
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
    await s.p.click('.hq-sheet button:has-text("Make the organisation")');
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
    await s.p.click('.hq-sheet button:has-text("Make the class")');
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
  'Guide: open it from the apps and answer a question': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/classes`);
    await s.p.click('.apps-btn');
    await s.p.click('.apps-pop a[role=menuitem]:has-text("Guide")');
    await see(s.p, 'h1:has-text("A little help.")', 'the Guide');
    await axe(s.p, 'Guide', A11Y_FOUND);
    await s.p.getByRole('button', { name: 'Questions', exact: true }).click();
    await s.p.fill('input[aria-label="Gap 1"]', 'has lived');
    await s.p.locator('.gu-try', { hasText: 'present perfect' }).locator('button:has-text("Check")').click();
    await see(s.p, '.gu-result:has-text("1 of 2")', 'the gap fill marked');
    await s.p.click('.gu-nav-i:has-text("Language notation")');
    await see(s.p, '.gu-card', 'the sound cards');
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
  'Teacher onboarding and goal-based guide': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const f = JSON.parse(localStorage.getItem('mockfs'));
      f['users/teacher1'].onboarding = 'new';
      localStorage.setItem('mockfs', JSON.stringify(f));
    });
    await s.p.goto(BASE);
    await s.p.waitForURL('**/welcome');
    if (await s.p.getByRole('button', { name: 'Show my starting point' }).isEnabled()) throw new Error('Continue should need a choice');
    await s.p.getByRole('button', { name: 'Make a listening activity' }).click();
    await s.p.getByRole('button', { name: 'Show my starting point' }).click();
    await see(s.p, 'text=A recording you can reuse in your lessons.', 'the selected plan');
    await s.p.getByRole('button', { name: 'Show me how first' }).click();
    await s.p.waitForURL('**/guide?goal=audio');
    await see(s.p, '#guide-topic-title:has-text("Studio")', 'relevant guide topic');
    await s.p.goto(BASE);
    await see(s.p, '.hm', 'home after completing onboarding');
    await s.p.goto(BASE + '/guide');
    await see(s.p, '#guide-topic-title:has-text("Studio")', 'saved preference after reload');
    const picker = s.p.getByRole('button', { name: 'What would you like to do?', exact: true });
    await picker.click();
    await picker.press('End');
    await picker.press('Enter');
    await see(s.p, '.guide-next h2:has-text("A connection")', 'custom dropdown updates the goal');
    if (await s.p.locator('.gu-nav-i .ui-icon').count() !== 14) throw new Error('Guide topic icons missing');
    await s.p.getByRole('searchbox').fill('no such topic');
    await see(s.p, 'text=No matching topics', 'search empty state');
    await s.p.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/welcome', '/guide', '/tour']) {
      await s.p.goto(BASE + route);
      await see(s.p, 'h1', 'mobile heading');
      if (await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Mobile overflow: ' + route);
      await axe(s.p, 'Teacher start ' + route, A11Y_FOUND);
    }
    for (const width of [320, 390, 768, 1280]) {
      await s.p.setViewportSize({ width, height: 900 });
      await s.p.goto(BASE + '/guide');
      for (const topic of ['Colleagues', 'Your blend', 'Questions']) {
        await s.p.getByRole('button', { name: topic, exact: true }).click();
        if (await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Guide overflow at ' + width + ': ' + topic);
      }
      await picker.click();
      const fits = await s.p.getByRole('listbox', { name: 'What would you like to do?' }).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
      if (!fits) throw new Error('Goal dropdown overflows at ' + width);
      await picker.press('Escape');
      await s.p.goto(BASE + '/tour');
      await see(s.p, '.tour-paths', 'responsive public tour');
      const clipped = await s.p.locator('.gu-grid2 > *').evaluateAll(els => els.some(el => el.getBoundingClientRect().right > innerWidth + 1));
      if (clipped) throw new Error('Tour illustration clipped at ' + width);
    }
    await s.p.goto(BASE + '/welcome');
    await s.p.getByRole('button', { name: 'I’ll explore on my own' }).click();
    await see(s.p, '.hm', 'skip opens home');
    return s;
  },
  'An invitation that is gone': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/invite/nothing-here`);
    await see(s.p, 'text=isn’t there any more', 'the gone invitation');
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
      err = e.message.slice(0, 3500) + (s?.errors?.length ? '\n   ' + s.errors.slice(0, 2).join('\n   ') : '');
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

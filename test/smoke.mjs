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
  await p.waitForFunction(() => !!window.__mockReady, null, { timeout: 30000 });
  await p.evaluate(async () => { await window.__mockReady; });
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

async function openAssistant(p, section = 'help') {
  await p.getByRole('button', { name: 'Help', exact: true }).click();
  await p.getByRole('menuitem', { name: section === 'help' ? /Ask ELT Suite/ : /Discover/ }).click();
}

// ------------------------------------------------------------------ the journeys
const A11Y_FOUND = [];
const J = {
  'Classroom memories are opt-in and selected before generation': async (b) => {
    const s=await session(b);
    await s.p.evaluate(()=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['aiPilot/teacher1']={enabled:true};localStorage.setItem('mockfs',JSON.stringify(fs));});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    const toggle=s.p.getByLabel('Refer to learners’ previous responses');
    await toggle.waitFor();
    if(await toggle.isChecked()) throw Error('Memories must default off');
    await toggle.check();
    await s.p.getByRole('button',{name:'Read recent responses'}).click();
    const selection=s.p.getByLabel(/Alex · Travel stories/);
    await selection.waitFor();
    if(await selection.isChecked()) throw Error('Responses must not be preselected');
    await selection.check();
    await s.p.getByLabel('Learning objective',{exact:true}).fill('Planning a trip');
    await s.p.getByLabel('Learning objective',{exact:true}).fill('Make and compare plans.');
    await s.p.getByLabel('Context',{exact:true}).fill('Adult learners working in pairs.');
    await s.p.getByRole('button',{name:'Suggest an outline'}).click();
    await see(s.p,'text=2. Review the outline','memory outline');
    const request=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockAiLastRequest')));
    if(request.useLearnerMemories!==true || request.memoryIds?.[0]!=='a:q') throw Error('Selection not sent');
    s.p.on('dialog',d=>d.accept());
    await s.p.reload();
    await toggle.waitFor();
    if(await toggle.isChecked()) throw Error('Memory permission persisted unexpectedly');
    await axe(s.p,'Classroom memories',A11Y_FOUND);
    return s;
  },
  'New teacher signup, all starting points and save retry': async b => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['inviteCodes/ABCD-EF23'] = { code: 'ABCD-EF23', uses: 0, maxUses: 1, usedBy: {}, by: 'teacher1', byName: 'Arda', at: Date.now(), expires: 0 };
      localStorage.setItem('mockfs', JSON.stringify(fs));
      sessionStorage.removeItem('mockuid'); localStorage.removeItem('mockuid');
      sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'get', path: 'users/u', count: 1, delay: 1600 }]));
      sessionStorage.setItem('mockauth-profile-delay', '4000');
    });
    await s.p.goto(BASE + '/?code=ABCD-EF23');
    await see(s.p, 'h1:has-text("Make your teacher account")', 'signup from invitation');
    await s.p.getByRole('textbox', { name: 'Your name', exact: true }).fill('New Teacher');
    await s.p.getByRole('textbox', { name: 'Email', exact: true }).fill('new-teacher@example.com');
    await s.p.locator('input[type="password"]').fill('test-password-123');
    await s.p.getByRole('button', { name: 'Make my account', exact: true }).click();
    if (await s.p.locator('.welcome,.hm').count()) throw Error('Teacher UI opened before account setup completed');
    await s.p.waitForURL('**/welcome');
    console.log('Signup: profile confirmed and welcome opened');
    const uid = await s.p.evaluate(() => sessionStorage.getItem('mockuid'));
    const profile = await s.p.evaluate(id => JSON.parse(localStorage.getItem('mockfs'))['users/' + id], uid);
    if (profile.role !== 'teacher' || profile.displayName !== 'New Teacher') throw Error('New teacher profile was not confirmed');
    await s.p.getByRole('button', { name: 'Prepare my next lesson' }).click();
    await s.p.getByRole('button', { name: 'Show my starting point' }).click();
    await s.p.getByRole('button', { name: 'Change my choice' }).click();
    await s.p.getByRole('button', { name: 'Make a listening activity' }).click();
    await s.p.getByRole('button', { name: 'Show my starting point' }).click();
    await s.p.evaluate(id => sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'update', path: 'users/' + id, count: 1, code: 'unavailable' }])), uid);
    await s.p.getByRole('button', { name: 'Show me how first' }).click();
    await see(s.p, '[role="alert"]:has-text("Your choice is kept")', 'a failed connection retains the selection');
    await s.p.getByRole('button', { name: 'Show me how first' }).click();
    await s.p.waitForURL('**/guide?goal=audio');
    console.log('Signup: connection retry saved the goal');
    await s.p.waitForTimeout(4200); // a late sign-in display-name update must not reset onboarding
    await s.p.reload();
    await see(s.p, '#guide-topic-title:has-text("Studio")', 'saved choice after reloading');
    const saved = await s.p.evaluate(id => { const f = JSON.parse(localStorage.getItem('mockfs')); return { user: f['users/' + id], code: f['inviteCodes/ABCD-EF23'] }; }, uid);
    if (saved.code.uses !== 1 || saved.user.onboarding !== 'done' || saved.user.teacherGoal !== 'audio') throw Error('Setup was repeated or the goal was lost');
    for (const [title, target] of [['Prepare my next lesson', '/classes'], ['Make better materials', '/collab'], ['Get everyone involved', '/classes'], ['Make a listening activity', '/recordings'], ['Keep my reading organised', '/development?section=reading'], ['Work with other teachers', '/colleagues']]) {
      await s.p.goto(BASE + '/welcome');
      await s.p.getByRole('button', { name: title, exact: false }).click();
      await s.p.getByRole('button', { name: 'Show my starting point' }).click();
      await s.p.locator('.path-plan .btn.primary').click();
      await s.p.waitForURL(url => url.pathname + url.search === target);
      console.log('Signup: starting point opened ' + target);
      if (await s.p.locator('[role="alert"]:has-text("save your choice")').count()) throw Error('Onboarding save failed for ' + title);
    }
    await s.p.goto(BASE + '/welcome');
    await s.p.getByRole('button', { name: 'I’ll explore on my own' }).click();
    await see(s.p, '.hm', 'skip opens teacher home');
    await s.p.reload();
    await see(s.p, '.hm', 'completed signup stays complete');
    await s.p.evaluate(id => sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'get', path: 'users/' + id, count: 1, code: 'unavailable' }])), uid);
    await s.p.reload();
    await see(s.p, 'button:has-text("Retry account setup")', 'profile loading can recover without a fabricated account');
    if (await s.p.locator('.hm,.welcome').count()) throw Error('Teacher content opened with an unconfirmed profile');
    await axe(s.p, 'Teacher account setup recovery', A11Y_FOUND);
    await s.p.getByRole('button', { name: 'Retry account setup' }).click();
    await see(s.p, '.hm', 'retry reloads the real teacher profile');
    return s;
  },
  'Feature discovery is optional, private and based on completed workflows': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/');
    const launch = { click: () => openAssistant(s.p, 'discovery') };
    await launch.click();
    await s.p.getByRole('button', { name: 'Browse features first →', exact: true }).click();
    const iconsCentered = await s.p.locator('.discovery-feature-icon').evaluateAll(icons => icons.every(icon => {
      const box = icon.getBoundingClientRect(), svg = icon.querySelector('svg').getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - svg.left - svg.width / 2) < 1 && Math.abs(box.top + box.height / 2 - svg.top - svg.height / 2) < 1;
    }));
    if (!iconsCentered) throw Error('Discovery feature icons are not centered');
    const guides = await s.p.getByRole('button', { name: /^Show visual guide for / }).all();
    const labels = await Promise.all(guides.map(g => g.getAttribute('aria-label')));
    for (const label of labels) {
      await s.p.getByRole('button', { name: label, exact: true }).click();
      await see(s.p, '.discovery-visual-guide .discovery-art', 'illustrated workflow');
      await s.p.getByRole('button', { name: 'Next step', exact: true }).click();
      await s.p.getByRole('button', { name: 'Next step', exact: true }).click();
      if (!await s.p.getByRole('button', { name: 'Next step', exact: true }).isDisabled()) throw Error('Visual guide went past its final step');
      await s.p.getByRole('button', { name: 'Previous step', exact: true }).click();
      if (!await s.p.locator('.discovery-flow-tree li').nth(1).locator('button').getAttribute('aria-current')) throw Error('Step navigation did not update');
      if (label.endsWith('Lessons')) {
        await axe(s.p, 'Feature discovery visual flow', A11Y_FOUND);
        for (const width of [320, 390, 1280]) {
          await s.p.setViewportSize({ width, height: 844 });
          if (await s.p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Visual guide overflow at ' + width);
        }
      }
      await s.p.getByRole('button', { name: 'Back to discovery', exact: true }).click();
    }
    if (await s.p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mockfs') || '{}')).some(k => k.startsWith('featureDiscovery/')))) throw Error('Browsing a visual guide enabled tracking or wrote recommendation history');
    await s.p.getByRole('button', { name: 'For you', exact: true }).click();
    await s.p.getByRole('button', { name: 'Personalise my suggestions', exact: true }).click();
    await s.p.getByRole('button', { name: 'Show me how', exact: true }).click();
    await see(s.p, '.discovery-steps', 'verified feature walkthrough');
    await s.p.getByRole('button', { name: 'Your features', exact: true }).click();
    const lessons = s.p.locator('.discovery-feature').filter({ has: s.p.getByText('Lessons', { exact: true }) });
    if (!(await lessons.innerText()).includes('Not explored yet')) throw Error('Reading a guide fabricated feature adoption');
    await axe(s.p, 'Feature discovery usage', A11Y_FOUND);
    await s.p.getByRole('button', { name: 'Preferences', exact: true }).click();
    await s.p.getByLabel('Suggestion frequency', { exact: true }).selectOption('3');
    await s.p.getByRole('button', { name: 'Pause for 30 days', exact: true }).click();
    await see(s.p, 'text=Resume suggestions', 'suggestion pause');
    await axe(s.p, 'Feature discovery preferences', A11Y_FOUND);
    for (const width of [320, 390, 1280]) {
      await s.p.setViewportSize({ width, height: 800 });
      const fits = await s.p.locator('#discovery-panel').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
      if (!fits) throw Error('Discovery panel overflows at ' + width);
    }
    await s.p.getByRole('button', { name: 'Close feature discovery', exact: true }).click();
    const d = await newFile(s, 'Collab document');
    await see(d, '.ProseMirror', 'created Collab document');
    await d.close();
    await launch.click();
    await s.p.getByRole('button', { name: 'Your features', exact: true }).click();
    await see(s.p, '.discovery-feature:has-text("Collab"):has-text("Tried once")', 'successful workflow activation');
    await s.p.reload();
    await launch.click();
    await s.p.getByRole('button', { name: 'Preferences', exact: true }).click();
    if (await s.p.getByLabel('Suggestion frequency', { exact: true }).inputValue() !== '3') throw Error('Frequency preference was not saved');
    await see(s.p, 'text=Resume suggestions', 'pause survives reload');
    await s.p.getByLabel('Personalise suggestions', { exact: false }).uncheck();
    if (await s.p.getByLabel('Quiet suggestions', { exact: false }).isChecked()) throw Error('Opting out left proactive suggestions enabled');
    return s;
  },
  'Help assistant: verified answers, browsing, fallback and phone layout': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/');
    await openAssistant(s.p);
    const panel = s.p.getByRole('dialog', { name: 'ELT Suite assistant' });
    await panel.getByRole('button', { name: 'How do I record a lesson?', exact: true }).click();
    await panel.locator('.help-typing-dots').waitFor();
    await panel.getByRole('heading', { name: 'Make a listening recording' }).waitFor();
    await panel.getByRole('heading', { name: 'Turn a script into AI speech' }).waitFor();
    await panel.locator('.help-suggestion summary').click();
    await panel.getByText(/choose Draft with AI/).waitFor();
    if (await s.p.locator('.help-launch, .discovery-launch').count()) throw Error('Floating launchers still cover page content.');
    if (!await panel.getByText(/video-lesson recording.*not confirmed/).isVisible()) throw Error('Recording limitation was lost.');
    await panel.getByRole('button', { name: 'Yes, this helped' }).click();
    await panel.getByText('Feedback saved', { exact: true }).waitFor();
    await panel.getByLabel('Ask how to use ELT Suite', { exact: true }).fill('FAIL_TEST');
    await panel.getByRole('button', { name: 'Send help question' }).click();
    await panel.getByRole('heading', { name: 'Let’s find another way' }).waitFor();
    await panel.getByRole('button', { name: 'Browse topics', exact: true }).click();
    await panel.getByRole('searchbox').fill('files');
    await panel.locator('summary').filter({ hasText: 'Keep your resources together' }).click();
    await panel.getByRole('link', { name: 'Open Resources' }).waitFor();
    await panel.getByRole('button', { name: 'Ask a question', exact: true }).click();
    await panel.getByRole('button', { name: 'Clear chat' }).click();
    await panel.getByRole('heading', { name: 'How can I help?' }).waitFor();
    await axe(s.p, 'Help assistant desktop', A11Y_FOUND);
    await s.p.setViewportSize({ width: 390, height: 844 });
    await s.p.waitForTimeout(200);
    if (await panel.getAttribute('aria-modal') !== 'true') throw Error('Phone help must be modal.');
    const box = await panel.boundingBox();
    if (!box || box.x < 0 || box.width > 391 || box.height > 845) throw Error('Phone help overflows the viewport.');
    await axe(s.p, 'Help assistant phone', A11Y_FOUND);
    await panel.getByRole('button', { name: 'Close help' }).click();
    await s.p.getByRole('button', { name: 'Help', exact: true }).waitFor();
    await s.p.setViewportSize({ width: 1280, height: 900 });
    await openAssistant(s.p, 'discovery');
    await s.p.locator('#discovery-panel').waitFor();
    await openAssistant(s.p);
    await s.p.locator('#discovery-panel').waitFor({ state: 'hidden' });
    await panel.waitFor();
    return s;
  },

  'Authentication: signed-out teacher homepage': async (b) => {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(BASE + '/');
    await see(p, '#teacher-sign-in', 'teacher sign-in form');
    await see(p, '.so-item button', 'suite illustration');
    await p.reload();
    await see(p, '#teacher-sign-in', 'teacher sign-in after reload');
    if (new URL(p.url()).pathname !== '/') throw Error('Teacher homepage redirected');
    if (await count(p, '.app-err')) throw Error('Sign-in rendered an error');
    await axe(p, 'Teacher sign-in', A11Y_FOUND);
    if (errors.length) throw Error(errors.join('; '));
    return { ctx, errors };
  },
  'Authentication: teacher logout from protected page': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/classes');
    await s.p.getByRole('button', { name: 'Account', exact: true }).click();
    await s.p.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await see(s.p, '#teacher-sign-in', 'teacher sign-in after logout');
    if (new URL(s.p.url()).pathname !== '/') throw Error('Logout did not return home');
    await s.p.reload();
    await see(s.p, '#teacher-sign-in', 'logout persisted after reload');
    if (await count(s.p, '.app-err')) throw Error('Logout rendered an error');
    if (s.errors.length) throw Error(s.errors.join('; '));
    return s;
  },

  'Trainer studio is class-specific and creates native completion forms': async (b) => {
    const s=await session(b);
    await s.p.evaluate(({classId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['aiPilot/teacher1']={enabled:true};fs['classes/'+classId].kind='training';fs['classes/'+classId].level='CELTA';fs['classes/'+classId].trainingProfile={programme:'CELTA',stage:'Pre-service',experience:'New to teaching',goals:'Prepare for teaching practice',context:'Teachers beginning their first course',focus:'Checking instructions',examDate:''};localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/assistant');
    await s.p.getByRole('heading',{name:'Develop teachers. Shape their practice.'}).waitFor();
    await s.p.getByLabel('Learning objective',{exact:true}).fill('Checking instructions');
    await s.p.getByRole('button',{name:'Suggest an outline'}).click();
    await s.p.getByRole('button',{name:'Approve outline and make the plan'}).click();
    await s.p.getByRole('button',{name:'Prepare training activities'}).click();

    await see(s.p,'text=Trainee completion form:','trainer form preview');
    await s.p.getByRole('button',{name:'Create session in Classes'}).click();
    await s.p.getByRole('link',{name:'Open in Classes'}).click();
    await see(s.p,'text=Teaching move and intended learner outcome','native rehearsal form');
    await axe(s.p,'Trainer completion form',A11Y_FOUND);
    await s.p.evaluate(({classId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['classes/'+classId].kind='language';fs['classes/'+classId].level='B1';localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/assistant');
    await s.p.getByLabel('Learning objective',{exact:true}).waitFor();
    if(await s.p.getByRole('heading',{name:'Develop teachers. Shape their practice.'}).count()) throw Error('Trainer studio leaked into a language class');
    return s;
  },

  'Songs: lesson-linked brief, music styles, exact lyrics and timeline': async (b) => {
    const s=await session(b);await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher');
    await s.p.getByRole('button',{name:'Create song',exact:true}).click();
    const d=s.p.getByRole('dialog',{name:'Create a classroom song'});
    await d.getByRole('radio',{name:'Young learners',exact:true}).check();
    if(await d.getByRole('textbox',{name:'Language',exact:true}).count())throw Error('Language should be fixed to English');
    const names=await s.p.evaluate(({classId,itemId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));return {className:fs['classes/'+classId].name,title:fs['classes/'+classId+'/items/'+itemId].title};},s.demo);
    await d.getByLabel('Classroom',{exact:true}).click();await s.p.getByRole('option',{name:new RegExp(names.className)}).click();
    await d.getByLabel('Classroom lesson',{exact:true}).click();await s.p.getByRole('option',{name:names.title,exact:true}).click();
    await d.locator('.song-linked').waitFor();
    if(process.env.SONG_LESSON_SCREENSHOT)await s.p.screenshot({path:process.env.SONG_LESSON_SCREENSHOT});
    await axe(s.p,'Song learners and linked lesson',A11Y_FOUND);
    await d.getByRole('button',{name:'Next: music'}).click();await d.getByRole('radio',{name:'Acoustic',exact:true}).check();await d.getByRole('radio',{name:'30 seconds',exact:true}).check();
    if(process.env.SONG_MUSIC_SCREENSHOT)await s.p.screenshot({path:process.env.SONG_MUSIC_SCREENSHOT});
    await axe(s.p,'Song music style cards',A11Y_FOUND);
    await d.getByRole('button',{name:'Next: lyrics'}).click();await d.getByLabel('Song title',{exact:true}).fill('Morning song');
    const words='  Wake up!\nWake up!\nLet’s go.  ';await d.getByLabel('Lyrics',{exact:true}).fill(words);
    if(await d.getByRole('button',{name:'Create song',exact:true}).isEnabled())throw Error('Song started before lyric approval');
    await d.getByText('Help me write the lyrics',{exact:true}).click();if(!await d.getByRole('button',{name:'Draft lyrics',exact:true}).isEnabled())throw Error('A linked lesson should be sufficient to draft lyrics');await d.getByRole('button',{name:'Draft lyrics',exact:true}).click();
    await d.getByRole('button',{name:'Use these lyrics',exact:true}).waitFor();
    const lyricRequest=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockSongLastRequest')));
    if(lyricRequest.brief.lesson.classId!==s.demo.classId||lyricRequest.brief.lesson.itemId!==s.demo.itemId||lyricRequest.brief.language!=='English')throw Error('Lesson link did not reach lyric drafting');
    if(await d.getByLabel('Lyrics',{exact:true}).inputValue()!==words)throw Error('AI replaced lyrics before teacher review');
    await d.getByRole('button',{name:'Keep my current lyrics',exact:true}).click();await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();
    await d.getByRole('button',{name:'Back',exact:true}).click();await d.getByRole('radio',{name:'Pop',exact:true}).check();await d.getByRole('button',{name:'Next: lyrics'}).click();
    if(await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').isChecked())throw Error('Approval did not reset after a music change');
    await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();
    if(/ChatGPT|Google|Lyria|OpenAI/.test(await d.innerText()))throw Error('Provider names leaked into song creation');
    if(process.env.SONG_SCREENSHOT)await s.p.screenshot({path:process.env.SONG_SCREENSHOT});await axe(s.p,'Song lyric approval',A11Y_FOUND);
    await d.getByRole('button',{name:'Create song',exact:true}).click();await d.locator('audio').waitFor();
    const request=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockSongLastRequest')));if(request.name!=='recordingSong'||request.brief.lyrics!==words||request.approved!==true)throw Error('Approved lyrics changed');
    await d.getByRole('button',{name:'Add song to timeline',exact:true}).click();await d.waitFor({state:'hidden'});await s.p.getByRole('button',{name:'Script',exact:true}).click();await see(s.p,'.recording-script-rows textarea','song script');
    if(await s.p.locator('.recording-script-rows textarea').inputValue()!==words)throw Error('Timeline lost exact lyrics');return s;
  },
  'Songs: failures preserve words, completed previews recover and phone layout fits': async (b) => {
    const s=await session(b);await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher');await s.p.getByRole('button',{name:'Create song',exact:true}).click();let d=s.p.getByRole('dialog',{name:'Create a classroom song'});
    await d.getByRole('radio',{name:'Adults',exact:true}).check();await d.getByRole('button',{name:'Next: music'}).click();await d.getByRole('radio',{name:'Custom style',exact:true}).check();await d.getByLabel('Custom music style',{exact:true}).fill('FAIL_TEST');await d.getByRole('button',{name:'Next: lyrics'}).click();
    await d.getByLabel('Song title',{exact:true}).fill('Travel song');await d.getByLabel('Lyrics',{exact:true}).fill('Where shall we go?\nTake a train.');await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await d.getByRole('button',{name:'Create song',exact:true}).click();await d.getByRole('alert').waitFor();
    if(await d.getByLabel('Lyrics',{exact:true}).inputValue()!=='Where shall we go?\nTake a train.')throw Error('Failure lost lyrics');
    await d.getByRole('button',{name:'Back',exact:true}).click();await d.getByLabel('Custom music style',{exact:true}).fill('Jazz');await d.getByRole('button',{name:'Next: lyrics'}).click();await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await d.getByRole('button',{name:'Create song',exact:true}).click();await d.locator('audio').waitFor();
    await s.p.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('ll.songDraft:')&&JSON.parse(sessionStorage.getItem(k)).savedSong));
    await d.getByRole('button',{name:'Back',exact:true}).click();await d.getByRole('radio',{name:'Folk',exact:true}).check();await d.getByRole('button',{name:'Next: lyrics'}).click();
    await s.p.reload();await s.p.getByRole('button',{name:'Create song',exact:true}).click();d=s.p.getByRole('dialog',{name:'Create a classroom song'});await d.getByRole('button',{name:'Recover creation'}).click();await d.locator('audio').waitFor();
    if(!await d.locator('.song-brief-strip').getByText('Folk',{exact:true}).count())throw Error('Recovery overwrote a newer brief');
    await d.getByRole('button',{name:'Use this song’s settings'}).click();await d.getByRole('button',{name:'Back',exact:true}).click();if(await d.getByLabel('Custom music style',{exact:true}).inputValue()!=='Jazz')throw Error('Preview settings were not restored');
    await s.p.setViewportSize({width:390,height:844});await s.p.evaluate(()=>document.documentElement.dataset.theme='dark');
    if(await d.evaluate(el=>el.scrollWidth>el.clientWidth+2))throw Error('Song creator overflows on phone');await axe(s.p,'Song music on phone in dark mode',A11Y_FOUND);
    if(process.env.SONG_MOBILE_SCREENSHOT)await s.p.screenshot({path:process.env.SONG_MOBILE_SCREENSHOT});return s;
  },

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
    await s.p.locator('.task-editor .editor-host .ProseMirror').first().click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'AI conversation');
    await see(s.p,'.speak-setup','speaking practice in teacher training').catch(async e=>{throw Error(e.message+' '+(await s.p.locator('body').innerText()).slice(-5000)+' '+s.errors.join(';'));});
    return s;
  },
  'Speech: teacher setup, script writing, preview and speaker tracks': async (b) => {
    const s=await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await see(s.p,'.ProseMirror','the lesson editor');
    await s.p.getByRole('button',{name:'+ New task',exact:true}).click();
    await s.p.locator('.ProseMirror').nth(1).fill('At the airport, ask the airline representative to replace your damaged suitcase.');await s.p.keyboard.press('ControlOrMeta+End');await s.p.keyboard.press('Enter');await slash(s.p,'AI conversation');
    await see(s.p,'.speak-setup','the speaking task editor');
    if(!(await s.p.getByLabel('The situation',{exact:true}).inputValue()).includes('damaged suitcase')) throw Error('AI conversation lost its activity context');
    await s.p.locator('.save-state.saved').waitFor({state:'visible'});
    await s.p.getByLabel('Feedback focus source',{exact:true}).click();await s.p.getByRole('option',{name:'Let the learner choose',exact:true}).click();
    await s.p.getByRole('button',{name:'+ Feedback option',exact:true}).click();
    await s.p.getByLabel('Feedback option 3',{exact:true}).fill('Giving reasons');
    await s.p.getByRole('button',{name:'Save AI conversation',exact:true}).click();
    await see(s.p,'text=AI conversation saved and ready for learners.','saved speaking configuration');
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
    await s.p.getByLabel('Learning objective', { exact: true }).waitFor();
    await s.p.goto(BASE + '/admin?tab=ai');
    await s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true }).click();
    await see(s.p, '[role=status]:has-text("turned off")', 'revocation saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access revoked');
    return s;
  },
  'AI native reading, lists and subtasks survive the lesson editor': async (b) => {
    const s=await session(b);
    const {nativeTask}=await import('../functions/ai/activities.js');
    const oral={format:'discussion',acceptedAnswers:[],prompt:'Which place would you choose?',options:[],answer:'Any justified choice.',explanation:'Listen for a reason.'};
    const task={stageId:'s',title:'Read and compare',format:'reading',minutes:15,instructions:'Read the message.',input:'Summary',blocks:[{kind:'email',title:'From Alex',text:'Shall we visit the museum on Saturday?',items:[]}],visuals:[],roles:[],versions:[],questions:[],teacherOnlyInput:'',teacherNotes:'Monitor pairs.',support:'',challenge:'',subTasks:[{instructions:'Talk to your partner.',input:'',blocks:[],visuals:[],questions:[oral,{...oral,prompt:'Why?'}]}]};
    const native=nativeTask(task,0);
    await s.p.evaluate(({classId,native})=>{
      const fs=JSON.parse(localStorage.getItem('mockfs'));
      const base='classes/'+classId+'/items/ai-native-shapes';
      fs[base]={type:'lesson',title:'Native shapes',order:99,hidden:true,locked:false,taskCount:1};
      fs[base+'/tasks/read']={kind:'task',title:'Read and compare',instructions:'Read the message.',content:native.content,order:0,hidden:false,locked:false};
      fs[base+'/tasks/read/private/key']={key:native.key};
      localStorage.setItem('mockfs',JSON.stringify(fs));
    },{classId:s.demo.classId,native});
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/lesson/ai-native-shapes');
    await s.p.getByText('Shall we visit the museum on Saturday?',{exact:true}).first().waitFor();
    await s.p.getByLabel('Instruction for sub-task a',{exact:true}).fill('Compare your ideas.');
    await s.p.locator('.subtask-node ol li').first().waitFor();
    if(await s.p.locator('.writing-node').count()) throw Error('Oral prompts became writing responses');
    await s.p.waitForTimeout(1000);
    await s.p.reload();
    await s.p.getByLabel('Instruction for sub-task a',{exact:true}).waitFor();
    if(await s.p.getByLabel('Instruction for sub-task a',{exact:true}).inputValue()!=='Compare your ideas.') throw Error('Subtask edit did not survive reload');
    await s.p.locator('.subtask-node ol li').nth(1).waitFor();
    await axe(s.p,'AI native reading and subtasks',A11Y_FOUND);
    return s;
  },
  'Lesson assistant approval, private save and reopen': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs = JSON.parse(localStorage.getItem('mockfs')); fs['aiPilot/teacher1'] = { enabled: true }; localStorage.setItem('mockfs', JSON.stringify(fs)); });
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    const topicBox=s.p.getByLabel('Learning objective',{exact:true});
    await topicBox.waitFor({state:'visible'}).catch(async e=>{throw Error(e.message+' '+s.errors.join('; ')+' '+(await s.p.locator('body').innerText()).slice(0,600));});
    await s.p.locator('.ai-context > summary').first().click();
    await s.p.getByLabel('Course type',{exact:true}).selectOption('Academic English');
    await s.p.getByLabel('Course goals',{exact:true}).fill('Compare academic arguments.');
    if(await s.p.getByLabel('Learning objective',{exact:true}).inputValue()!=='Compare academic arguments.') throw Error('Shared goals did not update the default brief');
    await s.p.getByLabel('Learning objective',{exact:true}).fill('Keep my lesson-specific objective.');
    await s.p.getByLabel('Course goals',{exact:true}).fill('Evaluate evidence.');
    if(await s.p.getByLabel('Learning objective',{exact:true}).inputValue()!=='Keep my lesson-specific objective.') throw Error('Shared goals overwrote a customized brief');
    await s.p.getByRole('button',{name:'Save to class settings'}).click();
    await see(s.p,'text=Class settings updated.','profile save');
    await s.p.getByRole('button',{name:'Exam Assess clearly and fairly'}).click();
    await s.p.getByLabel('Exam conditions',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Homework Extend learning beyond class'}).click();
    await s.p.getByLabel('Independent-work instructions',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Practice Retrieve, repeat and improve'}).click();
    await s.p.getByLabel('Practice setup',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Lesson Explore, practise and communicate'}).click();
    const shortHeight=await topicBox.evaluate(el=>el.getBoundingClientRect().height);
    if(shortHeight>70) throw Error('Empty brief field is not compact');
    await topicBox.fill('Travel\nFood\nWork\nStudy');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)<=shortHeight) throw Error('Brief field did not expand');
    await topicBox.fill('Travel');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)>shortHeight+2) throw Error('Brief field did not shrink');
    await s.p.getByLabel('Learning objective', { exact: true }).fill('Compare options and agree on a trip.');
    await s.p.getByLabel('Context', { exact: true }).fill('Adult B1 class working in pairs.');
    await s.p.getByRole('button', { name: 'Suggest an outline' }).click();
    await see(s.p, 'text=2. Review the outline', 'outline approval');
    await s.p.getByRole('table',{name:'Lesson stages'}).waitFor();
    await s.p.getByLabel('Stage 1: Title',{exact:true}).fill('Plan a trip together');
    if(await s.p.getByLabel('Stage 1: Title',{exact:true}).inputValue()!=='Plan a trip together') throw Error('Stage table edit was lost');
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
    await s.p.evaluate(()=>localStorage.setItem('mockAiPause','1'));
    await s.p.getByRole('button',{name:'Prepare class activities'}).click();
    await s.p.locator('.ai-generation').waitFor();
    const checkStay = async (action) => {
      const dialogPromise=s.p.waitForEvent('dialog');
      const actionPromise=action().catch(()=>{});
      const dialog=await dialogPromise;
      if(dialog.type()!=='beforeunload' && !dialog.message().includes('still being created')) throw Error('Missing generation-specific leave warning');
      await dialog.dismiss();
      await actionPromise;
      if(!s.p.url().includes('/assistant')) throw Error('Dismissing leave warning lost the planner');
    };
    await checkStay(()=>s.p.locator('.ai-generation').getByRole('link',{name:'Back to class',exact:true}).click());
    await checkStay(()=>s.p.goBack({timeout:1500}));
    const reloadDialog=s.p.waitForEvent('dialog');
    const reload=s.p.reload({timeout:3000}).catch(()=>{});
    const unload=await reloadDialog;
    if(unload.type()!=='beforeunload') throw Error('Missing reload protection during saved-plan generation');
    await unload.dismiss();await reload;
    await s.p.evaluate(()=>localStorage.removeItem('mockAiPause'));
    await see(s.p,'text=04 · CLASS ACTIVITIES','activity review');

    await s.p.getByRole('table',{name:'Travel options'}).waitFor();
    await s.p.getByText('Supported · alternative task',{exact:true}).click();
    await s.p.getByText('Choose a trip. Complete the sentence.',{exact:true}).waitFor();
    await axe(s.p,'Visual and differentiated activity preview',A11Y_FOUND);
    if(await s.p.getByRole('heading',{name:'3. Review and edit'}).count()) throw Error('Step 3 remains visible in step 4');
    await s.p.getByRole('button',{name:'← Back to teaching plan'}).click();
    if(await s.p.locator('.ai-ready').count()) throw Error('Step 4 remains visible in step 3');
    await s.p.getByRole('textbox',{name:'Main aim',exact:true}).fill('Choose and justify a trip with clear reasons');
    await s.p.getByRole('button',{name:'Prepare class activities'}).click();
    await see(s.p,'text=04 · CLASS ACTIVITIES','rebuilt activity review');
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
    await s.p.getByLabel('Learning objective', { exact: true }).waitFor();
    await s.p.goto(BASE + '/admin?tab=ai');
    await s.p.getByRole('switch', { name: 'AI access for teacher@example.com', exact: true }).click();
    await see(s.p, '[role=status]:has-text("turned off")', 'revocation saved');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/assistant`);
    await see(s.p, 'text=The pilot is not enabled yet.', 'access revoked');
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
    const editor = s.p.locator('.task-editor .ProseMirror').first();
    await see(s.p, '.task-editor .ProseMirror', 'the lesson editor');
    await axe(s.p, 'Lesson editor', A11Y_FOUND);
    // The demo contains editable draw-cards. Ctrl+End does not leave a card on macOS:
    // use the browser platform's document-end shortcut so this is a top-level diagram.
    const endKey = await s.p.evaluate(() => navigator.platform.startsWith('Mac') ? 'Meta+ArrowDown' : 'Control+End');
    await editor.click();
    await editor.press(endKey);
    await slash(s.p, 'Flow chart');
    if (!(await count(s.p, '.dg-node'))) {
      await editor.click();
      await editor.press(endKey);
      await slash(s.p, 'Flow chart');
    }
    await see(s.p, '.dg-node', 'the diagram in the editor');
    const diagramId = await editor.evaluate(el => el.editor.getJSON().content.find(n => n.type === 'diagram')?.attrs.id);
    if (!diagramId) throw new Error('The diagram was not inserted at the task’s top level');
    await s.p.locator('.dg-node .dg-cell-body p').nth(1).click();
    await s.p.keyboard.press('End');
    await s.p.keyboard.type(' and ');
    await slash(s.p, 'Gap fill');
    const answers = s.p.getByRole('textbox', { name: 'Right answers, separated by |', exact: true });
    await answers.fill('coffee');
    await answers.press('Enter');
    const original = await editor.evaluate((el, id) => el.editor.getJSON().content.find(n => n.attrs?.id === id), diagramId);
    const gaps = [];
    const visit = n => { if (n.type === 'gap') gaps.push(n); (n.content ?? []).forEach(visit); };
    visit(original);
    if (gaps.length !== 1 || gaps[0].attrs.answers[0] !== 'coffee') throw new Error('The accepted answer is not saved inside the diagram');
    const gapId = gaps[0].attrs.id;
    await s.p.waitForFunction(({ diagramId, gapId }) => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      return Object.entries(fs).some(([path, value]) => value.content?.content?.some(n => n.type === 'diagram' && n.attrs.id === diagramId) && fs[path + '/private/key']?.[gapId]?.answers?.includes('coffee'));
    }, { diagramId, gapId });
    await s.p.reload();
    await see(s.p, '.dg-node', 'the diagram after reloading');
    await s.p.waitForFunction(({ diagramId, original }) => {
      const editor = document.querySelector('.task-editor .ProseMirror')?.editor;
      return JSON.stringify(editor?.getJSON().content.find(n => n.attrs?.id === diagramId)) === original;
    }, { diagramId, original: JSON.stringify(original) });
    await s.p.keyboard.press('Control+Shift+P');
    const gap = s.p.locator(`.dg [data-qid="${gapId}"] input`);
    await gap.waitFor({ state: 'visible' });
    await gap.fill('coffee');
    for (const style of ['young', 'adult']) {
      await s.p.evaluate(async ({ classId, style }) => {
        const { getClass, updateClass } = await import('/src/lib/classes.ts');
        await updateClass(await getClass(classId), { lessonStyle: style });
      }, { classId: s.demo.classId, style });
      await see(s.p, `.task-frame[data-lesson-style="${style}"] .dg [data-qid="${gapId}"] input`, 'the nested gap after changing lesson style');
      if (await gap.inputValue() !== 'coffee') throw new Error('Changing lesson style reset the nested answer');
    }
    await s.p.getByRole('button', { name: 'Check answers', exact: true }).click();
    await see(s.p, '.dg .gap-result .ans.right:has-text("coffee")', 'the nested answer scored correctly in learner preview');
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
  'Slow teacher profile setup recovers without opening an unfinished account': async b => {
    const s = await session(b);
    await s.p.evaluate(() => {
      const fs = JSON.parse(localStorage.getItem('mockfs'));
      fs['inviteCodes/SLOW-AB23'] = { uses: 0, maxUses: 1, usedBy: {}, by: 'teacher1', at: Date.now(), expires: 0 };
      localStorage.setItem('mockfs', JSON.stringify(fs));
      sessionStorage.removeItem('mockuid'); localStorage.removeItem('mockuid');
      sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'transaction', path: '', count: 1, delay: 18000 }]));
    });
    await s.p.goto(BASE + '/?code=SLOW-AB23');
    await see(s.p, 'h1:has-text("Make your teacher account")', 'the signup form').catch(async e => { throw Error(e.message + ' ' + (await s.p.locator('body').innerText()).slice(0, 1000)); });
    await s.p.getByRole('textbox', { name: 'Your name', exact: true }).fill('Slow Teacher');
    await s.p.getByRole('textbox', { name: 'Email', exact: true }).fill('slow-teacher@example.com');
    await s.p.locator('input[type="password"]').fill('test-password-123');
    await s.p.getByRole('button', { name: 'Make my account', exact: true }).click();
    await see(s.p, 'button:has-text("Retry account setup")', 'slow setup recovery', 25000);
    if (await s.p.locator('.hm,.welcome').count()) throw Error('A slow setup opened teacher content before its profile existed');
    await s.p.getByRole('button', { name: 'Retry account setup' }).click();
    await s.p.waitForURL('**/welcome');
    await s.p.getByRole('button', { name: 'I’ll explore on my own' }).click();
    await see(s.p, '.hm', 'slow setup completed');
    const uses = await s.p.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['inviteCodes/SLOW-AB23'].uses);
    if (uses !== 1) throw Error('Retry spent the invitation more than once');
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
  'Development Studio chat profile setup and settings persist': async b => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs=JSON.parse(localStorage.getItem('mockfs')); fs['aiPilot/teacher1']={enabled:true}; localStorage.setItem('mockfs',JSON.stringify(fs)); });
    await s.p.goto(BASE + '/development?section=coach');
    await see(s.p, 'text=Let’s start with your teaching', 'first-chat profile setup');
    if (await s.p.getByLabel('Message your coach').count()) throw Error('Coach allowed chat before profile completion');
    await s.p.locator('.qualifications-picker > summary:visible').click();
    await s.p.getByRole('checkbox',{name:'CELTA',exact:true}).check();
    await s.p.getByRole('checkbox',{name:'TKT Module 1',exact:true}).check();
    await s.p.getByRole('checkbox',{name:'Other',exact:true}).check();
    await s.p.getByRole('button',{name:'Done',exact:true}).filter({visible:true}).click();
    await s.p.getByLabel('Specify your other course or qualification').fill('Local mentoring course');
    await s.p.getByRole('button',{name:'Teaching experience',exact:true}).click();
    await s.p.getByRole('option',{name:'10+ years',exact:true}).click();
    await s.p.getByRole('checkbox', {name:'Teacher',exact:true}).check();
    await s.p.getByLabel('Who do you teach?', {exact:true}).fill('Adult learners at B1');
    await s.p.getByRole('button', {name:'Continue to teaching beliefs',exact:true}).click();
    await see(s.p,'text=What guides your teaching?','beliefs required before chat');
    if(await s.p.getByLabel('Message your coach').count()) throw Error('Chat allowed without beliefs');
    for(const question of ['How do learners learn best?','What is your role in the classroom?','How should feedback support learning?','What makes learning meaningful and inclusive?','How do you know learning is happening?']) await s.p.getByLabel(question,{exact:true}).fill('I am exploring this through my teaching and observation.');
    await s.p.getByRole('button',{name:'Save beliefs and start chatting',exact:true}).click();
    await see(s.p, 'textarea[aria-label="Message your coach"]', 'chat composer after setup');
    await s.p.getByLabel('Message your coach').fill('My lesson changed direction.');
    await s.p.getByLabel('Message your coach').press('Enter');
    await see(s.p, '.coach-message:has-text("What did you notice")', 'chat reply');
    const initialComposerHeight = await s.p.getByLabel('Message your coach').evaluate(el=>el.clientHeight);
    if(initialComposerHeight>44) throw Error('Composer does not begin on one line');
    await s.p.getByLabel('Message your coach').fill(Array(12).fill('A longer message with a new line.').join('\n'));
    const expanded=await s.p.getByLabel('Message your coach').evaluate(el=>el.clientHeight);
    if(expanded<=initialComposerHeight || expanded>162) throw Error('Composer did not grow within its limit');
    await s.p.getByLabel('Message your coach').fill('');
    for(let i=0;i<8;i++) {
      await s.p.getByLabel('Message your coach').fill('Classroom observation '+i+': '+ 'I noticed different patterns in participation. '.repeat(12));
      await s.p.getByRole('button',{name:'Send',exact:true}).click();
      await s.p.getByRole('button',{name:'Send',exact:true}).waitFor({state:'visible'});
      await s.p.waitForFunction(()=>!document.querySelector('.coach-chat-typing'));
    }
    for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:720},{width:1440,height:900},{width:844,height:390}]) {
      await s.p.setViewportSize(size);
      const box=await s.p.locator('.coach-chat-thread').boundingBox();
      await s.p.mouse.move(box.x+box.width/2,box.y+box.height/2);
      for(let step=0;step<12;step++){await s.p.mouse.wheel(0,-1000);await s.p.waitForTimeout(50);if(await s.p.locator('.coach-chat-thread').evaluate(el=>el.scrollTop<2))break;}
      await s.p.waitForFunction(()=>document.querySelector('.coach-chat-thread').scrollTop<2).catch(async()=>{throw Error('Cannot reach conversation start '+JSON.stringify({size,scroll:await s.p.locator('.coach-chat-thread').evaluate(el=>({top:el.scrollTop,h:el.clientHeight,total:el.scrollHeight}))}));});
      const up=await s.p.evaluate(()=>({page:document.documentElement.scrollHeight,view:innerHeight,send:document.querySelector('.coach-chat-composer').getBoundingClientRect().bottom,mark:document.querySelector('.suite-mark').getBoundingClientRect().left,chat:document.querySelector('.coach-chat').getBoundingClientRect().left}));
      if(up.page>up.view+1||up.send>up.view||Math.abs(up.mark-up.chat)>1) throw Error('Viewport, composer or alignment failed '+JSON.stringify({size,up}));
      for(let step=0;step<12;step++){await s.p.mouse.wheel(0,1000);await s.p.waitForTimeout(50);if(await s.p.locator('.coach-chat-thread').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<3))break;}
      await s.p.waitForFunction(()=>{const el=document.querySelector('.coach-chat-thread');return el.scrollHeight-el.clientHeight-el.scrollTop<3;}).catch(async()=>{throw Error('Cannot reach conversation end '+JSON.stringify({size,scroll:await s.p.locator('.coach-chat-thread').evaluate(el=>({top:el.scrollTop,h:el.clientHeight,total:el.scrollHeight}))}));});
      await s.p.locator('.coach-chat-thread').focus();
      await s.p.keyboard.press('Home');
      await s.p.waitForFunction(()=>document.querySelector('.coach-chat-thread').scrollTop<2).catch(async()=>{throw Error('Cannot reach conversation start '+JSON.stringify({size,scroll:await s.p.locator('.coach-chat-thread').evaluate(el=>({top:el.scrollTop,h:el.clientHeight,total:el.scrollHeight}))}));});
      await s.p.keyboard.press('End');
      await s.p.waitForFunction(()=>{const el=document.querySelector('.coach-chat-thread');return el.scrollHeight-el.clientHeight-el.scrollTop<3;}).catch(async()=>{throw Error('Cannot reach conversation end '+JSON.stringify({size,scroll:await s.p.locator('.coach-chat-thread').evaluate(el=>({top:el.scrollTop,h:el.clientHeight,total:el.scrollHeight}))}));});
    }
    await s.p.setViewportSize({width:1280,height:900});
    await s.p.getByLabel('Message your coach').fill('Yes, draft a journal reflection.');
    await s.p.getByRole('button',{name:'Send',exact:true}).click();
    await see(s.p,'.coach-chat-typing','thinking indicator');
    await s.p.getByRole('button',{name:'Review journal draft',exact:true}).click();
    const review=s.p.getByRole('dialog',{name:'Review journal draft'});
    await review.getByLabel('Your reflection',{exact:true}).fill('My edited reflection: I want to consider other explanations.');
    await review.getByRole('button',{name:'Save to reflections',exact:true}).click();
    await see(s.p,'text=Saved privately to Reflections.','journal saved directly');
    const savedDraft=await s.p.evaluate(()=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).find(([key,value])=>key.startsWith('teachingCoach/teacher1/reflections/')&&value.text==='My edited reflection: I want to consider other explanations.')?.[1]);
    if(!savedDraft?.content) throw Error('Edited journal draft or rich content missing');
    if(process.env.COACH_CHAT_SCREENSHOT) await s.p.screenshot({path:process.env.COACH_CHAT_SCREENSHOT});
    await s.p.getByRole('button', {name:'Reading',exact:true}).click();
    await s.p.getByRole('button', {name:'Coach',exact:true}).click();
    await see(s.p, '.coach-message:has-text("What did you notice")', 'chat retained between Studio sections');
    await s.p.getByRole('link', {name:'Settings',exact:true}).click();
    await s.p.getByRole('checkbox', {name:/^Professional profile/}).uncheck();
    await s.p.waitForFunction(() => JSON.parse(localStorage.getItem('mockfs'))['teachingCoach/teacher1/settings/context']?.profile === false);
    await s.p.reload();
    await s.p.waitForFunction(()=>{const input=document.querySelector('.coach-preference-options input');return input && !input.disabled;});
    if (await s.p.getByRole('checkbox', {name:/^Professional profile/}).isChecked()) throw Error('Saved context opt-out was not retained');
    await s.p.goto(BASE+'/development?section=coach');
    for (const width of [320,390,1280]) {
      await s.p.setViewportSize({width,height:900});
      await axe(s.p,'Development Studio chat '+width,A11Y_FOUND);
      if (await s.p.locator('.coach-chat').evaluate(el => el.getBoundingClientRect().right > innerWidth+1)) throw Error('Chat overflows at '+width);
      await s.p.getByRole('button',{name:'Apps',exact:true}).click();
      const fits=await s.p.locator('.app-name-wrap').evaluate(el => el.scrollWidth <= el.clientWidth+1 && getComputedStyle(el).whiteSpace !== 'nowrap');
      if (!fits) throw Error('Development Studio label is clipped at '+width);
      await s.p.getByRole('button',{name:'Apps',exact:true}).click();
    }
    return s;
  },
  'Development Studio reading, private writing and classroom inquiry': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs = JSON.parse(localStorage.getItem('mockfs')); delete fs['aiPilot/teacher1']; fs['sharedDocs/existing-reading'] = {owner:'teacher1',ownerName:'Arda',title:'Classroom interaction notes',kind:'pd',docKey:'reading-test',members:{colleague:{role:'edit',name:'Colleague',kind:'teacher'}},memberIds:['colleague']}; localStorage.setItem('mockfs', JSON.stringify(fs)); });
    await s.p.goto(BASE + '/development');
    await see(s.p, 'h1:has-text("Development Studio")', 'development workspace');
    await s.p.getByRole('button', { name: 'Reading', exact: true }).click();
    await see(s.p, '.af-embedded h2:has-text("Reading")', 'embedded reading library');
    if (await s.p.locator('.topbar').count() > 1) throw Error('Reading has a duplicate application header');
    await see(s.p, '.af-open:has-text("Classroom interaction notes")', 'existing reading journal');
    const [readingTab] = await Promise.all([s.ctx.waitForEvent('page'), s.p.locator('.af-open:has-text("Classroom interaction notes")').click()]);
    await see(readingTab, 'text=CITATION STYLE', 'existing reading editor');
    await readingTab.setViewportSize({ width: 390, height: 844 });
    const readingFits = await readingTab.locator('.pd-main').evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 250 && r.right <= innerWidth + 1; });
    if (!readingFits) throw Error('Reading notes are squeezed off-screen on mobile');
    const readingActionsFit = await readingTab.locator('.dp-acts').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1);
    if (!readingActionsFit) throw Error('Reading return and reflection controls overflow');
    await axe(readingTab, 'Development Studio reading editor on mobile', A11Y_FOUND);

    await readingTab.getByRole('link', { name: 'Back to Development Studio', exact: true }).click();
    await see(readingTab, '.af-embedded', 'reading editor returns to Development Studio');
    await readingTab.close();
    await s.p.getByRole('button', { name: 'Home', exact: true }).click();
    await s.p.getByRole('button', { name: 'Reflect on this', exact: true }).click();
    await s.p.getByLabel('Your reflection', { exact: true }).fill('This reading raises a question about my own classroom.');
    await s.p.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await see(s.p, 'button.coach-entry:has-text("On Classroom interaction notes")', 'reflection linked to reading');
    await s.p.getByRole('button', { name: 'Profile and beliefs', exact: true }).click();
    await s.p.getByLabel('Professional goals, specialisms and interests').fill('Understand participation in speaking activities.');
    await s.p.locator('.qualifications-picker > summary:visible').click();
    await s.p.getByRole('checkbox',{name:'No formal qualification',exact:true}).check();
    await s.p.getByRole('button',{name:'Done',exact:true}).filter({visible:true}).click();
    for(const question of ['How do learners learn best?','What is your role in the classroom?','How should feedback support learning?','What makes learning meaningful and inclusive?','How do you know learning is happening?']) await s.p.getByLabel(question,{exact:true}).fill('I am exploring this through my teaching and observation.');
    await s.p.getByRole('button',{name:'Years of teaching experience',exact:true}).click();
    await s.p.getByRole('option',{name:'3–5',exact:true}).click();
    await s.p.getByLabel('Your learners and teaching context').fill('Adults learning English at B1');
    await s.p.getByRole('checkbox', { name: 'Teacher', exact: true }).check();

    await s.p.getByRole('button', { name: 'Save profile and beliefs', exact: true }).click();
    await see(s.p, 'text=Saved privately.', 'saved professional profile');
    await s.p.reload();
    if (await s.p.getByLabel('Professional goals, specialisms and interests').inputValue() !== 'Understand participation in speaking activities.') throw Error('Profile failed to reopen after reload');

    await s.p.getByRole('button', { name: 'Reflections', exact: true }).click();
    await s.p.getByRole('button', { name: 'Write a reflection', exact: true }).click();
    await s.p.getByLabel('Title', { exact: true }).fill('Preparation time and participation');
    await s.p.getByLabel('Your reflection', { exact: true }).fill('More learners volunteered after a minute to think. I wonder what else changed.').catch(async e => { throw Error('New reflection: ' + e.message + '\n' + await s.p.locator('main').innerText()); });
    await s.p.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await see(s.p, 'button.coach-entry:has-text("Preparation time and participation")', 'saved reflection');
    await s.p.reload();
    await s.p.getByRole('button', { name: 'Reflections', exact: true }).click();
    await s.p.getByLabel('Find a reflection').fill('participation');
    await s.p.getByRole('button', { name: /Preparation time and participation/ }).click();
    await s.p.getByLabel('Your reflection', { exact: true }).fill('I also changed the task. That may have affected participation.').catch(async e => { throw Error('Reopened reflection: ' + e.message + '\n' + await s.p.locator('main').innerText()); });
    await s.p.getByRole('button', { name: 'Save reflection', exact: true }).click();
    await s.p.getByRole('button', { name: 'Research', exact: true }).click();
    await s.p.getByRole('button', { name: 'Plan an inquiry', exact: true }).click();
    await s.p.getByLabel('Your classroom question', { exact: true }).fill('Does preparation time affect participation?');
    await s.p.getByLabel('What happens now?', { exact: true }).fill('Observe the number of volunteers across two lessons.');
    await s.p.getByRole('button', { name: '2. Evidence and ethics', exact: true }).click();
    await s.p.getByLabel('Consent, anonymity and care', { exact: true }).fill('Seek consent and record anonymous totals only.');
    await s.p.getByRole('button', { name: 'Save inquiry', exact: true }).click();
    await see(s.p, 'button.coach-entry:has-text("Does preparation time")', 'saved inquiry');
    await s.p.getByRole('button', { name: 'Home', exact: true }).click();
    await s.p.getByRole('button', { name: 'View my timeline', exact: true }).click();
    if (await s.p.locator('.coach-timeline article').count() !== 3) throw Error('Reflection and inquiry missing from timeline');
    for (const width of [390, 1280]) {
      await s.p.setViewportSize({ width, height: 900 });
      await axe(s.p, 'Teaching coach at ' + width, A11Y_FOUND);
      const overflow = await s.p.locator('.coach-panel').evaluate(el => el.getBoundingClientRect().right > innerWidth + 1);
      if (overflow) throw Error('Coach content overflows on mobile');
    }
    let frame;
    for(const tab of ['Home','Reflections','Reading','Research','Coach']) {
      await s.p.getByRole('button',{name:tab,exact:true}).click();
      const bounds=await s.p.locator('main.coach').boundingBox();
      if(frame&&(Math.abs(bounds.width-frame.width)>1||Math.abs(bounds.height-frame.height)>1))throw Error('Studio tabs do not share a frame: '+tab);
      frame=bounds;
      if(tab==='Reading') {
        const fits=await s.p.getByRole('searchbox',{name:'Search Reading Journal'}).evaluate(el=>{const input=el.getBoundingClientRect(),parent=el.closest('label').getBoundingClientRect();return input.bottom<=parent.bottom+1&&input.right<=parent.right+1;});
        if(!fits)throw Error('Reading search input escapes its container');
      }
    }
    await s.p.getByRole('link', { name: 'Settings', exact: true }).click();
    for (const label of ['Professional profile','Teaching beliefs','Reflections','Research inquiries']) if (!(await s.p.getByRole('checkbox', { name: new RegExp('^'+label) }).isChecked())) throw Error('Coach context must be on by default: '+label);
    await s.p.goto(BASE+'/development?section=coach');
    await s.p.getByLabel('Message your coach').fill('What else could explain participation?');
    await s.p.getByRole('button', { name: 'Send', exact: true }).click();
    await see(s.p, '.coach-message:has-text("What did you notice")', 'reflective coaching reply');
    await s.p.getByRole('link',{name:'Settings',exact:true}).click();
    await s.p.getByRole('checkbox', { name: /^Teaching beliefs/ }).uncheck();
    await s.p.waitForFunction(() => JSON.parse(localStorage.getItem('mockfs'))['teachingCoach/teacher1/settings/context']?.beliefs === false);
    if (await s.p.locator('.coach-message').count()) throw Error('Changing coach settings did not clear the conversation');
    const preserved = await s.p.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['sharedDocs/existing-reading']);
    if (JSON.stringify(preserved.memberIds) !== JSON.stringify(['colleague'])) throw Error('Reading sharing was changed');
    if (process.env.DEVELOPMENT_SCREENSHOT) { await s.p.getByRole('button', { name: 'Home', exact: true }).click(); await s.p.screenshot({ path: process.env.DEVELOPMENT_SCREENSHOT, fullPage: false }); }
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
const vite = process.env.SMOKE_EXTERNAL_SERVER ? null : await up();
const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
// A first visit, so the server has prepared every page before the journeys start.
{
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/dev.html?seed&as=teacher`, { timeout: 180000 });
  await p.waitForFunction(() => !!window.__mockReady, null, { timeout: 180000 });
  await p.evaluate(async () => { await window.__mockReady; });
  await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 180000 });
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
    if (vite) process.kill(-vite.pid);
  } catch {
    vite?.kill();
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


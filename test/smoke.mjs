async function openPlanning(p){const details=p.locator('.lesson-support-tools');if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}
async function blankTask(p){const gap=p.locator('.task-insert').last();await gap.locator('summary').click();await gap.getByRole('button',{name:'New task',exact:true}).click();}
import {documentChrome,highlightJourney} from './tuesday-latest.mjs';
import {slidesCut} from './slides-cut.mjs';
import {resourcesLayout,fieldCut} from './resources-layout.mjs';
import {tuesdayForms,tuesdayCoach,tuesdayLinks} from './tuesday.mjs';
import {reviewAi,returnDuringAi,backgroundSongAudit,suiteCohesionAudit} from './cohesion.mjs';
// Smoke tests: the journeys teachers and learners take most, run in a real browser against the
// app with stand-ins for Firebase (test/vite.config.ts). Run with: npm run smoke
// Each journey fails on a crash in the page, a missing screen, or something that does not stay.
// With --a11y, each main screen is also checked for accessibility problems (axe-core).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { AI_FEATURES } from '../functions/ai/features.js';

const require = createRequire(import.meta.url);
const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.SMOKE_PORT || '5184'}`;
const LIVE_PUBLIC = BASE === 'https://eltsuite.com';
const A11Y = process.argv.includes('--a11y');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
if(process.env.SMOKE_BASE_URL && (!LIVE_PUBLIC || ONLY !== 'Public homepage')) throw Error('Live checks only support the isolated public homepage journey on eltsuite.com.');
const OWNER = 'ardanurioglu@gmail.com';

// ------------------------------------------------------------------ the app
async function up() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', new URL(BASE).port], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) {
      // Finish the editor dependency prebundle before any browser context loads a
      // second ProseMirror copy. The first transform can otherwise trigger a
      // Vite reload halfway through a later document-export journey.
      const editorModule = await fetch(BASE + '/test/document-tools-check.ts').then((r) => r.ok ? r.text() : '', () => '');
      if (editorModule.includes('@tiptap_core.js')) return vite;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The test server did not start:\n' + log);
}

// ------------------------------------------------------------------ helpers
const NOISE = [/Future Flag/, /Failed to load resource/, /ERR_TUNNEL|ERR_NAME|ERR_INTERNET|net::/, /Download the React DevTools/];
let activeSession;
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
  await p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return true;},null,{timeout:180000});
  await p.waitForLoadState('networkidle');
  await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 30000 });
  if (owner) await p.evaluate((e) => { const a = JSON.parse(localStorage.getItem('mockauth')); a.teacher1.email = e; localStorage.setItem('mockauth', JSON.stringify(a)); }, OWNER);
  if (as !== 'teacher') await p.goto(`${BASE}/dev.html?as=${as}`);
  const demo = await p.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
  activeSession={ctx,p,errors,demo};return activeSession;
}
const see = async (p, sel, what, timeout = 15000) => {
  try {
    await p.locator(sel).first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`Not shown: ${what} (${sel})`);
  }
};
const count = (p, sel) => p.locator(sel).count();
async function newFile(s, label, paged=true) {
  await s.p.goto(`${BASE}/archive`);
  await see(s.p, 'text=+ New', 'the New button in Files');
  await s.p.click('text=+ New');
  const [tab] = await Promise.all([s.ctx.waitForEvent('page'), s.p.click(`[role=menuitem]:has-text("${label}")`)]);
  await tab.waitForLoadState();
  if(label==='Collab document'&&paged){await tab.getByRole('menuitem',{name:'View',exact:true}).click();await tab.getByRole('menuitemradio',{name:'Pages',exact:true}).click();}
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
  'Monday navigation: sidebar hover stays stable and app search works': async b=>{
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    const row=s.p.locator('.task-row').filter({has:s.p.locator('.row-actions')}).first();await row.waitFor();
    for(const width of [1300,900]){
      await s.p.setViewportSize({width,height:900});await s.p.mouse.move(0,0);
      if(width<=1100)await s.p.getByRole('button',{name:'Show the task list',exact:true}).click();
      const before=await row.boundingBox(),titleBefore=await row.locator('.task-pick').boundingBox();
      await row.hover();const after=await row.boundingBox(),titleAfter=await row.locator('.task-pick').boundingBox();
      if(Math.abs(before.height-after.height)>0.5||Math.abs(titleBefore.width-titleAfter.width)>0.5)throw Error('Hover changed the row or title dimensions');
    }
    await s.p.mouse.move(0,0);
    const appsButton=s.p.getByRole('button',{name:'Apps',exact:true});
    const appsHit=await appsButton.evaluate(el=>{const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,viewport:innerWidth,hit:el===document.elementFromPoint(x,y)||el.contains(document.elementFromPoint(x,y))};});
    if(!appsHit.hit)throw Error('Apps button is obscured at tablet width: '+JSON.stringify(appsHit));
    await appsButton.click();
    await s.p.getByRole('searchbox',{name:'Find an app',exact:true}).fill('journal');
    await s.p.getByRole('menuitem',{name:'Reading Journal',exact:true}).waitFor();
    if(await s.p.locator('.apps-pop [role=menuitem]').count()!==1)throw Error('App search did not filter destinations');
    await s.p.getByRole('searchbox',{name:'Find an app',exact:true}).fill('linguistics');
    await s.p.getByText('No apps match your search.').waitFor();
    await axe(s.p,'Filtered application launcher',A11Y_FOUND);
    await s.p.getByRole('button',{name:'Close apps menu'}).last().click();
    await s.p.goto(BASE+'/');
    for (const width of [320,390]) {
      await s.p.setViewportSize({width,height:720});
      await s.p.getByRole('button',{name:'Apps',exact:true}).click();
      const panel=s.p.locator('.apps-pop');
      await panel.waitFor();
      const fit=await panel.evaluate((el)=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1;});
      if(!fit)throw Error(`Apps menu does not fit ${width}px phone`);
      if(await s.p.evaluate(()=>document.body.style.overflow)!=='hidden')throw Error('Page scroll remains active behind mobile apps menu');
      if(await panel.evaluate(el=>el.scrollTop)>1)throw Error('Apps menu did not open at the first group');
      const firstGroup=await s.p.locator('.apps-g').first().locator('.apps-h').innerText();
      if(!['teach and organise','learning'].includes(firstGroup.toLowerCase()))throw Error('Teaching apps are missing from the launcher: '+firstGroup);
      await s.p.waitForTimeout(250);
      if(await panel.evaluate(el=>el.scrollTop)>1)throw Error('Apps menu moved away from the first group');
      const headingFit=await s.p.locator('.apps-g').first().evaluate(el=>{const box=el.getBoundingClientRect(),search=el.closest('.apps-pop').querySelector('.apps-search').getBoundingClientRect(),pop=el.closest('.apps-pop'),menu=el.parentElement,s=getComputedStyle(menu);return {top:box.top,searchBottom:search.bottom,popScroll:pop.scrollTop,scrollTop:el.closest('.apps-scroll').scrollTop,windowScroll:scrollY,htmlScroll:document.documentElement.scrollTop,bodyScroll:document.body.scrollTop,menuTop:menu.getBoundingClientRect().top,menuTranslate:s.translate,menuOffsetParent:menu.offsetParent?.className};});
      if(headingFit.top<headingFit.searchBottom-2)throw Error('Teaching apps group is hidden above the search field: '+JSON.stringify(headingFit));
      const search=s.p.getByRole('searchbox',{name:'Find an app',exact:true});await search.focus();
      const rings=await search.evaluate(el=>({border:getComputedStyle(el).borderWidth,outline:getComputedStyle(el).outlineWidth,parent:getComputedStyle(el.parentElement).borderWidth}));
      if(rings.border!=='0px'||rings.outline!=='0px'||rings.parent==='0px')throw Error('Apps search has duplicate focus rectangles: '+JSON.stringify(rings));
      await s.p.screenshot({path:`/tmp/eltsuite-apps-menu-${width}.png`});
      await axe(s.p,`Apps menu at ${width}px`,A11Y_FOUND);
      await s.p.getByRole('button',{name:'Close apps menu'}).last().click();
      if(await s.p.evaluate(()=>document.body.style.overflow)==='hidden')throw Error('Page scroll remains locked after closing apps menu');
    }
    await s.p.evaluate(()=>document.documentElement.dataset.theme='dark');
    await s.p.getByRole('button',{name:'Apps',exact:true}).click();
    await s.p.waitForTimeout(250);
    await s.p.screenshot({path:'/tmp/eltsuite-apps-menu-dark.png'});
    await axe(s.p,'Apps menu in dark mode',A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    if(await s.p.locator('.apps-pop').count())throw Error('Escape did not close the apps menu');
    await s.p.evaluate(()=>document.documentElement.dataset.theme='light');
    await s.p.getByRole('button',{name:'Apps',exact:true}).click();
    await s.p.locator('.apps-scrim').click({position:{x:4,y:4}});
    if(await s.p.locator('.apps-pop').count())throw Error('Tapping outside did not close the apps menu');
    await s.p.getByRole('button',{name:'Apps',exact:true}).click();
    await s.p.getByRole('searchbox',{name:'Find an app',exact:true}).fill('Resources');
    await s.p.getByRole('menuitem',{name:'Resources',exact:true}).click();
    await s.p.waitForURL('**/archive');
    if(await s.p.locator('.apps-pop').count())throw Error('Apps menu stayed open after navigation');
    return s;
  },
  'Tuesday wishlist: Resources columns, full width and cut move':async b=>{const s=await session(b,{owner:true});await resourcesLayout(s,BASE,axe,A11Y_FOUND);return s;},
  'Tuesday wishlist: Cut in ordinary fields preserves text':async b=>{const s=await session(b,{owner:true});await fieldCut(s,BASE,axe,A11Y_FOUND);return s;},
  'Tuesday wishlist: Slides object Cut and paste preserve the object':async b=>{const s=await session(b,{owner:true});await slidesCut(s,BASE);return s;},
  'Tuesday wishlist: available forms, current document collection and separate sheets':async b=>{const s=await session(b,{owner:true});await tuesdayForms(s,BASE,newFile,axe,A11Y_FOUND);return s;},
  'Tuesday wishlist: internal document and classroom links persist':async b=>{const s=await session(b,{owner:true});await tuesdayLinks(s,BASE,newFile,axe,A11Y_FOUND);return s;},
  'Tuesday wishlist: pinned coach, voice playback and microphone fallback':async b=>{const s=await session(b,{owner:true});await tuesdayCoach(s,BASE,axe,A11Y_FOUND);return s;},
  'Tuesday latest: document menus, citation style and matching controls':async b=>{const s=await session(b,{owner:true});await documentChrome(s,BASE,newFile,axe,A11Y_FOUND);return s;},
  'Tuesday latest: highlight dialogue authoring, save and learner feedback':async b=>{const s=await session(b);await highlightJourney(s,BASE,axe,A11Y_FOUND);return s;},
  'New task: empty lesson opens a blank editor even with AI enabled':async b=>{
    const s=await session(b);
    await s.p.evaluate(async demo=>{
      const {doc,setDoc,collection,getDocs,deleteDoc}=await import('/test/mock/firestore.ts');
      await setDoc(doc({},'aiPilot','teacher1'),{enabled:true});
      const tasks=await getDocs(collection({},'classes',demo.classId,'items',demo.itemId,'tasks'));
      await Promise.all(tasks.docs.map(t=>deleteDoc(t.ref)));
    },s.demo);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.getByRole('button',{name:'+ New task',exact:true}).click();
    const title=s.p.getByRole('textbox',{name:'Task title',exact:true});
    await title.waitFor();
    if(await s.p.getByRole('dialog',{name:'Suggest next activity'}).count())throw Error('New task opened AI creation');
    if(await title.inputValue()!=='New task')throw Error('New task did not open a blank task');
    await title.fill('Manual task regression');await title.blur();
    await s.p.waitForTimeout(1400);await s.p.reload();
    await s.p.getByRole('button',{name:/Manual task regression/}).first().click();
    await title.waitFor();
    if(await title.inputValue()!=='Manual task regression')throw Error('Manual task did not persist');
    return s;
  },
  'New task: blank and import choices remain available before AI starts':async b=>{
    const s=await session(b);
    await s.p.evaluate(async()=>{const {doc,setDoc}=await import('/test/mock/firestore.ts');await setDoc(doc({},'aiPilot','teacher1'),{enabled:true});});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    const originalTitle = await s.p.getByRole('textbox',{name:'Task title',exact:true}).inputValue();
    const insert=s.p.locator('.task-insert').last();
    await insert.locator('summary').click();
    await insert.getByRole('button',{name:'New task',exact:true}).waitFor();
    await insert.getByRole('button',{name:'Create with AI',exact:true}).click();
    const dialog=s.p.getByRole('dialog',{name:'Suggest next activity'});
    await dialog.getByRole('button',{name:'Start blank',exact:true}).waitFor();
    if(!await dialog.getByRole('button',{name:'Start blank',exact:true}).isEnabled())throw Error('Blank task choice was hidden or disabled');
    await dialog.getByRole('button',{name:'Upload existing material',exact:true}).waitFor();
    if(await s.p.getByRole('region',{name:'AI activity'}).getByText('AI is working').count())throw Error('Opening a blank task started AI without a choice');
    await dialog.getByRole('button',{name:'Start blank',exact:true}).click();
    await s.p.locator('.task-row.on').filter({hasText:'New task'}).waitFor();
    await s.p.waitForFunction(() => document.querySelector('input[aria-label="Task title"]')?.value === 'New task');
    await s.p.waitForTimeout(1000);
    if(await s.p.getByRole('textbox',{name:'Task title',exact:true}).inputValue()!=='New task')throw Error('Previous task title appeared in the new blank task');
    await s.p.reload();
    await s.p.locator('.task-row').filter({hasText:'New task'}).getByRole('button').first().click();
    await s.p.locator('.task-row.on').filter({hasText:'New task'}).waitFor();
    await s.p.getByRole('textbox',{name:'Task title',exact:true}).waitFor();
    if(await s.p.getByRole('textbox',{name:'Task title',exact:true}).inputValue()!=='New task')throw Error('New blank task did not stay blank after reload');
    if(originalTitle==='New task')throw Error('The fixture needs a distinct source task title');
    await s.p.locator('.task-row .task-pick').first().click();
    await s.p.waitForFunction(title=>document.querySelector('input[aria-label="Task title"]')?.value===title,originalTitle);
    await axe(s.p,'Blank task authoring after choosing how to start',A11Y_FOUND);
    return s;
  },
  'Lesson editor: visual questions, rich picture descriptions and precise add controls':async b=>{
    const s=await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.getByRole('button',{name:'Questions',exact:true}).click();
    const questions=s.p.getByRole('dialog',{name:'Add a question',exact:true});
    await questions.waitFor();
    mkdirSync('outputs',{recursive:true});await questions.screenshot({path:'outputs/questions-dropdown-preview.png'});
    if(await questions.locator('.dialog.gallery,.scrim').count()||await questions.evaluate(el=>el.getBoundingClientRect().width>500))throw Error('Questions opened as a window instead of a dropdown');
    if(await questions.getByText('Corpus Explorer').count()||await questions.getByText('Spin the wheel').count())throw Error('Non-question tools appear in Questions');
    const card=questions.locator('.question-pop-item').first();
    if(!await card.locator('.gallery-pic').count())throw Error('Question card has no visual preview');
    const questionSearch=questions.locator('input[aria-label="Search questions"]');
    const qOutline=await questionSearch.evaluate(el=>({width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle,focus:document.activeElement===el}));
    if(qOutline.style!=='none')throw Error('Questions search has a duplicate focus outline: '+JSON.stringify(qOutline));
    await questionSearch.fill('Gap fill');
    await questions.getByRole('button',{name:/^Gap fill/}).click();
    await s.p.locator('.task-editor .gap-node').first().waitFor();
    await s.p.getByRole('button',{name:'Everything you can add, with pictures',exact:true}).click();
    const gallery=s.p.getByRole('dialog',{name:'Add to the task',exact:true});
    await gallery.getByRole('textbox',{name:'Search',exact:true}).fill('Dialogue');
    await gallery.getByRole('button',{name:/^Dialogue/}).first().waitFor();
    await gallery.getByRole('textbox',{name:'Search',exact:true}).fill('Image');
    await gallery.getByRole('button',{name:/^Image/}).first().click();
    const pictures=s.p.getByRole('dialog',{name:'Add pictures',exact:true});
    await pictures.getByRole('textbox',{name:'Description shown below the picture'}).fill('The shapes are');
    await pictures.locator('input[type=file]').setInputFiles('test/fixtures/import-shapes.jpg');
    await pictures.waitFor({state:'detached'});
    const caption=s.p.locator('.task-editor .pic-node .pic-caption').last();
    await caption.getByText('The shapes are').waitFor();
    await caption.click();
    await s.p.keyboard.press('End');await s.p.keyboard.type(' a red circle and');
    if(!(await caption.innerText()).includes('The shapes are a red circle and'))throw Error('Picture description did not stay editable: '+JSON.stringify(await caption.innerText()));
    await s.p.keyboard.press('ControlOrMeta+b');await s.p.keyboard.type(' a blue square');await s.p.keyboard.press('ControlOrMeta+b');
    await caption.locator('strong').filter({hasText:'a blue square'}).waitFor();
    await s.p.getByRole('button',{name:'Questions',exact:true}).click();
    const inlineQuestions=s.p.getByRole('dialog',{name:'Add a question',exact:true});
    await inlineQuestions.locator('input[aria-label="Search questions"]').fill('Gap fill');
    await inlineQuestions.getByRole('button',{name:/^Gap fill/}).click();
    await caption.locator('.gap-node').waitFor();
    await s.p.locator('.task-editor .pic-node').last().screenshot({path:'outputs/picture-description-preview.png'});
    await s.p.waitForFunction(()=>JSON.stringify(localStorage.getItem('mockfs')).includes('The shapes are a red circle and'),null,{timeout:30000});
    await s.p.reload();
    await s.p.locator('.task-editor .pic-node .pic-caption').filter({hasText:'The shapes are a red circle and'}).locator('.gap-node').waitFor();
    const insert=s.p.locator('.task-list .task-insert').first();
    await s.p.mouse.move(900,500);
    if(await insert.locator('summary').evaluate(el=>getComputedStyle(el).opacity)!=='0')throw Error('Task plus is visible without hover');
    await insert.hover();
    await s.p.waitForFunction(()=>getComputedStyle(document.querySelector('.task-list .task-insert summary')).opacity==='1');
    const gap=await insert.boundingBox(),firstRow=await s.p.locator('.task-list .task-row').first().boundingBox();
    const endInsert=s.p.locator('.task-list .task-insert').last(),endGap=await endInsert.boundingBox(),lastRow=await s.p.locator('.task-list .task-row').last().boundingBox();
    if(!gap||!firstRow||!endGap||!lastRow||gap.y+gap.height>firstRow.y||endGap.y<lastRow.y+lastRow.height)throw Error('Task insertion guide overlaps a task row');
    const guide=await insert.locator('summary').evaluate(el=>({line:getComputedStyle(el,'::before').height,ring:getComputedStyle(el.querySelector('span')).borderTopWidth}));
    if(parseFloat(guide.line)<2||parseFloat(guide.ring)<2)throw Error('Task insertion guide is too faint: '+JSON.stringify(guide));
    await insert.locator('summary').click();
    const actionIcons=await insert.locator('.task-insert-menu button').evaluateAll(buttons=>buttons.map(button=>({name:button.getAttribute('aria-label'),hasIcon:!!button.querySelector('svg *')})));
    if(actionIcons.some(action=>!action.hasIcon))throw Error('Task insertion action has no icon: '+JSON.stringify(actionIcons));
    await insert.screenshot({path:'outputs/task-insert-preview.png'});
    await endInsert.locator('summary').click();
    if(await s.p.locator('.task-list .task-insert[open]').count()!==1||!await endInsert.evaluate(el=>el.open))throw Error('More than one task insertion menu can open');
    await s.p.keyboard.press('Escape');
    if(await s.p.locator('.task-list .task-insert[open]').count())throw Error('Escape did not close the task insertion menu');
    const paragraph=s.p.locator('.task-editor .ProseMirror > p').last();
    await paragraph.hover();
    const line=s.p.getByRole('button',{name:'Add a line below',exact:true});
    await line.waitFor();
    const aligned=await line.evaluate(el=>Math.abs(el.getBoundingClientRect().top+el.getBoundingClientRect().height/2-(el.nextElementSibling?.getBoundingClientRect().top||0))<2);
    if(!aligned)throw Error('Line plus is not aligned with its insertion guide');
    const before=await s.p.locator('.task-editor .ProseMirror > p').count();
    await line.click();
    if(await s.p.locator('.task-editor .ProseMirror > p').count()<=before)throw Error('Line plus was not clickable');
    await openPlanning(s.p);
    const widths=await s.p.locator('.lesson-support-actions > *, .lesson-support-actions .lesson-tool-toolbar > *').evaluateAll(els=>els.filter(el=>el.matches('.btn')).map(el=>Math.round(el.getBoundingClientRect().width)));
    if(widths.some(w=>Math.abs(w-widths[0])>1))throw Error('Planning menu actions have different widths: '+widths.join(', '));
    await s.p.locator('.lesson-support-tools > summary').click();
    await s.p.locator('.mode-btn').click();
    await s.p.getByRole('menuitemradio',{name:/^Learner view/}).click();
    const learnerCaption=s.p.locator('.frame-body .pic-rendered .pic-caption').filter({hasText:'The shapes are a red circle and'});
    await learnerCaption.waitFor();
    await learnerCaption.locator('strong').filter({hasText:'a blue square'}).waitFor();
    await learnerCaption.locator('.gap-wrap').waitFor();
    await axe(s.p,'Visual question and picture editing',A11Y_FOUND);
    return s;
  },
  'Suite cohesion: all app headers, menus, light and dark phone layouts': async b=>{const s=await session(b,{owner:true});await suiteCohesionAudit(s,BASE,A11Y_FOUND,axe);return s;},
  'Shared control gallery: states, choices, narrow screens and 200% zoom': async b=>{
    const s=await session(b,{owner:true});await s.p.goto(BASE+'/test/control-gallery.html');
    await s.p.getByRole('heading',{name:'Controls and states'}).waitFor();
    mkdirSync('outputs/ui-ux-brief/control-gallery',{recursive:true});
    for(const width of [320,375,768,1024,1440])for(const theme of ['light','dark']){
      await s.p.setViewportSize({width,height:900});
      await s.p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      const overflow=await s.p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      if(overflow>2)throw Error(`Control gallery overflows ${width}px ${theme} by ${overflow}px`);
      await s.p.screenshot({path:`outputs/ui-ux-brief/control-gallery/${width}-${theme}.png`,fullPage:true});
      if((width===375&&theme==='dark')||(width===1440&&theme==='light'))await axe(s.p,`Control gallery ${width}px ${theme}`,A11Y_FOUND);
    }
    await s.p.setViewportSize({width:768,height:900});
    await s.p.evaluate(()=>document.documentElement.style.zoom='200%');
    const zoomOverflow=await s.p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(zoomOverflow>2)throw Error(`Control gallery overflows at 200% zoom by ${zoomOverflow}px`);
    await s.p.screenshot({path:'outputs/ui-ux-brief/control-gallery/768-zoom-200.png',fullPage:true});
    await s.p.evaluate(()=>document.documentElement.style.zoom='');
    await s.p.getByRole('button',{name:'One option'}).click();
    await s.p.getByRole('option',{name:'Third option'}).click();
    if(!(await s.p.getByRole('button',{name:'One option'}).innerText()).includes('Third option'))throw Error('Shared dropdown did not select an option');
    await s.p.getByRole('button',{name:'Several options'}).click();
    await s.p.getByRole('option',{name:'Speaking'}).click();
    await s.p.keyboard.press('Escape');
    await s.p.getByRole('button',{name:'Several options'}).press('Backspace');
    if((await s.p.getByRole('button',{name:'Several options'}).innerText()).includes('Speaking'))throw Error('Backspace did not remove the last multiselect chip');
    await s.p.getByRole('button',{name:'Several options'}).click();
    await s.p.getByRole('option',{name:'Use any'}).click();
    if(!(await s.p.getByRole('button',{name:'Several options'}).innerText()).includes('Any'))throw Error('Multiselect did not clear its selected values');
    await s.p.keyboard.press('Escape');
    await s.p.getByRole('button',{name:'Large option list'}).click();
    const find=s.p.getByRole('searchbox',{name:'Find in Large option list'});
    await find.fill('Writing');
    await s.p.getByRole('option',{name:'Writing'}).waitFor();
    if(await s.p.getByRole('option',{name:'Reading'}).count())throw Error('Multiselect search did not filter options');
    await axe(s.p,'Searchable multiselect open',A11Y_FOUND);
    await find.fill('unmatched skill');
    await s.p.getByText('Nothing matches.',{exact:true}).waitFor();
    await axe(s.p,'Searchable multiselect no results',A11Y_FOUND);
    await s.p.keyboard.press('Escape');
    await s.p.getByRole('button',{name:'Open dialog'}).click();
    await s.p.getByRole('dialog',{name:'Control example'}).getByRole('button',{name:'Done'}).click();
    await s.p.getByRole('dialog',{name:'Control example'}).waitFor({state:'detached'});
    return s;
  },
  'Discuss with Teacher’s Companion carries saved lesson evidence without optional profile fields': async b => {
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Learner readiness & progress',exact:true}).click();
    const dialog=s.p.getByRole('dialog',{name:'Learner readiness and progress'});
    await dialog.getByRole('button',{name:'Check this activity',exact:true}).click();await reviewAi(s.p,'Learner readiness and progress');
    const discuss=dialog.getByRole('button',{name:'Discuss with Teacher’s Companion',exact:true});
    await discuss.waitFor({timeout:12000}).catch(async()=>{throw Error('Saved report discussion missing: '+(await dialog.innerText()).slice(0,1000));});
    await discuss.click();
    await dialog.waitFor({state:'hidden'});
    await s.p.getByRole('complementary',{name:'Selected teaching context'}).waitFor();
    if(await s.p.getByText('Let’s start with your teaching',{exact:true}).count())throw Error('Optional profile blocked selected-lesson discussion');
    await s.p.getByLabel('Message Teacher’s Companion').fill('How could I support learners with this activity?');
    await s.p.getByRole('button',{name:'Send',exact:true}).click();
    await see(s.p,'.coach-message:has-text("What did you notice")','contextual coaching reply');
    const request=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')));
    if(request.lessonContext.classId!==s.demo.classId||request.lessonContext.itemId!==s.demo.itemId||!request.lessonContext.reportId||!request.lessonContext.taskId)throw Error('Selected report and activity were not passed');
    await s.p.getByRole('link',{name:'Selected activity',exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Remove lesson context',exact:true}).click();
    await s.p.getByText('Let’s start with your teaching',{exact:true}).waitFor();
    if(await s.p.locator('.coach-message').count())throw Error('Previous lesson conversation retained after context removal');
    return s;
  },
  'Teacher’s Companion opens as a small message with the current activity': async b => {
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.waitForFunction(()=>!!document.querySelector('[data-coach-task-id]')?.getAttribute('data-coach-task-id'));
    const taskId=await s.p.locator('[data-coach-task-id]').getAttribute('data-coach-task-id');
    await s.p.locator('.dock-launch .dock-tab-main').click();
    const list=s.p.locator('.dock-win[data-win="list"]');
    await list.waitFor();
    const width=await list.evaluate(el=>parseFloat(getComputedStyle(el).width));
    await list.getByRole('button',{name:/Teacher’s Companion/}).click();
    const coach=s.p.locator('.dock-win[data-win="teaching-coach"]');
    await coach.waitFor();
    const coachWidth=await coach.evaluate(el=>parseFloat(getComputedStyle(el).width));
    if(Math.abs(coachWidth-width)>1)throw Error(`Companion opened at a different width from person messages: ${width}px → ${coachWidth}px`);
    if(await s.p.locator('.coach-floating').count())throw Error('Companion opened a separate floating panel');
    await coach.getByLabel('Selected teaching context').waitFor();
    await coach.getByRole('textbox',{name:'Message Teacher’s Companion'}).fill('What is your advice on this activity?');
    await coach.getByRole('button',{name:'Send',exact:true}).click();
    await coach.getByRole('log').getByText('What is your advice on this activity?',{exact:true}).waitFor();
    await s.p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')||'null')?.prompt==='What is your advice on this activity?');
    const request=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')));
    if(request.lessonContext?.classId!==s.demo.classId||request.lessonContext?.itemId!==s.demo.itemId||request.lessonContext?.taskId!==taskId)throw Error('The current activity was not included in the conversation');
    await coach.getByRole('button',{name:'Minimise',exact:true}).click();
    await s.p.getByRole('button',{name:'Open Teacher’s Companion'}).click();
    await s.p.locator('.dock-win[data-win="teaching-coach"] .coach-chat-message-teacher').filter({hasText:'What is your advice on this activity?'}).waitFor();
    await axe(s.p,'Teacher’s Companion in small Messages',A11Y_FOUND);
    return s;
  },
  'Class spelling and a saved question exception apply to the learner answer': async b => {
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}`);
    await s.p.getByRole('button',{name:'Class actions'}).click();
    await s.p.getByRole('menuitem',{name:'Class settings'}).click();
    const settings=s.p.getByRole('dialog',{name:'Class settings'});
    await settings.getByLabel('Class spelling spell check').selectOption('off');
    await settings.getByRole('button',{name:'Save changes'}).click();
    await s.p.waitForFunction(id=>JSON.parse(localStorage.getItem('mockfs'))['classes/'+id]?.spelling?.enabled===false,s.demo.classId);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.getByRole('button',{name:/Your experiences/}).click();
    const taskId=await s.p.locator('[data-coach-task-id]').getAttribute('data-coach-task-id');
    const editor=s.p.locator('.frame-inner .ProseMirror').first();
    await editor.click();
    await s.p.waitForFunction(()=>document.querySelector('.frame-inner .ProseMirror')?.getAttribute('spellcheck')==='true');
    await s.p.getByRole('button',{name:'Question spelling'}).click();
    const exception=s.p.getByRole('checkbox',{name:'Override class spelling for question 1'});
    await exception.check();
    await s.p.waitForFunction(({classId,itemId,taskId})=>JSON.stringify(JSON.parse(localStorage.getItem('mockfs'))[`classes/${classId}/items/${itemId}/tasks/${taskId}`]?.content).includes('"spellingOverride":true'),{...s.demo,taskId});
    await s.p.reload();
    await s.p.getByRole('button',{name:/Your experiences/}).click();
    const spellingFold=s.p.getByRole('button',{name:'Question spelling'});
    if(await spellingFold.getAttribute('aria-expanded')!=='true')await spellingFold.click();
    const savedException=s.p.getByRole('checkbox',{name:'Override class spelling for question 1'});
    if(!await savedException.count())throw Error('Question spelling control disappeared after reload: '+(await s.p.locator('.task-side').innerText()).slice(0,800));
    if(!await savedException.isChecked())throw Error('Question spelling exception was not saved');
    await s.p.goto(`${BASE}/dev.html?as=Mia`);
    await s.p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;const uid=sessionStorage.getItem('mockuid');return !!uid&&JSON.parse(localStorage.getItem('mockfs')||'{}')['users/'+uid]?.displayName?.startsWith('Mia');},null,{timeout:180000});
    await s.p.waitForLoadState('networkidle');
    await s.p.goto(`${BASE}/learn/${s.demo.itemId}?task=${taskId}`);
    const answer=s.p.getByRole('textbox',{name:'Question 1',exact:true});
    await answer.click();
    await s.p.waitForFunction(()=>document.querySelector('[aria-label="Question 1"]')?.getAttribute('spellcheck')==='true');
    if(!await answer.locator('xpath=ancestor::*[@data-spelling-question-override="true"]').count())throw Error('Question exception was not rendered around the learner answer');
    await axe(s.p,'Class spelling and question exception',A11Y_FOUND);
    return s;
  },
  'Learner readiness: cited evidence, insufficient history and saved reports': async(b)=>{
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Learner readiness & progress',exact:true}).click();
    let dialog=s.p.getByRole('dialog',{name:'Learner readiness and progress'});
    await dialog.getByRole('button',{name:'Check this activity',exact:true}).click();await reviewAi(s.p,'Learner readiness and progress');
    await dialog.getByText('Alex answered two of three assessed items correctly.',{exact:true}).waitFor();
    await dialog.getByText('Not enough recorded history for a useful estimate.',{exact:true}).waitFor();
    await dialog.getByText('View evidence (1 activities)',{exact:true}).click();
    await dialog.getByText(/Timing not recorded/).waitFor();
    await dialog.getByRole('button',{name:'Check this lesson',exact:true}).click();await reviewAi(s.p,'Learner readiness and progress');
    await s.p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('mockfs'))).filter(k=>k.includes('/learningReports/')).length===2);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await s.p.reload();
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Learner readiness & progress',exact:true}).click();
    dialog=s.p.getByRole('dialog',{name:'Learner readiness and progress'});
    await dialog.getByText('Alex answered two of three assessed items correctly.',{exact:true}).waitFor();
    await axe(s.p,'Learner readiness',A11Y_FOUND);return s;
  },
  'Google teachers can add a password without changing their account': async b=>{
    const s=await session(b);
    await s.p.evaluate(()=>{const all=JSON.parse(localStorage.getItem('mockauth'));all.teacher1.providers=['google.com'];delete all.teacher1.password;localStorage.setItem('mockauth',JSON.stringify(all));sessionStorage.setItem('mock-link-recent','1');});
    await s.p.goto(BASE+'/settings');await s.p.getByRole('button',{name:'Add password',exact:true}).click();
    const save=s.p.getByRole('button',{name:'Save password',exact:true});if(await save.isEnabled())throw Error('Empty password accepted');
    await s.p.getByText('Enter a password with at least 8 characters.',{exact:true}).waitFor();
    await s.p.getByLabel('New password',{exact:true}).fill('Test-only-friday-123');await s.p.getByLabel('Confirm password',{exact:true}).fill('wrong');
    if(await save.isEnabled())throw Error('Mismatched passwords accepted');
    await s.p.getByLabel('Confirm password',{exact:true}).fill('Test-only-friday-123');await save.click();
    await s.p.getByRole('button',{name:'Confirm with Google and add password',exact:true}).click();await s.p.getByText('Password sign-in is enabled.',{exact:true}).waitFor();
    await s.p.reload();await s.p.getByText('Password sign-in is enabled.',{exact:true}).waitFor();
    const uid=await s.p.evaluate(async()=>{const a=await import('/test/mock/auth.ts');const auth=a.getAuth();await a.signOut(auth);return(await a.signInWithEmailAndPassword(auth,'teacher@example.com','Test-only-friday-123')).user.uid;});if(uid!=='teacher1')throw Error('Password sign-in created a different identity');
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);await s.p.getByRole('textbox',{name:'Task title',exact:true}).waitFor();
    await axe(s.p,'Same teacher lesson after password sign-in',A11Y_FOUND);return s;
  },
  'Lesson editor: compact panels and non-overlapping toolbars': async(b)=>{
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.getByRole('textbox',{name:'Task title',exact:true}).waitFor();
    mkdirSync('outputs/friday',{recursive:true});
    for(const theme of ['light','dark'])for(const width of [1280,1100,900,785,390]){
      if(width===1280){await s.p.setViewportSize({width,height:900});await s.p.reload();await s.p.getByRole('textbox',{name:'Task title',exact:true}).waitFor();}
      await s.p.setViewportSize({width,height:900});
      await s.p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      if(width>700){await s.p.locator('.instr-wrap [contenteditable="true"]').click();
      await s.p.locator('.instr-bar').waitFor({state:'visible'});}
      const layout=await s.p.evaluate(()=>{
        const rect=s=>document.querySelector(s)?.getBoundingClientRect();
        const instruction=rect('.instr-bar'),body=rect('.frame-body'),header=rect('.suite-topbar');
        return {overlap:instruction&&body&&instruction.bottom>body.top+1,overflow:document.documentElement.scrollWidth>innerWidth+1,headerOverflow:[...document.querySelector('.suite-topbar').children].some(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1;})};
      });
      if(layout.overlap||layout.overflow||layout.headerOverflow)throw Error(`Editor layout ${theme} ${width}: ${JSON.stringify(layout)}`);
      if(width>700)await s.p.getByRole('textbox',{name:'Task title',exact:true}).click();
      if(await s.p.locator('.instr-bar').isVisible())throw Error('Instruction toolbar stayed visible after focus left');
      if(width<=1100&&width>700){
        const clipped=await s.p.locator('.panel-toggle').evaluateAll(els=>els.some(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth;}));
        if(clipped)throw Error('Panel handles are clipped by compact gutters');
        await s.p.getByRole('button',{name:'Show the task settings',exact:true}).click();
        const panel=s.p.getByRole('complementary',{name:'Task settings',exact:true});await panel.waitFor({state:'visible'});
        const box=await panel.boundingBox();if(!box||box.y+box.height>870||box.x<0)throw Error('Settings drawer is clipped');
        await panel.getByRole('button',{name:'Close task settings',exact:true}).click();
      }
      await s.p.screenshot({path:`outputs/friday/editor-${theme}-${width}.png`});
    }
    return s;
  },

  'Friday wishes: AI edit review, spelling scope and companion window': async(b)=>{
    const s=await session(b,{owner:true});
    await s.p.evaluate(({classId,itemId})=>{const fs=JSON.parse(localStorage.getItem('mockfs')),root='classes/'+classId+'/items/'+itemId+'/tasks/';for(const k of Object.keys(fs))if(k.startsWith(root))delete fs[k];fs[root+'friday']={kind:'task',title:'Friday activity',instructions:'',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'I '},{type:'gap',attrs:{id:'typed',answers:[]}},{type:'text',text:' at home.'}]},{type:'mcq',attrs:{id:'choice',prompt:'Where?',options:['Home','School'],correct:-1}}]},order:0,hidden:false,locked:false};fs[root+'friday/private/key']={typed:{kind:'gap',answers:['work']},choice:{kind:'mcq',correct:0}};localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await s.p.getByRole('button',{name:'Question spelling',exact:true}).click();
    if(await s.p.locator('.question-spelling-toggle').count()!==1)throw Error('Choice question has an irrelevant spelling setting');
    await openPlanning(s.p);
    await s.p.getByRole('button',{name:'Discuss with Teacher’s Companion',exact:true}).click();
    await s.p.locator('.dock-coach').waitFor();if(!s.p.url().includes('/lesson/'))throw Error('Companion navigated away from lesson');
    await s.p.locator('.dock-win[data-win="teaching-coach"]').getByRole('button',{name:/Close/}).click();
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Edit with AI',exact:true}).click();
    const dialog=s.p.getByRole('dialog',{name:'Edit with AI',exact:true});
    if(await dialog.getByRole('button',{name:'Preview changes',exact:true}).isEnabled())throw Error('Blank required direction should not submit');
    await dialog.getByText('Describe the changes you want to preview.',{exact:true}).waitFor();
    await dialog.locator('textarea').fill('Change the title to A memorable day. Keep the rest.');
    await dialog.getByRole('button',{name:'Preview changes',exact:true}).click();await reviewAi(s.p,'Edit with AI');
    await dialog.getByRole('button',{name:'Apply changes',exact:true}).waitFor();
    if(await s.p.getByRole('textbox',{name:'Task title',exact:true}).inputValue()!=='Friday activity')throw Error('AI applied changes before review');
    await axe(s.p,'AI edit review',A11Y_FOUND);await dialog.getByRole('button',{name:'Apply changes',exact:true}).click();
    await s.p.waitForFunction(()=>document.querySelector('input[aria-label="Task title"]')?.value==='A memorable day');
    await s.p.reload();await s.p.getByRole('textbox',{name:'Task title',exact:true}).waitFor();
    if(await s.p.getByRole('textbox',{name:'Task title',exact:true}).inputValue()!=='A memorable day')throw Error('AI edit did not persist');
    if(await s.p.locator('.task-row').count()!==1)throw Error('AI edit appended a task');
    await s.p.getByRole('button',{name:'More: groups, export, shortcuts',exact:true}).click();
    if(await s.p.getByRole('menuitem',{name:/Lesson text|Full copy/}).count())throw Error('Legacy exports still in Classes menu');
    const [download]=await Promise.all([s.p.waitForEvent('download'),s.p.getByRole('menuitem',{name:/^Offline lesson/}).click()]);
    if(!download.suggestedFilename().endsWith('.html')||await download.failure())throw Error('Offline lesson download failed');
    await axe(s.p,'Edited lesson',A11Y_FOUND);return s;
  },

  'Lesson tools: keys, differentiated versions and next activities': async(b)=>{
    const s=await session(b,{owner:true});
    await s.p.evaluate(({classId,itemId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));const root='classes/'+classId+'/items/'+itemId+'/tasks/';for(const k of Object.keys(fs))if(k.startsWith(root))delete fs[k];fs[root+'tool-source']={kind:'task',title:'Yesterday',instructions:'Complete the sentence.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Yesterday I '},{type:'gap',attrs:{id:'missing',answers:[]}},{type:'text',text:' to the park.'}]}]},order:0,hidden:false,locked:false};fs[root+'tool-source/private/key']={missing:{kind:'gap',answers:[]}};localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Generate answer key',exact:true}).click().catch(async e=>{throw Error(e.message+' '+s.errors.join(';')+' '+(await s.p.locator('body').innerText()).slice(0,2500));});
    let dialog=s.p.getByRole('dialog',{name:'Generate answer key'});
    await dialog.getByRole('button',{name:'Fill in missing answers'}).click();await reviewAi(s.p,'Generate answer key');
    await dialog.getByRole('button',{name:'Apply answer key'}).waitFor();
    await axe(s.p,'Answer key review',A11Y_FOUND);
    await dialog.getByRole('button',{name:'Apply answer key'}).click();
    await s.p.waitForFunction(({classId,itemId})=>JSON.parse(localStorage.getItem('mockfs'))['classes/'+classId+'/items/'+itemId+'/tasks/tool-source/private/key'].missing.answers[0]==='went',s.demo);
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Differentiate activity',exact:true}).click();await reviewAi(s.p,'Differentiate activity');
    dialog=s.p.getByRole('dialog',{name:'Differentiate activity'});
    await dialog.getByRole('button',{name:/More support Add choices/}).click();
    await dialog.getByRole('button',{name:'Make the version'}).click();await reviewAi(s.p,'Differentiate activity');
    await dialog.getByRole('button',{name:'Add differentiated version'}).waitFor();
    await axe(s.p,'Differentiated preview',A11Y_FOUND);
    await dialog.getByRole('button',{name:'Add differentiated version'}).click();
    await s.p.waitForFunction(({classId,itemId})=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).some(([k,v])=>k.startsWith('classes/'+classId+'/items/'+itemId+'/tasks/')&&v.family==='tool-source'&&v.variant==='Supported'),s.demo);
    await openPlanning(s.p);await s.p.getByRole('button',{name:'Suggest next activity',exact:true}).click();await reviewAi(s.p,'Suggest next activity');
    dialog=s.p.getByRole('dialog',{name:'Suggest next activity'});
    await dialog.getByRole('button',{name:/Option 1 Plan a weekend/}).click();
    await dialog.getByRole('button',{name:'Make the activity'}).click();await reviewAi(s.p,'Suggest next activity');
    await dialog.getByRole('button',{name:'Add activity to lesson'}).click();
    await dialog.waitFor({state:'hidden'});
    await s.p.waitForFunction(({classId,itemId})=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).some(([k,v])=>k.startsWith('classes/'+classId+'/items/'+itemId+'/tasks/')&&v.title==='Our next plan'&&v.order===1),s.demo);
    await s.p.reload();await openPlanning(s.p);await s.p.getByRole('button',{name:'Suggest next activity',exact:true}).waitFor();
    const added=await s.p.evaluate(({classId,itemId})=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).filter(([k,v])=>k.startsWith('classes/'+classId+'/items/'+itemId+'/tasks/')&&v.title==='Our next plan').map(([,v])=>v),s.demo);
    if(added.length!==1||added[0].order!==1)throw Error('Next activity was not appended exactly once');
    await axe(s.p,'Lesson tools',A11Y_FOUND);return s;
  },

  'Designer: create, edit and reopen images and storyboards with optional fields blank': async (b) => {
    const s=await session(b,{owner:true});await s.p.goto(`${BASE}/design`);
    await s.p.getByRole('heading',{name:'Designer',exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Open character library'}).click();
    const library=s.p.getByRole('dialog',{name:'Character library'});
    await library.getByRole('button',{name:'Add character',exact:true}).click();
    await library.getByText('Give your character a name.').waitFor();
    await library.getByLabel('Character name').fill('Pip');
    await library.getByLabel('Reference image').setInputFiles({name:'pip.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
    await library.getByRole('button',{name:'Add character',exact:true}).click();
    await library.getByText('Pip saved to your character library.').waitFor();
    await library.getByRole('button',{name:'Close character library'}).click();
    await s.p.reload();
    const [image]=await Promise.all([s.ctx.waitForEvent('page'),s.p.getByRole('button',{name:'Create image'}).click()]);
    await image.getByRole('button',{name:'AI images',exact:true}).click();
    await image.getByRole('button',{name:'Generate preview'}).waitFor();
    await image.getByRole('button',{name:'What would you like to do?'}).click();
    await image.getByRole('option',{name:'Change an image'}).click();
    await image.getByText('Select one image on the canvas.',{exact:true}).waitFor();
    await image.getByRole('button',{name:'Generate preview'}).click();
    if(await image.evaluate(()=>localStorage.getItem('lastDesignerRequest')))throw Error('Image change started without a selected source');
    await image.getByRole('button',{name:'What would you like to do?'}).click();
    await image.getByRole('option',{name:'Create an image'}).click();
    await image.getByLabel('Describe your image').fill('Pip running in an original blue classroom scene');
    await image.getByText('Using references: Pip',{exact:true}).waitFor();
    await image.evaluate(()=>localStorage.setItem('mockDesignerDelayMs','2000'));
    await image.getByRole('button',{name:'Generate preview'}).click();
    await image.getByRole('button',{name:'Elements',exact:true}).click();
    await reviewAi(image,'Designer image');
    if(await image.getByLabel('Describe your image').inputValue()!=='Pip running in an original blue classroom scene')throw Error('Switching tools lost the image brief');
    await image.evaluate(()=>localStorage.removeItem('mockDesignerDelayMs'));
    await image.getByAltText('Generated preview').waitFor();
    await image.getByRole('button',{name:'Apply to canvas'}).click();
    await image.getByAltText('Generated preview').waitFor({state:'detached'});
    const characterRequest=await image.evaluate(()=>JSON.parse(localStorage.getItem('lastDesignerRequest')));
    if(characterRequest.characters?.length!==1)throw Error('Named character reference not sent');
    await image.getByRole('button',{name:'Add or edit characters'}).click();
    const inside=image.getByRole('dialog',{name:'Character library'});
    await inside.getByRole('button',{name:'Pip Edit character'}).click();
    await inside.getByLabel('Character name').fill('Pip the fox');
    await inside.getByRole('button',{name:'Save character',exact:true}).click();
    await inside.getByText('Pip the fox saved to your character library.').waitFor();
    await inside.getByRole('button',{name:'Close character library'}).click();
    await s.p.reload();await s.p.getByRole('button',{name:'Open character library'}).click();
    await s.p.getByRole('dialog',{name:'Character library'}).getByRole('button',{name:'Pip the fox Edit character'}).waitFor();
    await s.p.getByRole('button',{name:'Close character library'}).click();
    const fileId=new URL(image.url()).pathname.split('/').pop();
    await image.waitForFunction(id=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).some(([k,v])=>k.startsWith('sharedDocs/'+id+'/dels/')&&v.t==='image'&&v.img),fileId);
    await image.getByRole('button',{name:'What would you like to do?'}).click();
    await image.getByRole('option',{name:'Magic eraser · remove an object'}).click();
    await image.getByLabel('What should be removed?').fill('Remove the bag');
    await image.getByRole('button',{name:'Generate preview'}).click();
    await image.getByRole('button',{name:'Apply to canvas'}).click();
    await image.getByAltText('Generated preview').waitFor({state:'detached'});
    await image.getByRole('button',{name:'What would you like to do?'}).click();
    await image.getByRole('option',{name:'Change an image'}).click();
    await image.getByLabel('What should change?').fill('Change the sky to orange');
    await image.getByRole('button',{name:'Generate preview'}).click();
    await image.getByAltText('Generated preview').waitFor();
    const changeRequest=await image.evaluate(()=>JSON.parse(localStorage.getItem('lastDesignerRequest')));
    if(changeRequest.action!=='edit'||!changeRequest.imageId||changeRequest.prompt!=='Change the sky to orange')throw Error('Image change did not use the selected source');
    await image.getByRole('button',{name:'Apply to canvas'}).click();
    await image.getByAltText('Generated preview').waitFor({state:'detached'});
    await image.getByRole('button',{name:'What would you like to do?'}).click();
    await image.getByRole('option',{name:'Restyle an image'}).click();
    await image.getByRole('button',{name:/Black & white/}).click();
    await image.getByLabel('Extra changes (optional)').fill('');
    const ref=await image.evaluate(id=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).find(([k,v])=>k.startsWith('sharedDocs/'+id+'/dels/')&&v.t==='image'&&v.img)?.[1].img,fileId);
    if(!ref)throw Error('Designer image reference was not saved');
    await image.getByRole('button',{name:'Match an existing illustration'}).click();
    await image.getByRole('listbox',{name:'Match an existing illustration'}).getByRole('option').nth(1).click();
    await image.getByRole('button',{name:'Generate preview'}).click();
    await image.getByRole('button',{name:'Apply to canvas'}).click();
    await image.getByAltText('Generated preview').waitFor({state:'detached'});
    const req=await image.evaluate(()=>JSON.parse(localStorage.getItem('lastDesignerRequest')));
    if(req.action!=='restyle'||req.style!=='ink'||req.prompt!==''||req.referenceId!==ref)throw Error('Restyling did not send the style, reference and blank optional prompt');
    await image.getByRole('button',{name:'Black and white',exact:true}).click();
    await image.getByRole('button',{name:'Crop',exact:true}).click();
    const handle=await image.locator('.dz-ch').first().boundingBox();
    await image.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await image.mouse.down();await image.mouse.move(handle.x+handle.width/2+10,handle.y+handle.height/2+10,{steps:4});await image.mouse.up();
    await image.getByRole('button',{name:'Done',exact:true}).click();
    await image.getByRole('button',{name:'Text',exact:true}).click();await image.getByRole('button',{name:'Add a title',exact:true}).click();
    await image.getByRole('textbox',{name:'Text',exact:true}).fill('My edited image');await image.getByRole('textbox',{name:'Text',exact:true}).press('ControlOrMeta+Enter');
    await image.waitForFunction(id=>{const fs=JSON.parse(localStorage.getItem('mockfs'));const els=Object.entries(fs).filter(([k])=>k.startsWith('sharedDocs/'+id+'/dels/')).map(([,v])=>v);return els.some(e=>e.text==='My edited image')&&els.some(e=>e.fx?.gray===100&&e.crop?.w<1);},fileId);
    await image.reload();await image.getByRole('button',{name:'Download',exact:true}).waitFor();
    await image.getByRole('button',{name:'Download',exact:true}).click();
    const [download]=await Promise.all([image.waitForEvent('download'),image.getByRole('menuitem',{name:/Picture \(PNG\)/}).click()]);
    if(!download.suggestedFilename().endsWith('.png'))throw Error('Image export missing');
    const downloaded=await download.path();
    await s.p.goto(`${BASE}/archive`);
    await s.p.locator('input[type="file"][multiple]:not([accept])').setInputFiles({name:'Designer upload.png',mimeType:'image/png',buffer:readFileSync(downloaded)});
    const uploaded=s.p.getByRole('button',{name:/Designer upload/}).first();await uploaded.waitFor();
    const [opened]=await Promise.all([s.ctx.waitForEvent('page'),uploaded.dblclick()]);
    await opened.getByRole('button',{name:'Download',exact:true}).waitFor();await opened.getByRole('img',{name:'Page 1',exact:true}).waitFor();await opened.close();
    await s.p.goto(`${BASE}/design`);
    const [story]=await Promise.all([s.ctx.waitForEvent('page'),s.p.getByRole('button',{name:'Create storyboard'}).click()]);
    // A new storyboard is panels on the Designer canvas, opening on the Scene drawer.
    await story.getByRole('img',{name:'Panel 1',exact:true}).waitFor({timeout:90000});
    await story.getByRole('heading',{name:'Scene',exact:true}).waitFor();
    if(await story.getByLabel('Caption',{exact:true}).inputValue())throw Error('Optional caption should be blank');
    const storyId=new URL(story.url()).pathname.split('/').pop();
    const saved=await story.evaluate(id=>{const fs=JSON.parse(localStorage.getItem('mockfs'));return {kind:fs['sharedDocs/'+id].kind,type:fs['sharedDocs/'+id+'/dmeta/main'].type,panel:fs['sharedDocs/'+id+'/dpages/panel1']};},storyId);
    if(saved.kind!=='design'||saved.type!=='storyboard'||saved.panel?.w!==1280||saved.panel?.h!==720)throw Error('Storyboard did not save as a Designer file with a 16:9 first panel');
    // A backdrop by click; a person by dragging onto the panel, standing where dropped.
    await story.getByRole('button',{name:'Backdrop: Café',exact:true}).click();
    await story.waitForFunction(id=>JSON.parse(localStorage.getItem('mockfs'))['sharedDocs/'+id+'/dpages/panel1']?.scene==='cafe',storyId);
    const over=story.locator('.dz-over');const box=await over.boundingBox();
    await story.getByRole('button',{name:'Maya',exact:true}).dragTo(over,{targetPosition:{x:box.width*0.5,y:box.height*0.9}});
    const dropped=await story.waitForFunction(id=>{const fs=JSON.parse(localStorage.getItem('mockfs'));return Object.values(fs).find(v=>v&&v.page==='panel1'&&v.t==='art'&&v.ref==='maya')||null;},storyId).then(h=>h.jsonValue());
    if(!dropped.ground||Math.abs((dropped.y+dropped.h*286/300)-720*0.9)>12||Math.abs(dropped.x+dropped.w/2-640)>12)throw Error('Dropped person did not stand where dropped: '+JSON.stringify(dropped));
    // Selected on drop: a different side of the same person is a different drawing, and words go beside the head.
    await story.getByRole('button',{name:'Left profile',exact:true}).click();
    await story.waitForFunction(id=>Object.values(JSON.parse(localStorage.getItem('mockfs'))).some(v=>v&&v.page==='panel1'&&v.ref==='maya'&&v.view==='left'),storyId);
    await story.getByRole('button',{name:'Add a speech bubble',exact:true}).click();
    await story.getByRole('textbox',{name:'Text',exact:true}).fill('Two coffees, please.');await story.getByRole('textbox',{name:'Text',exact:true}).press('ControlOrMeta+Enter');
    const bubble=await story.waitForFunction(id=>Object.values(JSON.parse(localStorage.getItem('mockfs'))).find(v=>v&&v.page==='panel1'&&v.shape==='speech')||null,storyId).then(h=>h.jsonValue());
    if(bubble.y+bubble.h>dropped.y+dropped.h*0.5)throw Error('Speech bubble is not beside the head');
    // Grouping: the person and her bubble move together.
    await story.keyboard.press('ControlOrMeta+a');await story.keyboard.press('ControlOrMeta+g');
    await story.waitForFunction(id=>{const els=Object.values(JSON.parse(localStorage.getItem('mockfs'))).filter(v=>v&&v.page==='panel1'&&(v.t==='art'||v.t==='shape'));return els.length===2&&els[0].group&&els[0].group===els[1].group;},storyId);
    // A saved character stands in the scene; another side of it is drawn once with AI, with the cost shown first.
    await story.getByRole('button',{name:'Pip the fox',exact:true}).click();
    await story.getByRole('group',{name:'Pip the fox: view, pose and expression'}).waitFor();
    await story.getByRole('group',{name:'Pip the fox: view, pose and expression'}).getByRole('button',{name:'Left profile',exact:true}).click();
    await story.getByText('Making it uses 1 of your Designer images (7 of 10 left today).').waitFor();
    await story.getByRole('button',{name:'Draw this view',exact:true}).click();
    const variantRequest=await story.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('lastDesignerRequest')||'{}');return r.action==='variant'?r:null;}).then(h=>h.jsonValue());
    if(variantRequest.variant!=='left.stand.neutral')throw Error('Variant request wrong: '+JSON.stringify(variantRequest));
    await story.waitForFunction(id=>Object.values(JSON.parse(localStorage.getItem('mockfs'))).some(v=>v&&v.page==='panel1'&&v.char&&v.variant==='left.stand.neutral'&&v.img),storyId);
    await story.getByRole('group',{name:'Pip the fox: view, pose and expression'}).getByRole('button',{name:'Front',exact:true}).click();
    await story.getByRole('button',{name:'Use the reference picture',exact:true}).waitFor();
    // Ready-made scenes add panels; the thumbnails in the panel strip follow.
    await story.getByRole('button',{name:'Templates',exact:true}).click();
    await story.getByRole('button',{name:/A café/}).click();
    await story.waitForFunction(id=>Object.keys(JSON.parse(localStorage.getItem('mockfs'))).filter(k=>k.startsWith('sharedDocs/'+id+'/dpages/')).length===2,storyId);
    await story.reload();await story.getByRole('button',{name:/^Panel 2/}).waitFor();
    const d=await newFile(s,'Collab document');
    await d.getByRole('menuitem',{name:'Insert',exact:true}).click();
    await d.getByRole('menuitem',{name:'Picture…',exact:true}).click();
    await d.getByRole('tab',{name:'Designer',exact:true}).click();
    await d.getByLabel('Search Designer').waitFor();
    await d.locator('.inline-image-list button').filter({hasText:'Image design'}).first().click();
    const pageButton=d.getByRole('button',{name:/Insert page|Insert the image|Insert the storyboard|Insert Panel/}).first();
    await pageButton.click();
    await d.getByRole('dialog',{name:'Add pictures'}).waitFor({state:'detached'});
    if(!await d.locator('.pic-node,.sbn').count())throw Error('Designer content was not inserted');
    await d.route('https://commons.wikimedia.org/w/api.php**',route=>route.fulfill({json:{query:{pages:{1:{pageid:1,title:'File:Market.png',imageinfo:[{url:'https://upload.wikimedia.org/test/500px-test-market.png',thumburl:'https://upload.wikimedia.org/test/500px-test-market.png',width:4000,height:3000,mime:'image/png',extmetadata:{Artist:{value:'Test artist'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]}}}}}));
    await d.route('https://upload.wikimedia.org/test/500px-test-market.png',route=>route.fulfill({body:readFileSync(downloaded),contentType:'image/png'}));
    await d.getByRole('menuitem',{name:'Insert',exact:true}).click();
    await d.getByRole('menuitem',{name:'Picture…',exact:true}).click();
    await d.getByRole('tab',{name:'Wikimedia Commons',exact:true}).click();
    await d.getByLabel('Search Wikimedia Commons').fill('market');
    await d.getByRole('button',{name:'Search',exact:true}).click();
    await d.locator('.inline-image-list button').filter({hasText:'Market'}).click();
    await d.locator('.pic-credit').filter({hasText:'Test artist'}).waitFor();
    await d.reload();await d.locator('.pic-credit').filter({hasText:'CC BY 4.0'}).waitFor();
    await image.close();await story.close();return s;
  },


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
    await s.p.getByLabel('Success criteria',{exact:true}).fill('Planning a trip');
    await s.p.getByLabel('Success criteria',{exact:true}).fill('Make and compare plans.');
    await s.p.getByLabel('Practice setup',{exact:true}).fill('Adult learners working in pairs.');
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
    for (const [title, target] of [['Prepare my next lesson', '/classes'], ['Make better materials', '/collab'], ['Get everyone involved', '/classes'], ['Make a listening activity', '/recordings'], ['Keep my reading organised', '/reading'], ['Work with other teachers', '/colleagues']]) {
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
    await panel.locator('.help-thinking .ai-mark.is-working').waitFor();
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

  'Public homepage: showcase navigation, screenshot previews and pricing': async (b) => {
    const ctx=await b.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    const requests=[];p.on('request',r=>{if(/cloudfunctions.net|firestore.googleapis.com/.test(r.url()))requests.push(r.url());});
    await p.goto(BASE+'/');
    await p.getByRole('heading',{name:'Everything you need to teach. A community to grow with.'}).waitFor();
    if(await p.getByRole('link',{name:/Ask for an invitation|Request an invitation|Join ELT Suite|Buy now/}).count())throw Error('Unapproved public acquisition action');
    await axe(p,'Public homepage desktop',A11Y_FOUND);
    if(process.env.PUBLIC_SCREENSHOT)await p.screenshot({path:process.env.PUBLIC_SCREENSHOT,fullPage:false});
    if(await p.locator('.pub-home a[href^="/explore"]').count())throw Error('The homepage links to the demo');
    for(const legacy of ['/explore?step=lesson','/tour']){
      await p.goto(BASE+legacy);await p.waitForURL(BASE+'/#plan');
      await p.locator('#plan').getByRole('heading',{name:'From first idea to finished lesson.'}).waitFor();
    }
    for(const section of ['plan','teach','understand','audio','language','collaborate']){
      const shot=p.locator('#'+section+' .pub-frame').first();
      await shot.click();const dialog=p.getByRole('dialog');await dialog.waitFor();
      await dialog.locator('img').evaluate(img=>img.decode());await dialog.getByRole('button',{name:'Close'}).click();
    }
    await p.locator('.pub-lang-sentence').scrollIntoViewIfNeeded();
    await p.getByText('/ɡʊd ˈtiːtʃɪŋ ɪz wɜːθ ˈʃeərɪŋ/',{exact:true}).waitFor();
    for(const preview of await p.locator('.pub-float').all()){
      await preview.getByRole('button').focus();
      await preview.getByRole('link').click();
      if(!['#audio','#understand','#teach'].includes(new URL(p.url()).hash))throw Error('Preview did not reach its showcase');
    }
    await p.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Plans & Pricing',exact:true}).click();
    await p.getByRole('heading',{name:'Find the right space for your teaching.'}).waitFor();
    await axe(p,'Proposed pricing',A11Y_FOUND);
    for(const [path,heading] of [['/about','Created out of a love for English language teaching.'],['/contact','We’d like to hear from you.'],['/privacy','Privacy policy'],['/terms','Terms of use'],['/unknown-page','We couldn’t find that page.'],['/classes','This area is for ELT Suite members.']]){
      await p.goto(BASE+path);await p.getByRole('heading',{name:heading,exact:true}).waitFor();await axe(p,'Public '+path,A11Y_FOUND);
    }
    await p.setViewportSize({width:390,height:844});
    await p.getByRole('button',{name:'Menu +',exact:true}).click();
    const nav=p.getByRole('navigation',{name:'Main navigation'});
    await nav.getByRole('link',{name:'Plans & Pricing',exact:true}).waitFor();
    if(await nav.getByRole('link',{name:'Explore',exact:true}).count())throw Error('The menu still links to the demo');
    await nav.getByRole('link',{name:'The Platform'}).click();
    await p.waitForURL(BASE+'/#plan');
    await axe(p,'Public homepage mobile',A11Y_FOUND);
    if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Public homepage overflows on mobile');
    await p.getByRole('button',{name:'Menu +',exact:true}).click();
    await p.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Sign In'}).click();
    await p.getByLabel('Email',{exact:true}).waitFor();
    await p.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
    await p.reload();
    await p.getByLabel('Email',{exact:true}).waitFor();
    await axe(p,'Public sign-in dark',A11Y_FOUND);
    await p.goto(BASE+'/');await p.getByRole('heading',{name:'Everything you need to teach. A community to grow with.'}).waitFor();
    await axe(p,'Public homepage dark',A11Y_FOUND);
    const mobile=await b.newContext({viewport:{width:320,height:740},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    try{
      const phone=await mobile.newPage();await phone.goto(BASE+'/');
      await phone.getByRole('heading',{name:'Everything you need to teach. A community to grow with.'}).waitFor();
      for(const card of await phone.locator('.pub-float-card').all()){
        await card.tap();if(await card.getAttribute('aria-expanded')!=='true')throw Error('Touch preview failed to expand');
        await card.tap();if(await card.getAttribute('aria-expanded')!=='false')throw Error('Touch preview failed to collapse');
      }
      if(await phone.locator('.pub-float-card').count()!==4)throw Error('Missing hero preview');
      if(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Small phone overflows');
      if(process.env.PUBLIC_MOBILE_SCREENSHOT)await phone.screenshot({path:process.env.PUBLIC_MOBILE_SCREENSHOT});
    }finally{await mobile.close();}
    if(requests.length)throw Error('Public pages called a production data or AI endpoint: '+requests.join(', '));
    if(errors.length)throw Error(errors.join('; '));return {ctx,errors};
  },
  'Authentication: signed-out teacher homepage': async (b) => {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(BASE + '/');
    await see(p, '.pub-hero', 'public homepage');
    await see(p, '.pub-hero .pub-stage-main img', 'lesson editor screenshot');
    await p.reload();
    await see(p, '.pub-hero', 'public homepage after reload');
    await p.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Sign In'}).click();
    await see(p, '#teacher-sign-in', 'separate sign-in page');
    if (new URL(p.url()).pathname !== '/signin') throw Error('Sign-in route incorrect');
    if (await count(p, '.app-err')) throw Error('Sign-in rendered an error');
    await axe(p, 'Teacher sign-in', A11Y_FOUND);
    for(const flow of [
      ['Forgot password?', 'Send reset link', /sent it a reset link/],
      ['Email me a sign-in link', 'Email me a link', /Check your inbox/],
    ]){
      await p.getByRole('button',{name:flow[0],exact:true}).click();
      await p.getByLabel('Email',{exact:true}).fill('teacher@example.test');
      await p.getByRole('button',{name:flow[1],exact:true}).click();
      await p.getByRole('status').filter({hasText:flow[2]}).waitFor();
      await p.getByRole('button',{name:'Back to sign-in',exact:true}).click();
    }
    await p.getByRole('button',{name:'I Have an Invitation',exact:true}).click();
    await p.getByPlaceholder('ABCD-EF23').fill('BAD');
    await p.getByRole('button',{name:'Continue',exact:true}).click();
    await p.getByRole('alert').filter({hasText:'eight-character code'}).waitFor();

    if (errors.length) throw Error(errors.join('; '));
    return { ctx, errors };
  },
  'Authentication: teacher logout from protected page': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/classes');
    await s.p.getByRole('button', { name: 'Account', exact: true }).click();
    await s.p.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await see(s.p, '.pub-hero', 'public homepage after logout');
    if (new URL(s.p.url()).pathname !== '/') throw Error('Logout did not return home');
    await s.p.reload();
    await see(s.p, '.pub-hero', 'logout persisted after reload');
    if (await count(s.p, '.app-err')) throw Error('Logout rendered an error');
    if (s.errors.length) throw Error(s.errors.join('; '));
    return s;
  },

  'Trainer studio is class-specific and creates native completion forms': async (b) => {
    const s=await session(b);
    await s.p.evaluate(({classId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['aiPilot/teacher1']={enabled:true};fs['classes/'+classId].kind='training';fs['classes/'+classId].level='CELTA';fs['classes/'+classId].trainingProfile={programme:'CELTA',stage:'Pre-service',experience:'New to teaching',goals:'Prepare for teaching practice',context:'Teachers beginning their first course',focus:'Checking instructions',examDate:''};localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/assistant');
    await s.p.getByRole('heading',{name:'Develop teachers. Shape their practice.'}).waitFor();
    await s.p.getByLabel('Success criteria',{exact:true}).fill('Checking instructions');
    await s.p.getByRole('button',{name:'Suggest an outline'}).click();
    await s.p.getByRole('button',{name:'Approve outline and make the plan'}).click();
    await s.p.getByRole('button',{name:'Prepare training activities'}).click();

    await see(s.p,'text=Trainee completion form:','trainer form preview');
    await s.p.getByRole('button',{name:'Create practice in Classes'}).click();
    await s.p.getByRole('link',{name:'Open in Classes'}).click();
    await see(s.p,'text=Teaching move and intended learner outcome','native rehearsal form');
    await axe(s.p,'Trainer completion form',A11Y_FOUND);
    await s.p.evaluate(({classId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['classes/'+classId].kind='language';fs['classes/'+classId].level='B1';localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/assistant');
    await s.p.getByLabel('Success criteria',{exact:true}).waitFor();
    if(await s.p.getByRole('heading',{name:'Develop teachers. Shape their practice.'}).count()) throw Error('Trainer studio leaked into a language class');
    return s;
  },

  'Songs: separate tracks preview, mute, save and reopen': async (b) => {
    const s=await session(b);await s.ctx.tracing.start({screenshots:true,snapshots:true,sources:true});try{s.p.setDefaultTimeout(60000);
    const pendingRequests=new Set();s.p.on('request',r=>pendingRequests.add(r.url()));s.p.on('requestfinished',r=>pendingRequests.delete(r.url()));s.p.on('requestfailed',r=>pendingRequests.delete(r.url()));
    const reopened=async()=>{await s.p.getByLabel('Sing-along backing volume',{exact:true}).waitFor({timeout:20000}).catch(async()=>{await s.p.screenshot({path:'outputs/song-stems-reopen-failure.png'});throw Error('Reopen failed at '+s.p.url()+'\n'+s.errors.join('\n')+'\nPending: '+[...pendingRequests].join(' ')+'\nDOM: '+(await s.p.locator('#root').innerHTML()).slice(0,1400));});};await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher&savedStudio');
    await s.p.evaluate(()=>sessionStorage.setItem('mockStemDelayMs','1800'));
    await s.p.getByRole('button',{name:'Create song',exact:true}).click();const d=s.p.getByRole('dialog',{name:'Create a classroom song'});
    await d.getByRole('radio',{name:'Adults',exact:true}).check();await d.getByRole('button',{name:'Next: music'}).click();await d.getByRole('radio',{name:'Pop',exact:true}).check();await d.getByRole('radio',{name:'30 seconds',exact:true}).check();await d.getByRole('button',{name:'Next: lyrics'}).click();
    await d.getByLabel('Lyrics',{exact:true}).fill('Hello, hello, sing with me.');await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await d.getByRole('button',{name:'Create song',exact:true}).click();await returnDuringAi(s.p,'Classroom song');
    await d.getByText(/Preparing sing-along tracks/).waitFor();if(await d.getByRole('button',{name:'Add song to timeline'}).isEnabled())throw Error('Add should explain why tracks are not ready');
    await d.getByRole('button',{name:'Sing-along · no vocals',exact:true}).click();const audio=d.locator('audio');
    await audio.evaluate(el=>el.play());await s.p.waitForFunction(()=>document.querySelector('dialog audio')?.currentTime>.1);await audio.evaluate(el=>el.pause());
    await s.p.setViewportSize({width:390,height:844});if(await d.evaluate(el=>el.scrollWidth>el.clientWidth+2))throw Error('Sing-along controls overflow on mobile');await axe(s.p,'Song stems phone preview',A11Y_FOUND);await s.p.setViewportSize({width:1300,height:900});
    await axe(s.p,'Song stems preview',A11Y_FOUND);if(process.env.SONG_STEMS_SCREENSHOT)await s.p.screenshot({path:process.env.SONG_STEMS_SCREENSHOT});
    await d.getByRole('button',{name:'Vocals only',exact:true}).click();await d.getByRole('button',{name:'Full song',exact:true}).click();await d.getByRole('button',{name:'Add song to timeline'}).click();await d.waitFor({state:'hidden'});
    await s.p.getByRole('button',{name:'Mute Classroom song · Vocals',exact:true}).click();if(await s.p.getByRole('button',{name:'Mute Classroom song · Vocals'}).getAttribute('aria-pressed')!=='true')throw Error('Vocal mute failed');
    await s.p.getByRole('button',{name:'Save',exact:true}).click();await s.p.getByRole('dialog',{name:'Save the recording'}).getByRole('button',{name:'Save',exact:true}).click();
    await reopened();
    const saved=await s.p.evaluate(()=>{const fs=JSON.parse(localStorage.getItem('mockfs'));return Object.entries(fs).filter(([k,v])=>k.includes('/media/')&&v.stems).map(([k,v])=>({key:k,stems:v.stems}));});if(saved.length!==1)throw Error('Separate tracks were not persisted');
    await s.p.reload();await reopened();await axe(s.p,'Saved separate song tracks reopened',A11Y_FOUND);
    const copied=await s.p.evaluate(async({classId})=>{const fs=JSON.parse(localStorage.getItem('mockfs')),entry=Object.entries(fs).find(([k,v])=>k.startsWith('users/teacher1/archive/')&&v.name==='Classroom song');if(!entry)throw Error('Saved archive entry missing');const item={id:entry[0].split('/').at(-1),...entry[1]},api=await import('/src/lib/archive.ts');return api.mediaIn('teacher1',item,classId);},s.demo);
    await s.p.evaluate(async({classId,itemId,mediaId})=>{
      const full=await import('/src/lib/fullcopy.ts'),fire=await import('/test/mock/firestore.ts'),share=await import('/src/lib/sharing.ts');
      const read=()=>JSON.parse(localStorage.getItem('mockfs'));
      const verify=(space,id)=>{const prefix=space.startsWith('user:')?'users/'+space.slice(5):space.startsWith('share:')?'shares/'+space.slice(6):'classes/'+space;const data=read(),m=data[prefix+'/media/'+id];if(!m?.stems)throw Error('Song links missing after copy');for(const stem of ['vocals','instrumental']){const key=prefix+'/media/'+m.stems[stem];if(!data[key]||!data[key+'_p0']?.data)throw Error('Copied stem audio is missing');}};
      const carried=await full.carryMedia(classId,'song-carry-target',[{audioId:mediaId}]);verify('song-carry-target',carried[mediaId]);
      await fire.setDoc(fire.doc({},'classes',classId,'items',itemId,'tasks','song-bundle-test'),{kind:'task',order:90,title:'Song',audioId:mediaId});
      const bundle=await full.lessonBundle(classId,itemId),stems=bundle.media[mediaId].stems;if(!bundle.media[stems.vocals]||!bundle.media[stems.instrumental])throw Error('Lesson export omitted stem audio');
      const before=new Set(Object.keys(read()));await full.importBundle('song-bundle-target',bundle,{title:'Song bundle test'});const stored=read();const imported=Object.entries(stored).find(([k,v])=>!before.has(k)&&k.startsWith('classes/song-bundle-target/media/')&&v.stems);if(!imported)throw Error('Imported song manifest missing');verify('song-bundle-target',imported[0].split('/').at(-1));
      const archive={id:'song-shared',kind:'audio',name:'Shared song',folder:'',tags:[],size:0,createdAt:Date.now(),home:{classId,mediaId}},spec={kind:'media',owner:'teacher1',ownerName:'Teacher',title:'Shared song',mode:'link',people:[],src:{},archive,notes:false};
      const sharedId=await share.createShare(spec);verify('share:'+sharedId,mediaId);const own=await share.copyMediaToArchive({...spec,id:sharedId},'teacher1');const resource=read()['users/teacher1/archive/'+own];verify(resource.home.classId,resource.home.mediaId);
    },{...s.demo,mediaId:copied});
    await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher&mode=player&class='+s.demo.classId+'&media='+copied);await s.p.getByRole('button',{name:'Vocals off · sing-along',exact:true}).waitFor();await s.p.getByRole('button',{name:'Play',exact:true}).click();await s.p.getByRole('button',{name:'Pause',exact:true}).waitFor();await s.p.getByRole('button',{name:'Vocals off · sing-along',exact:true}).click();await s.p.getByRole('button',{name:'Vocals on',exact:true}).waitFor();await s.p.getByRole('button',{name:'Vocals on',exact:true}).click();await s.p.getByRole('button',{name:'Vocals off · sing-along',exact:true}).waitFor();await s.p.getByRole('button',{name:'Pause',exact:true}).waitFor();await axe(s.p,'Copied song vocals-off player',A11Y_FOUND);return s;}finally{await s.ctx.tracing.stop({path:'outputs/song-stems-trace.zip'});}
  },
  'Songs: topic-only lyric drafting and non-blocking AI activity': async(b)=>{const s=await session(b);await backgroundSongAudit(s,BASE,A11Y_FOUND,axe);return s;},
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
    await d.getByText('Help me write the lyrics',{exact:true}).click();if(!await d.getByRole('button',{name:'Draft lyrics',exact:true}).isEnabled())throw Error('A linked lesson should be sufficient to draft lyrics');await d.getByRole('button',{name:'Draft lyrics',exact:true}).click();await reviewAi(s.p,'Classroom song');
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
    await d.getByRole('button',{name:'Create song',exact:true}).click();await reviewAi(s.p,'Classroom song');await d.locator('audio').waitFor();
    const request=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockSongLastRequest')));if(request.name!=='recordingSong'||request.brief.lyrics!==words||request.approved!==true)throw Error('Approved lyrics changed');
    await d.getByRole('button',{name:'Add song to timeline',exact:true}).click();await d.waitFor({state:'hidden'});await s.p.getByRole('button',{name:'Script',exact:true}).click();await see(s.p,'.recording-script-rows textarea','song script');
    if(await s.p.locator('.recording-script-rows textarea').inputValue()!==words)throw Error('Timeline lost exact lyrics');return s;
  },
  'Songs: failures preserve words, completed previews recover and phone layout fits': async (b) => {
    const s=await session(b);await s.p.goto(BASE+'/test/speech/fixture.html?as=teacher');await s.p.getByRole('button',{name:'Create song',exact:true}).click();let d=s.p.getByRole('dialog',{name:'Create a classroom song'});
    await d.getByRole('radio',{name:'Adults',exact:true}).check();
    const unavailable=await s.p.evaluate(({classId,itemId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));sessionStorage.setItem('mockSongLessonFailure','1');return {className:fs['classes/'+classId].name,title:fs['classes/'+classId+'/items/'+itemId].title};},s.demo);
    await d.getByLabel('Classroom',{exact:true}).click();await s.p.getByRole('option',{name:new RegExp(unavailable.className)}).click();await d.getByLabel('Classroom lesson',{exact:true}).click();await s.p.getByRole('option',{name:unavailable.title,exact:true}).click();await d.getByRole('alert').waitFor();
    if(await d.getByRole('button',{name:'Next: music'}).isEnabled())throw Error('An unresolved lesson error can strand the later steps');
    await d.getByRole('button',{name:'Continue without a lesson'}).click();await d.getByRole('button',{name:'Next: music'}).click();await d.getByRole('radio',{name:'Custom style',exact:true}).check();await d.getByLabel('Custom music style',{exact:true}).fill('FAIL_TEST');await d.getByRole('button',{name:'Next: lyrics'}).click();
    await d.getByLabel('Song title',{exact:true}).fill('Travel song');await d.getByLabel('Lyrics',{exact:true}).fill('Where shall we go?\nTake a train.');await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await d.getByRole('button',{name:'Create song',exact:true}).click();await reviewAi(s.p,'Classroom song');await d.getByRole('alert').waitFor();
    if(await d.getByLabel('Lyrics',{exact:true}).inputValue()!=='Where shall we go?\nTake a train.')throw Error('Failure lost lyrics');
    await d.getByRole('button',{name:'Back',exact:true}).click();await d.getByLabel('Custom music style',{exact:true}).fill('Jazz');await d.getByRole('button',{name:'Next: lyrics'}).click();await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await d.getByRole('button',{name:'Create song',exact:true}).click();await reviewAi(s.p,'Classroom song');await d.locator('audio').waitFor();
    await s.p.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('ll.songDraft:')&&JSON.parse(sessionStorage.getItem(k)).savedSong));
    await d.getByRole('button',{name:'Back',exact:true}).click();await d.getByRole('radio',{name:'Folk',exact:true}).check();await d.getByRole('button',{name:'Next: lyrics'}).click();
    await s.p.reload();await s.p.getByRole('button',{name:'Create song',exact:true}).click();d=s.p.getByRole('dialog',{name:'Create a classroom song'});await d.getByRole('button',{name:'Recover creation'}).click();await reviewAi(s.p,'Classroom song');await d.locator('audio').waitFor();
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
    await s.p.waitForFunction(()=>document.querySelector('[aria-label="Dialogue line 1"]')?.value==='(laughs) Second take.',{},{timeout:5000});
    if(await s.p.getByLabel('Dialogue line 2',{exact:true}).inputValue()!=='First take.')throw Error('Keyboard reorder lost the other line');
    await s.p.locator('.speech-drag').first().dragTo(s.p.locator('.speech-script-row').nth(1));
    await s.p.waitForFunction(()=>document.querySelector('[aria-label="Dialogue line 1"]')?.value==='First take.',{},{timeout:5000});
    if(await s.p.getByLabel('Dialogue line 2',{exact:true}).inputValue()!=='(laughs) Second take.')throw Error('Drag reorder lost the other line');
    await s.p.getByRole('button',{name:'Regenerate line 1',exact:true}).click();await reviewAi(s.p,'Speech and dialogue');
    await s.p.getByRole('button',{name:'Listen to line 1',exact:true}).click();
    await axe(s.p,'Dialogue take table',A11Y_FOUND);
    return s;
  },
  'Speech: teacher training shares dialogue and speaking authoring': async (b) => {
    const s=await session(b);
    await s.p.evaluate(id=>{const data=JSON.parse(localStorage.getItem('mockfs'));data['classes/'+id].kind='training';localStorage.setItem('mockfs',JSON.stringify(data));},s.demo.classId);
    await s.p.goto(BASE+'/class/'+s.demo.classId+'/lesson/'+s.demo.itemId);
    await blankTask(s.p);
    await s.p.locator('.ProseMirror').nth(1).click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'Language analysis');
    await see(s.p,'text=Target language','teacher-training language analysis');
    await blankTask(s.p);
    await s.p.locator('.task-editor .editor-host .ProseMirror').first().click();await s.p.keyboard.press('ControlOrMeta+End');await slash(s.p,'AI conversation');
    await see(s.p,'.speak-setup','speaking practice in teacher training').catch(async e=>{throw Error(e.message+' '+(await s.p.locator('body').innerText()).slice(-5000)+' '+s.errors.join(';'));});
    return s;
  },
  'Speech: teacher setup, script writing, preview and speaker tracks': async (b) => {
    const s=await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await see(s.p,'.ProseMirror','the lesson editor');
    await blankTask(s.p);
    await s.p.locator('.ProseMirror').nth(1).fill('At the airport, ask the airline representative to replace your damaged suitcase.');await s.p.keyboard.press('ControlOrMeta+End');await s.p.keyboard.press('Enter');await slash(s.p,'AI conversation');
    await see(s.p,'.speak-setup','the speaking task editor');
    if(!(await s.p.getByLabel('The situation',{exact:true}).inputValue()).includes('damaged suitcase')) throw Error('AI conversation lost its activity context');
    await s.p.locator('.save-state.saved').waitFor({state:'visible'});
    const focusSource=s.p.getByRole('button',{name:'Feedback focus source',exact:true});
    await focusSource.press('ArrowDown');await s.p.getByRole('listbox',{name:'Feedback focus source',exact:true}).waitFor({state:'visible'});await focusSource.press('End');await focusSource.press('Enter');
    if(!(await focusSource.innerText()).includes('Let the learner choose'))throw Error('Feedback focus choice was not applied');
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
    await s.p.getByRole('button',{name:'Create missing takes',exact:true}).click();await reviewAi(s.p,'Speech and dialogue');
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
    await s.p.getByLabel('Success criteria', { exact: true }).waitFor();
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
    const topicBox=s.p.getByLabel('Success criteria',{exact:true});
    await topicBox.waitFor({state:'visible'}).catch(async e=>{throw Error(e.message+' '+s.errors.join('; ')+' '+(await s.p.locator('body').innerText()).slice(0,600));});
    if(await s.p.getByRole('group',{name:'What would you like to create?'}).getByRole('button',{name:/^Lesson /}).count())throw Error('Full AI lesson creation is still visible');
    await s.p.locator('.ai-context > summary').first().click();
    await s.p.getByLabel('Course type',{exact:true}).selectOption('Academic English');
    await s.p.getByLabel('Course goals',{exact:true}).fill('Compare academic arguments.');
    if(await s.p.getByLabel('Success criteria',{exact:true}).inputValue()!=='Compare academic arguments.') throw Error('Shared goals did not update the default brief');
    await s.p.getByLabel('Success criteria',{exact:true}).fill('Keep my lesson-specific objective.');
    await s.p.getByLabel('Course goals',{exact:true}).fill('Evaluate evidence.');
    if(await s.p.getByLabel('Success criteria',{exact:true}).inputValue()!=='Keep my lesson-specific objective.') throw Error('Shared goals overwrote a customized brief');
    await s.p.getByRole('button',{name:'Save to class settings'}).click();
    await see(s.p,'text=Class settings updated.','profile save');
    await s.p.getByRole('button',{name:'Exam Assess clearly and fairly'}).click();
    await s.p.getByLabel('Exam conditions',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Homework Extend learning beyond class'}).click();
    await s.p.getByLabel('Independent-work instructions',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Practice Retrieve, repeat and improve'}).click();
    await s.p.getByLabel('Practice setup',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Practice Retrieve, repeat and improve'}).click();
    const shortHeight=await topicBox.evaluate(el=>el.getBoundingClientRect().height);
    if(shortHeight>70) throw Error('Empty brief field is not compact');
    await topicBox.fill('Travel\nFood\nWork\nStudy');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)<=shortHeight) throw Error('Brief field did not expand');
    await topicBox.fill('Travel');
    if(await topicBox.evaluate(el=>el.getBoundingClientRect().height)>shortHeight+2) throw Error('Brief field did not shrink');
    await s.p.getByLabel('Success criteria', { exact: true }).fill('Compare options and agree on a trip.');
    await s.p.getByLabel('Practice setup', { exact: true }).fill('Adult B1 class working in pairs.');
    await s.p.getByRole('button', { name: 'Suggest an outline' }).click();
    await see(s.p, 'text=2. Review the outline', 'outline approval');
    await s.p.getByRole('table',{name:'Lesson stages'}).waitFor();
    await s.p.getByLabel('Stage 1: Title',{exact:true}).fill('Plan a trip together');
    if(await s.p.getByLabel('Stage 1: Title',{exact:true}).inputValue()!=='Plan a trip together') throw Error('Stage table edit was lost');
    if (await s.p.getByRole('button', { name: 'Save private draft' }).count()) throw Error('Plan created before approval');
    const revision=s.p.getByRole('region',{name:'Ask AI to make changes',exact:true});
    await revision.getByRole('button',{name:'Suggest changes',exact:true}).click();
    await s.p.getByRole('alert').getByText('Describe what you would like AI to change in the box.').waitFor();
    await revision.getByRole('textbox',{name:'Your changes',exact:true}).fill('Change the title only. Keep my stage title.');
    await revision.getByRole('button',{name:'Suggest changes',exact:true}).click();
    await revision.getByRole('button',{name:'Apply changes',exact:true}).waitFor();
    if(await s.p.getByRole('textbox',{name:'Title',exact:true}).inputValue()!=='Choose a trip')throw Error('Proposal silently replaced current outline');
    await revision.getByRole('textbox',{name:'Your changes',exact:true}).fill('I like that title. Keep it and refine the wording.');
    await revision.getByRole('button',{name:'Refine proposal',exact:true}).click();
    await revision.getByRole('button',{name:'Apply changes',exact:true}).waitFor();
    const refinement=await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockAiLastRequest')));
    if(refinement.revision.current.title!=='Revised travel choice')throw Error('Reply ignored the previous proposal');
    await s.p.getByLabel('Stage 1: Title',{exact:true}).fill('My newer manual edit');
    if(await revision.getByRole('button',{name:'Apply changes',exact:true}).isEnabled())throw Error('Stale proposal can overwrite newer manual edits');
    await revision.getByRole('button',{name:'Keep current version',exact:true}).click();
    await revision.getByRole('button',{name:'Suggest changes',exact:true}).click();
    await revision.getByRole('button',{name:'Apply changes',exact:true}).click();
    if(await s.p.getByLabel('Stage 1: Title',{exact:true}).inputValue()!=='My newer manual edit')throw Error('Applying revision lost a manual edit');

    await s.p.getByRole('button', { name: 'Approve outline and make the plan' }).click();
    await s.p.getByRole('textbox', { name: 'Main aim', exact: true }).fill('Explain a choice with two reasons');
    await revision.getByRole('textbox',{name:'Your changes',exact:true}).fill('Suggest a different title; keep my main aim.');
    await revision.getByRole('button',{name:'Suggest changes',exact:true}).click();
    await revision.getByRole('button',{name:'Keep current version',exact:true}).click();
    if(await s.p.getByRole('textbox',{name:'Main aim',exact:true}).inputValue()!=='Explain a choice with two reasons')throw Error('Rejecting plan revision lost manual edits');

    await s.p.getByRole('button', { name: 'Learner materials', exact: true }).click();
    await see(s.p, 'text=Answer key or response criteria', 'separate learner material editor');
    await s.p.getByRole('button', { name: 'Save private draft' }).click();
    await see(s.p, 'text=Saved privately.', 'private save confirmation');
    await s.p.evaluate(()=>{const drafts=JSON.parse(localStorage.getItem('mockAiDrafts')||'{}');drafts['archived-lesson']={brief:{},plan:{title:'Archived AI lesson'},creationType:'lesson',version:1};localStorage.setItem('mockAiDrafts',JSON.stringify(drafts));});
    await s.p.getByRole('button', { name: 'Start a new plan' }).click();
    await s.p.getByRole('button', { name: 'Open saved plans' }).click();
    if(await s.p.getByRole('button',{name:'Archived AI lesson',exact:true}).count())throw Error('Saved full AI lesson drafts are still listed');
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
    await s.p.locator('.ai-generation').getByRole('link',{name:'Back to class',exact:true}).click();
    const aiTray=s.p.getByRole('region',{name:'AI activity',exact:true});
    await aiTray.getByRole('link',{name:'Open in a new tab',exact:true}).waitFor();
    if(!s.p.url().includes('/assistant'))throw Error('AI navigation tray lost the active plan');
    await aiTray.getByRole('button',{name:'Keep working here',exact:true}).click();
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
    await revision.getByRole('textbox',{name:'Your changes',exact:true}).fill('Change only the lesson title; keep all activity content.');
    await revision.getByRole('button',{name:'Suggest changes',exact:true}).click();
    await revision.getByRole('button',{name:'Apply changes',exact:true}).click();
    await s.p.getByRole('heading',{name:'Revised travel choice',exact:true}).waitFor();
    await s.p.getByRole('table',{name:'Travel options'}).waitFor();

    await s.p.getByRole('button',{name:'Create practice in Classes'}).click();
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
      return top + height <= Math.floor(top / 1147) * 1147 + 1123 - 96 + 1;
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
    await s.p.getByLabel('Success criteria', { exact: true }).waitFor();
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
      return top + height <= Math.floor(top / 1147) * 1147 + 1123 - 96 + 1;
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
    const contrast = await d.locator('.pg-paper').evaluate((el) => getComputedStyle(el.querySelector('.pg-sheet')).backgroundColor !== getComputedStyle(el.closest('.pg-desk')).backgroundColor);
    if (!contrast) throw new Error('The sheet blends into the document canvas.');
    await axe(d, 'Document page tools', A11Y_FOUND);
    return s;
  },
  'Document menus, page appearance and citations': async (b) => {
    const s = await session(b);
    await s.p.goto(BASE + '/dev.html?as=teacher&friday');
    await s.p.waitForFunction(() => !!window.__mockReady);
    await s.p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return true;},null,{timeout:180000});await s.p.waitForLoadState('networkidle');
    await s.p.goto(BASE + '/');
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
      const actual = await d.locator('.pg-sheet').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      if (actual !== expected) throw new Error('Incorrect page colour: ' + actual);
    }
    await d.reload();
    await see(d, '.pg-paper[data-paper-theme="black"]', 'the saved page appearance');
    await see(d, '.cite:has-text("Thornbury, 2006, p. 24")', 'the saved citation');
    await s.p.goto(BASE + '/dev.html?as=teacher&friday-brand');
    await s.p.waitForFunction(() => !!window.__mockReady);
    await s.p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return true;},null,{timeout:180000});await s.p.waitForLoadState('networkidle');
    await s.p.goto(BASE + '/');
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
    await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const classCode = (await s.p.locator('.code-chip strong').innerText()).trim();
    await s.p.getByRole('button', { name: 'Copy the link' }).click();
    const joinLink = await s.p.evaluate(() => navigator.clipboard.readText());
    const joinUrl = new URL(joinLink);
    if (joinUrl.pathname !== '/join' || joinUrl.searchParams.get('code') !== classCode) throw Error('The copied class link does not open learner joining with the class code.');
    await s.p.click('nav.tabs button:has-text("Learners")');
    await see(s.p, 'text=Mia Chan', 'the learners list');
    await axe(s.p, 'Class', A11Y_FOUND);
    const classPictureFolder = await s.p.evaluate(async classId=>{
      const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const {uploadPicture}=await import('/src/editor/PackNode.tsx');
      await uploadPicture(classId,new File([blob],'Class chart.png',{type:'image/png'}));
      const fs=JSON.parse(localStorage.getItem('mockfs'));
      return Object.entries(fs).filter(([key,value])=>key.startsWith('users/teacher1/archive/')&&value.name==='Class chart').map(([,value])=>value.folder);
    },s.demo.classId);
    if(!classPictureFolder.includes('Classes/Demo class'))throw Error('A class picture was not saved in its Resources folder.');
    const [learnerTab] = await Promise.all([s.ctx.waitForEvent('page'), s.p.getByRole('button', { name: 'View as Mia' }).click()]);
    await see(learnerTab, '.proxy-bar:has-text("Viewing as Mia Chan")', 'the student view in its own tab');
    await see(learnerTab, 'text=Demo class', 'the student class in the view-as tab');
    await learnerTab.goto(`${BASE}/learn/${s.demo.itemId}`);
    await see(learnerTab, 'nav[aria-label="Tasks"] .task-pick', 'the learner task list on a laptop');
    const laptopPanels=await learnerTab.locator('.lesson-layout.learner').evaluate(el=>{const nav=el.querySelector('.task-list').getBoundingClientRect(),center=el.querySelector('.center-col').getBoundingClientRect();return {top:Math.abs(nav.top-center.top),overflow:document.documentElement.scrollWidth>innerWidth+2};});
    if(laptopPanels.top>12||laptopPanels.overflow)throw Error('Learner task list and lesson are misaligned on a laptop.');
    await learnerTab.setViewportSize({width:390,height:844});
    await see(learnerTab, 'nav[aria-label="Tasks"] .task-pick', 'the learner task tabs on a phone');
    const taskTabs = await learnerTab.locator('nav[aria-label="Tasks"]').evaluate(el=>({height:el.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+2}));
    if(taskTabs.height>52||taskTabs.overflow)throw Error('Learner task tabs are too tall or overflow the phone screen.');
    await learnerTab.close();
    await s.p.evaluate(() => { sessionStorage.removeItem('mockuid'); localStorage.removeItem('mockuid'); });
    await s.p.goto(joinLink);
    await see(s.p, 'h1:has-text("Join your class")', 'learner joining from the copied link');
    if (await s.p.getByLabel('Class code').inputValue() !== classCode) throw Error('The class code was not filled in for the learner.');
    await see(s.p, '.notice:has-text("Demo class")', 'the linked class');
    await s.p.getByRole('button', { name: 'Your name' }).click();
    await s.p.getByRole('option', { name: 'Mia Chan' }).click();
    const mia = s.demo.pins.find((entry) => entry.name === 'Mia Chan');
    if (!mia?.pin) throw Error('The demo learner PIN was not available.');
    await s.p.getByLabel('PIN digit 1').fill(mia.pin);
    await s.p.getByRole('button', { name: 'Join class' }).click();
    await see(s.p, 'text=Demo class', 'the class after the learner joins');
    return s;
  },
  'Lesson: diagram with a gap stays': async (b) => {
    const s = await session(b);
    // Isolate diagram editing from the demo's nested card editors.
    await s.p.evaluate(({classId,itemId})=>{const fs=JSON.parse(localStorage.getItem('mockfs'));const root='classes/'+classId+'/items/'+itemId+'/tasks/';for(const path of Object.keys(fs))if(path.startsWith(root))delete fs[path];fs[root+'diagram-fixture']={kind:'task',title:'Diagram practice',instructions:'Complete the diagram.',content:{type:'doc',content:[{type:'paragraph'}]},order:0,hidden:false,locked:false};localStorage.setItem('mockfs',JSON.stringify(fs));},s.demo);
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
  'Collab professional reading keeps its reference': async (b) => {
    const s = await session(b);
    const d = await newFile(s, 'Collab document');
    await see(d, '.ProseMirror', 'the document');
    await d.click('.ProseMirror');
    await slash(d, 'Professional reading');
    await see(d, '.studio-form[data-studio-kind="reading"]', 'the inline reading form');
    await d.getByRole('button', { name: 'Add reference' }).click();
    await d.getByRole('region', { name: 'Reading reference' }).getByRole('textbox', { name: 'Title', exact: true }).fill('Teaching Vocabulary');
    await d.getByRole('region', { name: 'Reading reference' }).getByRole('textbox', { name: 'Authors 1, surname' }).fill('Doe');
    await d.getByRole('button', { name: 'Save the source' }).click();
    await see(d, '.studio-reading-reference:has-text("Teaching Vocabulary")', 'the saved source reference');
    await d.waitForTimeout(2000);
    await d.reload();
    await see(d, '.studio-reading-reference:has-text("Teaching Vocabulary")', 'the reference after reopening');
    return s;
  },
  'Messages': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/messages`);
    await see(s.p, 'main, .msg, [class*=msg]', 'Messages');
    await s.p.getByRole('option', { name: /Teacher’s Companion/ }).click();
    await see(s.p, '.coach-chat-tools', 'Companion actions in the message view');
    for(const name of ['History','New chat','Voice conversation'])if(!(await s.p.getByRole('button',{name,exact:true}).count()))throw Error('Missing Companion action: '+name);
    if(!(await s.p.getByRole('link',{name:'Settings',exact:true}).count()))throw Error('Missing Companion settings action.');
    if(await s.p.getByText('The page name is available; its content is not automatically shared.').count())throw Error('The old page-context warning is still visible.');
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
  'Account deletion confirmation': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/settings`);
    await s.p.getByRole('button',{name:'Delete…',exact:true}).click();
    const dialog=s.p.getByRole('dialog',{name:'Delete account',exact:true});
    const action=dialog.getByRole('button',{name:'Permanently delete account',exact:true});
    if(await action.isEnabled())throw Error('Blank confirmation enables deletion');
    await dialog.getByText('Enter DELETE exactly to enable account deletion.').waitFor();
    await dialog.getByRole('textbox').fill('DELETE');
    await s.p.evaluate(()=>localStorage.setItem('mockDeleteError','Sign out and sign in again before deleting an account. Nothing has been deleted.'));
    await action.click();
    await dialog.getByRole('alert').waitFor();
    if(await s.p.evaluate(()=>!!localStorage.getItem('mockDeleteRequest')))throw Error('Rejected deletion was accepted');
    await s.p.evaluate(()=>localStorage.removeItem('mockDeleteError'));
    await action.click();
    await s.p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockDeleteRequest')||'{}').uid==='teacher1');
    await s.p.getByRole('heading',{name:'This area is for ELT Suite members.',exact:true}).waitFor();
    return s;
  },
  'Admin account deletion confirmation': async (b) => {
    const s=await session(b,{owner:true});
    await s.p.goto(`${BASE}/admin`);
    await s.p.click('.hq-nav-i:has-text("Teachers")');
    await s.p.click('.hq-table tbody tr >> nth=0');
    await s.p.getByRole('button',{name:'Delete account…',exact:true}).click();
    const dialog=s.p.getByRole('dialog',{name:'Delete account',exact:true});
    await dialog.getByText('Type DELETE to confirm').waitFor();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    if(await s.p.evaluate(()=>!!localStorage.getItem('mockDeleteRequest')))throw Error('Cancel submitted deletion');
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
  'AI usage: admin configures per-user allowances, saves and recovers errors': async (b) => {
    const s = await session(b, { owner: true });
    await s.p.evaluate(() => {const fs=JSON.parse(localStorage.getItem('mockfs')||'{}');fs['users/allowance-user']={role:'learner',displayName:'Allowance learner',email:'allowance@example.test'};localStorage.setItem('mockfs',JSON.stringify(fs));});
    await s.p.goto(BASE+'/admin?tab=ai');
    await s.p.getByRole('combobox',{name:'Songs release state',exact:true}).selectOption('testing');
    await s.p.getByRole('button',{name:'Save feature states',exact:true}).click();
    await s.p.getByText('Feature states saved. New requests use these settings.',{exact:true}).waitFor();
    await s.p.getByRole('button',{name:'AI allowances for user',exact:true}).click({timeout:15000}).catch(async e=>{throw Error(e.message+'\n'+s.errors.join('\n')+'\n'+await s.p.locator('body').innerText());});
    await s.p.getByRole('option').filter({hasText:'Allowance learner'}).click();
    await see(s.p,'.ai-usage-row','per-feature allowances');
    if(await s.p.locator('.ai-usage-row').count()!==AI_FEATURES.length)throw Error('Missing AI features');
    await s.p.getByRole('checkbox',{name:'Songs testing access',exact:true}).check();
    await s.p.getByRole('button',{name:'Teaching definitions allowance',exact:true}).waitFor();
    await s.p.getByRole('button',{name:'Songs allowance',exact:true}).click();
    await s.p.getByRole('option',{name:'Custom daily limit',exact:true}).click();
    await s.p.getByRole('spinbutton',{name:'Songs uses per day',exact:true}).fill('0');
    await s.p.getByRole('button',{name:'Save AI allowances',exact:true}).click();
    await see(s.p,'text=AI allowances saved.','saved confirmation');
    await s.p.reload();
    await s.p.getByRole('button',{name:'AI allowances for user',exact:true}).click();
    await s.p.getByRole('option').filter({hasText:'Allowance learner'}).click();
    await s.p.getByRole('spinbutton',{name:'Songs uses per day',exact:true}).waitFor();
    if(await s.p.getByRole('spinbutton',{name:'Songs uses per day',exact:true}).inputValue()!=='0')throw Error('Saved zero limit missing');
    if(!await s.p.getByRole('checkbox',{name:'Songs testing access',exact:true}).isChecked())throw Error('Saved testing access missing');
    if(await s.p.getByRole('combobox',{name:'Songs release state',exact:true}).inputValue()!=='testing')throw Error('Saved release state missing');
    await s.p.getByRole('spinbutton',{name:'Songs uses per day',exact:true}).fill('999');
    await s.p.getByRole('button',{name:'Save AI allowances',exact:true}).click();
    await see(s.p,'[role=alert]:has-text("Test save unavailable")','visible save failure');
    await s.p.getByRole('button',{name:'Songs allowance',exact:true}).click();await s.p.getByRole('option',{name:'Unlimited',exact:true}).click();
    await s.p.getByRole('button',{name:'Save AI allowances',exact:true}).click();
    await see(s.p,'text=AI allowances saved.','unlimited saved');
    await s.p.setViewportSize({width:390,height:844});
    await s.p.getByRole('button',{name:'Open it anyway',exact:true}).click();
    await s.p.getByRole('button',{name:'AI allowances for user',exact:true}).click();
    await s.p.getByRole('option').filter({hasText:'Allowance learner'}).click();
    await see(s.p,'.ai-usage-row','phone allowance controls');
    if(await s.p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('AI allowance page overflows phone');
    await axe(s.p,'Super Admin: per-user AI allowances',A11Y_FOUND);
    await s.p.getByRole('button',{name:'AI allowances for user',exact:true}).click();
    await s.p.getByRole('option').filter({hasText:'teacher@example.com'}).click();
    await see(s.p,'text=This user is a super admin.','unlimited super admin');
    if(await s.p.locator('.ai-usage-number').count())throw Error('Super admin should not have editable caps');
    return s;
  },
  'Super Admin is the owner’s alone': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/admin`);
    await see(s.p, 'text=only for the super admins', 'the closed Super Admin');
    return s;
  },
  'Learner submission records attempts before feedback and preserves retry history': async b => {
    const s=await session(b,{as:'Mia'});
    await s.p.evaluate(({classId,itemId})=>{
      const fs=JSON.parse(localStorage.getItem('mockfs'));
      const root='classes/'+classId+'/items/'+itemId+'/tasks/';
      for(const k of Object.keys(fs))if(k.startsWith(root))delete fs[k];
      fs[root+'submit-check']={kind:'task',title:'Yesterday',instructions:'Complete with the past form of go.',order:0,hidden:false,locked:false,afterCheck:'retry',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Yesterday I '},{type:'gap',attrs:{id:'submit-gap',answers:[]}},{type:'text',text:' home.'}]}]}};
      fs[root+'submit-check/private/key']={'submit-gap':{kind:'gap',answers:['went']}};
      localStorage.setItem('mockfs',JSON.stringify(fs));
    },s.demo);
    await s.p.goto(BASE+'/learn/'+s.demo.itemId);
    await s.p.getByRole('textbox',{name:'Question 1',exact:true}).fill('go');
    await s.p.getByRole('button',{name:'Check answers',exact:true}).click();
    await s.p.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('mockfs'))).some(d=>d.taskId==='submit-check'&&d.checked&&d.attempts===1&&d.submittedAt));
    await s.p.getByRole('button',{name:'Try the wrong ones again',exact:true}).click();
    await s.p.getByRole('textbox',{name:'Question 1',exact:true}).fill('went');
    await s.p.getByRole('button',{name:'Check answers',exact:true}).click();
    await s.p.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('mockfs'))).some(d=>d.taskId==='submit-check'&&d.checked&&d.attempts===2&&d.score===1));
    await s.p.reload();
    await see(s.p,'text=1 of 1 correct','saved second attempt score');
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
      // The app times out after 15 seconds. Leave a clear observation window even
      // when a busy browser renders the retry screen late, before the real load finishes.
      sessionStorage.setItem('mockfs-faults', JSON.stringify([{ op: 'transaction', path: '', count: 1, delay: 25000 }]));
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
    await see(s.p, '.hm', 'slow setup completed',60000).catch(async e=>{throw Error(e.message+' · '+(await s.p.locator('body').innerText()).slice(0,1200)+' · '+s.errors.slice(0,3).join('; '));});
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
    for (const route of ['/welcome', '/guide']) {
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
    if (await s.p.getByLabel('Message Teacher’s Companion').count()) throw Error('Coach allowed chat before profile completion');
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
    if(await s.p.getByLabel('Message Teacher’s Companion').count()) throw Error('Chat allowed without beliefs');
    for(const question of ['How do learners learn best?','What is your role in the classroom?','How should feedback support learning?','What makes learning meaningful and inclusive?','How do you know learning is happening?']) await s.p.getByLabel(question,{exact:true}).fill('I am exploring this through my teaching and observation.');
    await s.p.getByRole('button',{name:'Save beliefs and start chatting',exact:true}).click();
    await see(s.p, 'textarea[aria-label="Message Teacher’s Companion"]', 'chat composer after setup');
    await s.p.getByLabel('Message Teacher’s Companion').fill('My lesson changed direction.');
    await s.p.getByLabel('Message Teacher’s Companion').press('Enter');
    await see(s.p, '.coach-message:has-text("What did you notice")', 'chat reply');
    const initialComposerHeight = await s.p.getByLabel('Message Teacher’s Companion').evaluate(el=>el.clientHeight);
    if(initialComposerHeight>44) throw Error('Composer does not begin on one line');
    await s.p.getByLabel('Message Teacher’s Companion').fill(Array(12).fill('A longer message with a new line.').join('\n'));
    const expanded=await s.p.getByLabel('Message Teacher’s Companion').evaluate(el=>el.clientHeight);
    if(expanded<=initialComposerHeight || expanded>162) throw Error('Composer did not grow within its limit');
    await s.p.getByLabel('Message Teacher’s Companion').fill('');
    for(let i=0;i<8;i++) {
      await s.p.getByLabel('Message Teacher’s Companion').fill('Classroom observation '+i+': '+ 'I noticed different patterns in participation. '.repeat(12));
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
    await s.p.getByLabel('Message Teacher’s Companion').fill('Yes, draft a journal reflection.');
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
    await s.p.getByRole('button', {name:'Reading Journal',exact:true}).click();
    await s.p.getByRole('button', {name:'Teacher’s Companion',exact:true}).click();
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
      const reading=s.p.getByRole('menuitem',{name:'Reading Journal',exact:true});
      await reading.waitFor();
      if (await s.p.getByRole('menuitem',{name:'Development Studio',exact:true}).count()) throw Error('Development Studio still appears as an app');
      const fits=await reading.locator('.app-tile-copy b').evaluate(el => el.scrollWidth <= el.clientWidth+1);
      if (!fits) throw Error('Reading Journal label is clipped at '+width);
      await s.p.getByRole('button',{name:'Apps',exact:true}).click();
    }
    return s;
  },
  'Development Studio reading, private writing and classroom inquiry': async (b) => {
    const s = await session(b);
    await s.p.evaluate(() => { const fs = JSON.parse(localStorage.getItem('mockfs')); delete fs['aiPilot/teacher1']; fs['sharedDocs/existing-reading'] = {owner:'teacher1',ownerName:'Arda',title:'Classroom interaction notes',kind:'pd',docKey:'reading-test',members:{colleague:{role:'edit',name:'Colleague',kind:'teacher'}},memberIds:['colleague']}; localStorage.setItem('mockfs', JSON.stringify(fs)); });
    await s.p.goto(BASE + '/development');
    await see(s.p, 'h1:has-text("Development Studio")', 'development workspace');
    await s.p.getByRole('button', { name: 'Reading Journal', exact: true }).click();
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

    await readingTab.getByRole('link', { name: 'Back to Reading Journal', exact: true }).click();
    await see(readingTab, '.af', 'reading editor returns to Reading Journal');
    await readingTab.getByRole('link',{name:'ELT Suite Reading Journal: Home',exact:true}).waitFor();
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
      await axe(s.p, 'Teacher’s Companion at ' + width, A11Y_FOUND);
      const overflow = await s.p.locator('.coach-panel').evaluate(el => el.getBoundingClientRect().right > innerWidth + 1);
      if (overflow) throw Error('Coach content overflows on mobile');
    }
    let frame;
    for(const tab of ['Home','Reflections','Reading','Research','Teacher’s Companion']) {
      await s.p.getByRole('button',{name:tab==='Reading'?'Reading Journal':tab,exact:true}).click();
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
    await s.p.getByLabel('Message Teacher’s Companion').fill('What else could explain participation?');
    await s.p.getByRole('button', { name: 'Send', exact: true }).click();
    await see(s.p, '.coach-message:has-text("What did you notice")', 'reflective coaching reply');
    await s.p.getByRole('link',{name:'Settings',exact:true}).click();
    await s.p.getByRole('checkbox', { name: /^Teaching beliefs/ }).uncheck();
    await s.p.waitForFunction(() => JSON.parse(localStorage.getItem('mockfs'))['teachingCoach/teacher1/settings/context']?.beliefs === false);
    await s.p.goto(BASE+'/development?section=coach');
    await see(s.p,'.coach-message:has-text("What did you notice")','history retained after privacy change');
    await s.p.getByLabel('Message Teacher’s Companion').fill('Continue without my beliefs.');await s.p.getByRole('button',{name:'Send',exact:true}).click();
    await s.p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')).prompt==='Continue without my beliefs.');
    if((await s.p.evaluate(()=>JSON.parse(localStorage.getItem('mockCoachLastRequest')).history)).length)throw Error('Previous context was sent after privacy settings changed');
    const preserved = await s.p.evaluate(() => JSON.parse(localStorage.getItem('mockfs'))['sharedDocs/existing-reading']);
    if (JSON.stringify(preserved.memberIds) !== JSON.stringify(['colleague'])) throw Error('Reading sharing was changed');
    if (process.env.DEVELOPMENT_SCREENSHOT) { await s.p.getByRole('button', { name: 'Home', exact: true }).click(); await s.p.screenshot({ path: process.env.DEVELOPMENT_SCREENSHOT, fullPage: false }); }
    return s;
  },
  'Observation entry points hidden while existing lessons remain usable': async (b) => {
    const s = await session(b);
    await s.p.goto(`${BASE}/class/${s.demo.classId}/lesson/${s.demo.itemId}`);
    await openPlanning(s.p);
    if (await s.p.getByRole('link',{name:'Observe this lesson'}).count()) throw Error('Lesson observation is still available');
    await s.p.getByRole('button',{name:'Discuss with Teacher’s Companion'}).waitFor();
    await s.p.goto(BASE+'/observations');
    await s.p.waitForURL(/\/development$/);
    if (await s.p.getByRole('link',{name:'Observations',exact:true}).count()) throw Error('Observation navigation is still visible');
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
const vite = (LIVE_PUBLIC || process.env.SMOKE_EXTERNAL_SERVER) ? null : await up();
const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
// A first visit, so the server has prepared every page before the journeys start.
// Never seed users, mock records or authenticated flows against production.
if(!LIVE_PUBLIC && ONLY !== 'Public homepage') {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/dev.html?seed&as=teacher`, { timeout: 180000 });
  await p.waitForFunction(() => !!window.__mockReady, null, { timeout: 180000 });
  await p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return true;},null,{timeout:180000});await p.waitForLoadState('networkidle');
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
    activeSession=undefined;
    let err = '';
    try {
      s = await run(browser);
      if (s.errors.length) err = s.errors.slice(0, 3).join('\n   ');
    } catch (e) {
      s??=activeSession;
      if(s){mkdirSync('outputs/cohesion',{recursive:true});const stem='outputs/cohesion/failure-'+name.replace(/[^a-z0-9]/gi,'_').slice(0,120);await s.p.screenshot({path:stem+'.jpg'}).catch(()=>{});for(const [i,pg] of s.ctx.pages().entries())if(pg!==s.p)await pg.screenshot({path:`${stem}-tab${i}.jpg`}).catch(()=>{});}
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


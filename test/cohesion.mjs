import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

// The same user action used by the live app: return from the activity tray.
export async function reviewAi(p,title) {
  await p.waitForTimeout(60);
  const row=p.getByRole('region',{name:'AI activity',exact:true}).locator('section').filter({has:p.locator('strong',{hasText:title})});
  if(await row.isVisible()){const review=row.getByRole('button',{name:/Review result/});await Promise.race([review.waitFor({state:'visible',timeout:60000}),row.waitFor({state:'hidden',timeout:60000})]);if(await row.isVisible()&&await review.isVisible())await review.click();}
}
export async function returnDuringAi(p,title) {
  await p.waitForTimeout(60);
  const row=p.getByRole('region',{name:'AI activity',exact:true}).locator('section').filter({has:p.locator('strong',{hasText:title})});
  if(await row.isVisible())await row.getByRole('button',{name:/Return to task|Review result/}).click();
}
export async function backgroundSongAudit(s,base,out,axe) {
  const p=s.p;await p.goto(base+'/test/speech/fixture.html?as=teacher');
  await p.getByRole('button',{name:'Create song',exact:true}).click();const d=p.getByRole('dialog',{name:'Create a classroom song'});
  await d.getByRole('radio',{name:'Young learners',exact:true}).check();await d.getByRole('button',{name:'Next: music'}).click();await d.getByRole('radio',{name:'Pop',exact:true}).check();await d.getByRole('button',{name:'Next: lyrics'}).click();
  await d.getByText('Help me write the lyrics',{exact:true}).click();assert.equal(await d.getByRole('button',{name:'Draft lyrics',exact:true}).isEnabled(),false);
  await d.getByLabel('Lyric ideas').fill('Parts of the body song');assert.equal(await d.getByLabel('Song title',{exact:true}).inputValue(),'');
  await p.evaluate(()=>sessionStorage.setItem('mockSongDelayMs','3000'));await d.getByRole('button',{name:'Draft lyrics',exact:true}).click();await d.waitFor({state:'hidden'});
  const dock=p.getByRole('region',{name:'AI activity',exact:true});await dock.getByRole('button',{name:/Return to task/}).waitFor();
  assert.equal(await dock.evaluate(el=>getComputedStyle(el).colorScheme),'dark','AI activity must match the dark recording workspace');
  assert.equal(await p.locator('dialog[open]').count(),0,'Generation must release the modal');
  await dock.getByRole('button',{name:/Return to task/}).click();
  await d.getByRole('heading',{name:'Writing your lyrics…',exact:true}).waitFor();
  await d.getByRole('button',{name:'Continue working',exact:true}).click();
  await d.waitFor({state:'hidden'});
  await p.getByRole('link',{name:'ELT Suite',exact:true}).click();
  assert.equal(await dock.getByRole('link',{name:'Open in a new tab',exact:true}).getAttribute('target'),'_blank');
  assert.ok(p.url().includes('/test/speech/fixture.html'),'In-page navigation must keep active AI work mounted');
  await dock.getByRole('button',{name:'Keep working here',exact:true}).click();
  await p.getByLabel('Name',{exact:true}).fill('My ongoing edit');
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await dock.locator('.ai-mark-orbit').first().evaluate(el=>getComputedStyle(el).animationName),'none');await p.emulateMedia({reducedMotion:'no-preference'});
  await axe(p,'Non-blocking lyric progress',out);await mkdir('outputs/cohesion',{recursive:true});await p.screenshot({path:'outputs/cohesion/ai-working-corner.jpg'});
  await reviewAi(p,'Classroom song');await d.getByRole('button',{name:'Use these lyrics'}).click();assert.equal(await d.getByRole('button',{name:'Create song',exact:true}).isEnabled(),false,'Teacher review is still required');
  await d.getByLabel('I’ve reviewed the lyrics. Use these exact words.').check();await p.setViewportSize({width:390,height:844});await p.evaluate(()=>document.documentElement.dataset.theme='dark');
  await d.getByRole('button',{name:'Create song',exact:true}).click();await d.waitFor({state:'hidden'});await dock.getByRole('button',{name:/Return to task/}).waitFor();
  assert.equal(await dock.evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);await axe(p,'Non-blocking music progress on phone',out);
  await reviewAi(p,'Classroom song');await d.locator('audio').waitFor();await d.locator('audio').evaluate(el=>el.play());await p.waitForFunction(()=>document.querySelector('dialog audio')?.currentTime>.1);await d.locator('audio').evaluate(el=>el.pause());
  await d.getByRole('button',{name:'Sing-along · no vocals',exact:true}).waitFor();await d.getByRole('button',{name:'Continue working',exact:true}).click();await d.waitFor({state:'hidden'});await dock.getByText('Ready to review.',{exact:true}).waitFor();await reviewAi(p,'Classroom song');
  await d.getByRole('button',{name:'Add song to timeline'}).click();await p.getByRole('button',{name:/Mute .* · Vocals/}).waitFor();assert.equal(await p.getByLabel('Name',{exact:true}).inputValue(),'My ongoing edit','Reviewing an AI result must preserve edits made during generation');
  await p.setViewportSize({width:1300,height:900});await axe(p,'Background song returned to timeline',out);
}
export async function suiteCohesionAudit(s,base,out,axe) {
  const p=s.p, demo=s.demo;await mkdir('outputs/cohesion',{recursive:true});const result=[];
  const routes=['/','/classes','/timetable','/rooms','/archive','/games','/collab','/pdf','/design','/recordings','/development','/development?section=reflections','/development?section=reading','/development?section=research','/development?section=coach','/observations','/linguistics','/messages','/colleagues','/settings','/guide',`/class/${demo.classId}`,`/class/${demo.classId}/lesson/${demo.itemId}`,`/class/${demo.classId}/assistant`];
  // Load each route once, then audit its responsive/theme states in the same document.
  // This exercises resizing as a teacher would, without 96 full reloads of Vite's module graph.
  for(const route of routes) {
   await p.goto(base+route);await p.waitForLoadState('networkidle');
   for(const width of [1440,390])for(const theme of ['light','dark']) {
    await p.setViewportSize({width,height:1000});await p.locator('.suite-topbar').waitFor().catch(async()=>{throw Error('Missing header on '+route+' '+width+' '+theme+': '+(await p.locator('body').innerText()).slice(0,1800));});await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const measurement=await p.locator('.suite-topbar').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth-innerWidth};});
    assert.equal(measurement.height,width<700?60:64,'Shared header on '+route);assert.ok(measurement.overflow<=2,'Horizontal overflow on '+route+' '+width+' '+theme+': '+measurement.overflow);
    const menus=[];const controls=p.locator('.suite-topbar button[aria-expanded],.suite-topbar button[aria-haspopup]');
    for(let i=0;i<await controls.count();i++){const button=controls.nth(i);if(!await button.isVisible()||!await button.isEnabled())continue;const label=await button.getAttribute('aria-label')||await button.innerText();await button.click();await p.waitForTimeout(50);menus.push(label);await p.keyboard.press('Escape');}
    // Main-page dropdowns are exercised too; values are kept unchanged.
    const dropdowns=p.locator('main button[aria-haspopup="listbox"]');for(let i=0;i<Math.min(12,await dropdowns.count());i++){const button=dropdowns.nth(i);if(await button.isVisible()&&await button.isEnabled()){await button.click();await p.keyboard.press('ArrowDown');await p.keyboard.press('Escape');menus.push(await button.getAttribute('aria-label')||'Page options');}}
    await p.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await p.evaluate(()=>window.scrollTo(0,0));
    const name=route.replaceAll(/[^a-z0-9]/gi,'_');if(width===1440||['/recordings','/development','/messages','/settings'].includes(route))await p.screenshot({path:`outputs/cohesion/${width}-${theme}-${name}.jpg`});
    if(width===1440&&theme==='light'&&['/classes','/archive','/development','/observations','/linguistics','/settings'].includes(route))await axe(p,'Suite audit '+route,out);
    result.push({route,viewportWidth:width,theme,...measurement,menus});
   }
  }
  for(const width of [1440,390])for(const theme of ['light','dark']){const positions=result.filter(r=>r.viewportWidth===width&&r.theme===theme).map(r=>r.x);assert.ok(Math.max(...positions)-Math.min(...positions)<=1,'Shared header shifts horizontally between pages at '+width+' '+theme);}
  await p.setViewportSize({width:1440,height:1000});await p.goto(base+'/classes',{waitUntil:'networkidle'});
  // The audit has loaded every lazy route by this point. A development-server
  // optimisation can reload the last navigation; retry that navigation once,
  // then still require the actual shared header before measuring it.
  if(!await p.locator('.suite-topbar').isVisible())await p.reload({waitUntil:'networkidle'});
  await p.locator('.suite-topbar').waitFor().catch(async()=>{throw Error('Missing shared header after final class navigation: '+(await p.locator('body').innerText()).slice(0,1200));});const fitting=await p.locator('.suite-topbar').evaluate(el=>el.getBoundingClientRect().x);
  await p.evaluate(()=>{const extra=document.createElement('div');extra.id='cohesion-long-page';extra.style.height='200vh';extra.setAttribute('aria-hidden','true');document.body.append(extra);});const overflowing=await p.locator('.suite-topbar').evaluate(el=>el.getBoundingClientRect().x);await p.evaluate(()=>document.getElementById('cohesion-long-page')?.remove());assert.ok(Math.abs(fitting-overflowing)<=1,'Content height changes must not move the shared header');
  await writeFile('outputs/cohesion/route-audit.json',JSON.stringify({providerAndFirebaseSimulated:true,checks:result,scrollbarContentChange:{fitting,overflowing}},null,2));
}

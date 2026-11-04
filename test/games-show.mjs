// The game show from welcome to the final screen: keyboard play, lock-in, lifelines, the timer, a
// controller mirrored by a spectator through the real server checks, every question shape, and the
// stage at desktop, iPad and phone sizes with and without motion.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5217';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5217','--host','127.0.0.1'],{stdio:'ignore'});let browser;
const open=async(context,query)=>{const p=await context.newPage();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/test/games-show.html?'+query,{waitUntil:'domcontentloaded',timeout:90000});await p.getByRole('button',{name:'Start the show',exact:true}).first().waitFor();return {p,errors};};
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
try{
 for(let i=0;i<200;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch();
 // 1. Keyboard play with lock-in, explanation, a wrong answer, the ladder and the final screen.
 {const context=await browser.newContext({viewport:{width:1180,height:820}});const {p,errors}=await open(context,'theme=wood&lock=1&lifelines=1');
  await p.getByText('6 questions in 2 rounds',{exact:true}).waitFor();await p.getByRole('button',{name:'Start the show',exact:true}).click();
  await p.getByRole('heading',{name:'Where do you borrow books?'}).waitFor();
  const cards=p.locator('.show-cards button');assert.equal(await cards.count(),4);
  const library=await cards.evaluateAll(all=>all.findIndex(b=>b.textContent.includes('library')));
  await cards.first().focus();await p.keyboard.press(String.fromCharCode(65+library));await p.locator('.show-cards button[data-state=selected]').waitFor();
  assert.equal(await p.locator('.show-cards button[data-state=right]').count(),0,'nothing is revealed until the answer is locked in');
  await p.getByRole('button',{name:'Lock it in',exact:true}).click();
  await p.locator('.show-cards button[data-state=right]').waitFor();await p.getByText('Correct',{exact:true}).waitFor();
  await p.getByText('We borrow books from a library. A bookshop sells them.').waitFor();
  assert.equal(await p.locator('.show-cards button[data-state=right]').textContent().then(t=>t.includes('library')),true);
  assert.equal(await p.locator('.show-actions').count(),0,'the lock-in row goes away once the answer is shown');
  await p.getByRole('button',{name:'Next question',exact:true}).click();await p.getByRole('heading',{name:'You buy bread here.'}).waitFor();
  // A wrong answer shows the right one and scores nothing.
  const wrong=p.locator('.show-cards button').filter({hasText:'museum'});await wrong.click();await wrong.click();
  await p.locator('.show-cards button[data-state=wrong]').waitFor();await p.locator('.show-cards button[data-state=right]').filter({hasText:'bakery'}).waitFor();await p.getByText('The answer: bakery',{exact:true}).waitFor();
  await p.locator('.show-score b').filter({hasText:/^10$/}).waitFor();
  // Take two away leaves the answer and one other card.
  await p.getByRole('button',{name:'Next question',exact:true}).click();await p.getByRole('heading',{name:'Trains stop here.'}).waitFor();
  await p.getByRole('button',{name:'Take two away',exact:true}).click();
  await p.waitForFunction(()=>document.querySelectorAll('.show-cards button[data-state=removed]').length===2);
  assert.equal(await p.locator('.show-cards button:not([data-state=removed])').filter({hasText:'station'}).count(),1);
  await expectDisabled(p,'Take two away');
  for(let i=3;i<=6;i++){const card=p.locator('.show-cards button:not([data-state=removed])').first();await card.click();await p.getByRole('button',{name:'Lock it in',exact:true}).click();await p.locator('.show-reveal').waitFor();if(i<6)await p.getByRole('button',{name:i===3?'Final round':'Next question',exact:true}).click();}
  await p.getByRole('button',{name:'Finish game',exact:true}).click();await p.getByRole('heading',{name:'Game complete',exact:true}).waitFor();
  await p.getByText('Choose one question you want to remember.',{exact:false}).waitFor();await p.getByText('Worth another look',{exact:true}).waitFor();await p.getByText('You buy bread here.').waitFor();
  const score=Number(await p.locator('.show-final b').textContent());assert.ok(score>=20&&score<=50&&score%10===0,'score is 10 a question: '+score);
  await p.getByRole('button',{name:'Play again',exact:true}).click();await p.getByRole('heading',{name:'Where do you borrow books?'}).waitFor();assert.equal(await p.locator('.show-score b').first().innerText(),'0');
  assert.deepEqual(errors,[]);await context.close();console.log('Keyboard play → lock in → explanation → wrong answer → take two away → finish → play again.');}
 // 2. Without lock-in a tap answers at once; the timer runs out and the round scores nothing.
 {const context=await browser.newContext({viewport:{width:1180,height:820}});const {p,errors}=await open(context,'theme=arcade&lock=0&lifelines=1&timer=15');
  await p.clock.install();await p.getByRole('button',{name:'Start the show',exact:true}).click();await p.getByRole('heading',{name:'Where do you borrow books?'}).waitFor();
  await p.locator('.show-timer').waitFor();assert.equal(await p.getByRole('button',{name:'Lock it in',exact:true}).count(),0);
  await p.getByRole('button',{name:'Extra time',exact:true}).click();await expectDisabled(p,'Extra time');
  await p.clock.runFor(36000);await p.getByText("Time's up",{exact:true}).waitFor();await p.locator('.show-cards button[data-state=right]').filter({hasText:'library'}).waitFor();
  assert.equal(await p.locator('.show-score b').first().textContent(),'0');
  await p.getByRole('button',{name:'Next question',exact:true}).click();await p.getByRole('heading',{name:'You buy bread here.'}).waitFor();
  await p.locator('.show-cards button').filter({hasText:'bakery'}).click();await p.getByText('Correct',{exact:true}).waitFor();await p.locator('.show-score b').filter({hasText:/^10$/}).waitFor();
  assert.deepEqual(errors,[]);await context.close();console.log('No lock-in → one tap answers; extra time once; the clock runs out → no points.');}
 // 3. A controller and a spectator share one board through the real server checks, with few writes.
 {const context=await browser.newContext({viewport:{width:1280,height:1400}});const {p,errors}=await open(context,'theme=space&live=1&timer=30');
  const me=p.getByRole('region',{name:'Controller'}),them=p.getByRole('region',{name:'Spectator'});
  await them.getByText('Waiting for the show to start…').waitFor();assert.equal(await them.getByRole('button',{name:'Start the show'}).count(),0);
  await me.getByRole('button',{name:'Start the show',exact:true}).click();await them.getByRole('heading',{name:'Where do you borrow books?'}).waitFor();
  await me.locator('.show-cards button').filter({hasText:'library'}).click();await them.locator('.show-cards button[data-state=selected]').filter({hasText:'library'}).waitFor();
  assert.equal(await them.getByRole('button',{name:'Lock it in'}).isDisabled(),true,'spectators cannot lock in');
  await me.getByRole('button',{name:'Take two away',exact:true}).click();await them.locator('.show-cards button[data-state=removed]').first().waitFor();
  await me.getByRole('button',{name:'Lock it in',exact:true}).click();await them.locator('.show-cards button[data-state=right]').waitFor();await them.getByText('Correct',{exact:true}).waitFor();
  await them.locator('.show-score b').filter({hasText:/^10$/}).waitFor();await me.locator('.show-score b').filter({hasText:/^10$/}).waitFor();
  const timers=await p.locator('.show-timer').count();assert.equal(timers,2,'both see the server clock');
  const writes=Number(await p.getByLabel('Writes').textContent());assert.ok(writes<=8,'a question costs a handful of writes, not a stream: '+writes);
  assert.deepEqual(errors,[]);await context.close();console.log('Controller → spectator mirrors intro, choice, lifeline, lock and reveal in '+writes+' writes.');}
 // 4. Typed answers and rich tasks, and a long reading question, fit the stage.
 {const context=await browser.newContext({viewport:{width:1180,height:820}});
  {const {p,errors}=await open(context,'theme=paper&set=text');await p.getByRole('button',{name:'Start the show',exact:true}).click();const box=p.getByRole('textbox',{name:'Your answer'});await box.waitFor();await box.fill('airport');await box.press('Enter');await p.getByText('Correct',{exact:true}).waitFor();assert.deepEqual(errors,[]);await p.close();}
  {const {p,errors}=await open(context,'theme=garden&set=task');await p.getByRole('button',{name:'Start the show',exact:true}).click();await p.getByText('A place to borrow books is a').waitFor();await expectDisabled(p,'Take two away');await p.locator('.show-panel input, .show-panel [contenteditable]').first().fill('library');await p.getByRole('button',{name:'Lock it in',exact:true}).click();await p.locator('.show-reveal').waitFor();await p.getByText('Correct',{exact:true}).waitFor();assert.deepEqual(errors,[]);await p.close();}
  {const {p,errors}=await open(context,'theme=wood&set=long');await p.getByRole('button',{name:'Start the show',exact:true}).click();await p.getByRole('heading',{name:/Read the message/}).waitFor();assert.equal(await p.locator('.show-panel').getAttribute('data-size'),'sm');assert.equal(await overflow(p),0);assert.deepEqual(errors,[]);await p.close();}
  await context.close();console.log('Typed answers, rich tasks and long reading questions all play.');}
 // 5. iPad landscape and portrait, a phone, and reduced motion: nothing overflows and the cards stack.
 for(const [w,h,label] of [[1180,820,'iPad landscape'],[820,1180,'iPad portrait'],[390,844,'phone']]){
  const context=await browser.newContext({viewport:{width:w,height:h},reducedMotion:label==='phone'?'reduce':'no-preference',hasTouch:true,isMobile:label==='phone'});const {p,errors}=await open(context,'theme=wood');
  assert.equal(await overflow(p),0,label+' welcome overflows');await p.getByRole('button',{name:'Start the show',exact:true}).tap();await p.getByRole('heading',{name:'Where do you borrow books?'}).waitFor();
  if(label==='phone'){await p.waitForFunction(()=>!document.querySelector('.show-intro'));const cols=await p.locator('.show-cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(cols,1,'cards stack on a phone');}
  const card=p.locator('.show-cards button').filter({hasText:'library'});await card.tap();await p.getByRole('button',{name:'Lock it in',exact:true}).tap();await p.getByText('Correct',{exact:true}).waitFor();
  assert.equal(await overflow(p),0,label+' stage overflows');await p.screenshot({path:'/tmp/game-show-'+label.replace(' ','-')+'.png'});
  assert.deepEqual(errors,[]);await context.close();console.log(label+' → fits, plays by touch'+(label==='phone'?', reduced motion':'')+'.');}
}finally{await browser?.close();server.kill();}
async function expectDisabled(p,name){const b=p.getByRole('button',{name:new RegExp('^'+name+'(?: Used)?$')});await p.waitForFunction(el=>el.disabled||el.getAttribute('aria-disabled')==='true',await b.elementHandle());}

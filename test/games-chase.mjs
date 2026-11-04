// Shark escape and Taxi town from the opening screen to the end: a wrong answer, the cone, steering by
// keyboard, the clock running out, a controller mirrored by a spectator through the real server checks,
// and the stage at desktop, iPad and phone sizes with and without motion.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5219';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5219','--host','127.0.0.1'],{stdio:'ignore'});let browser;
const START={shark:'Start rowing',taxi:'Start your shift'},NEXT={shark:'Next island',taxi:'Next passenger'},OVER={shark:'The shark caught up',taxi:'Your passenger left'};
const open=async(context,query)=>{const p=await context.newPage();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/test/games-chase.html?'+query,{waitUntil:'domcontentloaded',timeout:90000});await p.locator('.chase-stage').first().waitFor();return {p,errors};};
const score=(p,n,i=0)=>p.waitForFunction(([n,i])=>document.querySelectorAll('.ch-score b')[i]?.textContent===String(n),[n,i],{timeout:5000});
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
try{
 for(let i=0;i<200;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch();
 // 1. Shark escape: welcome, a wrong answer that stays marked, the right one, four islands, the final screen.
 {const context=await browser.newContext({viewport:{width:1180,height:820}});const {p,errors}=await open(context,'type=shark&theme=wood');
  await p.getByRole('heading',{name:'Island hopping'}).waitFor();assert.equal(await p.getByRole('button',{name:'library',exact:true}).count(),0,'Answers wait for the start');
  await p.getByRole('button',{name:START.shark,exact:true}).click();await p.getByRole('timer').waitFor();
  await p.getByRole('button',{name:'garage',exact:true}).click();await p.getByText('Not yet. Try another answer.',{exact:true}).waitFor();assert.equal(await p.locator('.ch-answer[data-state=wrong]').count(),1);assert.equal(await p.getByRole('button',{name:'garage',exact:true}).isDisabled(),true,'A tried answer cannot be tried again');
  await p.getByRole('button',{name:'library',exact:true}).click();await p.getByRole('heading',{name:'Island reached'}).waitFor();await score(p,10);assert.equal(await p.locator('.sk-scene[data-mood=cleared]').count(),1);
  await p.getByRole('button',{name:NEXT.shark,exact:true}).click();await p.getByText('2 of 4').waitFor();assert.equal(await p.locator('.ch-answer[data-state=wrong]').count(),0,'A new round starts clean');
  for(const [answer,last] of [['bakery',false],['station',false],['zoo',true]]){await p.getByRole('button',{name:answer,exact:true}).click();await p.getByRole('button',{name:last?'Finish game':NEXT.shark,exact:true}).click();}
  await p.getByRole('heading',{name:'Game complete'}).waitFor();assert.equal(await p.locator('.ch-final b').innerText(),'40');assert.equal(await p.getByText('4 of 4',{exact:true}).count(),1);
  await p.getByRole('button',{name:'Play again',exact:true}).click();await p.getByRole('timer').waitFor();await score(p,0);
  assert.equal(await overflow(p),0);assert.deepEqual(errors,[]);await context.close();console.log('Shark escape → welcome, wrong then right, four islands, final screen, play again.');}
 // 2. Taxi town: the cone blocks the lane in round two, steering by button and by keyboard, answers by letter key.
 {const context=await browser.newContext({viewport:{width:1180,height:820}});const {p,errors}=await open(context,'type=taxi&theme=garden');
  await p.getByRole('button',{name:START.taxi,exact:true}).click();await p.getByRole('timer').waitFor();assert.equal(await p.getByText('Lane 2 of 3 · clear road ahead',{exact:true}).count(),1);
  await p.keyboard.press('a');await p.getByRole('heading',{name:'Passenger delivered'}).waitFor();await p.getByRole('button',{name:NEXT.taxi,exact:true}).click();
  await p.getByText('2 of 4').waitFor();await p.getByRole('button',{name:'bakery',exact:true}).click();await p.getByText('Steer around the cone first.',{exact:true}).waitFor();await score(p,10);
  await p.keyboard.press('ArrowRight');await p.getByText('Lane 3 of 3 · clear road ahead',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Steer right',exact:true}).isDisabled(),true,'No lane further right');
  await p.getByRole('button',{name:'bakery',exact:true}).click();await p.getByRole('heading',{name:'Passenger delivered'}).waitFor();await score(p,20);
  await p.getByRole('button',{name:NEXT.taxi,exact:true}).click();await p.getByRole('button',{name:'Steer left',exact:true}).click();await p.getByText('Lane 2 of 3 · clear road ahead',{exact:true}).waitFor();
  await p.getByRole('button',{name:'station',exact:true}).click();await p.getByRole('button',{name:NEXT.taxi,exact:true}).click();await p.getByRole('button',{name:'zoo',exact:true}).click();await p.getByRole('button',{name:'Finish game',exact:true}).click();
  await p.getByRole('heading',{name:'Game complete'}).waitFor();assert.equal(await p.locator('.ch-final b').innerText(),'40');assert.deepEqual(errors,[]);await context.close();console.log('Taxi town → cone, steering by key and button, four passengers, final screen.');}
 // 3. The clock runs out: game over, no next button, try again.
 for(const type of ['shark','taxi']){const context=await browser.newContext({viewport:{width:1180,height:820}});const {p,errors}=await open(context,`type=${type}&seconds=20`);await p.clock.install();
  await p.getByRole('button',{name:START[type],exact:true}).click();await p.getByRole('timer').waitFor();await p.clock.fastForward(16000);await p.locator('.ch-clock.urgent').waitFor();await p.clock.fastForward(5000);
  await p.getByRole('heading',{name:OVER[type]}).waitFor();assert.equal(await p.getByRole('button',{name:NEXT[type],exact:true}).count(),0);assert.equal(await p.getByText('Time ran out. The answer was library.').count(),1);
  await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByRole('timer').waitFor();assert.deepEqual(errors,[]);await context.close();console.log(type,'→ time ran out, game over, try again.');}
 // 4. Live: a controller and a spectator share one board through the real server checks. The spectator never writes.
 {const context=await browser.newContext({viewport:{width:1180,height:1500}});const {p,errors}=await open(context,'type=taxi&live=1');const controller=p.getByRole('region',{name:'Controller'}),spectator=p.getByRole('region',{name:'Spectator'});
  await spectator.getByText('Waiting for the game to start…').waitFor();assert.equal(await p.getByLabel('Writes').innerText(),'0','Joining an untouched board must not publish a move');
  await controller.getByRole('button',{name:START.taxi,exact:true}).click();await spectator.getByRole('timer').waitFor();assert.equal(await spectator.getByRole('button',{name:'Steer right',exact:true}).count(),0,'Spectators have no controls');
  await controller.getByRole('button',{name:'garage',exact:true}).click();await spectator.locator('.ch-answer[data-state=wrong]').waitFor();
  await controller.getByRole('button',{name:'library',exact:true}).click();await spectator.locator('.ch-answer[data-state=right]').waitFor();await spectator.getByRole('heading',{name:'Passenger delivered'}).waitFor();
  await score(p,10,1);
  const writes=+(await p.getByLabel('Writes').innerText());await p.waitForTimeout(700);assert.equal(+(await p.getByLabel('Writes').innerText()),writes,'Remote state must not produce a write loop');assert.ok(writes<=4,'start, wrong, right: at most four writes, got '+writes);
  assert.deepEqual(errors,[]);await context.close();console.log('Live → spectator mirrors the controller with',writes,'writes and no loop.');}
 // A pre-redesign shared game can be between questions with its points already saved.
 for (const type of ['shark', 'taxi']) {
  const context = await browser.newContext();
  try {
   const {p,errors} = await open(context, 'type='+type+'&live=1&resume=1');
   const controller=p.getByRole('region',{name:'Controller'}), spectator=p.getByRole('region',{name:'Spectator'});
   await controller.getByRole('button',{name:START[type],exact:true}).click();
   await spectator.getByText('2 of 4',{exact:true}).waitFor();
   await score(p,10,1);
   if(type==='taxi')await controller.getByRole('button',{name:'Steer right',exact:true}).click();
   await controller.getByRole('button',{name:'bakery',exact:true}).click();
   await spectator.getByRole('heading',{name:type==='shark'?'Island reached':'Passenger delivered'}).waitFor();
   await score(p,20,1);
   assert.deepEqual(errors,[]);
  } finally { await context.close(); }
 }
 // 5. Sizes: desktop, iPad portrait and a phone, with and without motion. No sideways scroll, play by touch.
 for(const [w,h,motion] of [[1180,820,'no-preference'],[820,1180,'no-preference'],[390,844,'reduce']]){const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,reducedMotion:motion});
  for(const type of ['shark','taxi']){const {p,errors}=await open(context,`type=${type}&theme=${w<500?'arcade':'space'}`);await p.getByRole('button',{name:START[type],exact:true}).tap();await p.getByRole('timer').waitFor();
   const box=await p.getByRole('button',{name:'library',exact:true}).boundingBox();assert.ok(box.height>=44,`${type} ${w}: answers are touch-sized`);await p.getByRole('button',{name:'library',exact:true}).tap();await p.getByRole('button',{name:NEXT[type],exact:true}).waitFor();
   assert.equal(await overflow(p),0,`${type} ${w}: no sideways scroll`);assert.deepEqual(errors,[]);await p.close();}
  await context.close();}
 console.log('Sizes → desktop, iPad portrait and phone with reduced motion play by touch without overflow.');
}finally{await browser?.close();server.kill();}

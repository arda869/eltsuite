import ts from 'typescript';
import {readFileSync} from 'node:fs';
const model=ts.transpileModule(readFileSync(new URL('../src/games/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {wordGrid,shuffled,optionsFor}=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const port=5197,base=`http://localhost:${port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port',String(port)],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/dev.html?seed&as=teacher');await page.waitForFunction(()=>!!window.__mockReady);await page.evaluate(async()=>await window.__mockReady).catch(()=>{});await page.waitForFunction(()=>!!localStorage.getItem('mockdemo'));
 await page.goto(base+'/games');await page.getByRole('heading',{name:/A little competition/}).waitFor();
 const [created]=await Promise.all([context.waitForEvent('page'),page.getByRole('button',{name:/Game show Answer rounds/}).click()]);
 await created.getByRole('heading',{name:'Build your game'}).waitFor();await created.getByRole('button',{name:'Add question',exact:true}).click();await created.getByLabel('Question or clue').fill('What colour is a clear daytime sky?');await created.getByLabel('Answer',{exact:true}).fill('blue');await created.getByRole('button',{name:'Save game',exact:true}).click();await created.getByText('Saved',{exact:true}).waitFor();await created.reload();await created.getByRole('button',{name:'Play preview',exact:true}).click();await created.getByLabel('Your answer').fill('blue');await created.getByRole('button',{name:'Check answer',exact:true}).click();await created.getByRole('button',{name:'Finish game',exact:true}).click();await created.getByRole('heading',{name:'Game complete'}).waitFor();await created.close();
 await page.evaluate(()=>{const fs=JSON.parse(localStorage.getItem('mockfs'));fs['sharedDocs/game-test']={owner:'teacher1',ownerName:'Teacher',title:'Garden game',kind:'game',memberIds:[],members:{},docKey:'game-test'};fs['sharedDocs/game-test/game/main']={version:1,type:'show',theme:'wood',sound:false,rounds:[{id:'r1',prompt:'Where do you borrow books?',answer:'library',choices:['bank','park']},{id:'r2',prompt:'Where can you see paintings?',answer:'gallery',choices:['school','bank']}]};localStorage.setItem('mockfs',JSON.stringify(fs));});
 await page.goto(base+'/doc/game-test');await page.getByRole('heading',{name:'Build your game'}).waitFor();await page.getByRole('button',{name:'Play preview',exact:true}).click();await page.getByRole('button',{name:'library',exact:false}).click();await page.getByRole('button',{name:'Next round',exact:true}).click();await page.getByRole('button',{name:'gallery',exact:false}).click();await page.getByRole('button',{name:'Finish game',exact:true}).click();await page.getByRole('heading',{name:'Game complete'}).waitFor();assert.match(await page.locator('.game-finish').innerText(),/20 points/);
 await page.getByRole('button',{name:'Back to game editor'}).click();await page.getByLabel('Look and feel').selectOption('paper');await page.getByRole('button',{name:'Save game',exact:true}).click();await page.reload();await page.getByRole('heading',{name:'Build your game'}).waitFor();assert.equal(await page.getByLabel('Look and feel').inputValue(),'paper');
 for(const type of ['shark','taxi','drive','blocks','pairs','search','hangman','maze','pinball','targets','slice','moles','wager','auction']){
  console.log('Checking',type);await page.locator('.game-settings select').first().selectOption(type);
  if(type==='auction'){await page.getByLabel('Answer',{exact:true}).nth(0).fill('Correct');await page.getByLabel('Answer',{exact:true}).nth(1).fill('Incorrect');}
  await page.getByRole('button',{name:'Play preview',exact:true}).click();await page.locator('.game-stage').waitFor();
  const rounds=[{id:'r1',prompt:'Where do you borrow books?',answer:'library',choices:['bank','park']},{id:'r2',prompt:'Where can you see paintings?',answer:'gallery',choices:['school','bank']}];
  if(type==='pairs'){
   const cards=shuffled(rounds.flatMap(r=>[{id:r.id+'a',pair:r.id},{id:r.id+'b',pair:r.id}]),'pairs');
   for(const r of rounds)for(const side of ['a','b'])await page.locator(`[data-card-id="${r.id+side}"]`).click();
  }else if(type==='search'){
   const board=wordGrid(rounds);for(const r of rounds)for(const i of board.paths[r.id])await page.locator('.game-wordgrid button').nth(i).click();
  }else if(type==='auction'){
   await page.getByRole('button',{name:'Bid 5 coins'}).first().click();await page.getByRole('button',{name:'Going, going… sold!'}).click();await page.getByRole('button',{name:'No bids — next sentence'}).click();await page.getByRole('heading',{name:'Auction complete'}).waitFor();
  }else{
   for(const r of rounds){
    if(['shark','taxi','drive','blocks'].includes(type)){await page.getByRole('button',{name:'Start round',exact:true}).click();if(['taxi','drive'].includes(type)&&r.id==='r2')await page.getByRole('button',{name:'Steer right',exact:true}).click();await page.getByRole('button',{name:r.answer,exact:true}).click();}
    else if(type==='hangman'){for(const c of new Set(r.answer.toUpperCase()))await page.getByRole('button',{name:c,exact:true}).click();}
    else if(type==='maze'){await page.getByRole('button',{name:'Up',exact:true}).click();await page.getByRole('button',{name:'Up',exact:true}).click();const x=optionsFor(r).indexOf(r.answer)*2;for(let i=0;i<Math.abs(x-2);i++)await page.getByRole('button',{name:x<2?'Left':'Right',exact:true}).click();await page.getByRole('button',{name:'Up',exact:true}).click();await page.getByRole('button',{name:'Up',exact:true}).click();}
    else if(type==='pinball'){await page.getByRole('button',{name:r.answer,exact:true}).click();await page.getByRole('button',{name:'Launch ball'}).click();}
    else {await page.getByRole('button',{name:new RegExp(r.answer)}).click();}
    await page.getByRole('button',{name:r.id==='r2'?'Finish game':'Next round',exact:true}).click();
   }
  }
  if(type!=='auction'){console.log((await page.locator('.game-stage').innerText()).slice(-500));await page.getByRole('heading',{name:'Game complete'}).waitFor();}
  await page.getByRole('button',{name:'Back to game editor'}).click();
 }
 await page.locator('.game-settings select').first().selectOption('blocks');await page.getByLabel('Answer',{exact:true}).nth(0).fill('library');await page.getByLabel('Answer',{exact:true}).nth(1).fill('gallery');await page.getByRole('button',{name:'Play preview',exact:true}).click();await page.clock.install();await page.getByRole('button',{name:'Start round',exact:true}).click();await page.getByText('30s left',{exact:true}).waitFor();await page.getByRole('button',{name:'bank',exact:true}).click();await page.getByText('Not yet. Try another answer.',{exact:true}).waitFor();await page.getByRole('button',{name:'Move left',exact:true}).click();await page.getByRole('button',{name:'Rotate block',exact:true}).click();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:'/tmp/games-blocks.png',fullPage:true});await page.clock.fastForward(31000);await page.getByRole('heading',{name:'Game over',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Next round',exact:true}).count(),0);await page.getByRole('button',{name:'Back to game editor'}).click();
 await page.setViewportSize({width:390,height:844});await page.locator('.game-settings select').first().selectOption('show');await page.getByRole('button',{name:'Play preview',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));await page.screenshot({path:'/tmp/games-preview.png',fullPage:true});await page.goto(base+'/test/games-harness.html');const controller=page.getByRole('region',{name:'Controller'}),spectator=page.getByRole('region',{name:'Spectator'});await controller.getByRole('button',{name:/library/}).click();await controller.getByRole('button',{name:'Finish game'}).click();await spectator.getByRole('heading',{name:'Game complete'}).waitFor();assert.match(await spectator.innerText(),/10 points/);assert.equal(await spectator.getByRole('button',{name:'Sound off'}).isEnabled(),true);await page.getByRole('button',{name:'Reopen controller'}).click();await controller.getByRole('heading',{name:'Game complete'}).waitFor();const writes=+(await page.getByLabel('Writes').innerText());await page.waitForTimeout(600);assert.equal(+(await page.getByLabel('Writes').innerText()),writes,'Remote state must not produce a write loop');assert.deepEqual(errors,[]);console.log('Games: editor, saved reopen, complete quiz, all fifteen complete game formats and mobile overflow checks passed (mock Firebase).');
}finally{await browser?.close();vite.kill();}

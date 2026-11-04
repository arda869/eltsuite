import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(await readFile('src/offline/html.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {offlineHtml}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const js=await readFile('public/offline-player/player.js','utf8'),css=await readFile('public/offline-player/style.css','utf8');
const model=ts.transpileModule(await readFile('src/games/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {wordGrid,optionsFor}=await import('data:text/javascript;base64,'+Buffer.from(model).toString('base64'));
const browser=await chromium.launch();
try{
 const context=await browser.newContext({offline:true});const p=await context.newPage();const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.log('Offline error:',e.message)});
 const rounds=[{id:'r1',prompt:'Where do you borrow books?',answer:'library',choices:['bank','park']},{id:'r2',prompt:'Where can you see paintings?',answer:'gallery',choices:['school','bank']}];
 for(const type of (process.env.OFFLINE_TYPES||'show,shark,taxi,drive,blocks,pairs,search,hangman,maze,pinball,targets,slice,moles,wager,auction').split(',')){
  const game={version:1,type,theme:'paper',sound:false,rounds:type==='auction'?rounds.map((r,i)=>({...r,answer:i?'Incorrect':'Correct'})):rounds};
  await writeFile('/tmp/elt-offline-'+type+'.html',offlineHtml('Town game',{title:'Town game',game},js,css));
  await p.goto('file:///tmp/elt-offline-'+type+'.html');await p.locator(type==='show'?'.show-stage':['shark','taxi'].includes(type)?'.chase-stage.game-'+type:'.game-stage.game-'+type).waitFor();if(type==='show')await p.getByRole('button',{name:'Start the show',exact:true}).click();
  if(type==='pairs'){
   for(const r of rounds)for(const side of ['a','b'])await p.locator(`[data-card-id="${r.id+side}"]`).click();
  }else if(type==='search'){
   const board=wordGrid(rounds);for(const r of rounds)for(const i of board.paths[r.id])await p.locator('.game-wordgrid button').nth(i).click();
  }else if(type==='auction'){
   await p.getByRole('button',{name:'Bid 5 coins'}).first().click();await p.getByRole('button',{name:'Going, going… sold!'}).click();await p.getByRole('button',{name:'No bids — next sentence'}).click();await p.getByRole('heading',{name:'Auction complete'}).waitFor();
  }else{
   for(const r of rounds){
    if(['shark','taxi'].includes(type)){if(r.id==='r1')await p.getByRole('button',{name:type==='shark'?'Start rowing':'Start your shift',exact:true}).click();if(type==='taxi'&&r.id==='r2')await p.getByRole('button',{name:'Steer right',exact:true}).click();await p.getByRole('button',{name:r.answer,exact:true}).click();}
    else if(['drive','blocks'].includes(type)){await p.getByRole('button',{name:'Start round',exact:true}).click();if(type==='drive'&&r.id==='r2')await p.getByRole('button',{name:'Steer right',exact:true}).click();await p.getByRole('button',{name:r.answer,exact:true}).click();}
    else if(type==='hangman'){for(const c of new Set(r.answer.toUpperCase()))await p.getByRole('button',{name:c,exact:true}).click().catch(async e=>{console.log(await p.locator('body').innerText());throw e;});}
    else if(type==='maze'){await p.getByRole('button',{name:'Up',exact:true}).click();await p.getByRole('button',{name:'Up',exact:true}).click();const x=optionsFor(r).indexOf(r.answer)*2;for(let i=0;i<Math.abs(x-2);i++)await p.getByRole('button',{name:x<2?'Left':'Right',exact:true}).click();await p.getByRole('button',{name:'Up',exact:true}).click();await p.getByRole('button',{name:'Up',exact:true}).click();}
    else if(type==='pinball'){await p.getByRole('button',{name:r.answer,exact:true}).click();await p.getByRole('button',{name:'Launch ball'}).click();}
    else if(type==='show'){await p.getByRole('button',{name:new RegExp(r.answer)}).click();await p.getByRole('button',{name:'Lock it in',exact:true}).click();}
    else {await p.getByRole('button',{name:new RegExp(r.answer)}).click();}
    await p.getByRole('button',{name:r.id==='r2'?'Finish game':type==='show'?'Next question':type==='shark'?'Next island':type==='taxi'?'Next passenger':'Next round',exact:true}).click();
   }
  }
  if(type!=='auction'){console.log((await p.locator('.game-stage,.show-stage,.chase-stage').first().innerText()).slice(-500));await p.getByRole('heading',{name:'Game complete'}).waitFor();}
  console.log('Offline complete:',type);
 }
 assert.equal(errors.length,0,errors.join('\n'));
 const tasks=[{title:'Read and answer',instructions:'Complete the sentence.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A place to borrow books is a '},{type:'gap',attrs:{id:'g',answers:['library']}}]}]}}];
 await writeFile('/tmp/elt-offline-lesson.html',offlineHtml('Town lesson',{title:'Town lesson',tasks},js,css));await p.goto('file:///tmp/elt-offline-lesson.html');await p.getByRole('textbox').fill('library');await p.getByRole('button',{name:'Check answers'}).click();assert.equal(errors.length,0,errors.join('\n'));await p.getByText('ELT Suite',{exact:true}).waitFor();await p.screenshot({path:'/tmp/elt-offline-lesson.png',fullPage:true});console.log('Downloaded lesson answered and checked offline; ELT Suite branding visible.');
}finally{await browser.close();}

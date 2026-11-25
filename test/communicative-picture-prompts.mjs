// Every valid picture-only prompt must remain usable on teacher, learner and paper surfaces.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const BASE='http://localhost:5197';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),t=await ctx.newPage(),a=await ctx.newPage();
let current='setup';
try {
 await t.goto(BASE+'/dev.html?seed&as=teacher');await t.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return !!localStorage.getItem('mockdemo');},null,{timeout:180000});await t.waitForLoadState('networkidle');
 const d=await t.evaluate(async()=>{
  const d=JSON.parse(localStorage.getItem('mockdemo')),fs=await import('/test/mock/firestore.ts'),{addTask}=await import('/src/lib/tasks.ts'),{communicativeFixture,ACTIVITY_KINDS}=await import('/test/communicative-fixtures.ts'),{configFromNode,validateActivity}=await import('/src/communicative/model.ts'),{printActivity}=await import('/src/communicative/print.ts');
  const prefix=`classes/${d.classId}/items/${d.itemId}/tasks/`;for(const k of Object.keys(JSON.parse(localStorage.getItem('mockfs'))))if(k.startsWith(prefix))await fs.deleteDoc(fs.doc({},k));
  d.kinds=ACTIVITY_KINDS;
  for(const [n,kind]of ACTIVITY_KINDS.entries()){
   const node=communicativeFixture(kind);node.content.forEach((item,i)=>{
    const src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="hsl(${i*57},40%,50%)"/><circle cx="60" cy="45" r="20" fill="white"/></svg>`);
    item.attrs.picture={src,alt:`Synthetic ${kind} picture ${i+1}`,fit:'contain'};item.content=[{type:'paragraph'}];if(!item.attrs.special)item.attrs.title='';if(['memory','dominoes'].includes(kind)){item.attrs.match='';item.attrs.matchPicture={src,alt:`Synthetic matching picture ${i+1}`,fit:'contain'};}
   });
   const config=configFromNode(node),issues=validateActivity(config);if(issues.length)throw Error(kind+': '+JSON.stringify(issues));const paper=printActivity(config).map(p=>p.html).join('');if(kind!=='speaking'&&!paper.includes('Synthetic '+kind+' picture'))throw Error(kind+' omitted picture on paper');
   await addTask(d.classId,d.itemId,n,'task',{title:'Pictures '+kind,instructions:'Use the pictures.',content:{type:'doc',content:[node]}});
  }
  return d;
 });
 await Promise.all([t.goto(`${BASE}/class/${d.classId}/lesson/${d.itemId}?as=teacher`),a.goto(`${BASE}/learn/${d.itemId}?as=Mia`)]);await t.locator('.mode-btn').click();await t.getByRole('menuitemradio',{name:/Teaching/}).click();
 for(const kind of d.kinds){
  current=kind;for(const p of [t,a])await p.getByRole('button',{name:new RegExp('Pictures '+kind+'(?:$|\\s)')}).first().click();await t.getByRole('button',{name:'Start activity',exact:true}).click();await a.locator('.ca-kind-'+kind).waitFor();await a.locator('.ca-wait').waitFor({state:'hidden'});
  if(kind==='memory')await a.locator('.ca-mcard').first().click();
  if(kind==='speaking')await a.locator('.ca-timer').waitFor();
  else await a.waitForFunction(kind=>[...document.querySelectorAll('.ca-kind-'+kind+' img')].some(i=>i.complete&&i.naturalWidth>0),kind);
  if(kind==='bingo'){
   await t.getByRole('button',{name:'Draw a call',exact:true}).click();await t.locator('.ca-call-now img').waitFor();assert.ok(await t.locator('.ca-calls button img').count()>0);
  }
  if(kind==='cue'){await t.getByRole('button',{name:'Give everyone the same card'}).click();const labels=await t.getByRole('listbox',{name:'Give everyone the same card'}).getByRole('option').allTextContents();assert.ok(labels.length>3);for(const label of labels)assert.ok(label.trim(),'Card choice must be named');await t.keyboard.press('Escape');}
  if(kind==='findSomeone')assert.match(await t.locator('.ca-class-summary').innerText(),/Synthetic findSomeone picture/);
  console.log('PASS picture-only '+kind+': '+(kind==='speaking'?'timer-only learner view':'decoded learner prompt')+', teacher controls and print markup');
 }
} catch(e){console.error('Picture-only case failed:',current);throw e;} finally{await browser.close();}

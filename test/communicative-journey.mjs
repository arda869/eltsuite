import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const BASE=process.env.SMOKE_BASE_URL||'http://localhost:5197';
if(!BASE.startsWith('http://localhost:'))throw Error('Synthetic checks require the local mock server.');
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}}), teacher=await ctx.newPage(), learner=await ctx.newPage();
const errors=[];ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));teacher.on('pageerror',e=>errors.push(e.message));learner.on('pageerror',e=>errors.push(e.message));
mkdirSync('outputs/communicative',{recursive:true});
try{
 await teacher.goto(BASE+'/dev.html?seed&as=teacher');
 await teacher.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return !!localStorage.getItem('mockdemo');},null,{timeout:180000});
 await teacher.waitForLoadState('networkidle');
 await teacher.waitForFunction(()=>!!localStorage.getItem('mockdemo'),null,{timeout:180000});
 const demo=await teacher.evaluate(async()=>{
  const d=JSON.parse(localStorage.getItem('mockdemo'));
  const fs=await import('/test/mock/firestore.ts');const {addTask}=await import('/src/lib/tasks.ts');
  const prefix=`classes/${d.classId}/items/${d.itemId}/tasks/`;
  for(const k of Object.keys(JSON.parse(localStorage.getItem('mockfs'))))if(k.startsWith(prefix))await fs.deleteDoc(fs.doc({},k));
  const card=(id,title,text)=>({type:'pickCard',attrs:{activityItemId:id,title},content:[{type:'paragraph',content:[{type:'text',text}]}]});
  const content={type:'doc',content:[{type:'communicativeActivity',attrs:{id:'private-cues',kind:'cue',instruction:'Read your card. Ask your partner for the missing information.',settings:{mode:'class'}},content:[card('museum','Museum organiser','Your private budget is 37 tokens.'),card('gallery','Gallery organiser','Your private budget is 59 tokens.')]}]};
  d.taskId=await addTask(d.classId,d.itemId,0,'task',{title:'Synthetic private cards',instructions:'Read your card.',content});
  localStorage.setItem('communicativeFixture',JSON.stringify(d));return d;
 });
 await learner.goto(BASE+'/dev.html?as=Mia');await learner.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return sessionStorage.getItem('mockuid')!=='teacher1';});
 await Promise.all([teacher.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}?as=teacher`),learner.goto(`${BASE}/learn/${demo.itemId}?as=Mia`)]);
 await teacher.locator('.mode-btn').click();
 await teacher.getByRole('menuitemradio',{name:/Teaching/}).click();

 await teacher.getByRole('button',{name:'Start activity',exact:true}).click({timeout:60000});
 await learner.locator('.ca-cues .ca-private').waitFor({timeout:30000});
 assert.equal(await learner.locator('.ca-cues .ca-private').count(),1,'Learner sees only their assigned card');
 const before=await learner.locator('.ca-cues').innerText();assert.ok(/37|59/.test(before));assert.ok(!(/37/.test(before)&&/59/.test(before)));
 await learner.reload();await learner.locator('.ca-cues .ca-private').waitFor();assert.equal(await learner.locator('.ca-cues').innerText(),before,'Assignment survives reopening');
 await teacher.getByRole('button',{name:'End',exact:true}).click();await learner.getByText('This activity has ended.',{exact:true}).waitFor();assert.equal(await learner.locator('.ca-cues .ca-private').count(),1,'End does not reveal private cards');
 await teacher.getByRole('button',{name:'Play again',exact:true}).click();await teacher.getByRole('button',{name:'Start',exact:true}).click();
 await teacher.getByRole('button',{name:'Compare versions',exact:true}).click();await learner.waitForFunction(()=>document.querySelectorAll('.ca-cues .ca-private').length===2);
 await teacher.screenshot({path:'outputs/communicative/teacher-cues.png'});await learner.screenshot({path:'outputs/communicative/learner-compared-cues.png'});
 assert.deepEqual(errors,[]);console.log('PASS simultaneous teacher/learner private cards, reopen, End privacy, reset and explicit Compare (local Firebase stand-ins).');
} catch(e){await teacher.screenshot({path:'outputs/communicative/failure-teacher.png'}).catch(()=>{});await learner.screenshot({path:'outputs/communicative/failure-learner.png'}).catch(()=>{});console.error(errors);throw e;}finally{await browser.close();}

import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const BASE=process.env.STYLE_BASE||'http://localhost:5184';
const b=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});
const ctx=await b.newContext({viewport:{width:1300,height:900}}),p=await ctx.newPage();p.setDefaultTimeout(120000);
let learnerPage;const errors=[];ctx.on('page',q=>q.on('pageerror',e=>errors.push(e.message)));
try {
 await p.goto(`${BASE}/dev.html?seed&as=teacher`);await p.waitForFunction(()=>JSON.parse(localStorage.getItem('mockdemo')||'{}').packId);
 const demo=await p.evaluate(()=>JSON.parse(localStorage.mockdemo));
 const taskId=await p.evaluate(async ({classId,itemId})=>{
  const {doc,updateDoc}=await import('/test/mock/firestore.ts');const {addTask}=await import('/src/lib/tasks.ts');const {fixture}=await import('/test/lesson-style-fixture.ts');
  const fs=JSON.parse(localStorage.mockfs);for(const [path,t] of Object.entries(fs))if(path.startsWith(`classes/${classId}/items/${itemId}/tasks/`)&&path.split('/').length===6)await updateDoc(doc({},path),{hidden:true});
  await updateDoc(doc({},'classes',classId),{lessonStyle:'young'});
  return addTask(classId,itemId,-1,'task',{title:'Presentation context fixture',instructions:'Read, choose and compare.',content:fixture});
 },demo);
 await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);await p.locator('.task-frame[data-lesson-style=young]').waitFor();await p.locator('.frame-body .ProseMirror').first().waitFor();
 assert(await p.locator('.dg-node').count());assert(await p.locator('.tbox.s-speech').count());console.log('PASS Teacher editor receives Young learner class context with nested fixture');
 await p.keyboard.press('Control+Shift+P');await p.locator('.task-body .dg [data-qid="diagram-gap"]').waitFor();console.log('PASS Teacher preview preserves nested diagram control');
 await p.keyboard.press('Control+Shift+P');await p.getByRole('radio',{name:'Worksheet: the lesson as printed pages',exact:true}).click();await p.locator('.task-frame[data-lesson-style=young]').waitFor();
 assert((await p.locator('.frame-body .ProseMirror').first().evaluate(el=>getComputedStyle(el).fontFamily)).includes('Atkinson'));console.log('PASS Worksheet editor keeps Young learner typeface and class context');
 const learnerUid=await p.evaluate(()=>Object.entries(JSON.parse(localStorage.mockfs)).find(([path,v])=>path.startsWith('users/')&&v.role==='learner'&&v.displayName.startsWith('Mia'))[0].split('/')[1]);
 const l=await ctx.newPage();learnerPage=l;l.setDefaultTimeout(120000);await l.goto(`${BASE}/dev.html?as=Mia`);await l.waitForFunction(uid=>sessionStorage.getItem('mockuid')===uid,learnerUid);await l.goto(`${BASE}/learn/${demo.itemId}`);await l.locator('.task-frame[data-lesson-style=young]').waitFor();
 const input=l.locator('[data-qid="email-gap"] input');await input.fill('Monday');await input.blur();
 await l.waitForFunction(({classId,taskId})=>Object.entries(JSON.parse(localStorage.mockfs)).some(([path,v])=>path.startsWith(`classes/${classId}/answers/${taskId}_`)&&v.responses?.['email-gap']==='Monday'),{classId:demo.classId,taskId});
 const protectedData=()=>l.evaluate(({classId,itemId,taskId})=>Object.fromEntries(Object.entries(JSON.parse(localStorage.mockfs)).filter(([path])=>path.startsWith(`classes/${classId}/items/${itemId}/tasks/${taskId}`)||path.startsWith(`classes/${classId}/answers/${taskId}_`))),{...demo,taskId});
 const saved=await protectedData();
 for(const style of ['adult','young','adult']) {
  await p.evaluate(async({classId,style})=>{const{getClass,updateClass}=await import('/src/lib/classes.ts');await updateClass(await getClass(classId),{lessonStyle:style});},{classId:demo.classId,style});
  await l.locator(`.task-frame[data-lesson-style=${style}]`).waitFor();assert.equal(await input.inputValue(),'Monday');await l.reload();await l.locator(`.task-frame[data-lesson-style=${style}]`).waitFor();await l.waitForFunction(()=>document.querySelector('[data-qid="email-gap"] input')?.value==='Monday');assert.equal(await input.inputValue(),'Monday');assert.deepEqual(await protectedData(),saved);
 }
 console.log('PASS Actual learner autosave, cross-tab class updates and reloads preserve nested answers and task/key JSON in both styles');assert.deepEqual(errors,[]);
} catch(e) {console.log('DIAGNOSTIC',learnerPage?.url(),await learnerPage?.locator('body').innerText(),await learnerPage?.evaluate(()=>({uid:sessionStorage.getItem('mockuid')})));throw e;} finally {await b.close();}

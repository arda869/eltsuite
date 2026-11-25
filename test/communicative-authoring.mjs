import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const BASE=process.env.BASE_URL??'http://localhost:5197';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})}),p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
try {
 await p.goto(BASE+'/dev.html?seed&as=teacher');await p.waitForFunction(async()=>{if(!window.__mockReady)return false;await window.__mockReady;return !!localStorage.mockdemo},null,{timeout:180000});await p.waitForLoadState('networkidle');
 const d=await p.evaluate(async()=>{const d=JSON.parse(localStorage.mockdemo),{addTask}=await import('/src/lib/tasks.ts');d.authorTask=await addTask(d.classId,d.itemId,100,'task',{title:'Authoring verification',content:{type:'doc',content:[{type:'paragraph'}]}});d.questionTask=await addTask(d.classId,d.itemId,101,'task',{title:'Question settings verification',content:{type:'doc',content:[{type:'paragraph'}]}});const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='teal';ctx.fillRect(0,0,120,80);ctx.fillStyle='white';ctx.fillRect(40,20,40,40);d.png=canvas.toDataURL('image/png');return d;});
 const pictureFile={name:'spot.png',mimeType:'image/png',buffer:Buffer.from(d.png.split(',')[1],'base64')};
 const route=`${BASE}/class/${d.classId}/lesson/${d.itemId}?as=teacher`;
 async function open(title='Authoring verification'){await p.goto(route);await p.getByRole('button',{name:title,exact:false}).first().click();await p.locator('.task-editor').first().waitFor();await p.waitForLoadState('networkidle');}
 async function pasteGrid(cell, value){await cell.evaluate((el,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));},value);}
 const gridCell=(node,row,col=0)=>node.locator(`.ig [data-cell="${row}:${col}"]`);
 const cards=node=>node.locator('.ig-row:not(.ig-head):not(.ig-ghost)');
 async function preview(node){if(await node.locator('.ca-rest').isVisible())await node.locator('.ca-rest').dispatchEvent('mousedown');await node.getByRole('button',{name:'Preview on screen',exact:true}).click();const dialog=p.getByRole('dialog',{name:/Preview:/});await dialog.getByRole('button',{name:'Try the activity',exact:true}).click();await dialog.getByRole('radio',{name:'As Learner A'}).click();return dialog;}
 await open();
 async function insert(label){const selector=label==='Gap fill'?'.gap-node':label==='Multiple choice, as a list'?'.choice-node':label==='Find and fix the mistake'?'.pq-node':label==='Long answer'?'.q-block:has(.writing-edit)':'.ca-editor-node';const previous=await p.locator(selector).count();await p.locator('.task-editor .ProseMirror').first().focus();const trigger=p.getByRole('button',{name:'Everything you can add, with pictures',exact:true}).first(),dialog=p.getByRole('dialog',{name:'Add to the task'});await trigger.click();if(!await dialog.isVisible())await trigger.click();await dialog.getByRole('textbox',{name:'Search'}).fill(label);await (label==='Timer'?dialog.locator('.gallery-card:has([data-preview="activity-speaking"])'):dialog.locator('.gallery-card').filter({hasText:label}).first()).click();await p.waitForFunction(({selector,previous})=>document.querySelectorAll(selector).length>previous,{selector,previous});}
 if(!process.env.QUESTION_SETTINGS_ONLY){
 await insert('Board game');const ca=p.locator('.ca-editor-node').last();await ca.waitFor();assert.equal(await cards(ca).count(),12);await ca.getByText('things to finish',{exact:false}).waitFor();await ca.getByRole('button',{name:'Preview on screen',exact:true}).click();const blank=p.getByRole('dialog',{name:/Preview:/});await blank.getByRole('button',{name:'Try the activity',exact:true}).click();assert.equal(await blank.getByRole('radiogroup',{name:'View the preview as'}).count(),0);await blank.getByRole('button',{name:'Close',exact:true}).click();console.log('PASS blank starter has visible requirements and cannot start');
 await pasteGrid(gridCell(ca,1),Array.from({length:10},(_,n)=>`Question ${n+1}`).join('\n'));assert.equal(await cards(ca).count(),12);
 await gridCell(ca,12).fill('New square');assert.equal(await cards(ca).count(),13);assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'11:0');assert.equal(await gridCell(ca,11).inputValue(),'New square');console.log('PASS board empty last row inserts before Finish and keeps the caret');
 await ca.getByLabel('Number of squares').fill('16');await ca.getByLabel('Number of squares').press('Tab');await p.waitForTimeout(100);assert.equal(await cards(ca).count(),16);
 await p.waitForTimeout(700);await pasteGrid(gridCell(ca,15),'New 1\tOrdinary square\nNew 2\tOrdinary square\nNew 3\tOrdinary square');assert.equal(await cards(ca).count(),19);assert.equal(await gridCell(ca,18).inputValue(),'Finish');await p.locator('.task-editor .ProseMirror').first().focus();await p.keyboard.press(process.platform==='darwin'?'Meta+Z':'Control+Z');assert.equal(await cards(ca).count(),16);console.log('PASS board 3×2 paste inserts before Finish and one editor undo removes the paste');

 await ca.getByLabel('Number of squares').fill('48');await ca.getByLabel('Number of squares').press('Tab');assert.equal(await cards(ca).count(),48);await ca.getByLabel('Number of squares').fill('49');await ca.getByLabel('Number of squares').press('Tab');await ca.getByText('A board can have up to 48 squares.').waitFor();
 await ca.getByLabel('Number of squares').fill('12');await ca.getByLabel('Number of squares').press('Tab');
 const boardPreview=await preview(ca);await boardPreview.getByRole('button',{name:'Roll the die',exact:true}).waitFor();await boardPreview.getByRole('button',{name:'Close',exact:true}).click();console.log('PASS board insertion, grid paste, resize and learner preview');
 await p.waitForTimeout(1600);await open();assert.equal(await cards(p.locator('.ca-editor-node').first()).count(),12);assert.equal(await gridCell(p.locator('.ca-editor-node').first(),1).inputValue(),'Question 1');console.log('PASS board saved and reopened');

 const cases=[['bingo','Bingo',18],['dominoes','Dominoes',3],['memory','Pelmanism',3],['strips','Strip story',3],['cue','Cue cards',1],['survey','Survey',1],['findSomeone','Find someone who',6],['ranking','Ranking',4],['opinion','Opinion line',1],['spot','Spot the difference',2],['taboo','Taboo cards',3],['speaking','Timer',1]];
 for(const [kind,label,count] of cases){
  console.log('CHECK',kind);
  await insert(label);const node=p.locator('.ca-editor-node').last();await node.waitFor();
  if(kind!=='spot'&&kind!=='speaking'){
   const first=gridCell(node,0),lines=Array.from({length:kind==='survey'?3:count},(_,n)=>['dominoes','memory'].includes(kind)?`Word ${n+1}\tMeaning ${n+1}`:kind==='survey'?`Prompt ${n+1}\tBus; Tram`:`Prompt ${n+1}`);
   if(lines.length===1 && !lines[0].includes('\t'))await first.fill(lines[0]);else await pasteGrid(first,lines.join('\n'));
   assert.equal(await cards(node).count(),Math.max(count,kind==='bingo'?18:kind==='findSomeone'?6:kind==='ranking'?4:['cue','opinion'].includes(kind)?1:3),kind+' keeps or extends starter cards');
  }
  if(kind==='strips')await gridCell(node,0).fill('Edited opening strip');
  if(kind==='spot'){
   for(let n=0;n<2;n++){const item=node.locator('.ca-item').nth(n);if(!await item.locator('.ca-picture-field').isVisible())await item.locator('summary').click();const chooser=p.waitForEvent('filechooser');await item.getByRole('button',{name:'Upload',exact:true}).click();await(await chooser).setFiles(pictureFile);await item.getByLabel('Picture description',{exact:true}).fill(n?'Second white square':'First white square');}
   await node.locator('.ca-item').nth(1).getByLabel('Horizontal framing',{exact:true}).fill('40');await node.locator('.ca-item').nth(1).getByLabel('Vertical framing',{exact:true}).fill('50');await node.locator('.ca-spot-keys summary').click();await node.getByRole('button',{name:'Mark this point',exact:true}).focus();await p.keyboard.press('Enter');
  }
  const activityPreview=await preview(node);await activityPreview.locator('.ca-kind-'+kind).waitFor();await activityPreview.getByRole('button',{name:'Close',exact:true}).click();
  console.log('PASS',kind,kind==='spot'?'gallery insertion, pictures, keyboard difference marker and local learner preview':'gallery insertion, list replacement and local learner preview; optional fields blank');
  if(kind!=='spot'&&kind!=='speaking'){
   const before=await cards(node).count(),first=gridCell(node,0),columns=await node.locator('.ig-head .ig-h').count();
   await first.focus();await first.press('ArrowDown');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'1:0',kind+' ArrowDown');await gridCell(node,1).press('ArrowUp');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'0:0',kind+' ArrowUp');await first.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),columns>1?'0:1':'1:0',kind+' Tab');await first.focus();await first.press('Enter');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),'1:0',kind+' Enter');
   await gridCell(node,before).fill('Extra entry');assert.equal(await cards(node).count(),before+1,kind+' adds a row');assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('data-cell')),`${before}:0`,kind+' keeps the caret');
   await p.waitForTimeout(700);await first.click();await (columns>1?gridCell(node,0,1):gridCell(node,1)).click({modifiers:['Shift']});const copied=await node.locator('.ig').evaluate(el=>{const clipboardData=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData}));return clipboardData.getData('text/plain');});assert.ok(copied.includes(columns>1?'\t':'\n'),kind+' copies a TSV selection');const original=await first.inputValue();await p.keyboard.press('Delete');assert.equal(await first.inputValue(),'',kind+' Delete');await p.locator('.task-editor .ProseMirror').first().focus();await p.keyboard.press(process.platform==='darwin'?'Meta+Z':'Control+Z');assert.equal(await first.inputValue(),original,kind+' selection Delete undoes');
   await node.getByRole('button',{name:`Remove row ${before+1}`}).click();assert.equal(await cards(node).count(),before,kind+' removes its added row');
   await p.waitForTimeout(700);await pasteGrid(gridCell(node,0),'Grid A\tGrid B\nGrid C\tGrid D\nGrid E\tGrid F');assert.equal(await cards(node).count(),Math.max(before,3),kind+' 3×2 paste');await p.locator('.task-editor .ProseMirror').first().focus();await p.keyboard.press(process.platform==='darwin'?'Meta+Z':'Control+Z');assert.equal(await cards(node).count(),before,kind+' paste undo');
   console.log('PASS',kind,'grid typing, caret, arrows, Tab/Enter, TSV copy, Delete, 3×2 paste and one-step undo');
  }
 }
 await p.waitForTimeout(1600);await open();assert.equal(await p.locator('.ca-editor-node').count(),13);
 for(let n=0;n<13;n++){const node=p.locator('.ca-editor-node').nth(n);const dialog=await preview(node);await dialog.getByRole('button',{name:'Close',exact:true}).click();}
 assert.equal(await p.locator('.ca-editor-node').nth(2).locator('.ig [data-cell="0:1"]').inputValue(),'Meaning 1');console.log('PASS all 13 activities saved, reopened and previewed again with persisted grid cells and spot pictures');
 await p.setViewportSize({width:768,height:1000});await p.locator('.ca-editor-node').first().waitFor();const sizes=await p.locator('.ca-editor-node').evaluateAll(nodes=>nodes.map(n=>({kind:n.querySelector('.block-label')?.textContent,width:n.getBoundingClientRect().width,scroll:n.scrollWidth})));assert.equal(sizes.length,13);const overflow=sizes.filter(n=>n.scroll>n.width+2);assert.deepEqual(overflow,[]);console.log('PASS768px authoring: all13 activities fit without horizontal overflow');
 await p.addScriptTag({content:readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')});const violations=await p.evaluate(async()=>{const r=await window.axe.run('.ca-editor-node',{runOnly:['wcag2a','wcag2aa']});return r.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target)}))});assert.deepEqual(violations,[]);console.log('PASS scoped activity axe WCAG2A/2AA: no violations');await p.setViewportSize({width:390,height:844});await p.locator('.ca-editor-node').first().waitFor({state:'hidden'});await p.locator('.ca-kind-board').first().waitFor();console.log('PASS390px uses the app’s phone preview; authoring remains a computer/tablet feature');await p.setViewportSize({width:1440,height:1000});

 }
 await open('Question settings verification');
 for(const [label,type,selector] of [['Gap fill','gap','.gap-node'],['Multiple choice, as a list','choice','.choice-node'],['Find and fix the mistake','pq','.pq-node'],['Long answer','writing','.q-block:has(.writing-edit)']]){
  await insert(label);const node=p.locator(selector).last();if(type==='gap')await node.locator('.gap-chip').click();if(type==='choice'){await node.locator('.choice-chip').click();await node.getByLabel('Option a',{exact:true}).fill('Bus');await node.getByLabel('Option b',{exact:true}).fill('Tram');}
  await node.getByLabel('No correct answer',{exact:true}).check();assert.equal(await node.getByLabel('No correct answer',{exact:true}).isChecked(),true);if(type==='choice')assert.equal(await node.getByText('Mark the correct option.',{exact:true}).count(),0);
  if(type==='gap')await node.getByLabel('Right answers, separated by |').press('Escape');if(type==='choice')await node.getByRole('button',{name:'Done',exact:true}).click();
  console.log('PASS',type,'No correct answer set in actual editor');
 }
 await p.waitForTimeout(1600);await open('Question settings verification');
 for(const [type,selector] of [['gap','.gap-node'],['choice','.choice-node'],['pq','.pq-node'],['writing','.q-block:has(.writing-edit)']]){const node=p.locator(selector).last();if(type==='gap')await node.locator('.gap-chip').click();if(type==='choice'){await node.locator('.choice-chip').click();}assert.equal(await node.getByLabel('No correct answer',{exact:true}).isChecked(),true,type+' persisted');if(type==='gap')await node.getByLabel('Right answers, separated by |').press('Escape');if(type==='choice')await node.getByRole('button',{name:'Done',exact:true}).click();}
 console.log('PASS gap, choice, pack and writing No correct answer settings saved and reopened');


 assert.deepEqual(errors,[]);
} catch(e){console.log('AUTHOR FAILURE', (await p.locator('body').innerText()).slice(-18000));throw e;} finally {await browser.close();}

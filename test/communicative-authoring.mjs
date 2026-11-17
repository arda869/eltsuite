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
 const d=await p.evaluate(async()=>{const d=JSON.parse(localStorage.mockdemo),{addTask}=await import('/src/lib/tasks.ts');d.authorTask=await addTask(d.classId,d.itemId,100,'task',{title:'Authoring verification',content:{type:'doc',content:[{type:'paragraph'}]}});d.questionTask=await addTask(d.classId,d.itemId,101,'task',{title:'Question settings verification',content:{type:'doc',content:[{type:'paragraph'}]}});return d;});
 const route=`${BASE}/class/${d.classId}/lesson/${d.itemId}?as=teacher`;
 async function open(title='Authoring verification'){await p.goto(route);await p.getByRole('button',{name:title,exact:false}).first().click();await p.locator('.task-editor').first().waitFor();await p.waitForLoadState('networkidle');}
 await open();
 async function insert(label){const selector=label==='Gap fill'?'.gap-node':label==='Multiple choice, as a list'?'.choice-node':label==='Find and fix the mistake'?'.pq-node':label==='Long answer'?'.q-block:has(.writing-edit)':'.ca-editor-node';const previous=await p.locator(selector).count();await p.getByRole('button',{name:'Everything you can add, with pictures',exact:true}).first().click();const dialog=p.getByRole('dialog');const section=label==='Long answer'?'Speaking, writing and reflection':['Gap fill','Multiple choice, as a list','Find and fix the mistake'].includes(label)?'Questions checked by the app':'Communicative activities';await dialog.getByRole('button',{name:new RegExp('^'+section)}).click();await dialog.locator('.gallery-card').filter({hasText:label}).first().click();await p.waitForFunction(({selector,previous})=>document.querySelectorAll(selector).length>previous,{selector,previous});}
 if(!process.env.QUESTION_SETTINGS_ONLY){
 await insert('Board game');const ca=p.locator('.ca-editor-node').last();await ca.waitFor();assert.equal(await ca.locator('.pick-card-title').count(),12);await ca.getByText('Add text or a picture to item 2.',{exact:true}).waitFor();await ca.getByRole('button',{name:'Try the activity',exact:true}).click();assert.equal(await ca.getByLabel('Preview as').count(),0);console.log('PASS blank starter has visible requirements and cannot start');
 await ca.getByLabel('Paste a list').fill(Array.from({length:10},(_,n)=>`Question ${n+1}`).join('\n'));await ca.getByRole('button',{name:'Add list',exact:true}).click();assert.equal(await ca.locator('.pick-card-title').count(),12);
 await ca.getByLabel('Number of squares').fill('16');await ca.getByLabel('Number of squares').press('Tab');await p.waitForTimeout(100);assert.equal(await ca.locator('.pick-card-title').count(),16);

 await ca.getByLabel('Number of squares').fill('48');await ca.getByLabel('Number of squares').press('Tab');assert.equal(await ca.locator('.pick-card-title').count(),48);await ca.getByLabel('Number of squares').fill('49');await ca.getByLabel('Number of squares').press('Tab');await ca.getByRole('alert').filter({hasText:'Use between 12 and 48 squares.'}).waitFor();
 await ca.getByLabel('Number of squares').fill('12');await ca.getByLabel('Number of squares').press('Tab');
 await ca.getByRole('button',{name:'Try the activity',exact:true}).click();await ca.getByLabel('Preview as').selectOption('preview-a');await ca.getByRole('button',{name:'Roll the die',exact:true}).waitFor();console.log('PASS board insertion, replacement paste, resize and learner preview');
 await p.waitForTimeout(1600);await open();assert.equal(await p.locator('.ca-editor-node .pick-card-title').count(),12);assert.equal(await p.locator('.ca-editor-node .pick-card-title').nth(1).inputValue(),'Question 1');console.log('PASS board saved and reopened');

 const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="teal"/><circle cx="60" cy="40" r="20" fill="white"/></svg>');
 const cases=[['bingo','Bingo',18],['dominoes','Dominoes',3],['memory','Pelmanism',3],['strips','Strip story',3],['cue','Cue cards',1],['survey','Survey',1],['findSomeone','Find someone who',6],['ranking','Ranking',4],['opinion','Opinion line',1],['spot','Spot the difference',2],['taboo','Taboo cards',3],['speaking','Speaking timer',1]];
 for(const [kind,label,count] of cases){
  console.log('CHECK',kind);
  await insert(label);const node=p.locator('.ca-editor-node').last();await node.waitFor();
  if(kind!=='spot'){await node.getByLabel('Paste a list').fill(Array.from({length:count},(_,n)=>['dominoes','memory'].includes(kind)?`Word ${n+1} = Meaning ${n+1}`:`Prompt ${n+1}`).join('\n'));await node.getByRole('button',{name:'Add list',exact:true}).click();assert.equal(await node.locator('.pick-card-title').count(),count,kind+' replaces blank starter');}
  if(kind==='strips')await node.locator('.pick-card-title').first().fill('Edited opening strip');
  if(kind==='survey')await node.getByLabel('Possible answers (one per line)').fill('Bus\nTram');
  if(['memory','dominoes','spot'].includes(kind)){
   const item=node.locator('.ca-item').first();await item.getByLabel('Picture address').first().fill(svg);await item.getByLabel('Picture description',{exact:true}).fill('A white circle on a teal card');await item.getByLabel('Horizontal framing').first().fill('25');
   if(kind!=='spot'){await item.getByLabel('Picture address').nth(1).fill(svg);await item.getByLabel('Matching picture description').fill('A matching circle');if(kind==='memory'){await item.getByLabel('Matching half',{exact:true}).fill('');await node.locator('.pick-card-title').first().fill('');}}
   else {const second=node.locator('.ca-item').nth(1);await second.locator('summary').click();await second.getByLabel('Picture address').fill(svg);await second.getByLabel('Picture description',{exact:true}).fill('Second circle');await node.getByLabel('Horizontal position',{exact:true}).fill('40');await node.getByLabel('Vertical position',{exact:true}).fill('50');await node.getByRole('button',{name:'Mark this point',exact:true}).focus();await p.keyboard.press('Enter');}
  }
  await node.getByRole('button',{name:'Try the activity',exact:true}).click();await node.getByLabel('Preview as').waitFor();await node.getByLabel('Preview as').selectOption('preview-a');await node.locator('.ca-kind-'+kind).waitFor();
  console.log('PASS',kind,kind==='spot'?'gallery insertion, pictures, keyboard difference marker and local learner preview':'gallery insertion, list replacement and local learner preview; optional fields blank');
 }
 await p.waitForTimeout(1600);await open();assert.equal(await p.locator('.ca-editor-node').count(),13);assert.equal(await p.locator('.ca-item input[aria-label="Picture address"]').count()>0,true);
 for(let n=0;n<13;n++){const node=p.locator('.ca-editor-node').nth(n);await node.getByRole('button',{name:'Try the activity',exact:true}).click();await node.getByLabel('Preview as').waitFor();}
 assert.equal(await p.locator('.ca-item').filter({has:p.getByLabel('Matching picture description')}).count(),2);
 assert.equal(await p.locator('.ca-editor-node').nth(3).locator('.pick-card-title').first().inputValue(),'');assert.equal(await p.locator('.ca-editor-node').nth(3).getByLabel('Matching half',{exact:true}).first().inputValue(),'');assert.equal(await p.locator('.ca-editor-node').nth(3).getByLabel('Horizontal framing').first().inputValue(),'25');console.log('PASS all 13 activities saved, reopened and previewed again with persisted pictures/matching halves');
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

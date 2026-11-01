// Actual UI, file/task persistence and learner display; Firebase/model responses simulated.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),base='http://localhost:5198';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5198'],{stdio:'ignore',detached:true});
let browser,p;
try {
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});p=await browser.newPage({viewport:{width:1300,height:900}});
 p.setDefaultTimeout(60000);
 const crashes=[];p.on('pageerror',e=>{crashes.push(e.message);console.log('Page error:',e.message);});p.on('console',m=>{if(m.type()==='error')console.log('Browser error:',m.text().slice(0,1000));});
 await p.goto(base+'/dev.html?seed&as=teacher');await p.waitForFunction(()=>!!window.__mockReady);await p.evaluate(()=>window.__mockReady);
 const demo=await p.evaluate(()=>JSON.parse(localStorage.getItem('mockdemo')));
 await p.evaluate(async({classId,itemId})=>{
  const {doc,setDoc}=await import('/test/mock/firestore.ts');
  await setDoc(doc({},'classes',classId),{level:'A1',learningProfile:{ageGroup:'Young learners'}},{merge:true});
  await setDoc(doc({},'classes',classId,'items',itemId,'tasks','definition-check'),{title:'A walk by the river',instructions:'Read the sentence.',order:-1,hidden:false,locked:false,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'We sat on the bank of the river.'}]}]}});
 },demo);
 await p.goto(`${base}/class/${demo.classId}/lesson/${demo.itemId}`);
 await p.getByRole('radio',{name:'Digital: the lesson on screen',exact:true}).check();
 await p.getByRole('button',{name:/1 A walk by the river/}).click();
 await p.getByRole('button',{name:'Everything you can add, with pictures',exact:true}).click();
 const gallery=p.getByRole('dialog',{name:'Add to the task',exact:true});await gallery.getByRole('textbox',{name:'Search',exact:true}).fill('Definition card');
 await gallery.getByRole('button',{name:/Definition card A standalone/}).click();
 const card=p.locator('.dcut-edit');await card.getByLabel('Headword',{exact:true}).fill('bank');
 const ai=card.getByRole('region',{name:'Teaching definition with AI'});
 // Leave optional extra context blank; level comes from the class.
 await ai.getByText('A1',{exact:true}).waitFor();
 await card.getByLabel('Meaning',{exact:true}).fill('My own explanation.');
 await ai.getByRole('button',{name:'Suggest definition with AI',exact:true}).click();
 await ai.locator('img').waitFor();assert(await ai.locator('img').evaluate(im=>im.complete&&im.naturalWidth>0));
 await ai.getByRole('button',{name:'Use suggested definition',exact:true}).click();
 assert.equal(await card.getByLabel('Meaning',{exact:true}).inputValue(),'My own explanation.');
 assert.equal(await card.getByLabel('Example sentence',{exact:true}).inputValue(),'We sat on the river bank.');
 await card.getByLabel('Meaning',{exact:true}).fill('The land beside a river.');
 await p.locator('.dcut-node').getByRole('button',{name:'Done',exact:true}).click();
 await p.waitForTimeout(1200);
 await p.reload();await p.getByRole('button',{name:/1 A walk by the river/}).click();
 await p.locator('.dcut').filter({hasText:'The land beside a river.'}).waitFor();
 await p.locator('.dcut-img').waitFor();assert(await p.locator('.dcut-img').evaluate(im=>im.complete&&im.naturalWidth>0),'Saved media image must load after reopen');
 assert((await p.locator('.dcut-img').getAttribute('alt')).includes('bank'));
 await p.getByRole('radio',{name:'Worksheet: the lesson as printed pages',exact:true}).check();
 await p.locator('img.dcut-img:visible').waitFor();assert(await p.locator('img.dcut-img:visible').evaluate(im=>im.complete&&im.naturalWidth>0),'Worksheet must include the generated picture');
 await p.getByRole('radio',{name:'Digital: the lesson on screen',exact:true}).check();
 // Inline definition path, including teacher review before the mark is applied.
 const editor=p.getByRole('textbox',{name:'Task',exact:true});const sentence=editor.locator('p').filter({hasText:'We sat on the bank of the river.'}).last();
 await sentence.evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text;while((text=walker.nextNode())){const at=text.textContent.indexOf('bank');if(at>=0){const range=document.createRange();range.setStart(text,at);range.setEnd(text,at+4);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);break;}}});
 assert.equal(await p.evaluate(()=>getSelection().toString()),'bank');await p.waitForTimeout(150);
 await p.getByRole('button',{name:'Add a definition to the selected word',exact:true}).click();
 const pop=p.getByRole('dialog',{name:'Definition',exact:true});await pop.getByRole('button',{name:'Suggest definition with AI',exact:true}).click();await pop.getByRole('button',{name:'Use suggested definition',exact:true}).click();await pop.getByRole('button',{name:'Done',exact:true}).click();
 await p.waitForTimeout(1200);await p.reload();
 assert.equal((await p.locator('.def-word').first().textContent()).trim(),'bank');
 await p.getByRole('button',{name:'Help',exact:true}).click();await p.getByRole('menuitem',{name:/Ask ELT Suite/}).click();
 const help=p.getByRole('dialog',{name:'ELT Suite assistant',exact:true});await help.getByRole('button',{name:'How do I generate images?',exact:true}).click();await help.getByRole('heading',{name:'Generate an image with AI',exact:true}).waitFor();
 await help.getByRole('button',{name:'Browse topics',exact:true}).click();await help.getByRole('combobox',{name:'Category',exact:true}).selectOption('Images and Designer');await help.getByRole('searchbox').fill('magic eraser');await help.locator('summary').filter({hasText:'Remove an object from a picture'}).click();await help.getByRole('link',{name:'Open Designer',exact:true}).waitFor();
 await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const violations=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:['wcag2a','wcag2aa']});return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id);});assert.deepEqual(violations,[]);assert.deepEqual(crashes,[]);
 // Outside-course definitions must save pictures with the document, not the teacher's private media.
 await p.evaluate(async()=>{const {doc,setDoc}=await import('/test/mock/firestore.ts');await setDoc(doc({},'sharedDocs','definition-doc'),{owner:'teacher1',ownerName:'Arda',title:'Editorial definitions',kind:'doc',docKey:'definition-doc-session',members:{},memberIds:[]});});
 await p.goto(base+'/doc/definition-doc');
 const docEditor=p.getByRole('textbox',{name:'Document text',exact:true});await docEditor.fill('Aviation includes flying aircraft.');
 await docEditor.evaluate(el=>{const text=el.querySelector('p').firstChild;const range=document.createRange();range.setStart(text,0);range.setEnd(text,8);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);});
 await p.getByRole('button',{name:'Definition: select a word, then add its meaning',exact:true}).click();
 const dp=p.getByRole('dialog',{name:'Definition',exact:true});await dp.getByRole('button',{name:'Suggest definition with AI',exact:true}).click();await dp.getByText('Designer style: Editorial',{exact:true}).waitFor();await dp.getByRole('button',{name:'Use suggested definition',exact:true}).click();await dp.getByRole('button',{name:'Done',exact:true}).click();
 await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('mockfs'))).some(k=>k.startsWith('sharedDocs/definition-doc/media/definition_')));
 await p.waitForTimeout(1200);await p.reload();await p.getByRole('button',{name:'Document mode',exact:true}).click();await p.getByRole('option',{name:'Viewing',exact:true}).click();await p.getByRole('button',{name:'Aviation',exact:true}).click();await p.locator('.dc-img').waitFor();assert(await p.locator('.dc-img').evaluate(im=>im.complete&&im.naturalWidth>0),'Reopened Collab reader must resolve its own saved image');
 console.log('PASS: outside-course Editorial definition saved to document media and reopened in reader with a loaded image. Model/Firebase simulated.');
 console.log('PASS: standalone + inline AI definition review/edit/save/reopen; preserve filled fields; class A1 with extra context blank; image FAQ and categorised full-text help search; accessibility. Model/Firebase simulated.');
} catch(e){console.log((await p?.locator('body').innerText())?.slice(-5000));throw e;}
finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

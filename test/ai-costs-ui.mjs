// Full browser admin journey with Firebase/provider data simulated.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),base='http://localhost:5317';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5317'],{stdio:'inherit',detached:true});
let browser,p;
try{
 for(let i=0;i<120;i++){
  if(await fetch(base).then(r=>r.ok,()=>false)){
   // Let Vite finish its editor prebundle before a browser page begins seeding.
   // Otherwise Vite can reload the page between mockReady and its await.
   const editor=await fetch(base+'/test/document-tools-check.ts').then(r=>r.ok?r.text():'',()=> '');
   if(editor.includes('@tiptap_core.js'))break;
  }
  await new Promise(r=>setTimeout(r,500));
 }
 browser=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(90000);const crashes=[];p.on('pageerror',e=>{crashes.push(e.message);console.log('Page error',e.message);});p.on('console',m=>{if(m.type()==='error')console.log('Browser error',m.text().slice(0,1000));});
 await p.goto(base+'/dev.html?seed&as=teacher');await p.waitForFunction(()=>!!window.__mockReady);await p.waitForFunction(async()=>{await window.__mockReady;return true;},null,{timeout:180000});
 await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('mockauth'));a.teacher1.email='ardanurioglu@gmail.com';localStorage.setItem('mockauth',JSON.stringify(a));});
 await p.goto(base+'/admin?tab=ai-costs');await p.getByRole('heading',{name:'AI Cost Intelligence',exact:true}).waitFor();
 await p.getByLabel('Proposed credits: Songs',{exact:true}).waitFor();assert.equal(await p.locator('tbody').first().locator('tr').count(),21);
 // All proposals optional and blank: save, refresh, reload remains valid.
 await p.getByRole('button',{name:'Save proposals and safeguards'}).click();await p.getByText(/Proposals and safeguards saved/).waitFor();await p.reload();await p.getByLabel('Proposed credits: Songs',{exact:true}).waitFor();assert.equal(await p.getByLabel('Proposed credits: Songs',{exact:true}).inputValue(),'');
 const field=p.getByLabel('Proposed credits: Songs',{exact:true});await field.fill('1.5');await p.getByText('Enter whole credits from 0 to 1,000,000, or leave blank for no proposal.',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Save proposals and safeguards'}).isDisabled(),true);
 await field.fill('32');await p.getByRole('button',{name:'Save proposals and safeguards'}).click();await p.getByText(/Proposals and safeguards saved/).waitFor();await p.getByRole('button',{name:'Refresh report'}).click();await p.getByText('on target',{exact:true}).waitFor();await p.getByText('75.0%',{exact:true}).waitFor();
 await p.getByText('Latest 100 provider calls and teacher attribution',{exact:true}).click();await p.getByText('→ teacher-1',{exact:true}).waitFor();
 await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});let violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:['wcag2a','wcag2aa']})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);
 await mkdir('outputs/ai-costs',{recursive:true});await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:'outputs/ai-costs/desktop.png'});
 await p.evaluate(()=>{localStorage.setItem('ll.theme','dark');document.documentElement.dataset.theme='dark';});violations=await p.evaluate(async()=>(await axe.run(document,{runOnly:['wcag2a','wcag2aa']})).violations.map(v=>v.id));assert.deepEqual(violations,[]);await p.screenshot({path:'outputs/ai-costs/dark.png'});
 await p.setViewportSize({width:390,height:844});const open=p.getByRole('button',{name:'Open it anyway',exact:true});if(await open.count())await open.click();await p.getByLabel('Admin section',{exact:true}).selectOption('ai-costs');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:'outputs/ai-costs/mobile.png'});
 await p.evaluate(()=>localStorage.setItem('mockCostEmpty','1'));await p.getByRole('button',{name:'Refresh report'}).click();await p.getByText(/No AI costs recorded in this range/).waitFor();
 await p.evaluate(()=>localStorage.setItem('mockCostFailure','1'));await p.getByRole('button',{name:'Refresh report'}).click();await p.getByRole('alert').filter({hasText:'Could not load costs'}).waitFor();
 assert.deepEqual(crashes,[]);console.log('PASS: 21 features, optional proposals blank, save/reload, inline invalid price, 75% margin, learner attribution, empty/error states, desktop/mobile and accessibility. Firebase/provider data simulated.');
}catch(e){console.error((await p?.locator('body').innerText())?.slice(-2000));throw e;}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

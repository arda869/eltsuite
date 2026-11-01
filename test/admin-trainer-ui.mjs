// Actual UI, file/task persistence and learner display; Firebase/model responses simulated.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),base='http://localhost:5199';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5199'],{stdio:'ignore',detached:true});
let browser,p;
try {
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});p=await browser.newPage({viewport:{width:1300,height:900}});
 p.setDefaultTimeout(60000);
 const crashes=[];p.on('pageerror',e=>{crashes.push(e.message);console.log('Page error:',e.message);});p.on('console',m=>{if(m.type()==='error')console.log('Browser error:',m.text().slice(0,1000));});
 await p.goto(base+'/dev.html?seed&as=teacher');await p.waitForFunction(()=>!!window.__mockReady);await p.evaluate(()=>window.__mockReady);
 await p.waitForFunction(()=>!!localStorage.getItem('mockdemo'));
 await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('mockauth'));a.teacher1.email='ardanurioglu@gmail.com';localStorage.setItem('mockauth',JSON.stringify(a));});
 await p.goto(base+'/admin');await p.getByRole('heading',{name:'What do you need to do?',exact:true}).waitFor();console.log('Admin overview loaded');
 await p.getByLabel('Find a teacher by name or email').fill('Arda');await p.getByRole('button',{name:'Find teacher',exact:true}).click();await p.locator('.hq-table tbody tr').first().click();
 await p.getByRole('button',{name:'Enable teacher-trainer access',exact:true}).click();await p.getByText('Teacher-trainer access enabled. They can now create teacher-training courses.',{exact:true}).waitFor();console.log('Grant saved');
 await p.reload();await p.getByRole('button',{name:'Remove teacher-trainer access',exact:true}).waitFor();
 await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('mockauth'));a.teacher1.email='teacher@example.com';localStorage.setItem('mockauth',JSON.stringify(a));});
 await p.goto(base+'/classes');await p.getByRole('button',{name:'+ New class',exact:true}).click();
 const form=p.getByRole('dialog',{name:'New class',exact:true});await form.getByRole('radio',{name:/^Teacher training/}).click();await form.getByLabel('Class name',{exact:true}).fill('Independent trainer course');
 // Optional dates, trainee needs, experience, and other profile details stay blank/default.
 await form.getByRole('button',{name:'Make class',exact:true}).click();await p.getByRole('heading',{name:'Independent trainer course',exact:true}).waitFor();
 await p.reload();await p.getByRole('heading',{name:'Independent trainer course',exact:true}).waitFor();assert((await p.locator('body').innerText()).includes('Trainees'));
 await p.getByRole('button',{name:'+ New topic',exact:true}).click();await p.getByPlaceholder('For example: Unit 4 · Present perfect').fill('Teaching vocabulary');await p.getByRole('button',{name:'Add',exact:true}).click();
 await p.getByRole('button',{name:'+ Add lesson, homework, exam or practice',exact:true}).click();await p.getByRole('textbox',{name:'Title',exact:true}).fill('Explain meaning');await p.getByRole('button',{name:'Add lesson',exact:true}).click();await p.getByRole('link',{name:'Explain meaning',exact:true}).click();
 await p.getByRole('navigation',{name:'Tasks',exact:true}).getByRole('button',{name:'+ New task',exact:true}).click();await p.getByRole('textbox',{name:'Task',exact:true}).waitFor();await p.getByRole('button',{name:'Everything you can add, with pictures',exact:true}).click();const gallery=p.getByRole('dialog',{name:'Add to the task',exact:true});await gallery.getByRole('textbox',{name:'Search',exact:true}).fill('Language analysis');await gallery.getByRole('button',{name:/^Language analysis/}).click();await p.getByPlaceholder("I've been to Paris (present perfect for experience)").fill('She has visited London.');await p.waitForTimeout(1200);await p.reload();await p.getByPlaceholder("I've been to Paris (present perfect for experience)").waitFor();assert.equal(await p.getByPlaceholder("I've been to Paris (present perfect for experience)").inputValue(),'She has visited London.');console.log('Independent course and language-analysis activity reopened');
 await p.goto(base+'/admin');await p.getByText('Super Admin is only for the super admins of ELT Suite',{exact:true}).waitFor();
 await p.evaluate(()=>{const a=JSON.parse(localStorage.getItem('mockauth'));a.teacher1.email='ardanurioglu@gmail.com';localStorage.setItem('mockauth',JSON.stringify(a));});
 await p.goto(base+'/admin?tab=teachers&f=trainers&t=teacher1');await p.getByRole('button',{name:'Remove teacher-trainer access',exact:true}).click();await p.getByText('Teacher-trainer access removed. Existing courses are kept.',{exact:true}).waitFor();
 await p.goto(base+'/admin');await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Open it anyway',exact:true}).click();await p.getByLabel('Admin section',{exact:true}).selectOption('teachers');await p.getByRole('heading',{name:'Teachers',exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin must fit a phone');
 await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const violations=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:['wcag2a','wcag2aa']});return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id);});assert.deepEqual(violations,[]);assert.deepEqual(crashes,[]);
 console.log('PASS: admin search → grant → reload; independent non-admin teacher creates and reopens training course with optional fields blank; revoke; mobile grouped navigation and accessibility. Firebase simulated.');
} catch(e){console.log((await p?.locator('body').innerText())?.slice(-5000));throw e;}
finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

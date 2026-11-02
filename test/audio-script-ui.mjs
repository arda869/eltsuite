// Actual media player and audio engine. Firebase is simulated; WAV is synthetic, no AI calls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:5203',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5203','--host','127.0.0.1'],{stdio:'ignore',detached:true});let browser,p;
try{
 for(let i=0;i<120;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({executablePath:process.env.SMOKE_BROWSER_PATH||undefined});p=await browser.newPage();p.setDefaultTimeout(30000);await p.goto(base+'/test/audio-script-fixture.html');
 for(const layout of ['false','true']){
  await p.getByLabel('Player layout').selectOption(layout);
  for(const role of ['teaching','learner']){
   await p.reload();await p.getByLabel('Player layout').selectOption(layout);
   await p.getByLabel('View',{exact:true}).selectOption(role);await p.getByLabel('Script setting').selectOption('button');
   await p.getByRole('button',{name:'Show the script',exact:true}).click();await p.getByText('Could you help me?',{exact:false}).waitFor();
   await p.getByRole('button',{name:'Hide the script',exact:true}).click();assert.equal(await p.locator('.kl,.im-script').count(),0);
   await p.getByLabel('Script setting').selectOption('karaoke');await p.getByText('Could you help me?',{exact:false}).waitFor();
   await p.getByLabel('Script setting').selectOption('after');assert.equal(await p.locator('.kl,.im-script').count(),0);
   await p.getByRole('button',{name:'Play',exact:true}).click();await p.getByText('Could you help me?',{exact:false}).waitFor();
   if(role==='teaching'){await p.getByRole('button',{name:'Hide the script',exact:true}).click();assert.equal(await p.locator('.kl,.im-script').count(),0);}
   await p.getByLabel('Script setting').selectOption('none');assert.equal(await p.locator('.kl,.im-script').count(),0);
   if(role==='teaching'){await p.getByRole('button',{name:'Show the script',exact:true}).click();await p.getByText('Could you help me?',{exact:false}).waitFor();}
  }
  await p.getByLabel('Recording',{exact:true}).selectOption('empty');await p.getByLabel('Script setting').selectOption('karaoke');await p.getByText('No transcript has been added to this recording.',{exact:true}).waitFor();
  await p.getByLabel('Recording',{exact:true}).selectOption('spoken');await p.reload();
 }
 console.log('PASS: block and inline players; teacher and learner show/hide, always-visible, after-playback and hidden modes; playable WAV; missing-transcript guidance. Firebase simulated.');
}catch(e){console.log(await p?.locator('body').innerText());throw e;}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

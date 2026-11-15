// Synthetic browser check: actual editor/media engine, simulated Firebase and AI.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const base='http://localhost:5197';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5197'],{stdio:'ignore',detached:true});
let browser, p;
try {
  for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true,...(process.env.SMOKE_BROWSER_PATH?{executablePath:process.env.SMOKE_BROWSER_PATH}:{})});
  p=await browser.newPage({viewport:{width:1400,height:900}});
  await p.goto(base+'/test/video-fixture.html?seed');
  // Let Vite finish dependency optimisation before starting media recording.
  await p.waitForLoadState('networkidle');
  await p.evaluate(async () => { await window.__mockReady; });
  await p.getByRole('button',{name:'Make test media',exact:true}).click();
  await p.getByText('Test files saved.',{exact:true}).waitFor();
  await p.evaluate(async()=>{
    const {getDocs,collection,doc,setDoc}=await import('/test/mock/firestore.ts');
    const a=(await getDocs(collection({},'videoAssets'))).docs.find(d=>d.data().kind==='character');
    await setDoc(doc({},'videoAssets','still'),{...a.data(),name:'Pencil storyboard',kind:'image'});
    const part=await import('/test/mock/firestore.ts').then(m=>m.getDoc(m.doc({},'videoAssets',a.id,'parts','0')));
    await setDoc(doc({},'videoAssets','still','parts','0'),part.data());
  });
  await p.goto(base+'/studio/video/new');
  const canvasChoice=p.getByRole('button',{name:'Canvas',exact:true});
  await canvasChoice.click();
  const canvasMenu=p.locator('.vx .sel-list:visible').last();
  const menuAppearance=await canvasMenu.evaluate(el=>{const r=el.getBoundingClientRect(),bg=getComputedStyle(el).backgroundColor,hit=document.elementFromPoint(r.left+r.width/2,r.top+20);return {bg,visible:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&!!hit&&el.contains(hit)};});
  assert(menuAppearance.visible,'Video dropdown is clipped or covered');
  assert.equal(menuAppearance.bg,'rgb(41, 38, 35)','Video dropdown did not use the dark studio palette');
  if(process.env.DROPDOWN_SCREENSHOT_DIR){mkdirSync(process.env.DROPDOWN_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:`${process.env.DROPDOWN_SCREENSHOT_DIR}/video-editor-dark.png`});}
  await canvasMenu.locator('[role="option"][data-value="720x1280"]').click();
  assert.match(await canvasChoice.textContent(),/720x1280/);
  await canvasChoice.click();
  await p.locator('.vx .sel-list:visible [role="option"][data-value="1280x720"]').click();
  const image=p.locator('.vx-asset-grid article').filter({has:p.getByText('Pencil storyboard',{exact:true})});
  await image.getByText('Still image · no motion',{exact:true}).waitFor();
  assert.equal(await image.getByRole('button',{name:'Animate image',exact:true}).count(),0);
  assert.equal(await p.getByRole('tab',{name:'Make with AI',exact:true}).count(),0);
  await image.getByRole('button',{name:'Add still image',exact:true}).click();
  await p.getByRole('button',{name:'Save project',exact:true}).click();
  await p.getByText('Saved',{exact:true}).waitFor();
  const saved=await p.evaluate(()=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).find(([k])=>k.startsWith('users/teacher1/videoProjects/')));
  assert(saved);
  const clips=saved[1].project.tracks.flatMap(t=>t.clips);
  assert.equal(clips.length,1);
  assert.equal(clips[0].asset,'still');
  console.log('PASS: video editor keeps media insertion and project saving; AI video generation controls are hidden (simulated Firebase).');
} catch(e) {console.log((await p?.locator('body').innerText())?.slice(0,4500));throw e;}
finally {await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

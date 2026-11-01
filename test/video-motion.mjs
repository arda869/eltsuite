// Synthetic browser check: actual editor/media engine, simulated Firebase and AI.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const base='http://localhost:5197';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5197'],{stdio:'ignore',detached:true});
let browser, p;
try {
  for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true,...(process.env.SMOKE_BROWSER_PATH?{executablePath:process.env.SMOKE_BROWSER_PATH}:{})});
  p=await browser.newPage({viewport:{width:1400,height:900}});
  await p.goto(base+'/test/video-fixture.html?seed');
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
  const image=p.locator('.vx-asset-grid article').filter({has:p.getByText('Pencil storyboard',{exact:true})});
  await image.getByText('Still image · no motion',{exact:true}).waitFor();
  await image.getByRole('button',{name:'Animate image',exact:true}).click();
  const scene=p.locator('.vx-scene').first();
  assert.equal(await scene.getByLabel('Starting picture / background').inputValue(),'still');
  assert.equal(await scene.getByRole('button',{name:/Generate moving video/}).isDisabled(),true);
  await scene.getByText('Describe what should move',{exact:false}).waitFor();
  await scene.getByLabel('What happens',{exact:true}).fill('The fox waves and passes a pencil to a friend. One continuous shot.');
  await scene.getByRole('button',{name:/Generate moving video/}).click();
  await scene.getByRole('button',{name:'Add scene to timeline',exact:true}).waitFor({timeout:20000});
  await scene.getByRole('button',{name:'Add scene to timeline',exact:true}).click();
  // A changed action must not offer an older generated result as its new video.
  await p.getByRole('tab',{name:'Make with AI',exact:true}).click();
  await p.getByRole('tab',{name:'Single scene',exact:true}).click();
  await scene.getByLabel('What happens',{exact:true}).fill('The fox nods.');
  assert.equal(await scene.getByRole('button',{name:'Add scene to timeline',exact:true}).count(),0);
  await p.getByRole('button',{name:'Save project',exact:true}).click();
  await p.getByText('Saved',{exact:true}).waitFor();
  const saved=await p.evaluate(()=>Object.entries(JSON.parse(localStorage.getItem('mockfs'))).find(([k])=>k.startsWith('users/teacher1/videoProjects/')));
  assert(saved);
  const clips=saved[1].project.tracks.flatMap(t=>t.clips);
  assert.equal(clips.length,1);
  assert.equal(clips[0].asset,await p.evaluate(()=>localStorage.getItem('videoTestSource')));
  console.log('PASS: still label → animate → selected source, required movement beside action → generated video (not image) on saved timeline; editing invalidates stale result. AI/Firebase simulated.');
} catch(e) {console.log((await p?.locator('body').innerText())?.slice(0,4500));throw e;}
finally {await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}

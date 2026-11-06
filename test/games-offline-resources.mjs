// Real Resources download and real single-file player; the source account is simulated.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5213';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5213','--host','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){if(await fetch(base).then(r=>r.ok,()=>false))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch();const context=await browser.newContext(),p=await context.newPage();p.setDefaultTimeout(60000);
 await p.goto(base+'/dev.html?seed&as=teacher');await p.waitForFunction(()=>!!window.__mockReady);await p.waitForFunction(async()=>{await window.__mockReady;return true;},null,{timeout:180000});await p.waitForFunction(()=>document.getElementById('root')?.childElementCount>0);await p.waitForLoadState('networkidle');
 await p.evaluate(async()=>{
 const {doc,setDoc}=await import('/test/mock/firestore.ts');const demo=JSON.parse(localStorage.getItem('mockdemo'));
 const game={version:1,type:'show',theme:'paper',sound:false,rounds:[{id:'r1',prompt:'Where can you borrow books?',answer:'library',choices:['bank','park']}]};
 await setDoc(doc({},'sharedDocs','offline-game'),{owner:'teacher1',title:'Offline town game',kind:'game',memberIds:[],members:{},docKey:'offline-game'});await setDoc(doc({},'sharedDocs','offline-game','game','main'),game);
 for (const [type, title] of [['shark','Offline Shark escape'],['taxi','Offline Taxi town']]) {
  const id='offline-'+type;
  await setDoc(doc({},'sharedDocs',id),{owner:'teacher1',title,kind:'game',memberIds:[],members:{},docKey:id});
  await setDoc(doc({},'sharedDocs',id,'game','main'),{...game,type});
 }
 const path=['classes',demo.classId,'items','offline-lesson'];await setDoc(doc({},...path),{title:'Offline town lesson',type:'lesson',order:99});
 await setDoc(doc({},...path,'tasks','t1'),{title:'Read and answer',order:0,instructions:'Complete the sentence.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A place to borrow books is a '},{type:'gap',attrs:{id:'g',answers:[]}}]},{type:'picture',attrs:{src:'media:test-image',alt:'Green square'}},{type:'media',attrs:{media:'test-audio',title:'Test recording'}}]}});
 await setDoc(doc({},...path,'tasks','t1','private','key'),{g:{kind:'gap',answers:['library']}});
 await setDoc(doc({},'classes',demo.classId,'media','test-image'),{data:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>')});
 // A playable PCM WAV, no external URL.
 const buffer=new ArrayBuffer(44+8000*2),view=new DataView(buffer),str=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,16000,true);for(let i=0;i<8000;i++)view.setInt16(44+i*2,Math.sin(i/8000*440*Math.PI*2)*1000,true);
 const b64=btoa(String.fromCharCode(...new Uint8Array(buffer)));await setDoc(doc({},'classes',demo.classId,'media','test-audio'),{kind:'audio',type:'audio/wav',parts:1,size:buffer.byteLength});await setDoc(doc({},'classes',demo.classId,'media','test-audio_p0'),{data:b64});
 });
 for(const [title,kind] of [['Offline town game','game'],['Offline Shark escape','shark'],['Offline Taxi town','taxi'],['Offline town lesson','lesson']]){
 await p.goto(base+'/archive');await p.getByRole('button',{name:'Search',exact:true}).click();await p.getByRole('searchbox').fill(title);await p.getByText(title,{exact:true}).click({button:'right'});const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('menuitem',{name:'Download offline HTML',exact:true}).click()]);const path='/tmp/resources-'+kind+'.html';await download.saveAs(path);
 const offline=await browser.newContext({offline:true});const file=await offline.newPage(),errors=[];file.on('pageerror',e=>errors.push(e.message));await file.goto('file://'+path);await file.locator('#offline-loading').waitFor({state:'detached'});await file.locator('.offline-suite-name').waitFor();
 if(kind==='game'){await file.getByRole('button',{name:'Start the show',exact:true}).click();await file.getByRole('button',{name:/library/}).click();await file.getByRole('button',{name:'Lock it in',exact:true}).click();await file.getByRole('button',{name:'Finish game',exact:true}).click();await file.getByRole('heading',{name:'Game complete',exact:true}).waitFor();}
 else if(kind==='shark'||kind==='taxi'){
   await file.getByRole('button',{name:kind==='shark'?'Start rowing':'Start your shift',exact:true}).click();
   await file.getByRole('button',{name:'library',exact:true}).click();
   await file.getByRole('button',{name:'Finish game',exact:true}).click();
   await file.getByRole('heading',{name:'Game complete',exact:true}).waitFor();
   assert.equal(await file.locator('.ch-final b').textContent(),'10');
 }
 else{await file.getByRole('textbox').fill('library');await file.getByRole('button',{name:'Check answers',exact:true}).click();await file.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);await file.getByRole('button',{name:'Play',exact:true}).click();await file.getByRole('button',{name:'Pause',exact:true}).waitFor();}
 assert.deepEqual(errors,[]);await offline.close();console.log('Resources → downloaded '+kind+' → usable offline, with branding'+(kind==='lesson'?', embedded picture and playable recording.':'.'));
 }
}finally{await browser?.close();server.kill();}

// Full app journeys use Firebase stand-ins. Real access/transaction checks run
// separately in communicative-rules.mjs and communicative-service.mjs.
import {spawn} from 'node:child_process';
const base='http://localhost:5197';let server;
const run=file=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[file],{stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(`${file} failed (${code})`)));});
try{
 if(!await fetch(base).then(r=>r.ok,()=>false)){
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','test/vite.config.ts','--port','5197'],{stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
  let ready=false;for(let n=0;n<120;n++){if(await fetch(base).then(r=>r.ok,()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Communicative test server did not start: '+log);
 }
 for(const file of ['test/communicative-slash.mjs','test/communicative-journey.mjs','test/communicative-all-journeys.mjs','test/communicative-versions-journey.mjs','test/communicative-ungraded-journey.mjs','test/communicative-storage.mjs','test/communicative-picture-prompts.mjs','test/communicative-picture-bingo.mjs','test/communicative-spot-framing.mjs','test/communicative-offline.mjs','test/communicative-authoring.mjs','test/communicative-upload-journey.mjs','test/communicative-print.mjs'])await run(file);
}finally{server?.kill();}

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const enabled of [false,true])test(`deployment discovers Sketch Engine only when configured: ${enabled}`,()=>{
 const script=`import {declaredParams} from 'firebase-functions/params'; await import('./index.js'); console.log(JSON.stringify(declaredParams.map(p=>p.name)));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('.',import.meta.url),env:{...process.env,ELT_CORPUS_CONNECTED:String(enabled)},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const names=JSON.parse(result.stdout.trim());assert.equal(names.includes('SKETCH_ENGINE_API_KEY'),enabled);assert(names.includes('OPENAI_API_KEY'));
});

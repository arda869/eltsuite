import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
for(const flag of ['false','true']){
  test('video endpoints bind the configured secret even when discovery flag is '+flag,()=>{
    const source="import {videoStudio,refreshVideoJobs} from './functions/video/index.js'; console.log(JSON.stringify([videoStudio,refreshVideoJobs].map(fn=>fn.__endpoint.secretEnvironmentVariables||[])));";
    const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('../',import.meta.url),env:{...process.env,VIDEO_AI_ENABLED:flag},encoding:'utf8'}));
    for(const secrets of result)assert.ok(secrets.some(s=>s.key==='RUNWAYML_API_SECRET'),'Runway secret must not disappear during source discovery');
    assert.ok(result[0].some(s=>s.key==='OPENAI_API_KEY'),'Image/script secret remains configured');
  });
}


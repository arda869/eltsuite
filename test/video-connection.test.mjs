import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRunwayKey} from '../functions/video/check-connection.mjs';
const key='key_'+'a'.repeat(128);
test('rejects malformed credentials without transmitting them',async()=>{
  for(const value of ['key_short','Bearer '+key,'"'+key+'"','AIza-test']){
    const result=await inspectRunwayKey(value,()=>{throw Error('Must not call provider');});
    assert.equal(result.formatValid,false);assert.equal(result.providerHttpStatus,null);
    assert.equal(JSON.stringify(result).includes(value),false);
  }
});
test('checks only organization metadata and reports whitespace without disclosing keys',async()=>{
  const result=await inspectRunwayKey(' '+key+'\n',async(url,options)=>{
    assert.equal(url,'https://api.dev.runwayml.com/v1/organization');
    assert.equal(options.method,undefined);assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,'Bearer '+key);
    return {ok:true,status:200,json:async()=>({creditBalance:10,privateAccount:'DO NOT PRINT'})};
  });
  assert.equal(result.accepted,true);assert.equal(result.outerWhitespace,true);assert.equal(result.hasCredits,true);
  assert.equal(JSON.stringify(result).includes(key),false);assert.equal(JSON.stringify(result).includes('DO NOT PRINT'),false);
});
test('reports rejected keys without reading provider error bodies',async()=>{
  const result=await inspectRunwayKey(key,async()=>({ok:false,status:401,json:()=>{throw Error(key);}}));
  assert.equal(result.providerHttpStatus,401);assert.equal(result.accepted,false);assert.equal(JSON.stringify(result).includes(key),false);
});
test('reports missing API credits only after successful authentication',async()=>{
  const result=await inspectRunwayKey(key,async()=>({ok:true,status:200,json:async()=>({creditBalance:0})}));
  assert.equal(result.accepted,true);assert.equal(result.hasCredits,false);
});
test('does not forward exception text containing credentials',async()=>{
  const result=await inspectRunwayKey(key,async()=>{throw Error(key);});
  assert.equal(result.connectionUnavailable,true);assert.equal(JSON.stringify(result).includes(key),false);
});

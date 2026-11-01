import test from 'node:test';
import assert from 'node:assert/strict';
import {corpusConfiguration,searchCorpus} from './corpus.js';
const raw={enabled:true,corpora:[{id:'example',licensed:true,name:'Example corpus',attribution:'Example publisher',licence:'Approved classroom reuse',allowCache:true,allowExport:false,allowAI:false,lemma:true}]};
test('corpus availability requires both approved configuration and a connection',()=>{
 assert.equal(corpusConfiguration(raw,false).available,false);
 assert.equal(corpusConfiguration({...raw,corpora:[{...raw.corpora[0],licensed:false}]},true).available,false);
 assert.equal(corpusConfiguration(raw,true).available,true);
});
test('adapter retains attribution and independent reuse rights, using literal phrase input',async()=>{
 const result=await searchCorpus({config:corpusConfiguration(raw,true),apiKey:'test-only',query:'a+b',corpusId:'example',fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://api.sketchengine.eu');assert.equal(options.headers.Authorization,'Bearer test-only');
  assert.equal(JSON.parse(url.searchParams.get('json')).concordance_query[0].phrase,'a\\+b');
  return {ok:true,json:async()=>({finished:1,Lines:[{toknum:42,Left:[{str:'I say '}],Kwic:[{str:'a+b'}],Right:[{str:' here.'}],Refs:['text 1']}]})};
 }});
 assert.equal(result.lines[0].text,'I say a+b here.');assert.equal(result.lines[0].shareAllowed,false);assert.equal(result.lines[0].canSave,true);assert.equal(result.lines[0].source,'Example publisher');assert.equal(result.lines[0].providerRef.toknum,42);
 assert.equal(result.hasMore,false);
});
test('provider authentication failure gives binding guidance without returning response bodies',async()=>{
 await assert.rejects(searchCorpus({config:corpusConfiguration(raw,true),apiKey:'test-only',query:'well',corpusId:'example',fetchImpl:async()=>({ok:false,status:401})}),/deployed binding/);
});

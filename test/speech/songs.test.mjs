import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrief,songPrompt,lyricSchema,lyricInstructions} from '../../functions/songs/contract.js';
import {generateSong} from '../../functions/songs/provider.js';
import {generate} from '../../functions/ai/provider.js';
const brief={title:'Morning song',audience:'Young learners',level:'A1',style:'Acoustic pop',language:'English',delivery:'Group singing',duration:60,focus:'Daily routines',prompt:'A song about waking up.',lyrics:'  Wake up!\nWake up!\nLet’s go.  '};
test('song validation preserves exact lyrics and rejects invalid or unbounded briefs',()=>{
 assert.equal(validateBrief(brief,true).lyrics,brief.lyrics);
 assert.equal(validateBrief({...brief,extra:'not forwarded'}).extra,undefined);
 for(const patch of [{audience:''},{audience:'Toddlers'},{duration:999},{duration:'60'},{style:''},{title:'a'.repeat(101)},{lyrics:'a'.repeat(6001)},{level:'anything'},{delivery:'Cloned voice'},{language:''},{lyrics:''}])assert.throws(()=>validateBrief({...brief,...patch},true));
 assert.equal(validateBrief({...brief,lyrics:''}).lyrics,'');
});
test('music request uses Gemini only, bounded timeout and exact approved lyrics',async()=>{
 let sent;
 const result=await generateSong('private-test-key',brief,async(url,options)=>{sent={url,...options,body:JSON.parse(options.body)};return {ok:true,json:async()=>({steps:[{type:'model_output',content:[{type:'text',text:'Returned structure'},{type:'audio',data:Buffer.alloc(1000,1).toString('base64'),mime_type:'audio/mpeg'}]}]})};});
 assert.equal(sent.url,'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(sent.headers['x-goog-api-key'],'private-test-key');assert.equal(sent.body.model,'lyria-3.5');assert.equal(sent.body.store,false);assert.ok(sent.body.input.includes(JSON.stringify(brief.lyrics)));assert.equal(result.bytes.length,1000);assert.equal(result.providerLyrics,'Returned structure');
 assert.match(songPrompt(brief),/verbatim and in order/);assert.match(songPrompt(brief),/Young learners/);
});
test('30-second songs use clip model, provider errors do not expose sensitive bodies',async()=>{
 let model;
 await assert.rejects(generateSong('secret',{...brief,duration:30},async(_u,o)=>{model=JSON.parse(o.body).model;return {ok:false,status:403,json:async()=>({error:{message:'secret-provider-payload'}})};}),e=>/administrator/.test(e.message)&&!e.message.includes('secret-provider-payload'));
 assert.equal(model,'lyria-3-clip-preview');await assert.rejects(generateSong('',brief),/not configured/);
});
test('partial, unsupported or ambiguous provider output is never inserted as a song',async()=>{
 for(const content of [[],[{type:'audio',data:'AA=='}],[{type:'audio',data:Buffer.alloc(1000).toString('base64'),mime_type:'text/html'}],[1,2].map(()=>({type:'audio',data:Buffer.alloc(1000).toString('base64')}))])await assert.rejects(generateSong('test',brief,async()=>({ok:true,json:async()=>({steps:[{type:'model_output',content}]})})));
});
test('lyrics use OpenAI Responses with separate original and age-aware instructions',async()=>{
 let sent;
 const r=await generate({apiKey:'openai-test',model:'gpt-6.1-sol',name:'song_lyrics',schema:lyricSchema,input:brief,instructions:lyricInstructions,fetchImpl:async(url,o)=>{sent={url,...JSON.parse(o.body)};return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({lyrics:'Wake up!\nLet’s go.'})}]}],usage:{input_tokens:100,output_tokens:30}})};}});
 assert.equal(sent.url,'https://api.openai.com/v1/responses');assert.equal(sent.store,false);assert.equal(sent.text.format.name,'song_lyrics');assert.match(sent.instructions,/without infantilising/);assert.match(sent.instructions,/No imitation/);assert.equal(r.value.lyrics,'Wake up!\nLet’s go.');
});
test('songs stay in English and lesson references contain IDs only',()=>{
 assert.throws(()=>validateBrief({...brief,language:'French'}),/English/);
 assert.equal(validateBrief({...brief,language:undefined}).language,'English');
 assert.deepEqual(validateBrief({...brief,lesson:{classId:'class-1',itemId:'lesson-1',text:'not trusted'}}).lesson,{classId:'class-1',itemId:'lesson-1'});
 for(const lesson of [{classId:'../class',itemId:'ok'},{classId:'ok',itemId:''},'lesson'])assert.throws(()=>validateBrief({...brief,lesson}));
 assert.match(lyricInstructions,/linkedLesson/);
});

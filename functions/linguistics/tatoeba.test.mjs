import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTatoeba} from './tatoeba.js';
const sentence={id:42,text:'Well, let us see.',lang:'eng',license:'CC BY 2.0 FR',owner:'example-author',is_unapproved:false};
test('Tatoeba uses public stable API and preserves per-sentence attribution',async()=>{
 const result=await searchTatoeba({query:'well',fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://api.tatoeba.org');assert.equal(url.pathname,'/v1/sentences');assert.equal(url.searchParams.get('showtrans'),'none');assert.equal(url.searchParams.get('is_unapproved'),'no');assert.equal(options.headers.Authorization,undefined);
  return {ok:true,json:async()=>({data:[sentence],paging:{has_next:true,next:'https://api.tatoeba.org/v1/sentences?after=12%2C42'}})};
 }});
 assert.equal(result.lines[0].match,'Well');assert.equal(result.lines[0].source,'Tatoeba contributor example-author');assert.match(result.lines[0].licence,/creativecommons.org/);assert.equal(result.nextCursor,'12,42');assert.equal(result.lines[0].providerRef.sentenceId,42);
});
test('exclude unapproved, unknown licence, orphan and foreign-language sentences',async()=>{
 const data=[{...sentence,license:'PROBLEM'},{...sentence,owner:null},{...sentence,is_unapproved:true},{...sentence,lang:'fra'},sentence];
 const result=await searchTatoeba({query:'well',fetchImpl:async()=>({ok:true,json:async()=>({data,paging:{has_next:true,next:'https://attacker.invalid/?after=x'}})})});
 assert.equal(result.lines.length,1);assert.equal(result.hasMore,false);
});
test('case-sensitive filter and unavailable provider do not fabricate examples',async()=>{
 const result=await searchTatoeba({query:'well',caseSensitive:true,fetchImpl:async()=>({ok:true,json:async()=>({data:[sentence]})})});assert.equal(result.lines.length,0);
 await assert.rejects(searchTatoeba({query:'well',fetchImpl:async()=>({ok:false,status:429})}),/wait before searching/);
});

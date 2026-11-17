import {build} from 'esbuild';
import assert from 'node:assert/strict';
const root=process.cwd();
const r=await build({stdin:{contents:"export {splitKey,mergeKey,scoreQuestion,questionIds} from './src/lib/questions.ts'",resolveDir:root},bundle:true,write:false,format:'esm',platform:'node'});
const {splitKey,mergeKey,scoreQuestion}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
for(const node of [{type:'gap',attrs:{id:'x',answers:[],noCorrectAnswer:true}},{type:'mcq',attrs:{id:'x',options:['yes','no'],correct:-1,noCorrectAnswer:true}},{type:'match',attrs:{id:'x',pairs:[{left:'A',right:'B'}],noCorrectAnswer:true}},{type:'order',attrs:{id:'x',sentence:'we agree',noCorrectAnswer:true}},{type:'writing',attrs:{id:'x',model:'',noCorrectAnswer:true}}]){
 const d={type:'doc',content:[node]},x=splitKey(d);assert.equal(x.key.x.ungraded,true);assert.equal(x.content.content[0].attrs.noCorrectAnswer,true);assert.deepEqual(scoreQuestion(x.key.x,'anything'),{got:0,max:0});assert.equal(mergeKey(x.content,x.key).content[0].attrs.noCorrectAnswer,true);
}
console.log('5 no-correct-answer save/merge/scoring checks passed');

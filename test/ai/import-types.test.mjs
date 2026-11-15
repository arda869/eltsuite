import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {IMPORT_TYPES} from '../../functions/ai/import-types.js';
import {checkImportElements} from '../../functions/ai/import-validation.js';
import {checkRebuild,rebuildSchemaForClass} from '../../functions/ai/material-contract.js';
import {nativeTask} from '../../functions/ai/activities.js';
import {splitKey,mergeKey} from '../../functions/ai/import-question-core.js';
import {questionIds,scoreQuestion} from '../../functions/learning/question-core.js';
import {scoreAnswer} from '../../functions/quiz/engine.js';
import {importElements,importTask,importLesson} from './import-types-fixture.mjs';
test('every native import type validates, renders to native nodes and survives editor key merging',()=>{
 assert.deepEqual(new Set(Object.keys(importElements)),new Set(IMPORT_TYPES.map(t=>t.kind)));
 for(const t of IMPORT_TYPES){
  const element=structuredClone(importElements[t.kind]);checkImportElements([element],true);
  const task=importTask([element]),validated=checkRebuild(importLesson([element]),'task',{training:true});assert.equal(validated.tasks.length,1);
  const native=nativeTask(task,0,'import_unique');assert.ok(native.content.content.length,t.kind);
  const editor=mergeKey(native.content,native.key),again=splitKey(editor);
  assert.deepEqual(again.key,native.key,t.kind+' keeps its complete private key');
  assert.deepEqual(again.content,native.content,t.kind+' round trips through the real editor');
 }
});
test('one source worksheet with every importable element becomes one task with private answers',()=>{
 const elements=Object.values(importElements).map(e=>structuredClone(e));
 const worksheet=elements.map((e,i)=>`${i+1}. ${e.kind}: ${e.prompt}`).join('\n');
 assert.equal(worksheet.split('\n').length,IMPORT_TYPES.length);
 // The editor accepts 60 inline elements per part. A long source stays one task with a
 // continuation part, preserving source order rather than dropping the last five elements.
 const rebuilt=importLesson(elements.slice(0,60));
 rebuilt.tasks[0].subTasks=[{instructions:'Continue the worksheet.',input:'',blocks:[],definitions:[],visuals:[],questions:[],inlineElements:elements.slice(60)}];
 const checked=checkRebuild(rebuilt,'task',{training:true});
 assert.equal(checked.tasks[0].inlineElements.length+checked.tasks[0].subTasks[0].inlineElements.length,IMPORT_TYPES.length);
 const native=nativeTask(checked.tasks[0],0,'all_elements');
 const again=splitKey(mergeKey(native.content,native.key));
 assert.deepEqual(again.content,native.content);
 assert.deepEqual(again.key,native.key);
 assert.ok(Object.keys(native.key).length>20,'answer key was not created');
 assert.ok(!JSON.stringify(native.content).includes('successful'),'private word-formation answer leaked to learners');
});
test('task picker exposes every editor question command, classroom response and training form',()=>{
 const editor=readFileSync('src/editor/TaskEditor.tsx','utf8');
 const source=ts.createSourceFile('TaskEditor.tsx',editor,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),keys=[];
 const visit=n=>{if(ts.isObjectLiteralExpression(n)){const props=Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).filter(p=>ts.isIdentifier(p.name)&&ts.isStringLiteral(p.initializer)).map(p=>[p.name.text,p.initializer.text]));if(props.group==='Questions')keys.push(props.key);}ts.forEachChild(n,visit);};visit(source);
 // bankpick selects an existing saved task; it is not a response type.
 for(const key of keys.filter(k=>k!=='bankpick'))assert.ok(IMPORT_TYPES.some(t=>t.kind===key),key+' is an importable editor question');
 // Explicit list includes commands written over multiple lines and prevents a new type being missed.
 const expected=['gap','lettergap','wordform','radio','dropdown','truefalse','notgiven','match','drop','bank','order','collab','upload','writing','reflect','peer','board','postits',...['fix','categorise','transform','highlight','sentences','label','odd','gapped','matching','speaking','dictation','pairs','crossword','wordsearch'].map(k=>'pq-'+k),'survey','drawcard','wheel','boxes'];
 for(const key of expected){assert.ok(editor.includes("key: '"+key+"'"),key+' exists in editor');assert.ok(IMPORT_TYPES.some(t=>t.kind===key),key+' is importable');}
 assert.ok(keys.length>20);
});
test('advanced answer keys are private while teacher notes and originals remain separate',()=>{
 const task=importTask(['wordform','pq-fix','pq-transform','pq-highlight','pq-crossword'].map(k=>importElements[k]));
 const n=nativeTask(task,0,'source');const pub=JSON.stringify(n.content);
 for(const secret of ['successful','goes','since','"groups"','"range"','"answers"'])assert.ok(!pub.includes(secret)||secret==='"answers"',secret+' not leaked');
 assert.equal(Object.values(n.key).length,5);assert.ok(!pub.includes('AI-suggested'));
});
test('imported questions without a supplied key remain unmarked; supplied answers still score',()=>{
 const unknown=[
  {...importElements.gap,data:{answers:[]}},
  {...importElements.truefalse,data:{answer:''}},
  {...importElements.match,data:{pairs:[{left:'First place',right:''},{left:'Second place',right:'Library'}],extras:['Office']}},
  {...importElements['pq-matching'],data:{...importElements['pq-matching'].data,statements:[{text:'Where is the cafe?',answer:-1},{text:'Where is the library?',answer:1}]}},
 ];
 const native=nativeTask(importTask(unknown),0,'missing_answers');
 const refs=questionIds(native.content),entries=refs.map(q=>native.key[q.id]);
 assert.equal(refs.length,4);
 assert.deepEqual(entries.map(e=>e.kind),['gap','mcq','match','pack']);
 assert.deepEqual(entries.map((e,i)=>scoreQuestion(e,['guess',0,[0,e.map?.[1]],[0,1]][i])),[
  {got:0,max:0},{got:0,max:0},{got:1,max:1},{got:1,max:1}
 ]);
 const publicText=JSON.stringify(native.content);
 assert.ok(!publicText.includes('"map"'),'private match and statement keys stay outside learner content');
 assert.deepEqual(splitKey(mergeKey(native.content,native.key)).key,native.key);
 const supplied=nativeTask(importTask([importElements.gap,importElements.truefalse]),0,'supplied_answers');
 const known=questionIds(supplied.content).map(q=>supplied.key[q.id]);
 assert.deepEqual(known.map((e,i)=>scoreQuestion(e,['went',0][i])),[{got:1,max:1},{got:1,max:1}]);
 const slide={qids:[refs[0].id,refs[2].id],poll:false,points:1,seconds:30};
 const quiz=scoreAnswer(slide,native.key,{score:100,streak:2,got:1,max:1},{responses:{[refs[0].id]:'guess',[refs[2].id]:[0,entries[2].map[1]]},ms:1000});
 assert.equal(quiz.next.got,2);
 assert.equal(quiz.next.max,2,'an unknown key cannot lower a learner’s quiz score');
 const noKeySlide=scoreAnswer({...slide,qids:[refs[0].id]},native.key,{score:100,streak:2,got:1,max:1},{responses:{[refs[0].id]:'guess'},ms:1000});
 assert.equal(noKeySlide.scored,false);
 assert.equal(noKeySlide.next.max,1);
 assert.equal(noKeySlide.next.streak,2,'an unmarked question cannot break a quiz streak');
});
test('bad keys, wrong token ranges, malformed gaps, unsafe nodes and incomplete resources cannot silently pass',()=>{
 const bad=[['radio',{answer:'not an option'}],['multi',{answers:['red','missing']}],['pq-fix',{wrong:'g'}],['pq-highlight',{text:'No target markers.'}],['pq-gapped',{removed:['Only one']}],['pq-matching',{statements:[{text:'Who?',answer:99}]}],['pq-odd',{odd:99}],['pq-pairs',{items:[{say:'missing',options:['ship','sheep']}]}],['pq-label',{image:'javascript:alert(1)'}],['speaking',{seconds:90}]];
 for(const [kind,patch] of bad)assert.throws(()=>checkImportElements([{...importElements[kind],data:{...importElements[kind].data,...patch}}],true),kind);
 assert.throws(()=>checkImportElements([{...importElements.gap,prompt:'No gap'}],true));
 assert.throws(()=>checkImportElements([{...importElements.gap,data:{...importElements.gap.data,untrustedHtml:'<script>'}}],true));
 const missing={...importElements['pq-label'],data:{...importElements['pq-label'].data,image:''}};
 const checked=checkRebuild(importLesson([missing]),'item',{training:false});assert.match(checked.warnings.join(' '),/attach.*picture/);
 assert.throws(()=>checkRebuild(importLesson([importElements['tt-custom']]),'item',{training:false}),/training/);
 const malformed=importLesson([importElements.gap]);malformed.tasks[0].structures=[{kind:'not-a-native-diagram',title:'Unsafe optional structure',labels:[],items:[]}];assert.throws(()=>checkRebuild(malformed,'item',{training:false}),/invalid/);
 const language=rebuildSchemaForClass(false);assert.ok(language.$defs.importElement.anyOf.every(b=>!b.properties.kind.enum[0].startsWith('tt-')));
});
test('new class-wide tools get distinct IDs per import and subtasks keep a shared drag bank',()=>{
 for(const kind of ['board','survey','collab','drawboard','speaking','drawcard']){
  const a=nativeTask(importTask([importElements[kind]]),0,'first'),b=nativeTask(importTask([importElements[kind]]),0,'second');
  assert.notEqual(JSON.stringify(a.content),JSON.stringify(b.content),kind+' cannot collide across lessons');
 }
 const t=importTask([importElements.bank]);t.subTasks=[{instructions:'Complete the sentence.',input:'',blocks:[],definitions:[],visuals:[],questions:[],inlineElements:[importElements.drop]}];
 const n=nativeTask(t,0,'shared');assert.deepEqual(n.content.content.find(x=>x.type==='wordbank').attrs.words.sort(),['going','went']);
});
test('word search preserves every source word over dense lists and many shuffle seeds',()=>{
 const words=['ELEPHANT','CROCODILE','BUTTERFLY','HIPPOPOTAMUS','RHINOCEROS','CHIMPANZEE','GIRAFFE','TIGER','KANGAROO','LEOPARD','SQUIRREL','HEDGEHOG','TORTOISE','PENGUIN','FLAMINGO','WOODPECKER','GRASSHOPPER','CATERPILLAR'].map(word=>({word,clue:'Find '+word}));
 for(let seed=0;seed<30;seed++){
  const n=nativeTask(importTask([{...importElements['pq-wordsearch'],data:{words,from:''}}]),0,'seed'+seed),k=Object.values(n.key)[0].k;
  assert.equal(k.placed.length,words.length);
  const node=n.content.content.find(n=>n.type==='pq'),{grid,size}=node.attrs.data;
  for(const p of k.placed){const [dr,dc]=p.dir.split(',').map(Number);assert.equal(Array.from({length:p.word.length},(_,i)=>grid[(p.row+dr*i)*size+p.col+dc*i]).join(''),p.word);}
 }
});
test('deployed key splitting is generated from the actual editor implementation',()=>{
 execFileSync(process.execPath,['scripts/sync-import-question-core.mjs','--check'],{stdio:'pipe'});
 execFileSync(process.execPath,['scripts/sync-learning-core.mjs','--check'],{stdio:'pipe'});
});

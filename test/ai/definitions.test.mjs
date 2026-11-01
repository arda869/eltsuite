import test from 'node:test';
import assert from 'node:assert/strict';
import {definitionInput,definitionSchema,checkDefinition,definitionInstructions,plainText,fields} from '../../functions/definitions/contract.js';
import {validate} from '../../functions/ai/contract.js';
const base={word:'bank',context:'We sat on the bank of the river.',focus:'',level:'A1',requestId:'test-1',classId:'c',lessonId:'l'};
const output=()=>({data:{...Object.fromEntries(fields.map(k=>[k,''])),meaning:'The land at the side of a river.',example:'We sat on the river bank.',pos:'noun'},translations:[],needsContext:false,note:'River context, simple A1 explanation.'});
test('definitions accept a word or phrase with optional clarification blank and validate scope',()=>{
 assert.equal(definitionInput(base).focus,'');assert.equal(definitionInput({...base,word:'look after'}).word,'look after');
 for(const patch of [{word:''},{word:'x'.repeat(121)},{context:'x'.repeat(4001)},{classId:'../private'},{classId:'',lessonId:'l'},{level:'invented'}])assert.throws(()=>definitionInput({...base,...patch}));
});
test('definition output cannot invent image links, word-level CEFR ratings or translations',()=>{
 const v=output();checkDefinition(v);assert.throws(()=>validate(definitionSchema,{...v,data:{...v.data,image:'https://example.invalid/tracker'}}));
 assert.throws(()=>checkDefinition({...v,data:{...v.data,cefr:'A1'}}));
 assert.throws(()=>checkDefinition({...v,translations:[{language:'Invented',text:'anything'}]},['Turkish']));
 assert.throws(()=>checkDefinition({...v,data:{...v.data,meaning:''}}));
 checkDefinition({...v,needsContext:true,data:Object.fromEntries(fields.map(k=>[k,'']))});
});
test('context extraction excludes private attributes and pedagogy requires the contextual sense',()=>{
 const text=plainText({type:'doc',attrs:{privateKey:'SECRET',learnerAnswer:'PRIVATE'},content:[{type:'paragraph',content:[{type:'text',text:'We sat by the river.'}]}]});
 assert.equal(text,'We sat by the river.');assert(plainText('x'.repeat(5000),100).length<=100);
 for(const requirement of ['multiword phrase','learner level','not a financial institution','useful classroom support','needsContext true','untrusted'])assert(definitionInstructions.includes(requirement));
});

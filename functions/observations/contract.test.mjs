import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observationInput,noteInput,selection,sourcePacket} from './contract.js';
test('optional context is blank and capture remains notes-only',()=>{assert.deepEqual(observationInput({title:'Pairs'}),{schemaVersion:1,title:'Pairs',focus:'',context:'',classId:'',itemId:'',mode:'developmental',capture:'notes-only'});assert.throws(()=>observationInput({title:' '}));});
test('notes distinguish observation from interpretation and validate time',()=>{assert.equal(noteInput({kind:'observed',offsetSeconds:0,text:'Four learners volunteered.'}).kind,'observed');for(const offsetSeconds of [-1,NaN,1.5,86401])assert.throws(()=>noteInput({kind:'observed',offsetSeconds,text:'Note'}));assert.throws(()=>noteInput({kind:'score',offsetSeconds:0,text:'Note'}));});
test('selections cannot silently include removed notes',()=>{assert.deepEqual(selection(['a','a']),['a']);assert.throws(()=>selection([]));assert.throws(()=>sourcePacket({id:'o'},[{id:'a',deleted:true}],['a']));assert.throws(()=>sourcePacket({id:'o'},[],['a']));});

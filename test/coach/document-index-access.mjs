import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc} from 'firebase/firestore';

test('only document editors can update a bounded coaching search preview',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-coach-index',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{
  await env.withSecurityRulesDisabled(async context=>{
   for(const uid of ['owner','editor','viewer'])await setDoc(doc(context.firestore(),'users',uid),{role:'teacher'});
   await setDoc(doc(context.firestore(),'sharedDocs','lesson-notes'),{kind:'doc',owner:'owner',docKey:'key',deletedAt:0,title:'Lesson notes',members:{editor:{role:'edit'},viewer:{role:'view'}},memberIds:['editor','viewer']});
  });
  const card={version:1,preview:'Holiday vocabulary and lesson reflection.',forms:'Lesson plan · learner choices'};
  const editor=env.authenticatedContext('editor').firestore(),viewer=env.authenticatedContext('viewer').firestore();
  await assertSucceeds(updateDoc(doc(editor,'sharedDocs','lesson-notes'),{coachIndex:card}));
  await assertFails(updateDoc(doc(viewer,'sharedDocs','lesson-notes'),{coachIndex:card}));
  await assertFails(updateDoc(doc(editor,'sharedDocs','lesson-notes'),{coachIndex:{...card,preview:'x'.repeat(1801)}}));
  await assertFails(updateDoc(doc(editor,'sharedDocs','lesson-notes'),{coachIndex:{...card,extra:'private'}}));
  assert.equal(card.preview.length<1800,true);
 }finally{await env.cleanup();}
});

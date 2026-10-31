import test from 'node:test';
import assert from 'node:assert/strict';
import { contextPermissions, beliefsComplete, profileComplete, relevantWriting, writingExcerpt } from '../../functions/ai/coach-context.js';
const complete = () => ({ qualifications: 'None', experience: '10+', roles: ['Teacher'], context: 'Adults at B1' });
test('all four sources start enabled and saved opt-outs take precedence', () => {
  assert.deepEqual(contextPermissions(), { profile:true, beliefs:true, reflections:true, inquiries:true });
  assert.deepEqual(contextPermissions({ profile:false, reflections:false }), { profile:false, beliefs:true, reflections:false, inquiries:true });
  assert.equal(contextPermissions({ inquiries:false }).inquiries, false);
});
test('profile setup accepts expertise without formal training and requires actual context', () => {
  assert.equal(profileComplete(complete()), true);
  for (const field of ['qualifications','experience','roles','context']) assert.equal(profileComplete({ ...complete(), [field]: field === 'roles' ? [] : '' }), false, field);
  assert.equal(profileComplete({ ...complete(), roles: ['Teacher','Teacher trainer'] }), true);
  assert.equal(profileComplete({ ...complete(), roles: ['Learner'] }), false);
  assert.equal(profileComplete({ ...complete(), experience: 'invented' }), false);
  assert.equal(profileComplete(undefined), false);
});
test('retrieval favours relevant writing and can prioritise an older linked reflection', () => {
  const rows = [{id:'a',title:'Instructions',text:'Task setup',at:30}, {id:'b',title:'Delayed correction',text:'Feedback and speaking',at:20}, {id:'c',title:'Mentoring',text:'Observation feedback',at:10}];
  assert.equal(relevantWriting(rows,'delayed correction in speaking',1)[0].id,'b');
  assert.equal(relevantWriting(rows,'delayed correction',1,'c')[0].id,'c');
  assert.equal(relevantWriting(rows,'unmatched topic',1)[0].id,'a');
  assert.equal(relevantWriting(rows,'feedback',2).length,2);
});
test('excerpts exclude unrelated fields, links and uncontrolled nested payloads', () => {
  const value = writingExcerpt({ title:'My reflection', text:'x'.repeat(9000), readingTitle:'A source', lesson:'/class/other', injected:{private:'never send'}, next:'Revisit' }, 'reflections');
  assert.equal(value.text.length,1800); assert.equal(value.readingTitle,'A source');
  assert.ok(!('injected' in value)); assert.ok(!('lesson' in value));
});

test('beliefs and an explicit Other qualification are required before coaching',()=>{
 assert.equal(beliefsComplete({beliefs:''}),false);
 assert.equal(beliefsComplete({beliefs:'   '}),false);
 assert.equal(beliefsComplete({beliefs:'I believe learning needs meaningful use.'}),true);
 assert.equal(profileComplete({...complete(),qualifications:'CELTA, Other: '}),false);
 assert.equal(profileComplete({...complete(),qualifications:'CELTA, Other: Mentoring course'}),true);
});

test('guided beliefs require answers rather than question labels alone',()=>{
 const form=Array.from({length:5},(_,i)=>`${String(i+1).padStart(2,'0')}. Question ${i}\n`).join('\n\n');
 assert.equal(beliefsComplete({beliefs:form}),false);
 assert.equal(beliefsComplete({beliefs:form.replaceAll(/(Question \d)\n/g,'$1\nIt depends on the learners.')}),true);
});

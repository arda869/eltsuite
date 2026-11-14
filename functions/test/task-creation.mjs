import test from 'node:test';
import assert from 'node:assert/strict';
import { checkActivities, nativeTask, taskCreationSchema } from '../ai/activities.js';
import { IMPORT_TYPES, newImportElement } from '../ai/import-types.js';
import { checkTaskMediaPlan } from '../ai/task-media.js';

const task = (changes = {}) => ({
  stageId:'tool',title:'At the café',format:'listening',mediaPlan:[{sourceRef:'',style:'',kind:'audio',title:'At the café',prompt:'',alt:'',lines:[
    {speaker:'Guest',text:'I would like soup, please.'},
    {speaker:'Server',text:'Certainly. Anything to drink?'},
  ]}],layout:'stacked',imageLayout:'row',teacherOnlyInput:'I would like soup, please.\nCertainly. Anything to drink?',roles:[],minutes:10,
  instructions:'Listen and answer.',input:'',structures:[],blocks:[],definitions:[],subTasks:[],questions:[],visuals:[],versions:[],teacherNotes:'Play twice.',support:'',challenge:'',inlineElements:[],
  ...changes,
});
const activity = t => ({title:t.title,rationale:'Listening practice',differentiation:'None',recycling:'None',tasks:[t]});
const check = t => checkActivities(activity(t),{stages:[{id:'tool',minutes:10}]},false,true);

test('task creation exposes each native editor/import element except source-only types', () => {
  const available = new Set(taskCreationSchema().$defs.importElement.anyOf.map(branch => branch.properties.kind.enum[0]));
  for (const type of IMPORT_TYPES) {
    if (['picture','linkcard','investigation'].includes(type.kind) || type.kind.startsWith('tt-')) continue;
    assert.ok(available.has(type.kind), type.kind);
  }
  assert.ok(!available.has('picture'), 'generated images must use the media preparation path');
});

test('listening task needs new audio, matching private script and private answers', () => {
  const gap = newImportElement('gap','The guest orders ___.');gap.data.answers=['soup'];
  const generated = task({inlineElements:[gap]});
  assert.doesNotThrow(() => check(generated));
  assert.doesNotThrow(() => checkTaskMediaPlan(generated,{recordings:[],images:[]},[],'Create a listening comprehension task about ordering food, including an audio dialogue and questions.'));
  assert.doesNotThrow(() => checkTaskMediaPlan(task({...generated,teacherOnlyInput:'Private transcript\nGuest: I would like soup, please.\nServer: Certainly. Anything to drink?\nReveal after the second listen.'}),{recordings:[],images:[]},[],'Create a listening task.'));
  assert.throws(() => checkTaskMediaPlan(task({...generated,mediaPlan:[]}),{recordings:[],images:[]},[],'Create a listening task.'),/recording/i);
  assert.throws(() => checkTaskMediaPlan(task({...generated,mediaPlan:[]}),{recordings:[],images:[]},[{type:'dialogue',content:[]}],'Create a listening task.'),/recording/i);
  assert.throws(() => checkTaskMediaPlan(task({...generated,teacherOnlyInput:'Wrong words.'}),{recordings:[],images:[]},[],'Create a listening task.'),/script/i);
  assert.throws(() => checkTaskMediaPlan(task({...generated,format:'reading'}),{recordings:[],images:[]},[],'Create a listening task.'),/listening activity/i);
  const native=nativeTask({...generated,preparedMedia:[{kind:'audio',mediaId:'prepared_audio',title:'At the café'}]},0);
  assert.equal(native.content.content[0].type,'media');
  assert.equal(native.content.content[0].attrs.media,'prepared_audio');
  assert.deepEqual(native.key.q0_e0.answers,['soup']);
  assert.ok(!JSON.stringify(native.content).includes('soup'), 'answer must stay out of learner content');
  assert.ok(!JSON.stringify(native.content).includes('Certainly'), 'private script must stay out of learner content');
});

test('prepared picture is placed inside a label question', () => {
  const label=newImportElement('pq-label','Label the counter.');
  label.data.points=[{x:45,y:52,label:'counter'}];
  const generated=task({format:'reading',mediaPlan:[{sourceRef:'',style:'editorial',kind:'image',title:'Café counter',prompt:'A café counter',alt:'A café counter',lines:[]}],teacherOnlyInput:'',inlineElements:[label]});
  assert.doesNotThrow(() => check(generated));
  assert.doesNotThrow(() => checkTaskMediaPlan(generated,{recordings:[],images:[]},[],''));
  const native=nativeTask({...generated,preparedMedia:[{kind:'image',mediaId:'prepared_picture',title:'Café counter',alt:'A café counter'}]},0);
  const question=native.content.content.find(node=>node.type==='pq');
  assert.equal(question.attrs.data.image,'media:prepared_picture');
  assert.ok(!JSON.stringify(native.content).includes('counter"}'), 'label answer must not be exposed in learner content');
});

test('a complete AI conversation setup becomes a native speaking task', () => {
  const speaking=newImportElement('speaking','Order lunch with a partner.');
  speaking.data={title:'At the café',scenario:'You are ordering lunch at a café.',focus:'Use polite requests.',learnerRole:'A guest ordering lunch',partnerRole:'A server taking the order',level:'B1',seconds:120};
  const generated=task({format:'speaking',mediaPlan:[],teacherOnlyInput:'',inlineElements:[speaking]});
  assert.doesNotThrow(() => check(generated));
  const native=nativeTask(generated,0);
  const node=native.content.content.find(n=>n.type==='speakingPractice');
  assert.equal(node.attrs.title,'At the café');
  assert.equal(node.attrs.contextApplied,true);
});

test('a speaking picture is attached inside its prompt without a duplicate', () => {
  const speaking=newImportElement('pq-speaking','Discuss your answers.');
  speaking.data={prompt:'Compare the two pictures.',images:[],questions:['Which setting would you choose?'],timer:60,pairs:true};
  const generated=task({format:'speaking',mediaPlan:[{sourceRef:'',style:'editorial',kind:'image',title:'Two cafés',prompt:'Two contrasting café settings',alt:'Two cafés',lines:[]}],teacherOnlyInput:'',inlineElements:[speaking]});
  assert.doesNotThrow(() => check(generated));
  assert.doesNotThrow(() => checkTaskMediaPlan(generated,{recordings:[],images:[]},[],''));
  const native=nativeTask({...generated,preparedMedia:[{kind:'image',mediaId:'prepared_picture',title:'Two cafés',alt:'Two cafés'}]},0);
  const picturePrompts=native.content.content.filter(n=>n.type==='pq'&&n.attrs.kind==='speaking');
  assert.deepEqual(picturePrompts[0].attrs.data.images,['media:prepared_picture']);
  assert.equal(native.content.content.filter(n=>n.type==='paragraph'&&n.content?.some(c=>c.type==='picture')).length,0);
});

test('dialogue and table gaps count as learner responses', () => {
  const dialogue=newImportElement('dialogue','Complete the guest’s order.');
  dialogue.data={layout:'stacked',turns:[
    {speaker:'Guest',text:'I would like ___, please.',answers:['soup']},
    {speaker:'Server',text:'Certainly.',answers:[]},
  ]};
  const speaking=task({inlineElements:[dialogue]});
  assert.doesNotThrow(() => check(speaking));
  const dialogueNative=nativeTask(speaking,0);
  assert.ok(Object.values(dialogueNative.key).some(k=>k.answers?.includes('soup')));
  assert.ok(!JSON.stringify(dialogueNative.content).includes('soup'));

  const table=newImportElement('table','Complete the order table.');
  table.data={headers:['Item','Price'],rows:[['Soup','___']],answers:['five pounds']};
  const written=task({format:'gap',mediaPlan:[],teacherOnlyInput:'',inlineElements:[table]});
  assert.doesNotThrow(() => check(written));
  assert.ok(Object.values(nativeTask(written,0).key).some(k=>k.answers?.includes('five pounds')));
});

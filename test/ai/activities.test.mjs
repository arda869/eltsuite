import test from 'node:test';
import assert from 'node:assert/strict';
import {checkActivities,nativeTask,nativeVersions} from '../../functions/ai/activities.js';
const task={stageId:'s',title:'Choose',format:'choice',teacherOnlyInput:'Private reference.',roles:[],minutes:15,instructions:'Choose the best answer.',input:'A trip tomorrow.',questions:[{format:'choice',acceptedAnswers:[],prompt:'Which is arranged?',options:['I am flying tomorrow.','I flew yesterday.'],answer:'I am flying tomorrow.',explanation:'The present continuous can describe an arrangement.'}],teacherNotes:'Check meaning.',support:'',challenge:''};
const plan={stages:[{id:'s',minutes:15}]};
const value={title:'Travel',rationale:'Contextualised choices',differentiation:'No evidence.',recycling:'No history.',tasks:[task]};
test('conversion validates stage timing, ordering, formats and usable keys',()=>{
 assert.equal(checkActivities(value,plan),value);
 for(const patch of [{minutes:14},{stageId:'x'},{format:'html'},{questions:[{...task.questions[0],answer:'missing'}]}]) assert.throws(()=>checkActivities({...value,tasks:[{...task,...patch}]},plan));
 assert.throws(()=>checkActivities({...value,tasks:[{...task,questions:[{...task.questions[0],format:'gap'}]}]},plan));
});
test('native activities separate correct answers from public nodes',()=>{
 const n=nativeTask(task,0);assert.equal(n.key.q0_0.correct,0);assert.equal(n.content.content.flatMap(x=>x.content??[]).find(x=>x.type==='choice').attrs.correct,-1);assert.ok(!JSON.stringify(n.content).includes('present continuous can describe'));
 const gap=nativeTask({...task,format:'gap',questions:[{...task.questions[0],format:'gap',prompt:'I ___ tomorrow.',answer:'am flying'}]},1);assert.deepEqual(gap.key.q1_0.answers,['am flying']);assert.ok(!JSON.stringify(gap.content).includes('am flying'));
 const match=nativeTask({...task,format:'matching',questions:[{...task.questions[0],format:'matching',prompt:'a',answer:'A'},{...task.questions[0],format:'matching',prompt:'b',answer:'B'}]},2);assert.deepEqual(match.key.q2_match.map,[1,0]);
});
test('reading tasks retain interactive questions and accepted alternative answers',()=>{
 const n=nativeTask({...task,format:'reading',teacherOnlyInput:'Hidden answer reference',questions:[task.questions[0],{...task.questions[0],format:'gap',prompt:'I ___ tomorrow.',answer:'am flying',acceptedAnswers:["’m flying","\u0027m flying"]}]},0);
 assert.equal(n.key.q0_0.kind,'mcq');assert.equal(n.key.q0_1.answers.length,3);
 assert.ok(!JSON.stringify(n.content).includes('Hidden answer reference'));
 assert.ok(n.notes.includes('Hidden answer reference'));
});

test('differentiation replaces task response format and keys instead of adding a footer',()=>{
 const versions=[{label:'Supported',reason:'Recognition',instructions:'Choose the reply.',input:'A traveller needs a lift.',visuals:[],questions:task.questions},{label:'Stretch',reason:'Recall',instructions:'Complete the reply.',input:'A traveller needs a lift.',visuals:[],questions:[{format:'gap',acceptedAnswers:[],prompt:'I ___ you a lift.',options:[],answer:'will give',explanation:'An offer.'}]}];
 const t={...task,versions,visuals:[]};checkActivities({...value,tasks:[t]},plan);
 const v=nativeVersions(t,0);assert.equal(v[0].native.key.q0_0.kind,'mcq');assert.equal(v[1].native.key.q0_0.kind,'gap');assert.equal(v[1].instructions,'Complete the reply.');assert.ok(!JSON.stringify(v[1].native.content).includes('Which is arranged?'));assert.ok(!JSON.stringify(v[1].native.content).includes('will give'));assert.deepEqual(nativeVersions(t,0,true,'exam'),[]);assert.deepEqual(nativeVersions(t,0,false),[]);
 assert.throws(()=>checkActivities({...value,tasks:[{...t,versions:[{...versions[0],questions:[{...task.questions[0],answer:'not an option'}]}]}]},plan));
});
test('visual grids are real editable nodes with consistent columns',()=>{
 const visuals=[{title:'Meet this week',headers:['Day','Free time'],rows:[['Monday','After 5'],['Tuesday','Before 4']]}];
 const t={...task,visuals,versions:[]};checkActivities({...value,tasks:[t]},plan);const n=nativeTask(t,0);assert.equal(n.content.content[2].type,'table');assert.equal(n.content.content[2].content[0].content[0].type,'tableHeader');assert.equal(n.content.content[2].content.length,3);
 assert.throws(()=>checkActivities({...value,tasks:[{...t,visuals:[{...visuals[0],rows:[['Monday','5','extra']]}]}]},plan));
});
test('legacy advice is not turned into fake differentiated versions; role cards remain separate',()=>{
 assert.deepEqual(nativeVersions({...task,support:'Add more work',challenge:'Extra paragraph'},0),[]);
 const v=nativeVersions({...task,roles:[{label:'A',input:'Private A detail'},{label:'B',input:'Private B detail'}]},0);
 assert.equal(v.length,2);assert.ok(JSON.stringify(v[0].native.content).includes('Private A detail'));assert.ok(!JSON.stringify(v[0].native.content).includes('Private B detail'));
});

test('native reading blocks, numbered oral prompts and subtasks stay editable without writing boxes',()=>{
 const blocks=[{kind:'reading',title:'A weekend away',text:'We arrived on Friday.\nThe town was quiet.',items:[]}];
 const discussion={format:'discussion',acceptedAnswers:[],prompt:'Which place would you choose? Compare with a partner.',options:[],answer:'Any choice with a reason.',explanation:'Listen for reasons.'};
 const subTasks=[{instructions:'Read. Choose the answer.',input:'',blocks:[],visuals:[],questions:task.questions},{instructions:'Talk to your partner.',input:'',blocks:[],visuals:[],questions:[discussion,{...discussion,prompt:'What would you do there?'}]}];
 const t={...task,format:'reading',blocks,subTasks,questions:[],versions:[],visuals:[]};
 checkActivities({...value,tasks:[t]},plan);
 const n=nativeTask(t,3),nodes=n.content.content;
 assert.equal(nodes[0].type,'textBox');assert.equal(nodes[0].attrs.style,'paper');assert.equal(nodes[0].content.length,2);
 assert.equal(nodes[1].type,'subTask');assert.equal(nodes[2].attrs.instr,'Talk to your partner.');
 assert.equal(nodes[2].content[0].type,'orderedList');assert.equal(nodes[2].content[0].content.length,2);
 assert.equal(n.key.q3_s0_0.kind,'mcq');
 assert.ok(!JSON.stringify(n.content).includes('"type":"writing"'));
 assert.ok(!JSON.stringify(n.content).includes('Any choice with a reason.'));
 assert.throws(()=>checkActivities({...value,tasks:[{...t,subTasks:[{...subTasks[0],questions:[{...task.questions[0],answer:'invalid'}]}]}]},plan));
});
test('structured lists and genre boxes use native nodes; role and support content stays separate',()=>{
 const blocks=[{kind:'numberedList',title:'',text:'',items:['1. Compare the places.','2. Choose one.']},{kind:'email',title:'From Alex',text:'Shall we go on Saturday?',items:[]}];
 const t={...task,blocks,subTasks:[],questions:[{...task.questions[0],format:'discussion'}]};
 checkActivities({...value,tasks:[t]},plan);
 const n=nativeTask(t,0);assert.equal(n.content.content[0].type,'orderedList');assert.equal(n.content.content[0].content[0].content[0].content[0].text,'Compare the places.');
 assert.equal(n.content.content[1].attrs.style,'email');
 const roles=nativeVersions({...t,roles:[{label:'A',input:'Secret A'},{label:'B',input:'Secret B'}]},0);
 assert.ok(JSON.stringify(roles[0].native.content).includes('Secret A'));assert.ok(!JSON.stringify(roles[0].native.content).includes('Secret B'));
 const supported=nativeVersions({...t,versions:[{label:'Supported',reason:'A frame.',instructions:'Choose.',input:'Different text',questions:task.questions,visuals:[]}]},0);
 assert.ok(!JSON.stringify(supported[0].native.content).includes('Shall we'));
 assert.throws(()=>checkActivities({...value,tasks:[{...t,blocks:[{kind:'numberedList',title:'',text:'Wrong container',items:[]}]}]},plan));
});

test('short options use inline choices and word responses never become essay fields',()=>{
 const t={...task,questions:[{...task.questions[0],prompt:'You ___ book.',options:['must','should','can'],answer:'must'},{...task.questions[0],format:'shortAnswer',prompt:'Which day?',options:[],answer:'Monday'}]};
 const n=nativeTask(t,0),json=JSON.stringify(n.content);
 assert.match(json,/"display":"dropdown"/);assert.ok(!json.includes('"type":"writing"'));assert.equal(n.key.q0_1.kind,'gap');assert.ok(!json.includes('Monday'));
 const long=nativeTask({...task,questions:[{...task.questions[0],options:['This is a long response with an explanation that needs its own line.','Another long response with enough information to warrant a separate line.'],answer:'This is a long response with an explanation that needs its own line.'}]},0);
 assert.match(JSON.stringify(long.content),/"display":"radio"/);
});
test('sorting, definitions and media use native nodes with private answers',()=>{
 const q={...task.questions[0],format:'categorise',prompt:'Item 1',options:['Necessary','A choice'],answer:'Necessary'};
 const t={...task,input:'A pier by the river.',definitions:[{term:'pier',meaning:'A structure where boats stop.',example:''}],questions:[q],preparedMedia:[{kind:'image',mediaId:'img1',alt:'A harbour',title:'Harbour'},{kind:'audio',mediaId:'snd1',title:'A conversation'}],layout:'columns'};
 const n=nativeTask(t,0),json=JSON.stringify(n.content);
 for(const type of ['definition','picture','media','columnBreak','pq'])assert.ok(json.includes('"type":"'+type+'"'));
 assert.equal(n.key.q0_categorise.k.map[0],0);assert.ok(!json.includes('"map"'));assert.match(json,/"scriptMode":"none"/);assert.match(json,/"src":"media:img1"/);
});

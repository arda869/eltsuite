import test from 'node:test';
import assert from 'node:assert/strict';
import {checkActivities,nativeTask} from '../../functions/ai/activities.js';
const task={stageId:'s',title:'Choose',format:'choice',teacherOnlyInput:'Private reference.',roles:[],minutes:15,instructions:'Choose the best answer.',input:'A trip tomorrow.',questions:[{format:'choice',acceptedAnswers:[],prompt:'Which is arranged?',options:['I am flying tomorrow.','I flew yesterday.'],answer:'I am flying tomorrow.',explanation:'The present continuous can describe an arrangement.'}],teacherNotes:'Check meaning.',support:'',challenge:''};
const plan={stages:[{id:'s',minutes:15}]};
const value={title:'Travel',rationale:'Contextualised choices',differentiation:'No evidence.',recycling:'No history.',tasks:[task]};
test('conversion validates stage timing, ordering, formats and usable keys',()=>{
 assert.equal(checkActivities(value,plan),value);
 for(const patch of [{minutes:14},{stageId:'x'},{format:'html'},{questions:[{...task.questions[0],answer:'missing'}]}]) assert.throws(()=>checkActivities({...value,tasks:[{...task,...patch}]},plan));
 assert.throws(()=>checkActivities({...value,tasks:[{...task,questions:[{...task.questions[0],format:'gap'}]}]},plan));
});
test('native activities separate correct answers from public nodes',()=>{
 const n=nativeTask(task,0);assert.equal(n.key.q0_0.correct,0);assert.equal(n.content.content[2].content[0].attrs.correct,-1);assert.ok(!JSON.stringify(n.content).includes('present continuous can describe'));
 const gap=nativeTask({...task,format:'gap',questions:[{...task.questions[0],format:'gap',prompt:'I ___ tomorrow.',answer:'am flying'}]},1);assert.deepEqual(gap.key.q1_0.answers,['am flying']);assert.ok(!JSON.stringify(gap.content).includes('am flying'));
 const match=nativeTask({...task,format:'matching',questions:[{...task.questions[0],format:'matching',prompt:'a',answer:'A'},{...task.questions[0],format:'matching',prompt:'b',answer:'B'}]},2);assert.deepEqual(match.key.q2_match.map,[1,0]);
});
test('reading tasks retain interactive questions and accepted alternative answers',()=>{
 const n=nativeTask({...task,format:'reading',teacherOnlyInput:'Hidden answer reference',questions:[task.questions[0],{...task.questions[0],format:'gap',prompt:'I ___ tomorrow.',answer:'am flying',acceptedAnswers:["’m flying","\u0027m flying"]}]},0);
 assert.equal(n.key.q0_0.kind,'mcq');assert.equal(n.key.q0_1.answers.length,3);
 assert.ok(!JSON.stringify(n.content).includes('Hidden answer reference'));
 assert.ok(n.notes.includes('Hidden answer reference'));
});

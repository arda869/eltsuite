import test from 'node:test';import assert from 'node:assert/strict';
import {lessonScore} from '../../functions/ai/coach-lessons.js';
test('an explicitly named lesson stays ahead of broad matching material after content retrieval',()=>{
 const prompt='Please look inside my saved lesson “At the park — import verification” in Demo class. What is the reading passage about, and what is one short classroom follow-up I could use? Name the lesson source you used.';
 const named={title:'At the park — import verification',className:'Demo class'},other={title:'Designer images — live verification',className:'Demo class'};
 assert.ok(lessonScore(prompt,named,'Sam has a red ball.')>lessonScore(prompt,other,prompt));
 assert.ok(lessonScore(prompt,named)>lessonScore(prompt,other));
 assert.ok(lessonScore('Discuss AT THE PARK - IMPORT VERIFICATION.',named)>1000000);
});

test('an ICQ question about the current activity does not read an unrelated lesson', async () => {
 const {findTeacherLessons}=await import('../../functions/ai/coach-lessons.js');
 const item={id:'tuesday',get:key=>({type:'lesson',title:'Tuesday live lesson plan'}[key])};
 const cls={id:'demo',get:()=> 'Demo class',ref:{collection:()=>({get:async()=>({docs:[item]})})}};
 let sourceReads=0;
 const db={collection:()=>({where:()=>({get:async()=>({docs:[cls]})})}),doc:()=>{sourceReads++;throw Error('Unexpected source read');}};
 const found=await findTeacherLessons(db,'teacher','What ICQs can I use here?',{classId:'demo',itemId:'lesson1',taskId:'listening1'});
 assert.deepEqual(found.lessons,[]);assert.equal(sourceReads,0);
});

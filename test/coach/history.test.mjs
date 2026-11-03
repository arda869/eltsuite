import test from 'node:test';import assert from 'node:assert/strict';
import {coachHistoryKey} from '../../functions/ai/coach-history.js';
test('privacy and selected-context changes isolate model history without deleting saved messages',()=>{
 const current=coachHistoryKey(1,2,{lessonContext:{classId:'c',itemId:'i'},reflectionId:'r'});
 assert.equal(current,coachHistoryKey(1,2,{lessonContext:{classId:'c',itemId:'i',taskId:'',reportId:''},entryId:'r'}));
 assert.notEqual(current,coachHistoryKey(1,3,{lessonContext:{classId:'c',itemId:'i'},reflectionId:'r'}));
 assert.notEqual(current,coachHistoryKey(2,2,{lessonContext:{classId:'c',itemId:'i'},reflectionId:'r'}));
 assert.notEqual(current,coachHistoryKey(1,2,{}));
});

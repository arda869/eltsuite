import assert from 'node:assert/strict';
import {test} from 'node:test';
import {preparedScript} from '../../functions/ai/prepared-script.js';
test('prepared audio retains exact spoken words, speakers and measured take timing',()=>{
 assert.deepEqual(preparedScript([{speaker:'Maya',text:'Shall we go?'},{speaker:'Leo',text:'Yes, please.'}],[1.5,2]),[{t:0,e:1.5,who:'Maya',text:'Shall we go?'},{t:1.75,e:3.75,who:'Leo',text:'Yes, please.'}]);
});
test('missing historical takes produce an untimed transcript, never invented timings',()=>{
 assert.deepEqual(preparedScript([{speaker:'Maya',text:'Shall we go?'}]),[{t:null,who:'Maya',text:'Shall we go?'}]);
});

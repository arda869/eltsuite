import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeGenerationResult,readGenerationResult} from '../../functions/ai/storage.js';
test('generation storage preserves visual grids and supports legacy saved jobs',()=>{
 const result={activities:{tasks:[{visuals:[{title:'Options',headers:['Trip','Cost'],rows:[['Bus','£5'],['Train','£8']]}],versions:[{visuals:[{rows:[['A','B']]}]}]}]},usage:[{inputTokens:100,outputTokens:200}]};
 const stored=encodeGenerationResult(result);
 assert.deepEqual(Object.keys(stored),['resultJson']);
 assert.deepEqual(readGenerationResult(stored),result);
 assert.deepEqual(readGenerationResult({result}),result);
 assert.throws(()=>encodeGenerationResult({text:'a'.repeat(700001)}));
});

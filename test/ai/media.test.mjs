import test from 'node:test';
import assert from 'node:assert/strict';
import {RESERVATION_PER_CALL} from '../../functions/ai/budget.js';
import {mediaRequests,mediaReservation,wav,sameWords} from '../../functions/ai/media-contract.js';
const image={kind:'image',title:'A garden',prompt:'An original garden',alt:'A garden',lines:[]};
test('media plans reject missing resources, excessive assets and unsafe spending',()=>{
 assert.equal(mediaRequests({tasks:[{mediaPlan:[image]}]})[0].id,'t0_m0');
 assert.throws(()=>mediaRequests({tasks:[{mediaPlan:[{...image,prompt:''}]}]}));
 assert.throws(()=>mediaRequests({tasks:Array.from({length:5},()=>({mediaPlan:[image]}))}));
 assert.throws(()=>mediaReservation(image,20000000));assert.throws(()=>mediaReservation(image,0,Date.parse('2027-01-01')));
 assert.equal(mediaReservation({...image,source:'commons'},0,Date.parse('2026-11-01')).amount,RESERVATION_PER_CALL);
});
test('saved audio is a complete PCM WAV and script mismatches fail comparison',()=>{
 const b=wav(Buffer.alloc(48000));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(40),48000);assert.equal(b.readUInt32LE(24),24000);
 assert.equal(sameWords('We’re ready.','We\'re ready!'),true);assert.equal(sameWords('We must go.','We should go.'),false);assert.equal(sameWords('Hello.','Hello. Thank you.'),false);
});

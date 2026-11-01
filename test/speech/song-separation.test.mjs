import test from 'node:test';import assert from 'node:assert/strict';
import {N,STRIDE,separateSamples} from '../../functions/songs/separate.js';
test('aligned separation preserves short edges and overlapped audio exactly',async()=>{
 for(const length of [113,N+371,STRIDE*2+3]){
 const mix=[Float32Array.from({length},(_,i)=>Math.sin(i*.01)*.4),Float32Array.from({length},(_,i)=>Math.cos(i*.02)*.3)];let calls=0,progress=[];
 const out=await separateSamples(mix,async input=>{calls++;const r=new Float32Array(8*N);for(let c=0;c<2;c++)for(let i=0;i<N;i++)r[(6+c)*N+i]=input[c*N+i]*.6;return r;},async p=>progress.push(p));
 assert.equal(calls,Math.ceil(length/STRIDE));assert.equal(progress.at(-1),1);
 for(let c=0;c<2;c++)for(let i=0;i<length;i++){assert.ok(Math.abs(out.vocals[c][i]+out.instrumental[c][i]-mix[c][i])<1e-6);assert.ok(Math.abs(out.vocals[c][i]-.6*mix[c][i])<1e-6);}
 }
});
test('invalid and non-finite separation results fail visibly',async()=>{await assert.rejects(()=>separateSamples([new Float32Array(1)],()=>{}));await assert.rejects(()=>separateSamples([new Float32Array(1),new Float32Array(1)],()=>new Float32Array(4)));});

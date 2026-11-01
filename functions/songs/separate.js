// HT-Demucs vocal specialist, exported by StemSplit (MIT). See THIRD_PARTY.md.
// No credential or external audio upload: the model runs on our server.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
export const MODEL_URL='https://huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx/resolve/2ef0d757d3e226d0da85fb8c71514f464fcabdd0/htdemucs_ft_vocals_fp16weights.onnx';
export const MODEL_SHA256='0cbe651f535415c9d26a7bb614f7d322dd5a080fa0298f2e50f478030a994dce';
export const RATE=44100,N=343980,OVERLAP=Math.floor(N/4),STRIDE=N-OVERLAP;
let sessionPromise;
async function modelSession(){
  if(!sessionPromise)sessionPromise=(async()=>{
    const path=join(tmpdir(),'elt-song-model-'+MODEL_SHA256+'.onnx');
    let bytes;try{bytes=await readFile(path);}catch{}
    if(!bytes||createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256){
      const r=await fetch(MODEL_URL,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('The sing-along model could not be loaded.');
      bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==165612636||createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('The sing-along model could not be verified.');
      await writeFile(path,bytes);
    }
    const ort=await import('onnxruntime-node');
    const session=await ort.InferenceSession.create(path,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
    return {session,Tensor:ort.Tensor};
  })().catch(e=>{sessionPromise=null;throw e;});
  return sessionPromise;
}
// Positive edge weights preserve the first/last samples, including clips under 7.8 s.
export function transitionWindow(){const w=new Float32Array(N).fill(1);for(let i=0;i<OVERLAP;i++){w[i]=(i+1)/(OVERLAP+1);w[N-1-i]=(i+1)/(OVERLAP+1);}return w;}
export async function separateSamples(mix,run,onProgress=async()=>{}){
  if(mix.length!==2||mix[0].length!==mix[1].length||!mix[0].length||mix[0].length>RATE*190)throw Error('Choose a song up to three minutes long.');
  const length=mix[0].length,vocals=[new Float32Array(length),new Float32Array(length)],weight=new Float32Array(length),window=transitionWindow();
  const count=Math.ceil(length/STRIDE),input=new Float32Array(2*N);
  for(let chunk=0;chunk<count;chunk++){
    const start=chunk*STRIDE,len=Math.min(N,length-start);input.fill(0);
    for(let c=0;c<2;c++)input.set(mix[c].subarray(start,start+len),c*N);
    const output=await run(input);if(output.length!==8*N)throw Error('The sing-along model returned incomplete audio.');
    for(let i=0;i<len;i++){weight[start+i]+=window[i];for(let c=0;c<2;c++){const value=output[(6+c)*N+i];if(!Number.isFinite(value))throw Error('The sing-along audio is invalid.');vocals[c][start+i]+=value*window[i];}}
    await onProgress((chunk+1)/count);
  }
  const instrumental=[new Float32Array(length),new Float32Array(length)];
  for(let c=0;c<2;c++)for(let i=0;i<length;i++){vocals[c][i]/=weight[i];instrumental[c][i]=mix[c][i]-vocals[c][i];}
  return {vocals,instrumental};
}
export function interleave(channels){const out=Buffer.alloc(channels[0].length*8);for(let i=0;i<channels[0].length;i++)for(let c=0;c<2;c++)out.writeFloatLE(channels[c][i],(2*i+c)*4);return out;}
export async function separateSong(bytes,onProgress){
  const dir=await mkdtemp(join(tmpdir(),'elt-song-stems-'));
  try{
    const {default:ffmpeg}=await import('ffmpeg-static'),input=join(dir,'song');await writeFile(input,bytes);
    const {stdout}=await exec(ffmpeg,['-nostdin','-v','error','-i',input,'-t','191','-f','f32le','-ac','2','-ar',String(RATE),'pipe:1'],{encoding:'buffer',maxBuffer:RATE*191*8+1024,timeout:90000});
    const length=stdout.length/8;if(!Number.isInteger(length)||length<RATE/2||length>RATE*190)throw Error('The song could not be decoded.');
    const mix=[new Float32Array(length),new Float32Array(length)];for(let i=0;i<length;i++)for(let c=0;c<2;c++)mix[c][i]=stdout.readFloatLE((2*i+c)*4);
    const {session,Tensor}=await modelSession();
    const samples=await separateSamples(mix,async data=>{const r=await session.run({mix:new Tensor('float32',data,[1,2,N])});return r.stems.data;},onProgress);
    const results={};
    for(const stem of ['vocals','instrumental']){
      const raw=join(dir,stem+'.raw'),mp3=join(dir,stem+'.mp3');await writeFile(raw,interleave(samples[stem]));
      await exec(ffmpeg,['-nostdin','-v','error','-f','f32le','-ar',String(RATE),'-ac','2','-i',raw,'-codec:a','libmp3lame','-b:a','192k',mp3],{timeout:90000});
      results[stem]=await readFile(mp3);
    }
    return {...results,mime:'audio/mpeg',duration:length/RATE};
  }finally{await rm(dir,{recursive:true,force:true});}
}

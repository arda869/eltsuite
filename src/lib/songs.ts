import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
export type SongBrief = { title:string; audience:string; level:string; style:string; language:string; delivery:string; duration:number; focus:string; prompt:string; lyrics:string };
export type SongResult = {status:'working'|'complete'|'failed';lyrics?:string;audio?:string;mime?:string;providerLyrics?:string;error?:string};
const fn=()=>getFunctions(app,'us-central1');
export const songResult=async(id:string)=>(await httpsCallable<{id:string},SongResult>(fn(),'recordingSongResult',{timeout:65000})({id})).data;
export const startSong=async(id:string,brief:SongBrief)=>(await httpsCallable(fn(),'recordingSong',{timeout:550000})({id,brief,approved:true})).data;
export const startLyrics=async(id:string,brief:SongBrief)=>(await httpsCallable(fn(),'recordingLyrics',{timeout:250000})({id,brief})).data;
export function songBlob(result:SongResult){
  if(!result.audio||!result.mime)throw Error('The song is not ready to play.');
  return new Blob([Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0))],{type:result.mime});
}

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
export type SongBrief = { title:string; audience:string; level:string; style:string; language:string; delivery:string; duration:number; focus:string; prompt:string; lyrics:string; lesson?:{classId:string;itemId:string}|null };
export type SongLesson = {reference:{classId:string;itemId:string};title:string;className:string;level:string;audience:string;focus:string;tasks:{title:string;instructions:string;text:string}[]};
export type SongResult = {status:'working'|'complete'|'failed';lyrics?:string;audio?:string;mime?:string;providerLyrics?:string;error?:string;stems?:{status:'working'|'complete'|'failed';progress:number;error?:string}|null};
const fn=()=>getFunctions(app,'us-central1');
export const loadSongLesson=async(lesson:{classId:string;itemId:string})=>(await httpsCallable<{lesson:typeof lesson},SongLesson>(fn(),'recordingSongLesson')({lesson})).data;
export const songResult=async(id:string,options:{stem?:'vocals'|'instrumental';metaOnly?:boolean}={})=>(await httpsCallable<{id:string;stem?:string;metaOnly?:boolean},SongResult>(fn(),'recordingSongResult',{timeout:65000})({id,...options})).data;
export const startSong=async(id:string,brief:SongBrief)=>(await httpsCallable(fn(),'recordingSong',{timeout:550000})({id,brief,approved:true})).data;
export const startLyrics=async(id:string,brief:SongBrief)=>(await httpsCallable(fn(),'recordingLyrics',{timeout:250000})({id,brief})).data;
export function songBlob(result:SongResult){
  if(!result.audio||!result.mime)throw Error('The song is not ready to play.');
  return new Blob([Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0))],{type:result.mime});
}

export const startSongStems=async(id:string)=>(await httpsCallable(fn(),'recordingSongStems',{timeout:1810000})({id})).data;
export type SongStems = { vocals: AudioBuffer; instrumental: AudioBuffer };

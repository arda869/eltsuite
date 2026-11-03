import {useEffect,useState} from 'react';
import {collection,onSnapshot,orderBy,query} from 'firebase/firestore';
import {db} from '../lib/firebase';
import type {LessonCoachContext} from './CoachChat';
export type CoachContext={lessonContext?:LessonCoachContext|null;formContext?:{docId:string;formId:string}|null;evidencePacketId?:string;reflectionId?:string};
export type CoachMessage={role:'teacher'|'coach';text:string;basis?:string[];journalDraft?:string|null;sources?:{title:string;url:string}[]};
type Turn={id:string;prompt:string;status:string;contextKey?:string;at:number;sequence:number;result?:{reply:string;basis?:string[];journalDraft?:string|null;sources?:{title:string;url:string}[]}};
export type Conversation={id:string;title:string;updatedAt:number;context:CoachContext};
const key=(uid:string,scope:string)=>'elt.coach.active:'+uid+':'+scope;
export function lastConversation(uid:string,scope:string){try{return localStorage.getItem(key(uid,scope))||crypto.randomUUID();}catch{return crypto.randomUUID();}}
export function rememberConversation(uid:string,scope:string,id:string){try{localStorage.setItem(key(uid,scope),id);}catch{/* The cloud history still works without local storage. */}}
export function readDraft(uid:string,id:string){try{return sessionStorage.getItem('elt.coach.draft:'+uid+':'+id)||'';}catch{return '';}}
export function saveDraft(uid:string,id:string,text:string){try{sessionStorage.setItem('elt.coach.draft:'+uid+':'+id,text);}catch{}window.dispatchEvent(new CustomEvent('elt-coach-draft',{detail:{uid,id,text}}));}
export function useConversations(uid:string,id:string,contextKey:string){
 const [conversations,setConversations]=useState<Conversation[]>([]),[turns,setTurns]=useState<Turn[]>([]),[ready,setReady]=useState(false),[loadedId,setLoadedId]=useState(''),[error,setError]=useState(''),[listError,setListError]=useState(''),[now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{setConversations([]);return onSnapshot(query(collection(db,'teachingCoach',uid,'conversations'),orderBy('updatedAt','desc')),s=>{setConversations(s.docs.map(d=>({...d.data(),id:d.id} as Conversation)));setListError('');},()=>setListError('Conversation history could not be opened. Check your connection and reopen the coach.'));},[uid]);
 useEffect(()=>{setReady(false);setTurns([]);setError('');return onSnapshot(query(collection(db,'teachingCoach',uid,'conversations',id,'turns'),orderBy('sequence')),s=>{setTurns(s.docs.map(d=>({...d.data(),id:d.id} as Turn)));setLoadedId(id);setReady(true);setError('');},()=>{setReady(false);setError('This conversation could not be opened. Your saved history has not been cleared.');});},[uid,id]);
 const currentTurns=loadedId===id?turns:[];
 const messages:CoachMessage[]=currentTurns.flatMap(t=>[{role:'teacher' as const,text:t.prompt},...(t.result?[{role:'coach' as const,text:t.result.reply,basis:t.result.basis,journalDraft:t.result.journalDraft,sources:t.result.sources}]:[])]);
 const history:CoachMessage[]=currentTurns.filter(t=>t.status==='completed'&&t.result&&t.contextKey===contextKey).flatMap(t=>[{role:'teacher' as const,text:t.prompt},{role:'coach' as const,text:t.result!.reply,journalDraft:t.result!.journalDraft}]);
 const pending=currentTurns.some(t=>t.status==='running'&&t.at>now-300000);
 const interrupted=currentTurns.some(t=>t.status==='failed'||(t.status==='running'&&t.at<=now-300000));
 return {conversations,messages,history,ready:ready&&loadedId===id,error:error||listError,pending,interrupted,turns:currentTurns};
}

import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {CoachChat} from './CoachChat';
import {emptyProfile,type CoachProfile} from './model';
import './coach.css';
import type {CoachContext} from './conversations';
export function CoachConversation({uid,initialConversationId,context={},compact=false}:{uid:string;initialConversationId?:string;context?:CoachContext;compact?:boolean}){
 const [profile,setProfile]=useState<CoachProfile|null>(null),[error,setError]=useState('');
 useEffect(()=>onSnapshot(doc(db,'teachingCoach',uid,'settings','profile'),s=>{setProfile({...emptyProfile,...s.data()});setError('');},()=>setError('We couldn’t open your coach. Check your connection and reopen the conversation.')),[uid]);
 return error?<p role="alert">{error}</p>:profile?<CoachChat uid={uid} profile={profile} initialPrompt="" reflectionId={context.reflectionId||''} formContext={context.formContext??undefined} lessonContext={context.lessonContext??undefined} evidencePacketId={context.evidencePacketId} initialConversationId={initialConversationId} compact={compact}/>:<p role="status">Opening Teacher’s Coach…</p>;
}

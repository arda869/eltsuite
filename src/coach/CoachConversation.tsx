import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {CoachChat} from './CoachChat';
import {emptyProfile,type CoachProfile} from './model';
import './coach.css';
export function CoachConversation({uid}:{uid:string}){
 const [profile,setProfile]=useState<CoachProfile|null>(null),[error,setError]=useState('');
 useEffect(()=>onSnapshot(doc(db,'teachingCoach',uid,'settings','profile'),s=>{setProfile({...emptyProfile,...s.data()});setError('');},()=>setError('We couldn’t open your coach. Check your connection and reopen the conversation.')),[uid]);
 return error?<p role="alert">{error}</p>:profile?<CoachChat uid={uid} profile={profile} initialPrompt="" reflectionId=""/>:<p role="status">Opening Teacher’s Coach…</p>;
}

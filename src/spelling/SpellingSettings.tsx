import {useEffect,useState} from 'react';
import {doc,onSnapshot,updateDoc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {SpellingFields} from './SpellingFields';
import {spellingDefaults,type Spelling} from './model';
export function SpellingSettings({uid}:{uid:string}){const [value,setValue]=useState<Spelling>(spellingDefaults),[status,setStatus]=useState('');useEffect(()=>onSnapshot(doc(db,'users',uid),s=>setValue(s.get('spelling')??spellingDefaults)),[uid]);return <><SpellingFields value={value} onChange={v=>{setValue(v);setStatus('Saving…');void updateDoc(doc(db,'users',uid),{spelling:v}).then(()=>setStatus('Saved')).catch(()=>setStatus('Could not save. Please try again.'));}}/><p role="status">{status}</p><p>Spelling is checked on your device. Use the Spelling button while writing for suggestions. Common typo corrections can be undone immediately with Backspace or Undo. Class settings control learner answers, with an optional exception for each question.</p></>;}

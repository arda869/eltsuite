import {useEffect} from 'react';
import {increment,serverTimestamp,setDoc} from 'firebase/firestore';
import {answerRef} from './tasks';
// Approximate foreground interaction time. No key values or typing histories are recorded.
export function useLearningTime(classId:string,itemId:string,taskId:string,uid:string,learnerId:string,enabled:boolean) {
 useEffect(()=>{
  if(!enabled||!classId||!taskId||!uid)return;
  let previous=performance.now(),lastInteraction=0,active=0,question='',pending:Record<string,number>={},saving=false;
  const tick=()=>{const now=performance.now(),elapsed=Math.min(5000,Math.max(0,now-previous));previous=now;if(document.visibilityState==='visible'&&document.hasFocus()&&lastInteraction&&now-lastInteraction<30000){active+=elapsed;if(question)pending[question]=(pending[question]??0)+elapsed;}};
  const interact=(event:Event)=>{tick();lastInteraction=performance.now();const target=event.target as Element|null;question=target?.closest?.('[data-qid]')?.getAttribute('data-qid')??'';};
  const flush=async()=>{tick();if(saving||active<1000)return;const ms=Math.round(active),parts=pending;active=0;pending={};saving=true;try{await setDoc(answerRef(classId,taskId,uid),{learnerUid:uid,learnerId,itemId,taskId,engagement:{version:1,activeMs:increment(ms),questions:Object.fromEntries(Object.entries(parts).map(([id,n])=>[id,{activeMs:increment(Math.round(n))}])),updatedAt:serverTimestamp()}},{merge:true});}catch{active+=ms;for(const [id,n]of Object.entries(parts))pending[id]=(pending[id]??0)+n;}finally{saving=false;}};
  const visibility=()=>{tick();if(document.visibilityState!=='visible'){lastInteraction=0;void flush();}};
  const interval=window.setInterval(tick,1000),save=window.setInterval(()=>void flush(),15000);
  for(const name of ['pointerdown','keydown','focusin'])document.addEventListener(name,interact,{capture:true});
  document.addEventListener('visibilitychange',visibility);
  return()=>{for(const name of ['pointerdown','keydown','focusin'])document.removeEventListener(name,interact,{capture:true});document.removeEventListener('visibilitychange',visibility);clearInterval(interval);clearInterval(save);void flush();};
 },[classId,itemId,taskId,uid,learnerId,enabled]);
}

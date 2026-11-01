// UI persistence stand-in only. Permission decisions are tested against the real backend/emulator.
import {investigationInput,selectedPacket} from '../../functions/linguistics/contract.js';
import {getAuth} from './auth';
import {collection,getDocs,doc,getDoc,setDoc} from 'firebase/firestore';
import {db} from '../../src/lib/firebase';
export async function linguistics(d:any){
 const uid=getAuth().currentUser?.uid||'teacher1',store=JSON.parse(localStorage.getItem('mocklinguistics')||'{"investigations":{},"embeds":{},"responses":{}}');
 const persist=()=>localStorage.setItem('mocklinguistics',JSON.stringify(store));const source=()=>store.investigations[d.id];let result:any;
 switch(d.action){
 case 'status':result={corpus:{available:false,corpora:[],reason:'Licensed corpus connection is awaiting setup.'}};break;
 case 'list':result={items:Object.values(store.investigations).filter((x:any)=>x.owner===uid&&!x.revoked)};break;
 case 'load':if(!source()||source().revoked)throw Error('Unavailable');result={investigation:source()};break;
 case 'save':{const id=d.id||crypto.randomUUID();store.investigations[id]={...investigationInput(d.investigation),id,owner:uid,version:(d.version||0)+1};result={id,version:(d.version||0)+1};break;}
 case 'share':{const id=crypto.randomUUID(),p=selectedPacket(source(),d.selected,{sharing:true});store.embeds[id]={...d,id,investigationId:d.id,title:source().title,data:{...p,fields:d.includeAnalysis?source().fields:{}},mode:d.mode||'snapshot'};result={id};break;}
 case 'openEmbed':{const e=store.embeds[d.id];if(!e||store.investigations[e.investigationId]?.revoked)throw Error('Evidence revoked');result=e;break;}
 case 'respond':store.responses[d.id+uid]={value:d.value};result={saved:true};break;
 case 'myResponse':result={response:store.responses[d.id+uid]};break;
 case 'revoke':source().revoked=true;result={revoked:true};break;
 case 'duplicate':{const id=crypto.randomUUID();store.investigations[id]={...source(),id,title:'Copy of '+source().title,version:1};result={id};break;}
 case 'inquiries':result={items:(await getDocs(collection(db,'teachingCoach',uid,'inquiries'))).docs.map(x=>({id:x.id,title:x.get('title')}))};break;
 case 'attachInquiry':{const ref=doc(db,'teachingCoach',uid,'inquiries',d.inquiryId),old=(await getDoc(ref)).data();await setDoc(ref,{...old,evidenceLinks:[{investigationId:d.id,selected:d.selected,purpose:d.purpose||'Selected evidence'}],version:(old?.version||0)+1});result={attached:true};break;}
 default:throw Error('UI test action not configured: '+d.action);
 }persist();return {data:result};
}

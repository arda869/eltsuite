import {collection,doc,getDoc,getDocs,orderBy,query} from 'firebase/firestore';
import {auth,db} from '../lib/firebase';
import {TEXT_SCALE,type TextSize} from '../lib/auth';
import {gatherLesson} from '../lib/transfer';
import {audioUrl} from '../lib/media';
import {loadManifest,soundUrl} from '../lib/archive';
import type {SharedDoc} from '../lib/sharedDocs';
import type {ClassLesson} from '../lib/classFiles';
import type {JSONContent} from '@tiptap/react';
import type {ExportTask} from '../lib/textformat';
import type {GameConfig} from '../games/model';
import {gameProblems} from '../games/model';
import {offlineHtml} from './html';
import {lessonStyleOf,lessonFonts} from '../lib/lessonStyle';

const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('Could not package media.'));r.readAsDataURL(blob);});
export async function makeOfflineFile(source:{doc?:SharedDoc;lesson?:ClassLesson}){
 const warnings=new Set<string>(),cache=new Map<string,Promise<string>>();let total=0;
 async function embed(url:string,space:string):Promise<string>{
  if(!url)return '';if(url.startsWith('data:'))return url;
  const k=space+'|'+url;if(cache.has(k))return cache.get(k)!;
  const promise=(async()=>{const resolved=url.startsWith('media:')?await audioUrl(space,url.slice(6)):url;
   const response=await fetch(resolved,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('A media file could not be downloaded. Check its access and try again.');
   const blob=await response.blob();total+=blob.size;if(total>200*1024*1024)throw Error('This download has more than 200 MB of media. Split the lesson into smaller lessons first.');return dataUrl(blob);})();cache.set(k,promise);return promise;
 }
 const online=new Set(['collab','upload','speakingPractice','investigation','survey','bankLink','pdfBlock','board','drawBoard']);
 async function node(n:JSONContent,space:string):Promise<JSONContent>{
  if(online.has(n.type||'')){const warning=`${n.type}: open the original lesson online to use this activity.`;warnings.add(warning);return {type:'paragraph',content:[{type:'text',text:warning}]};}
  const out={...n,attrs:n.attrs?{...n.attrs}:undefined};const a=out.attrs;
  if(n.type==='classroomGame'&&a?.sessionId){const snap=await getDoc(doc(db,'gameSessions',String(a.sessionId)));if(!snap.exists())throw Error('An inline game could not be loaded.');return {type:'offlineGame',attrs:{game:await game(snap.data().game,space)}};}
  if(['media','inlineMedia'].includes(n.type||'')&&a?.media){const mediaSpace=String(a.space||space);const m=await loadManifest(mediaSpace,String(a.media));if(!m)throw Error('A recording could not be loaded.');if(m.kind==='link'&&/youtu(?:be|\.be)|vimeo/i.test(m.url||'')){const warning=`${m.title||'Video'} requires internet (${m.url}).`;warnings.add(warning);return {type:'paragraph',content:[{type:'text',text:warning}]};}return {type:'offlineMedia',attrs:{src:await embed(m.kind==='link'?m.url||'':await soundUrl(mediaSpace,String(a.media),m),mediaSpace),video:!!m.video,title:m.title||a.title||'Recording',script:m.script||[],scriptMode:a.scriptMode||'karaoke',inline:n.type==='inlineMedia',mute:a.mute||[]}};}
  // Also resolve image URLs nested inside question packs, diagrams and storyboards.
  async function assets(value:any,key=''):Promise<any>{if(typeof value==='string'&&['src','image','url'].includes(key)&&/^(https?:|blob:|media:)/.test(value))return embed(value,space);if(Array.isArray(value))return Promise.all(value.map(v=>assets(v,key)));if(value&&typeof value==='object'){const entries=await Promise.all(Object.entries(value).map(async([k,v])=>[k,await assets(v,k)]));return Object.fromEntries(entries);}return value;}
  if(a)out.attrs=await assets(a);
  if(n.content)out.content=await Promise.all(n.content.map(c=>node(c,space)));
  return out;
 }
 async function game(value:GameConfig,space:string):Promise<GameConfig>{const errors=gameProblems(value);if(errors.length)throw Error(errors.join(' '));return {...value,rounds:await Promise.all(value.rounds.map(async r=>({...r,...(r.content?{content:await node(r.content,space)}:{})})))};}
 let title='',payload:any,appearance:Record<string,unknown>={};
 if(source.doc?.kind==='game'){
  title=source.doc.title;const snap=await getDoc(doc(db,'sharedDocs',source.doc.id,'game','main'));if(!snap.exists())throw Error('Save the game before downloading it.');payload={game:await game(snap.data() as GameConfig,'doc:'+source.doc.id)};
 }else{
  let tasks:ExportTask[],space:string;
  if(source.lesson){const result=await gatherLesson(source.lesson.classId,source.lesson.itemId);title=result.title;tasks=result.tasks;space=source.lesson.classId;const cls=(await getDoc(doc(db,'classes',space))).data();appearance={lessonStyle:lessonStyleOf(cls),themeColor:cls?.themeColor};}
  else if(source.doc?.kind==='lesson'){title=source.doc.title;space='doc:'+source.doc.id;tasks=(await getDocs(query(collection(db,'sharedDocs',source.doc.id,'tasks'),orderBy('order')))).docs.map(d=>d.data() as ExportTask);}
  else throw Error('Choose one game or lesson.');
  payload={tasks:await Promise.all(tasks.filter(t=>!t.hidden).map(async t=>({title:t.title,kind:t.kind,instructions:t.instructions||'',layout:t.layout,content:await node(t.content||{type:'doc'},space),...(t.instrDoc?{instrDoc:await node(t.instrDoc,space)}:{})})))};
 }
 if(auth.currentUser){const profile=(await getDoc(doc(db,'users',auth.currentUser.uid))).data();appearance={...appearance,textScale:TEXT_SCALE[(profile?.textSize||'M') as TextSize]||1,reading:profile?.reading||{}};}
 const [js,css]=await Promise.all(['player.js','style.css'].map(async file=>{const r=await fetch('/offline-player/'+file);if(!r.ok)throw Error('The offline player is not available yet. Please refresh and try again.');const text=await r.text();if(text.trimStart().startsWith('<!'))throw Error('The offline player is not available in this build.');return text;}));
 // Embed fonts as well as media: downloaded files cannot rely on the website.
 const fontCss=lessonFonts()+"\n@font-face{font-family:Karla;src:url('/fonts/Karla.ttf');font-weight:100 900;font-display:block}@font-face{font-family:Fraunces;src:url('/fonts/Fraunces.ttf');font-weight:100 900;font-display:block}";
 let embeddedFonts=fontCss;
 for(const match of [...fontCss.matchAll(/url\('([^']+)'\)/g)]) embeddedFonts=embeddedFonts.replace(match[0],"url('"+await embed(match[1],'')+"')");
 const html=offlineHtml(title,{title,...payload,...appearance,displayTheme:document.documentElement.dataset.theme==='dark'?'dark':'light',warnings:[...warnings]},js,css.replace(/@font-face\s*\{[^}]*\}/g,'')+'\n'+embeddedFonts);
 return {name:title.replace(/[\\/:*?"<>|]/g,' ').slice(0,100)+'.html',html,warnings:[...warnings]};
}
export function saveOfflineFile(file:{name:string;html:string}){const url=URL.createObjectURL(new Blob([file.html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {doc,onSnapshot} from 'firebase/firestore';
import {useAuth} from '../lib/auth';
import {db} from '../lib/firebase';
import {dictionary} from './dictionary';
import {resolveSpelling,typoCorrection,words,VARIANTS,type Spelling} from './model';
import './spelling.css';
type Field=HTMLInputElement|HTMLTextAreaElement|HTMLElement;
type Issue={word:string;start:number;end:number;suggestions:string[]};
const originalSpellcheck=new WeakMap<HTMLElement,string|null>();
const plain=(el:Field):el is HTMLInputElement|HTMLTextAreaElement=>el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement;
function textNodes(el:HTMLElement){const out:Text[]=[];const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){if(!n.parentElement?.closest('[contenteditable="false"]'))out.push(n as Text);}return out;}
const textOf=(el:Field)=>plain(el)?el.value:textNodes(el).map(n=>n.data).join('');
function rangeAt(el:HTMLElement,start:number,end:number){const r=document.createRange();let at=0,found=false;for(const n of textNodes(el)){const next=at+n.length;if(!found&&start<=next){r.setStart(n,Math.max(0,start-at));found=true;}if(found&&end<=next){r.setEnd(n,Math.max(0,end-at));return r;}at=next;}return null;}
function caret(el:Field){if(plain(el))return el.selectionStart===el.selectionEnd?el.selectionStart:null;const s=window.getSelection();if(!s?.isCollapsed||!s.anchorNode||!el.contains(s.anchorNode))return null;let at=0;for(const n of textNodes(el)){if(n===s.anchorNode)return at+s.anchorOffset;at+=n.length;}return null;}
function replace(el:Field,start:number,end:number,value:string){el.focus();if(plain(el))el.setSelectionRange(start,end);else{const range=rangeAt(el,start,end);if(!range)return false;const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range);}return document.execCommand('insertText',false,value);}
function fieldFrom(target:EventTarget|null):Field|null{if(!(target instanceof HTMLElement)||target.closest('[data-spelling-ui]'))return null;if(target instanceof HTMLInputElement)return ['text','search'].includes(target.type)&&!target.readOnly&&!target.disabled?target:null;if(target instanceof HTMLTextAreaElement)return !target.readOnly&&!target.disabled?target:null;const el=target.closest<HTMLElement>('[contenteditable="true"]');return el&&!target.closest('[contenteditable="false"]')?el:null;}
export function SpellingAssistant(){
 const {user,profile}=useAuth();const location=useLocation();const classId=/^\/class\/([^/]+)/.exec(location.pathname)?.[1]||(profile?.role==='learner'?profile.classId:'');const [classSettings,setClassSettings]=useState<Spelling>({});const [account,setAccount]=useState<Spelling>({}),[active,setActive]=useState<Field|null>(null),[issues,setIssues]=useState<Issue[]>([]),[open,setOpen]=useState(false),[notice,setNotice]=useState(''),[variant,setVariant]=useState<Spelling['variant']>('en-GB');
 const prefs=useRef(account),target=useRef<Field|null>(null),snapshot=useRef(''),generation=useRef(0),timer=useRef(0),ignore=useRef(new Set<string>()),last=useRef<{el:Field;before:string;after:string;start:number;original:string;replacement:string}|null>(null);
 useEffect(()=>{ignore.current.clear();if(!user){setAccount({});return;}return onSnapshot(doc(db,'users',user.uid),s=>setAccount(s.get('spelling')??{}));},[user?.uid]);prefs.current=account;
 useEffect(()=>{setClassSettings({});if(!user||!classId)return;return onSnapshot(doc(db,'classes',classId),s=>setClassSettings(s.get('spelling')??{}),()=>setClassSettings({}));},[user?.uid,classId]);
 useEffect(()=>{
  function settings(el:Field){let layers:Spelling[]=[];try{layers=JSON.parse(el.closest('[data-spelling]')?.getAttribute('data-spelling')||'[]');}catch{}return resolveSpelling(prefs.current,classSettings,...layers);}
  function permitted(el:Field){if(!originalSpellcheck.has(el))originalSpellcheck.set(el,el.getAttribute('spellcheck'));return originalSpellcheck.get(el)!=='false'&&!el.closest('[data-spelling-disabled="true"]')&&settings(el).enabled;}
  function clear(){generation.current++;setIssues([]);setOpen(false);setActive(null);target.current=null;}
  async function review(el:Field){const ticket=++generation.current;const allowed=permitted(el);el.setAttribute('spellcheck',String(allowed));el.setAttribute('autocorrect','off');if(!el.isConnected||!allowed){clear();return;}const config=settings(el);el.lang=config.variant;setVariant(config.variant);setActive(el);target.current=el;const text=textOf(el);snapshot.current=text;try{const check=await dictionary(config.variant);if(ticket!==generation.current||target.current!==el)return;const bad:Issue[]=[];for(const w of words(text.slice(0,12000)).slice(0,1000)){if(w.word.length<2||ignore.current.has(w.word.toLowerCase())||check.correct(w.word.replace(/’/g,"'")))continue;bad.push({...w,suggestions:check.suggest(w.word).slice(0,5)});if(bad.length===12)break;}setIssues(bad);setNotice('');}catch{if(ticket===generation.current)setNotice('Spelling suggestions are temporarily unavailable. Your writing is saved as usual.');}}
  const schedule=(el:Field)=>{clearTimeout(timer.current);timer.current=window.setTimeout(()=>void review(el),500);};
  const focus=(ev:FocusEvent)=>{const el=fieldFrom(ev.target);if(el){setOpen(false);schedule(el);}else if(!(ev.target instanceof HTMLElement&&ev.target.closest('[data-spelling-ui]')))clear();};
  const input=(ev:Event)=>{const el=fieldFrom(ev.target);if(el){if(last.current&&textOf(el)!==last.current.after)last.current=null;schedule(el);}};
  const key=(ev:KeyboardEvent)=>{const el=fieldFrom(ev.target);if(!el||ev.isComposing)return;const config=settings(el);if(!permitted(el))return;
   const previous=last.current;
   if(previous?.el===el&&textOf(el)===previous.after&&(ev.key==='Backspace'||((ev.metaKey||ev.ctrlKey)&&!ev.shiftKey&&ev.key.toLowerCase()==='z'))){ev.preventDefault();last.current=null;replace(el,previous.start,previous.start+previous.replacement.length,previous.original);schedule(el);return;}
   if(ev.key!==' '||ev.ctrlKey||ev.metaKey||ev.altKey||!config.autocorrect)return;const at=caret(el);if(at===null)return;const before=textOf(el),m=/\b([A-Za-z]+)$/.exec(before.slice(0,at));if(!m)return;const fixed=typoCorrection(m[1]);if(!fixed)return;const start=at-m[1].length;ev.preventDefault();if(replace(el,start,at,fixed+' ')){last.current={el,before,after:textOf(el),start,original:m[1],replacement:fixed+' '};setNotice('Corrected '+m[1]+' → '+fixed+'. Backspace to undo.');schedule(el);}
  };
  document.addEventListener('focusin',focus);document.addEventListener('input',input);document.addEventListener('keydown',key,true);
  return()=>{clearTimeout(timer.current);document.removeEventListener('focusin',focus);document.removeEventListener('input',input);document.removeEventListener('keydown',key,true);};
 },[account,classSettings]);
 const apply=(issue:Issue,word:string)=>{if(!active||textOf(active)!==snapshot.current){setNotice('The text changed. Return to the field to refresh suggestions.');return;}if(replace(active,issue.start,issue.end,word)){setIssues([]);setOpen(false);}};
 if(!active||(!issues.length&&!notice))return null;
 return <aside className="spelling-assistant" data-spelling-ui="true" aria-label="Spelling assistance" onMouseDown={e=>e.preventDefault()}><button type="button" className="btn small-btn" aria-expanded={open} onClick={()=>setOpen(!open)}>Aa · Spelling{issues.length?' ('+issues.length+')':''}</button>{open&&<section className="spelling-review" aria-label="Spelling suggestions"><header><strong>{VARIANTS[variant??'en-GB']}</strong><button type="button" className="btn small-btn" onClick={()=>setOpen(false)}>Close</button></header>{notice&&<p role="status">{notice}</p>}{issues.map((issue,i)=><div key={issue.start}><b>{issue.word}</b><span>{issue.suggestions.length?issue.suggestions.map(word=><button type="button" className="btn small-btn" key={word} onClick={()=>apply(issue,word)}>{word}</button>):'No suggestion found.'}</span><button type="button" className="btn small-btn" onClick={()=>{ignore.current.add(issue.word.toLowerCase());setIssues(rows=>rows.filter((_,n)=>n!==i));}}>Ignore for this session</button></div>)}</section>}</aside>;
}

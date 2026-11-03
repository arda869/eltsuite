import type {Spelling} from './model';
type Checker={correct:(word:string)=>boolean;suggest:(word:string)=>string[]};
type Wrong={word:string;suggestions:string[]};

// The dictionaries are built and searched in a background worker (spellWorker.ts), so loading
// one, which takes a few seconds, never freezes the page. If a browser can't start the worker,
// the same work happens here instead.
let worker:Worker|null|undefined;
let next=0;
const waiting=new Map<number,{resolve:(w:Wrong[])=>void;reject:(e:Error)=>void}>();
function spellWorker(){
 if(worker!==undefined)return worker;
 try{
  worker=new Worker(new URL('./spellWorker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(e:MessageEvent<{id:number;ok:boolean;wrong?:Wrong[]}>)=>{const w=waiting.get(e.data.id);if(!w)return;waiting.delete(e.data.id);if(e.data.ok)w.resolve(e.data.wrong??[]);else w.reject(Error('Dictionary unavailable'));};
  worker.onerror=()=>{for(const w of waiting.values())w.reject(Error('Dictionary unavailable'));waiting.clear();worker=null;};
 }catch{worker=null;}
 return worker;
}
function ask(variant:string,words?:string[],limit?:number):Promise<Wrong[]>{
 const w=spellWorker();
 if(!w)return dictionary(variant as Spelling['variant']).then(check=>{const wrong:Wrong[]=[];for(const word of words??[]){if(check.correct(word.replace(/’/g,"'")))continue;wrong.push({word,suggestions:check.suggest(word).slice(0,5)});if(wrong.length>=(limit??12))break;}return wrong;});
 const id=++next;
 return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});w.postMessage({id,variant,words,limit});});
}
// The words that aren't in the dictionary, with up to five suggestions each, stopping at limit.
export const checkWords=(variant:Spelling['variant'],words:string[],limit=12)=>ask(variant??'en-GB',words,limit);
// Start building a dictionary in the background, before it's needed.
export const warmDictionary=(variant:Spelling['variant'])=>{void ask(variant??'en-GB').catch(()=>{});};

const cache=new Map<string,Promise<Checker>>();
export function dictionary(variant:Spelling['variant']='en-GB'){
 if(!cache.has(variant)){const request=Promise.all([import('nspell'),fetch('/spelling/'+variant+'.aff').then(r=>{if(!r.ok)throw Error('Dictionary unavailable');return r.text();}),fetch('/spelling/'+variant+'.dic').then(r=>{if(!r.ok)throw Error('Dictionary unavailable');return r.text();})]).then(([module,aff,dic])=>module.default({aff,dic}));cache.set(variant,request);void request.catch(()=>cache.delete(variant));}return cache.get(variant)!;
}

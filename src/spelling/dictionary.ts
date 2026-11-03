import type {Spelling} from './model';
type Checker={correct:(word:string)=>boolean;suggest:(word:string)=>string[]};
const cache=new Map<string,Promise<Checker>>();
export function dictionary(variant:Spelling['variant']='en-GB'){
 if(!cache.has(variant)){const request=Promise.all([import('nspell'),fetch('/spelling/'+variant+'.aff').then(r=>{if(!r.ok)throw Error('Dictionary unavailable');return r.text();}),fetch('/spelling/'+variant+'.dic').then(r=>{if(!r.ok)throw Error('Dictionary unavailable');return r.text();})]).then(([module,aff,dic])=>module.default({aff,dic}));cache.set(variant,request);void request.catch(()=>cache.delete(variant));}return cache.get(variant)!;
}

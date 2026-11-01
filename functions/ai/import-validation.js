import { validate } from './contract.js';
import { IMPORT_ELEMENT_SCHEMA } from './import-types.js';
import { nativeImportedElements, importRequirements } from './import-elements.js';
const validImage=s=>{if(!s||/^picture:[a-zA-Z0-9_-]{1,60}$/.test(s))return true;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!/[<>\s]/.test(s)&&s.length<=1000;}catch{return false;}};
export function checkImportElements(elements,training){
 validate({type:'array',items:IMPORT_ELEMENT_SCHEMA,minItems:0,maxItems:60},elements);
 for(const e of elements){const d=e.data;
  if(e.kind==='picture'&&(!/^[a-zA-Z0-9_-]{1,60}$/.test(d.ref)||d.x+d.width>100.01||d.y+d.height>100.01||d.asset&&!/^[a-f0-9]{64}$/.test(d.asset)))throw Error('Choose a valid source illustration reference and crop within its page.');
  if(e.kind.startsWith('tt-')&&training===false)throw Error('Teacher-training forms need a teacher-training class.');
  if(['gap','lettergap','wordform','drop'].includes(e.kind)&&e.prompt.split('___').length!==2)throw Error('A '+e.kind+' needs exactly one ___ in its prompt.');
  if(['radio','dropdown','multi'].includes(e.kind)&&new Set(d.options).size!==d.options.length)throw Error('Choice options must be distinct.');
  if(['radio','dropdown'].includes(e.kind)&&!d.options.includes(d.answer))throw Error('The choice answer must match an option.');
  if(e.kind==='multi'&&(new Set(d.answers).size!==d.answers.length||d.answers.some(a=>!d.options.includes(a))))throw Error('Every selected answer must match a distinct option.');
  if(e.kind==='dropdown'&&e.prompt.split('___').length!==2)throw Error('An inline choice needs exactly one ___.');
  if(e.kind==='bank'&&elements.filter(x=>x.kind==='bank').length>1)throw Error('Use one shared word bank per activity part.');
  if(e.kind==='pq-fix'){const n=nativeImportedElements([e],'validate'),k=Object.values(n.key)[0];if(!k?.k?.range?.length)throw Error('The complete wrong word or phrase must occur in its sentence.');}
  if(e.kind==='pq-categorise'&&new Set(d.cats.map(c=>c.name.toLowerCase())).size!==d.cats.length)throw Error('Use distinct category names.');
  if(e.kind==='pq-transform'&&d.max&&d.min>d.max)throw Error('Transformation word limits are reversed.');
  if(e.kind==='writing'&&d.maxWords&&d.minWords>d.maxWords)throw Error('Writing word limits are reversed.');
  if(e.kind==='writing'&&d.rubric==='custom'&&!d.criteria.length)throw Error('Custom marking needs criteria.');
  if(e.kind==='pq-highlight'&&!/\{\{[^{}]+\}\}/.test(d.text))throw Error('Highlight targets must be marked with {{double braces}}.');
  if(e.kind==='pq-label'&&!validImage(d.image))throw Error('Use a public HTTPS picture URL or attach the picture in the editor.');
  if(e.kind==='pq-odd'&&d.odd>=d.words.length)throw Error('The odd-one-out answer is outside its options.');
  if(e.kind==='pq-gapped'){
   const gaps=Array.from(d.text.matchAll(/\{\{(\d+)\}\}/g),m=>Number(m[1]));
   if(gaps.length!==d.removed.length||new Set(gaps).size!==gaps.length||gaps.some((g,i)=>g!==i+1))throw Error('Gapped text needs {{1}}, {{2}}, etc. once each, in order, matching removed sentences.');
  }
  if(e.kind==='pq-matching'&&(new Set(d.options).size!==d.options.length||d.statements.some(s=>s.answer>=d.options.length)||(d.names.length&&d.names.length!==d.options.length)))throw Error('Multiple-matching keys and names must match their options.');
  if(e.kind==='pq-speaking'&&d.images.some(s=>!validImage(s)||!s))throw Error('Speaking pictures need public HTTPS URLs; use an empty list for missing pictures.');
  if(e.kind==='pq-pairs'&&d.items.some(v=>!v.options.includes(v.say)||new Set(v.options).size!==v.options.length))throw Error('Minimal-pair targets must occur among distinct options.');
  if(['pq-crossword','pq-wordsearch'].includes(e.kind)){
   const words=d.words.map(x=>x.word.toUpperCase().replace(/[^A-ZÀ-ÿ]/g,''));
   if(words.some(w=>w.length<2||w.length>16)||new Set(words).size!==words.length)throw Error('Puzzle answers need distinct words, 2–16 letters long.');
  }
  if(['reflect','peer'].includes(e.kind)&&d.items.some(v=>['choice','checklist'].includes(v.type)&&v.options.length<2))throw Error('Reflection choices need at least two options.');
  if(e.kind==='survey'&&d.questions.some(v=>['single','multi','rank'].includes(v.type)&&(v.options.length<2||new Set(v.options).size!==v.options.length)))throw Error('Survey choices need distinct options.');
  if(e.kind.startsWith('tt-')&&(e.kind==='tt-custom'||d.mode==='complete')&&d.fields.some(f=>f.value.trim()))throw Error('Keep trainee answer fields blank; put model answers in teacher-only notes.');
  if(e.kind.startsWith('tt-')&&e.kind!=='tt-custom'&&d.fields.some(f=>!/^[_a-zA-Z][_a-zA-Z0-9.\-]{0,79}$/.test(f.name)||['__proto__','constructor','prototype'].includes(f.name)))throw Error('Use a valid native training field name.');
 }
 return importRequirements(elements);
}

import { splitKey } from './import-question-core.js';
import { IMPORT_TYPE_BY_KIND } from './import-types.js';
const textNodes=text=>String(text||'').split('\n').flatMap((line,i)=>[...(i?[{type:'hardBreak'}]:[]),...(line?[{type:'text',text:line}]:[])]);
const p=text=>({type:'paragraph',content:textNodes(text)});
const paragraphs=text=>String(text||'').split(/\n\s*\n/).filter(Boolean).map(p);
const gapLine=(prompt,node)=>{const [before,after]=prompt.includes('___')?prompt.split('___'):[prompt+' ',''];return {type:'paragraph',content:[...textNodes(before),node,...textNodes(after)]};};
function letterPattern(answer,firstLetter){let start=true;return Array.from(answer.trim()).map(ch=>{const letter=/[\p{L}\p{N}]/u.test(ch),out=letter?(firstLetter&&start?ch:'_'):ch;start=!letter&&!/['’-]/.test(ch)?true:letter?false:start;return out;}).join('');}
export function importRequirements(elements=[]){
 return [...new Set(elements.flatMap(e=>{
  const explicit=(e.needs??[]).map(kind=>({picture:'Attach the source picture before making this task visible.',recording:'Attach the original recording before making this task visible.',transcript:'Add the missing source transcript before making this task visible.',classroomSetup:'Complete the Classroom setup before making this task visible.'})[kind]).filter(Boolean);
  if(e.kind==='picture'&&!e.data.asset)return [...explicit,'Recreate and review the source illustration before making this task visible.'];
  if(e.kind==='pq-label'&&e.data.image.startsWith('picture:'))return [...explicit,'Check label positions on the recreated illustration in the task editor before making it visible.'];
  if(e.kind==='pq-label'&&!e.data.image)return [...explicit,'Label the image: attach the source picture and check label positions before making this task visible.'];
  if(e.kind==='speaking')return [...explicit,'AI conversation: open the editor and save its Classroom speaking setup before making this task visible.'];
  if(e.kind==='collab'&&e.data.scope==='group')return [...explicit,'Shared document: create the class groups or choose whole-class collaboration before making this task visible.'];
  return explicit;
 }))];
}
export function nativeImportedElements(elements=[],prefix='import',{addBank=true}={}){
 const content=[],notes=[];
 for(const [i,e] of elements.entries()){
  const id=prefix+'_e'+i,d=e.data,attrs={id,feedback:e.feedback||'',example:e.example===true};
  notes.push(`${IMPORT_TYPE_BY_KIND.get(e.kind)?.label||e.kind}: ${e.reason}${e.feedback?'\nFeedback: '+e.feedback:''}`);
  let nodes=[];
  if(['gap','shortAnswer','lettergap','wordform','drop'].includes(e.kind)){
   const node=e.kind==='drop'?{type:'dropgap',attrs:{...attrs,answer:d.answer}}:{type:'gap',attrs:{...attrs,answers:d.answers,stem:e.kind==='wordform'?d.stem:'',letters:e.kind==='lettergap',firstLetter:d.firstLetter===true,pattern:e.kind==='lettergap'?letterPattern(d.answers[0],d.firstLetter):''}};
   nodes=[gapLine(e.prompt,node)];
  }else if(['radio','dropdown','multi','truefalse','notgiven'].includes(e.kind)){
   const options=e.kind==='truefalse'?['True','False']:e.kind==='notgiven'?['True','False','Not given']:d.options;
   const node={type:'choice',attrs:{...attrs,options,multi:e.kind==='multi',display:e.kind==='dropdown'?'dropdown':'radio',correct:e.kind==='multi'?d.answers.map(x=>options.indexOf(x)):options.indexOf(d.answer)}};
   nodes=e.kind==='dropdown'?[gapLine(e.prompt,node)]:[...paragraphs(e.prompt),{type:'paragraph',content:[node]}];
  }else if(e.kind==='picture')nodes=[...paragraphs(e.prompt),{type:'paragraph',content:[{type:'picture',attrs:{src:d.asset?'import-picture:'+d.asset:'',alt:d.alt,size:'full',mark:''}}]}];
  else if(e.kind==='match')nodes=[...paragraphs(e.prompt),{type:'match',attrs:{...attrs,pairs:d.pairs,extras:d.extras}}];
  else if(e.kind==='order')nodes=[...paragraphs(e.prompt),{type:'order',attrs:{...attrs,sentence:d.sentence}}];
  else if(e.kind==='bank')nodes=[{type:'wordbank',attrs:{extras:d.extras}}];
  else if(e.kind==='writing')nodes=[...paragraphs(e.prompt),{type:'writing',attrs:{...attrs,model:d.model,minWords:d.minWords||null,maxWords:d.maxWords||null,genre:d.genre,rubric:d.rubric,criteria:d.criteria,rich:false,spellcheck:false,points:5}}];
  else if(e.kind.startsWith('pq-'))nodes=[...paragraphs(e.prompt),{type:'pq',attrs:{...attrs,kind:e.kind.slice(3),data:d}}];
  else if(['reflect','peer'].includes(e.kind))nodes=[...paragraphs(e.prompt),{type:'reflect',attrs:{id,about:e.kind==='peer'?'peer':'self',title:d.title,items:d.items.map((v,j)=>({...v,id:id+'_r'+j}))}}];
  else if(e.kind==='upload')nodes=[...paragraphs(e.prompt),{type:'upload',attrs:{id,...d,shrink:true}}];
  else if(['board','postits'].includes(e.kind))nodes=[{type:'board',attrs:{id,mode:e.kind,prompt:e.prompt,...d}}];
  else if(e.kind==='drawboard')nodes=[{type:'drawBoard',attrs:{id,prompt:e.prompt}}];
  else if(e.kind==='collab')nodes=[...paragraphs(e.prompt),{type:'collab',attrs:{id,docKey:id,kind:'doc',title:d.title,scope:d.scope,groupSet:'',modes:['edit','suggest','comment'],display:'expand',download:true,start:{type:'doc',content:paragraphs(d.start)}}}];
  else if(e.kind==='survey')nodes=[...paragraphs(e.prompt),{type:'survey',attrs:{id,title:d.title,anonymous:d.anonymous,questions:d.questions.map((v,j)=>({...v,id:id+'_s'+j}))}}];
  else if(['drawcard','wheel','boxes'].includes(e.kind))nodes=[...paragraphs(e.prompt),{type:'randomPick',attrs:{id,mode:e.kind==='drawcard'?'cards':e.kind,repeat:d.repeat,play:'own',whoDraws:'teacher'},content:d.cards.map(c=>({type:'pickCard',attrs:{title:c.title},content:paragraphs(c.text)}))}];
  else if(e.kind==='speaking')nodes=[...paragraphs(e.prompt),{type:'speakingPractice',attrs:{id,...d,contextSeeded:true,contextApplied:true,feedbackMode:'task',focusOptions:[d.focus],lessonId:''}}];
  else if(e.kind.startsWith('tt-')){
   const kind=e.kind.slice(3);
   const data=Object.fromEntries(d.fields.map((f,j)=>[kind==='custom'?'field_'+j:f.name,f.value]));
   nodes=[...paragraphs(e.prompt),{type:'tt',attrs:{id,kind,title:d.title,mode:kind==='custom'?'complete':d.mode,data,...(kind==='custom'?{def:{id:id+'_form',name:d.title,fields:d.fields.map((f,j)=>({id:'field_'+j,label:f.label,kind:f.kind,hint:f.hint}))}}:{})}}];
  }else if(e.kind==='text')nodes=[...paragraphs(e.prompt),...paragraphs(d.text)];
  else throw Error('Unsupported imported inline type: '+e.kind);
  content.push(...nodes);
 }
 if(addBank&&elements.some(e=>e.kind==='drop')&&!elements.some(e=>e.kind==='bank'))content.unshift({type:'wordbank',attrs:{extras:[]}});
 const separated=splitKey({type:'doc',content});
 return {content:separated.content.content,key:separated.key,notes:notes.join('\n\n'),requirements:importRequirements(elements)};
}

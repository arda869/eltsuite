import {validate,outlineSchema,planSchema,checkSequence} from './contract.js';
import {activitySchema,checkActivities} from './activities.js';
import {trainingActivitySchema} from './training.js';
export const revisionSchema={type:'object',additionalProperties:false,required:['summary','changes'],properties:{summary:{type:'string',minLength:1,maxLength:1200},changes:{type:'array',minItems:1,maxItems:40,items:{type:'object',additionalProperties:false,required:['path','valueJson'],properties:{path:{type:'string',minLength:2,maxLength:300},valueJson:{type:'string',minLength:1,maxLength:30000}}}}}};
export const revisionInstructions='REVISION MODE: currentDraft is the teacher’s latest version, including manual edits. Follow requestedChanges, preserve what the teacher likes, and change only what is needed. Return a concise summary and targeted replacements using JSON Pointer paths and JSON-encoded replacement values in valueJson. Do not return the whole draft. Unlisted content is kept exactly. Paths must already exist. Never change sourceEvidence or insert keys named __proto__, constructor or prototype. Do not change total duration or stage IDs; ask for sequence changes through the outline stage. Include dependent answers, scripts and instructions in the same revision when necessary. References and private role information must remain valid. Return the schema only.';
export function revisionInput(d,brief,training=false){
 if(d.revision===undefined)return null;
 const r=d.revision;
 if(!r||typeof r.instructions!=='string'||!r.instructions.trim()||r.instructions.length>2000)throw Error('Describe the changes you want in up to 2,000 characters.');
 if(!['outline','plan','activities'].includes(d.action))throw Error('Choose a draft to revise.');
 const schema=d.action==='outline'?outlineSchema:d.action==='plan'?planSchema:training?trainingActivitySchema:activitySchema;
 validate(schema,r.current);
 if(d.action==='activities')checkActivities(r.current,d.plan,training);else checkSequence(r.current,brief.duration);
 if(JSON.stringify(r.current).length>200000)throw Error('This draft is too large for one revision.');
 return {instructions:r.instructions.trim(),current:r.current,schema};
}
export function applyRevision(current,patch,schema){
 validate(revisionSchema,patch);const result=structuredClone(current);
 for(const change of patch.changes){
  if(!change.path.startsWith('/'))throw Error('Invalid revision path.');
  const parts=change.path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(parts.some(p=>['__proto__','prototype','constructor','sourceEvidence'].includes(p)))throw Error('That revision field is protected.');
  let parent=result;for(const part of parts.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,part))throw Error('Revision target no longer exists.');parent=parent[part];}
  const key=parts.at(-1);if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key)||Array.isArray(parent)&&!/^\d+$/.test(key))throw Error('Revision target no longer exists.');
  parent[key]=JSON.parse(change.valueJson);
 }
 validate(schema,result);return result;
}
export function outlineFromPlan(p){return {title:p.title,outcomes:[p.mainAim],methodology:p.methodology,rationale:p.rationale,stages:p.stages.map(s=>Object.fromEntries(['id','title','aim','minutes','interaction','activityType','learnerAction','material','outcome'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]))),...(p.sourceEvidence?{sourceEvidence:p.sourceEvidence}:{})};}

export function preserveStageContract(value,approved,keys=['id','title','aim','minutes','interaction']){
 if(!Array.isArray(value.stages)||value.stages.length!==approved.stages.length||value.stages.some((s,i)=>s.id!==approved.stages[i].id))throw Error('Keep every approved stage ID and its order. Do not add or remove stages.');
 return {...value,stages:value.stages.map((stage,i)=>({...stage,...Object.fromEntries(keys.map(key=>[key,approved.stages[i][key]]))}))};
}

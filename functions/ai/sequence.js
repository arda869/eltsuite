import { validate } from './contract.js';
const object = properties => ({type:'object', additionalProperties:false, properties, required:Object.keys(properties)});
const omit = (properties, keys) => Object.fromEntries(Object.entries(properties).filter(([key])=>!keys.includes(key)));

// Allocate whole minutes without asking the model to perform scheduling arithmetic.
export function allocateMinutes(weights, total) {
  if (!Number.isInteger(total) || total < weights.length || !weights.length || weights.some(w=>!Number.isFinite(w)||w<=0)) throw Error('Invalid stage allocation.');
  const remaining=total-weights.length, sum=weights.reduce((a,b)=>a+b,0);
  const shares=weights.map(w=>remaining*w/sum), result=shares.map(w=>1+Math.floor(w));
  const order=shares.map((w,i)=>({i,remainder:w-Math.floor(w)})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0, left=total-result.reduce((a,b)=>a+b,0);i<left;i++) result[order[i].i]++;
  return result;
}

// The provider fills named slots; IDs, ordering and approved metadata belong to us.
// Keep the public/stored format unchanged for existing drafts and clients.
export function stageContract(action, schema, approved) {
  if(action==='outline') return {schema,input:{},instructions:'',decode:value=>value};
  const stages=approved.stages, slots=stages.map((stage,i)=>({slot:`stage_${i+1}`,...Object.fromEntries(['id','title','aim','minutes','interaction','activityType','learnerAction','material','outcome'].filter(k=>stage[k]!==undefined).map(k=>[k,stage[k]]))}));
  const field=action==='plan'?'stages':'tasks';
  const body=object(omit(schema.properties[field].items.properties, action==='plan'?['id','title','aim','minutes','interaction']:['stageId']));
  const properties=Object.fromEntries(slots.map(s=>[s.slot,action==='plan'?{$ref:'#/$defs/stageContent'}:{type:'array',items:{$ref:'#/$defs/stageContent'},minItems:1,maxItems:Math.min(s.minutes,6,Math.floor(20/stages.length))}]));
  const boundSchema={...object({...schema.properties,[field]:object(properties)}),$defs:{stageContent:body}};
  return {
    schema:boundSchema,
    input:{approvedStageSlots:slots},
    instructions:' Fill each named approvedStageSlots slot with content for that exact stage. Do not merge, omit or move stages. The application supplies approved stage metadata and final timings. Activity minutes are relative duration estimates within each stage. Keep timing numbers out of learner instructions.',
    decode(value) {
      validate(boundSchema,value);
      return {...value,[field]:slots.flatMap(s=>{
        const content=value[field][s.slot];
        if(action==='plan') return [{...content,...Object.fromEntries(Object.entries(s).filter(([k])=>k!=='slot'))}];
        const minutes=content.reduce((n,t)=>n+t.minutes,0)===s.minutes?content.map(t=>t.minutes):allocateMinutes(content.map(t=>t.minutes),s.minutes);
        return content.map((task,i)=>({...task,stageId:s.id,minutes:minutes[i]}));
      })};
    }
  };
}

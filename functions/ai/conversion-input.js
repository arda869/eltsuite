// Conversion translates an already reviewed plan; it must not research or add facts.
// Stage metadata is supplied once in approvedStageSlots. Full research evidence
// remains available to the subsequent editorial review, not duplicated here.
export function conversionInput(payload, slots) {
 const result=structuredClone(payload);
 if(result.approvedPlan?.stages&&slots)result.approvedPlan.stages=result.approvedPlan.stages.map(stage=>{
  const slot=slots.find(s=>s.id===stage.id);
  return Object.fromEntries(Object.entries(stage).filter(([key,value])=>key==='id'||!slot||!Object.hasOwn(slot,key)||JSON.stringify(slot[key])!==JSON.stringify(value)));
 });
 if(result.sourceEvidence){result.sourceAttributions=result.sourceEvidence.map(({title,url})=>({title,url}));delete result.sourceEvidence;}
 return result;
}

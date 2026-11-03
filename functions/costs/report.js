import {AI_FEATURES} from '../ai/features.js';
import {recommendedCredits} from './pricing.js';
export function costReport(generations,attempts,proposed={},selected=attempts) {
 const byGeneration=new Map(generations.map(g=>[g.id,{...g,cost:0,unknown:0,attempts:0}]));
 const provider={},date={};let calculated=0,estimated=0,unknown=0;
 for(const a of attempts){
  const g=byGeneration.get(a.generationId);if(!g)continue;
  g.attempts++;
  const known=Number.isSafeInteger(a.costMicroUsd)&&a.costMicroUsd>=0;
  if(!known){g.unknown++;}else {g.cost+=a.costMicroUsd;}
  }
 for(const a of selected){
  const known=Number.isSafeInteger(a.costMicroUsd)&&a.costMicroUsd>=0;
  if(!known)unknown++;
  if(known){if(a.basis==='estimated_usage')estimated+=a.costMicroUsd;else calculated+=a.costMicroUsd;}
  for(const [bucket,key] of [[provider,a.provider],[date,a.day]]){bucket[key]??={costMicroUsd:0,unknown:0,attempts:0};bucket[key].attempts++;if(known)bucket[key].costMicroUsd+=a.costMicroUsd;else bucket[key].unknown++;}
 }
 const features=AI_FEATURES.map(f=>{
  const rows=[...byGeneration.values()].filter(g=>g.feature===f.id),complete=rows.filter(g=>g.status!=='pending'),costs=complete.filter(g=>!g.unknown&&g.attempts).map(g=>g.cost).sort((a,b)=>a-b);
  const total=rows.reduce((s,g)=>s+g.cost,0),success=rows.filter(g=>g.status==='success').length,failed=rows.filter(g=>g.status==='failed').length,pending=rows.length-success-failed;
  const missing=rows.filter(g=>g.unknown||!g.attempts).length;
  const max=costs.length?costs.at(-1):null,average=costs.length?Math.ceil(costs.reduce((a,b)=>a+b,0)/costs.length):null,p95=costs.length?costs[Math.ceil(costs.length*.95)-1]:null;
  // Cover the highest observed generation AND amortise failed work over successful results.
  const basis=!missing&&!pending&&success?Math.max(max??0,Math.ceil(total/success)):null;
  const credits=proposed[f.id]??null,revenue=credits===null?null:credits*10000*success,profit=revenue===null||missing||pending?null:revenue-total,margin=revenue>0&&profit!==null?profit/revenue:null;
  const alert=missing||pending?'incomplete':credits===null?'not-priced':(revenue<total||(max!==null&&credits*10000<max))?'below-cost':revenue===0?(total?'below-cost':'no-revenue'):(margin<.75||(max!==null&&max>credits*2500))?'below-target':'on-target';
  return {...f,generations:rows.length,success,failed,pending,unknown:missing,totalMicroUsd:total,averageMicroUsd:average,maxMicroUsd:max,p95MicroUsd:p95,recommendedCredits:recommendedCredits(basis),proposedCredits:credits,revenueMicroUsd:revenue,profitMicroUsd:profit,margin,alert};
 });
 return {features,provider,date,calculatedMicroUsd:calculated,estimatedMicroUsd:estimated,invoiceConfirmedMicroUsd:null,unknownAttempts:unknown,generations:generations.length,attempts:selected.length};
}

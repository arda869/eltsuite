import {reserveBudget,settleBudget,checkRequestSize} from './budget.js';
import {generate} from './provider.js';
// Internal checking/repair shares the monthly budget, without counting as a new
// teacher import. Reserve before each provider call; failed calls retain their
// conservative reservation because provider usage may be unknown.
export function meteredImportReview({db,budget,job,isAdmin,apiKey,model}){
 return async options=>{
  // Reject an overlarge internal request before reserving money. The extra framing
  // margin is conservative; source-image transport is bounded separately.
  checkRequestSize({model,schema:options.schema,instructions:options.instructions,input:JSON.stringify(options.input),framingMargin:' '.repeat(1500)});
  const reserved=await db.runTransaction(async tx=>{const b=await tx.get(budget),r=reserveBudget(b.get('committedMicroUsd')??0,1,isAdmin);tx.set(budget,{committedMicroUsd:r.balance},{merge:true});return r.reserved;});
  const r=await generate({apiKey,model,...options});
  await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]),s=settleBudget(b.get('committedMicroUsd'),reserved,[r.usage]);tx.update(budget,{committedMicroUsd:s.balance});tx.update(job,{reviewCostMicroUsd:(j.get('reviewCostMicroUsd')??0)+s.cost});});
  return r;
 };
}
export async function readImportSource(job){
 const s=await job.collection('source').doc('original').get();if(!s.exists)return null;
 const source=JSON.parse(s.get('sourceJson'));
 const generated=await job.collection('pictures').get();source.pictureChecks=generated.docs.filter(d=>d.get('status')==='ready').map(d=>({id:d.id,ref:d.get('spec').ref,passed:d.get('qualityPassed')===true,summary:d.get('summary'),issues:d.get('issues')??[]}));
 const pictures=await job.collection('sourceImages').get();source.images=pictures.docs.sort((a,b)=>Number(a.id)-Number(b.id)).map(d=>d.get('jpeg'));
 return source;
}

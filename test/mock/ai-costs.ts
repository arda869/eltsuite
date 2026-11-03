import {costReport} from '../../functions/costs/report.js';
import {PRICING_VERSION,SOURCES} from '../../functions/costs/pricing.js';
export async function aiCosts(d:any){
 const settings=JSON.parse(localStorage.getItem('mockCostSettings')||'{"proposed":{},"version":0,"dailyGlobalMicroUsd":1000000000,"dailyTeacherMicroUsd":250000000,"paused":false}');
 if(d.action==='save'){if(d.version!==settings.version)throw Error('Another admin changed settings. Reload.');const next={...d,version:d.version+1};localStorage.setItem('mockCostSettings',JSON.stringify(next));return {data:{settings:next}};}
 if(localStorage.getItem('mockCostFailure'))throw Error('Could not load costs. Please try again.');
 const empty=localStorage.getItem('mockCostEmpty'),generations=empty?[]:[{id:'song-1',feature:'song',status:'success'}];
 const attempts=empty?[]:[{id:'cost-1',generationId:'song-1',feature:'song',model:'lyria-3.5',provider:'google',actorUid:'learner-1',teacherUid:'teacher-1',attribution:'class_owner',status:'success',day:'2026-11-03',basis:'calculated_units',costMicroUsd:80000,usage:{songs:1}}];
 return {data:{...costReport(generations,attempts,settings.proposed),settings,pricingVersion:PRICING_VERSION,sources:SOURCES,records:attempts}};
}

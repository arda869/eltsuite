import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
export const costContext=new AsyncLocalStorage();
export function selectCostFeature(feature,uid) { const c=costContext.getStore();if(c){c.feature=feature;c.uid=uid;} }
export function newContext({uid,classId='',operationId=randomUUID(),feature=null,db}={}) {return {uid,classId,operationId,feature,db,generations:new Set(),deferred:new Set(),failed:false};}
export function markCostFailure(){const c=costContext.getStore();if(c)c.failed=true;}

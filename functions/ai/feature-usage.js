import { HttpsError } from 'firebase-functions/v2/https';
import { isGenerationAdmin } from './allowance.js';
import { AI_FEATURES } from './features.js';
export { AI_FEATURES } from './features.js';
const catalog=new Map(AI_FEATURES.map(f=>[f.id,f]));
export function validateLimits(limits) {
 if(!limits||typeof limits!=='object'||Array.isArray(limits)||Object.keys(limits).some(id=>!catalog.has(id)))throw new HttpsError('invalid-argument','Choose a recognised AI feature.');
 for(const value of Object.values(limits))if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>1000000))throw new HttpsError('invalid-argument','Use a whole number from 0 to 1,000,000, or unlimited.');
 return limits;
}
export function effectiveLimit(feature,limits,isAdmin=false) {
 const f=catalog.get(feature);if(!f)throw new HttpsError('internal','AI feature has no usage policy.');
 if(isAdmin)return null;
 validateLimits(limits);
 return Object.hasOwn(limits,feature)?limits[feature]:f.defaultLimit;
}
export async function usageContext(db,auth) {
 if(!auth||auth.token?.proxyBy)throw new HttpsError('unauthenticated','Sign in with your own account.');
 return {uid:auth.uid,isAdmin:await isGenerationAdmin(db,auth),day:new Date().toISOString().slice(0,10)};
}
// Call after all other transaction reads and after idempotency checks, before any writes.
// A rejected budget/job reservation rolls this count back with the same transaction.
export async function chargeFeature(tx,db,context,feature) {
 const policy=db.doc('aiAllowances/'+context.uid),usage=db.doc('aiFeatureUsage/'+context.uid+'/days/'+context.day);
 const [p,u]=await Promise.all([tx.get(policy),tx.get(usage)]);
 const limit=effectiveLimit(feature,p.get('limits')??{},context.isAdmin),used=u.get('counts.'+feature)??0;
 if(!Number.isSafeInteger(used)||used<0)throw new HttpsError('internal','AI usage could not be checked. Please contact support.');
 if(limit!==null&&used>=limit)throw new HttpsError('resource-exhausted',limit===0?catalog.get(feature).label+' are disabled for your account. Contact your administrator.':catalog.get(feature).label+': you have used your '+limit+' daily uses. Your work is kept. The allowance resets at 00:00 UTC; ask your administrator to change it.');
 tx.set(usage,{counts:{[feature]:used+1},day:context.day,updatedAt:Date.now()},{merge:true});
}
export async function reserveFeature(db,auth,feature) {
 const context=await usageContext(db,auth);
 await db.runTransaction(tx=>chargeFeature(tx,db,context,feature));
 return context;
}

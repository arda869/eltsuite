import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_FEATURES, effectiveLimit, validateLimits, usageContext } from '../../functions/ai/feature-usage.js';
import { reserveBudget } from '../../functions/ai/budget.js';
import { mediaReservation } from '../../functions/ai/media-contract.js';
test('every AI feature has a default, zero blocks, custom and unlimited override defaults',()=>{
 assert.equal(new Set(AI_FEATURES.map(f=>f.id)).size,AI_FEATURES.length);
 assert.ok(AI_FEATURES.some(f=>f.id==='designerImage'));
 for(const f of AI_FEATURES){
  assert.equal(effectiveLimit(f.id,{}),f.defaultLimit);
  assert.equal(effectiveLimit(f.id,{[f.id]:0}),0);
  assert.equal(effectiveLimit(f.id,{[f.id]:900}),900);
  assert.equal(effectiveLimit(f.id,{[f.id]:null}),null);
  assert.equal(effectiveLimit(f.id,{[f.id]:0},true),null);
 }
 for(const limits of [null,[],{noSuchFeature:1},{song:-1},{song:1.5},{song:'3'},{song:1000001}])assert.throws(()=>validateLimits(limits));
 assert.throws(()=>effectiveLimit('forgotten-feature',{},true));
});
test('verified protected identities determine exemption; impersonation never does',async()=>{
 const db={doc:()=>({get:async()=>({exists:false})})};
 assert.equal((await usageContext(db,{uid:'owner',token:{email:'ardanurioglu@gmail.com',email_verified:true}})).isAdmin,true);
 assert.equal((await usageContext(db,{uid:'fake',token:{email:'ardanurioglu@gmail.com',email_verified:false,superAdmin:true}})).isAdmin,false);
 await assert.rejects(usageContext(db,{uid:'proxy',token:{proxyBy:'owner'}}),{code:'unauthenticated'});
});
test('super admins bypass text, repair and media monthly caps while accounting stays intact',()=>{
 const balance=80_000_000;
 assert.throws(()=>reserveBudget(balance,1));
 assert.ok(reserveBudget(balance,1,true).balance>balance);
 assert.ok(reserveBudget(balance,2,true).balance>balance);
 assert.throws(()=>reserveBudget(-1,1,true));
 assert.throws(()=>mediaReservation({kind:'image'},balance));
 assert.equal(mediaReservation({kind:'image'},balance,Date.now(),true).balance,balance+100000);
 assert.equal(mediaReservation({kind:'audio',lines:[{},{}]},balance,Date.now(),true).balance,balance+120000);
});

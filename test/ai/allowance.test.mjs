import test from 'node:test';
import assert from 'node:assert/strict';
import {isGenerationAdmin,dailyAllowanceReached,dailyGlobalUsage} from '../../functions/ai/allowance.js';
import {reserveBudget} from '../../functions/ai/budget.js';
test('only verified, non-proxy Super Admin identities receive the daily exemption',async()=>{
 const registered=new Set(['superAdmins/admin@example.com']);
 const db={doc:path=>({get:async()=>({exists:registered.has(path)})})};
 const auth=email=>({uid:'teacher',token:{email,email_verified:true}});
 assert.equal(await isGenerationAdmin(db,auth('ardanurioglu@gmail.com')),true);
 assert.equal(await isGenerationAdmin(db,auth('ADMIN@example.com')),true);
 assert.equal(await isGenerationAdmin(db,auth('ordinary@example.com')),false);
 assert.equal(await isGenerationAdmin(db,{...auth('admin@example.com'),token:{email:'admin@example.com',email_verified:false}}),false);
 assert.equal(await isGenerationAdmin(db,{...auth('ardanurioglu@gmail.com'),token:{email:'ardanurioglu@gmail.com',email_verified:false}}),false);
 assert.equal(await isGenerationAdmin(db,{...auth('admin@example.com'),token:{...auth('admin@example.com').token,proxyBy:'owner'}}),false);
 assert.equal(await isGenerationAdmin(db,null),false);
 registered.clear();assert.equal(await isGenerationAdmin(db,auth('admin@example.com')),false);
});
test('admin generation bypasses daily counts, records usage separately and retains spending protection',()=>{
 assert.equal(dailyAllowanceReached(12,120,2,true),false);
 assert.equal(dailyAllowanceReached(12,0,1,false),true);
 assert.equal(dailyAllowanceReached(0,120,1,false),true);
 assert.equal(dailyAllowanceReached(11,119,1,false),false);
 assert.equal(dailyAllowanceReached(11,119,2,false),true);
 assert.deepEqual(dailyGlobalUsage({calls:120,adminCalls:9},2,true),{adminCalls:11});
 assert.deepEqual(dailyGlobalUsage({calls:3,adminCalls:99},1,false),{calls:4});
 assert.throws(()=>reserveBudget(20_000_000,1),/monthly/);
});

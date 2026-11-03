import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeDeletion } from './service.js';
const db={doc:path=>({get:async()=>({exists:path==='superAdmins/admin@example.com'})})};
const now=1800000000000;
const auth=(uid,email=uid+'@example.com')=>({uid,token:{email,email_verified:true,auth_time:now/1000}});
const target={uid:'teacher',email:'teacher@example.com'};
test('only recent self or verified super-admin can request deletion',async()=>{
 await authorizeDeletion(db,auth('teacher'),target,now);
 await authorizeDeletion(db,auth('admin'),target,now);
 for(const a of [null,auth('other'),{...auth('admin'),token:{...auth('admin').token,email_verified:false}},{...auth('teacher'),token:{...auth('teacher').token,proxyBy:'admin'}},{...auth('teacher'),token:{...auth('teacher').token,auth_time:now/1000-301}}])await assert.rejects(authorizeDeletion(db,a,target,now));
});
test('site owner and registered super-admin accounts are protected',async()=>{
 for(const email of ['ardanurioglu@gmail.com','admin@example.com'])await assert.rejects(authorizeDeletion(db,auth('admin'),{uid:'target',email},now));
});

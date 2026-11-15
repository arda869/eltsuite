// Copy class recording scripts to teacher-only mediaScripts and remove the legacy
// field from public manifests. Run without --apply to count affected docs.
import {createRequire} from 'node:module';
const deps=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=deps('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=deps('firebase-admin/firestore');

const apply=process.argv.includes('--apply');
const expectedRaw=process.argv.find(arg=>arg.startsWith('--expected-legacy-count='))?.split('=')[1];
const expected=expectedRaw===undefined?null:Number(expectedRaw);
if(apply&&(!Number.isInteger(expected)||expected<0))throw Error('--apply requires --expected-legacy-count=N from a reviewed dry run.');
const projectId=process.env.GCLOUD_PROJECT || 'lesson-lit';
initializeApp(process.env.FIRESTORE_EMULATOR_HOST?{projectId}:{credential:applicationDefault(),projectId});
const db=getFirestore();
const totals={classes:0,media:0,legacyScripts:0,withText:0,migrated:0,alreadyPrivate:0,conflicts:0,errors:0};
const hasScript=script=>Array.isArray(script)&&script.some(line=>typeof line?.text==='string'&&line.text.trim());
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const candidates=[];

for await(const cls of db.collection('classes').select().stream()){
 totals.classes++;
 const media=await cls.ref.collection('media').select('script','aiGenerated').get();
 for(const doc of media.docs){
  totals.media++;
  if(!Object.hasOwn(doc.data(),'script'))continue;
  const script=doc.get('script');
  totals.legacyScripts++;
  if(hasScript(script))totals.withText++;
  const privateRef=cls.ref.collection('mediaScripts').doc(doc.id);
  try{
   const existing=await privateRef.get();
   if(existing.exists&&hasScript(script)){
    if(!same(existing.get('script'),script)){totals.conflicts++;continue;}
    totals.alreadyPrivate++;
   }
   candidates.push(doc.ref);
  }catch(error){
   totals.errors++;
   console.error('Migration skipped',`${cls.id}/${doc.id}`,error?.code||error?.name||'unknown error');
  }
 }
}
const preflight={...totals};
if(apply){
 if(totals.conflicts||totals.errors||totals.legacyScripts!==expected){
  console.log(JSON.stringify({mode:'preflight-failed',projectId,expectedLegacyCount:expected,totals:preflight},null,2));
  process.exit(1);
 }
 for(const ref of candidates){
  const privateRef=ref.parent.parent.collection('mediaScripts').doc(ref.id);
  try{
   const [current,existing]=await Promise.all([ref.get(),privateRef.get()]);
   const script=current.get('script');
   if(!Object.hasOwn(current.data()??{},'script')){totals.conflicts++;continue;}
   if(hasScript(script)&&existing.exists&&!same(existing.get('script'),script)){totals.conflicts++;continue;}
   // Keep the public source until the private copy is read back and verified.
   if(hasScript(script)){
    if(!existing.exists)await privateRef.create({script,aiGenerated:current.get('aiGenerated')===true,updatedAt:Timestamp.now()});
    const copy=await privateRef.get();
    if(!same(copy.get('script'),script)){totals.conflicts++;continue;}
   }
   const removed=await db.runTransaction(async tx=>{
    const latest=await tx.get(ref),privateDoc=hasScript(script)?await tx.get(privateRef):null;
    if(!latest.exists||!Object.hasOwn(latest.data()??{},'script')||!same(latest.get('script'),script)
      ||(hasScript(script)&&!same(privateDoc?.get('script'),script)))return false;
    tx.update(ref,{script:FieldValue.delete()});
    return true;
   });
   if(removed)totals.migrated++;else totals.conflicts++;
  }catch(error){
   totals.errors++;
   console.error('Migration skipped',ref.path,error?.code||error?.name||'unknown error');
  }
 }
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',projectId,...(apply?{expectedLegacyCount:expected,preflight}:{}),totals},null,2));
if(totals.conflicts||totals.errors)process.exitCode=1;

import test from 'node:test';
import assert from 'node:assert/strict';
import {taskMediaContext,resolveExistingMedia,checkExistingMedia} from '../../functions/ai/task-media.js';
import {nativeTask} from '../../functions/ai/activities.js';

// Fixtures model document paths and projection reads without a provider or Firebase credentials.
function fixture(){
 const docs=new Map([
  ['classes/c/media/r',{kind:'audio',title:'Market visit',script:[{who:'Sam',text:'The stall opens at eleven.'}]}],
  ['classes/other/media/r',{kind:'audio',script:[{text:'Unrelated private class'}]}],
  ['users/u/archive/i',{kind:'image',name:'Market stall',tags:['food'],home:{classId:'user:u',mediaId:'picture'}}],
  ['users/u/archive/deleted',{kind:'image',name:'Deleted',deletedAt:1,home:{classId:'c',mediaId:'gone'}}],
  ['users/u/media/picture',{data:'data:image/png;base64,aW1hZ2U=',type:'image/png',size:5,credit:'Teacher'}],
 ]);
 const snap=path=>({exists:docs.has(path),id:path.split('/').pop(),get:k=>docs.get(path)?.[k]});
 const col=(path,filter=()=>true)=>({where(k,op,v){return col(path,s=>filter(s)&&(k==='__name__'?s.id===v:op==='in'?v.includes(s.get(k)):s.get(k)===v))},select(){return this},limit(){return this},async get(){return {docs:[...docs.keys()].filter(key=>key.substring(0,key.lastIndexOf('/'))===path).map(snap).filter(filter)}},doc(id='copied'){return {id,path:path+'/'+id}}});
 const db={collection:col,doc:path=>({path})},cls={id:'c',ref:{collection:n=>col('classes/c/'+n)}},tx={get:ref=>snap(ref.path)};
 return {db,cls,uid:'u',docs,tx};
}
test('reads class scripts and live Resources metadata, never another class’s script or image bytes',async()=>{
 const env=fixture();const c=await taskMediaContext({...env,tasks:[{title:'Listening',content:{type:'media',attrs:{media:'r'}}}],direction:'market',title:'Market'});
 assert.equal(c.recordings[0].script,'Sam: The stall opens at eleven.');assert.equal(c.recordings.length,1);assert.deepEqual(c.images.map(i=>i.ref),['image:i']);assert.ok(!JSON.stringify(c).includes('base64'));
 const selected=[{ref:'image:i',alt:'Market stall'},{ref:'recording:r',alt:''}];checkExistingMedia(selected,c,[],{instructions:'Look at the picture.',format:'listening'});
 const items=await resolveExistingMedia(env.tx,env,selected);assert.equal(items[0].dest.path,'classes/c/media/copied');assert.equal(items[0].copy.data,env.docs.get('users/u/media/picture').data);
 const native=nativeTask({title:'At the market',instructions:'Listen and choose.',input:'',format:'listening',questions:[],roles:[],visuals:[],subTasks:[],preparedMedia:items.map(i=>i.asset)},0);
 assert.match(JSON.stringify(native.content),/media:copied/);assert.match(JSON.stringify(native.content),/Market visit/);assert.ok(!JSON.stringify(native.content).includes('AI-generated audio'));
});
test('requires actual media for picture and listening prompts and rejects unknown resources',()=>{
 const c={images:[],recordings:[]},task={instructions:'Compare the photos.',format:'speaking'};
 assert.throws(()=>checkExistingMedia([],c,[],task),/Attach/);
 assert.doesNotThrow(()=>checkExistingMedia([],c,[{kind:'image'}],task));
 assert.doesNotThrow(()=>checkExistingMedia([],c,[],{format:'speaking',instructions:'Compare your ideas.'}));
 assert.throws(()=>checkExistingMedia([{ref:'image:invented',alt:'no'}],c,[],task),/listed resource/);
 assert.throws(()=>checkExistingMedia([],c,[],{format:'listening',instructions:'Listen.'}),/recording/);
});
test('a Resources entry cannot copy private media from another class or another teacher',async()=>{
 const env=fixture();for(const space of ['other','user:someone']){
  env.docs.get('users/u/archive/i').home={classId:space,mediaId:'r'};
  await assert.rejects(resolveExistingMedia(env.tx,env,[{ref:'image:i',alt:'x'}]));
 }
});
test('Wikimedia and generated image plans queue real preparation and unused lessons queue none',async()=>{
 const {prepareActivityAssets}=await import('../../functions/ai/task-media.js');
 const env=fixture();env.cls.get=()=>({ageGroup:'Young learners'});
 const requests=[{kind:'image',style:'photo',id:'t0_m0'},{kind:'image',style:'editorial',id:'t0_m1'}];
 const result=await prepareActivityAssets(env.tx,env,requests);
 assert.deepEqual(result.map(x=>[x.source,x.status]),[['commons','queued'],['generate','queued']]);
 assert.deepEqual(await prepareActivityAssets(env.tx,env,[]),[]);
});

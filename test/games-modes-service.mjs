// Real Firestore emulator + production service, no generated content or billable calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gamesService} from '../functions/games/service.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Run only against the Firestore emulator.');
const app=initializeApp({projectId:'demo-ai-access'}),db=getFirestore(app);
const auth=uid=>({uid,token:{email:uid+'@example.com'}});
const call=(uid,action,data={})=>gamesService(db,auth(uid),{id:'modes',action,...data});
try {
 for(const [id,role] of [['mode-teacher','teacher'],['mode-a','learner'],['mode-b','learner'],['mode-watch','learner']])await db.doc('users/'+id).set({role,displayName:id});
 await db.doc('classes/mode-class').set({teacherId:'mode-teacher'});
 for(const id of ['mode-a','mode-b','mode-watch'])await db.doc('classes/mode-class/members/'+id).set({displayName:id});
 await db.doc('gameSessions/modes').set({owner:'mode-teacher',title:'Modes test',target:{type:'class',id:'mode-class'},game:{version:1,type:'show',theme:'paper',sound:false,rounds:[{id:'r',prompt:'Books?',answer:'library',choices:['bank']}]},mode:'teacher',selected:[],state:null,revision:0,ended:false});
 const move=async(uid,state,extra={})=>{const {session}=await call(uid,'open');return call(uid,'state',{state,revision:session.revision,runId:session.runId||0,...extra});};
 const complete={round:0,answer:'library',feedback:'Correct!',finished:true};
 await move('mode-teacher',complete);assert.equal((await call('mode-a','open')).session.state.score,10);
 await assert.rejects(()=>move('mode-a',complete),/not shared/);
 await call('mode-teacher','configure',{mode:'selected',selected:['mode-a']});
 await assert.rejects(()=>move('mode-teacher',complete),/not shared/);await assert.rejects(()=>move('mode-b',complete),/not shared/);
 await move('mode-a',complete);assert.equal((await call('mode-watch','open')).session.state.finished,true);
 const oldRun=(await call('mode-a','open')).session.runId;
 await call('mode-teacher','configure',{mode:'multiplayer',selected:['mode-a','mode-b']});
 await assert.rejects(()=>move('mode-a',complete,{runId:oldRun}),/refresh/);
 const first=(await call('mode-a','open')).session;
 await move('mode-a',{round:0,answer:'lib'});
 await assert.rejects(()=>call('mode-b','state',{state:complete,revision:first.revision,runId:first.runId}),/just moved/);
 await move('mode-b',complete);assert.equal((await call('mode-watch','open')).session.state.score,10);
 await call('mode-teacher','configure',{mode:'individual',selected:[]});
 await move('mode-a',complete);await move('mode-b',{...complete,answer:'bank',feedback:'Answer: library'});
 const a=await call('mode-a','open'),b=await call('mode-b','open');assert.equal(a.players.find(p=>p.id==='mode-a').state.score,10);assert.equal(b.players.find(p=>p.id==='mode-b').state.score,0);assert.equal(a.players.find(p=>p.id==='mode-b').state.answer,undefined);
 await call('mode-teacher','configure',{mode:'teacher',selected:['mode-a']});assert.deepEqual((await call('mode-a','open')).session.selected,[]);await assert.rejects(()=>move('mode-a',complete),/not shared/);
 await call('mode-teacher','end');await assert.rejects(()=>move('mode-teacher',complete),/not shared/);await assert.rejects(()=>call('mode-teacher','pointer',{x:.5,y:.5}),/not shared/);
 console.log('PASS: all four modes to scored results, spectators, teacher hand-off, independent private answers, stale moves, restart and end (real Firestore emulator).');
} finally {await db.terminate();await deleteApp(app);}

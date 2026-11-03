import {validGame} from '../../functions/games/contract.js';
import {scoreMove} from '../../functions/games/scoring.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {cleanState} from '../../functions/games/state.js';
import {gamesService} from '../../functions/games/service.js';
const js=ts.transpileModule(readFileSync(new URL('../../src/games/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {wordGrid,gameProblems,blankGame}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('every word-search clue has an exact in-bounds solution, including maximum length',()=>{const rounds=Array.from({length:16},(_,i)=>({id:'r'+i,answer:i===0?'ABCDEFGHIJKLMNOP':'BOOK'+String.fromCharCode(65+i),prompt:'clue',choices:[]}));const b=wordGrid(rounds);for(const r of rounds){const path=b.paths[r.id];assert.equal(path.map(i=>b.grid.flat()[i]).join(''),r.answer);assert.equal(new Set(path).size,r.answer.length);}});
test('incompatible content is blocked next to play rather than generating an unusable board',()=>{assert.match(gameProblems(blankGame()).join(' '),/at least one/);assert.match(gameProblems({...blankGame(),type:'hangman',rounds:[{id:'x',prompt:'clue',answer:'two words',choices:[]}]}).join(' '),/single/);assert.match(gameProblems({...blankGame(),type:'targets',rounds:[{id:'x',prompt:'clue',answer:'Cat',choices:[' cat ']}]}).join(' '),/different/);});
test('remote moves cannot change access, contain unbounded rounds, or inject a game definition',()=>{const s=cleanState({round:999,score:Infinity,owner:'evil',game:{},guessed:['AB','Z'],selected:[-1,999]},2);assert.equal(s.round,0);assert.equal(s.score,0);assert.equal(s.owner,undefined);assert.deepEqual(s.guessed,['Z']);assert.deepEqual(s.selected,[]);assert.throws(()=>cleanState({answer:'a'.repeat(41000)},2));});
function memory(){const data=new Map(Object.entries({'users/teacher':{role:'teacher'},'users/student':{role:'learner',displayName:'Learner'},'users/outsider':{role:'learner'},'classes/class1':{teacherId:'teacher'},'classes/class1/members/student':{},'gameSessions/game1':{owner:'teacher',target:{type:'class',id:'class1'},mode:'teacher',selected:[],game:{rounds:[{id:'r1'}]},state:null,revision:0,ended:false}}));const db={doc(path){return {path,async get(){const d=data.get(path);return{exists:!!d,data:()=>d,get:k=>d?.[k]};},async update(p){data.set(path,{...data.get(path),...p});},async set(p){data.set(path,p);},collection(part){return{doc:key=>db.doc(path+'/'+part+'/'+key),async get(){return{docs:[]};}};}};},async runTransaction(fn){return fn({get:r=>r.get(),update:(r,p)=>r.update(p)});}};return{db,data};}
const auth=uid=>({uid,token:{email:uid+'@example.com'}});
test('outsiders cannot open a class game, and spectators cannot submit or move the pointer',async()=>{const{db}=memory();for(const action of ['open','state','pointer'])await assert.rejects(()=>gamesService(db,auth('outsider'),{id:'game1',action,state:{},x:.5,y:.5}),/not shared/);for(const action of ['state','pointer'])await assert.rejects(()=>gamesService(db,auth('student'),{id:'game1',action,state:{},x:.5,y:.5}),/not shared/);});
test('selected learner moves once; stale moves and moves after ending are rejected',async()=>{const{db,data}=memory();Object.assign(data.get('gameSessions/game1'),{mode:'selected',selected:['student']});await gamesService(db,auth('student'),{id:'game1',action:'state',revision:0,state:{answer:'cat'}});assert.equal(data.get('gameSessions/game1').revision,1);await assert.rejects(()=>gamesService(db,auth('student'),{id:'game1',action:'state',revision:0,state:{}}),/just moved/);await gamesService(db,auth('teacher'),{id:'game1',action:'end'});await assert.rejects(()=>gamesService(db,auth('student'),{id:'game1',action:'state',revision:1,state:{}}),/not shared/);});

test('leaderboard points are computed from answers, not client-supplied scores',()=>{const game={type:'show',rounds:[{id:'r',answer:'library'}]};const next=cleanState({round:0,answer:'bank',score:3000,feedback:'Correct!',finished:true},1);const r=scoreMove(game,next);assert.equal(r.state.score,0);assert.equal(r.state.finished,true);assert.equal(scoreMove(game,{...next,answer:'library',score:999}).state.score,10);});
test('players cannot skip directly to the finish screen',()=>{const game={type:'show',rounds:[{answer:'a'},{answer:'b'},{answer:'c'}]};assert.throws(()=>scoreMove(game,cleanState({round:2,finished:true},3)),/current round/);assert.equal(scoreMove(game,cleanState({round:0,finished:true},3)).state.finished,false);});

test('game show: the server sets the clock, scores late answers as nothing and spends each lifeline once',()=>{
 const game={type:'show',showTimer:30,rounds:[{id:'a',answer:'library',choices:['bank','park']},{id:'b',answer:'bakery',choices:['zoo','bank']}]};
 const show=(extra={})=>({phase:'play',deadline:0,lockedAt:0,fifty:null,extra:null,results:'',...extra});
 // Opening a question stamps the deadline from the server clock, whatever the client proposed.
 const opened=scoreMove(game,cleanState({round:0,show:show({deadline:999999999})},2),{},{},10000);
 assert.equal(opened.state.show.deadline,40000);
 // Extra time adds 20 seconds, once; a second claim is ignored.
 const extra=scoreMove(game,cleanState({round:0,show:show({extra:0,deadline:1})},2),opened.state,opened.awards,15000);
 assert.equal(extra.state.show.deadline,60000);assert.equal(extra.state.show.extra,0);
 const again=scoreMove(game,cleanState({round:0,show:show({extra:1,deadline:1})},2),{...extra.state,round:0},extra.awards,16000);
 assert.equal(again.state.show.extra,0);assert.equal(again.state.show.deadline,60000);
 // Locked before the deadline, revealed after it: still counts.
 const locked=scoreMove(game,cleanState({round:0,answer:'library',show:show({phase:'locked',extra:0})},2),extra.state,extra.awards,59000);
 assert.equal(locked.state.show.lockedAt,59000);
 const revealed=scoreMove(game,cleanState({round:0,answer:'library',feedback:'Correct!',show:show({phase:'locked',extra:0,results:'1'})},2),locked.state,locked.awards,62000);
 assert.equal(revealed.state.score,10);assert.equal(revealed.state.show.results,'1');
 // Locked well after the deadline: the answer is dropped and the round scores nothing.
 const late0=scoreMove(game,cleanState({round:0,show:show()},2),{},{},0);
 const lateLock=scoreMove(game,cleanState({round:0,answer:'library',show:show({phase:'locked'})},2),late0.state,late0.awards,40000);
 const lateReveal=scoreMove(game,cleanState({round:0,answer:'library',feedback:'Correct!',show:show({phase:'locked',results:'1'})},2),lateLock.state,lateLock.awards,41000);
 assert.equal(lateReveal.state.score,0);assert.equal(lateReveal.state.feedback,'Time ran out.');assert.equal(lateReveal.state.show.results,'0');
 // Take two away is remembered on the round it was spent.
 const fifty=scoreMove(game,cleanState({round:0,show:show({fifty:0})},2),late0.state,late0.awards,100);
 const reuse=scoreMove(game,cleanState({round:0,show:show({fifty:1})},2),fifty.state,fifty.awards,200);
 assert.equal(reuse.state.show.fifty,0);
 // Without a timer there is never a deadline, and the ladder follows the ledger not the claim.
 const untimed={...game,showTimer:0};
 const u=scoreMove(untimed,cleanState({round:0,answer:'bank',feedback:'Answer: library',show:show({deadline:5,results:'1'})},2),{},{},0);
 assert.equal(u.state.show.deadline,0);assert.equal(u.state.show.results,'0');assert.equal(u.state.score,0);
 // Old boards without show state keep working.
 assert.equal(scoreMove(game,cleanState({round:0,answer:'library',feedback:'Correct!'},2)).state.score,10);
 assert.equal(validGame({...blankGame(),rounds:[{id:'r',prompt:'Books?',answer:'library',choices:[],note:'x'.repeat(601)}]}),false);
 assert.equal(validGame({...blankGame(),showTimer:25,rounds:[{id:'r',prompt:'Books?',answer:'library',choices:[]}]}),false);
 assert.equal(validGame({...blankGame(),showTimer:30,showLock:false,showLifelines:true,rounds:[{id:'r',prompt:'Books?',answer:'library',choices:[],note:'Books live in a library.'}]}),true);
});

test('invalid saved drafts cannot be published into a class',()=>{assert.equal(validGame({...blankGame(),type:'search',rounds:[{id:'r',prompt:'A place',answer:'two words',choices:[]}]}),false);assert.equal(validGame({...blankGame(),rounds:[{id:'r',prompt:'Books?',answer:'library',choices:[]}]}),true);});

test('timed games use a server deadline, reject premature defeat and end on expiry',()=>{
 const game={type:'blocks',roundSeconds:30,rounds:[{answer:'library'},{answer:'bank'}]};
 const start=scoreMove(game,cleanState({arcade:{phase:'running',deadline:99999999}},2),{},{},1000);
 assert.equal(start.state.arcade.deadline,31000);
 const premature=scoreMove(game,cleanState({...start.state,finished:true,arcade:{...start.state.arcade,phase:'lost',loss:'time'}},2),start.state,start.awards,2000);
 assert.equal(premature.state.finished,false);
 const expired=scoreMove(game,cleanState({...start.state,answer:'library',feedback:'Correct!',arcade:{...start.state.arcade,phase:'cleared'}},2),start.state,start.awards,31001);
 assert.equal(expired.state.finished,true);assert.equal(expired.state.arcade.loss,'time');assert.equal(expired.state.score,0);
 const correct=scoreMove(game,cleanState({...start.state,answer:'library',feedback:'Correct!',arcade:{...start.state.arcade,phase:'cleared'}},2),start.state,start.awards,2000);
 assert.equal(correct.state.score,10);assert.equal(correct.state.finished,false);
});
test('falling pieces rotate, land above occupied cells and clear full rows',async()=>{
 const js=ts.transpileModule(readFileSync(new URL('../../src/games/blockModel.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {piece,landing,settle}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 assert.equal(Math.max(...piece(2,1).map(c=>c[0])),0);
 const drop=landing([],2,0,3);assert.equal(drop.y,17);assert.deepEqual(drop.cells,[173,174,175,176]);
 const row=[170,171,172,177,178,179];assert.deepEqual(settle(row,drop.cells),[]);
 assert.equal(landing([0,1,2,3],2,0,0).blocked,true);
});

test('show deadline cannot be renewed by returning from lock to play',()=>{
 const game={...blankGame(),showTimer:15,rounds:[{id:'a',prompt:'Place?',answer:'library',choices:[]}]};
 const previous=cleanState({round:0,show:{phase:'locked',deadline:16000,lockedAt:14000}},1);
 const next=cleanState({round:0,show:{phase:'play',deadline:999999}},1);
 assert.equal(scoreMove(game,next,previous,{},20000).state.show.deadline,16000);
});
test('show timed-out inline answers never earn points',()=>{
 const game={...blankGame(),showTimer:15,rounds:[{id:'a',prompt:'Place?',answer:'library',choices:[],content:{type:'doc',content:[{type:'paragraph',content:[{type:'gap',attrs:{id:'g',answers:['library']}}]}]}}]};
 const previous=cleanState({round:0,show:{phase:'play',deadline:16000}},1);
 const next=cleanState({round:0,answer:'library',responses:{g:'library'},feedback:'Time ran out.',show:{phase:'play'}},1);
 assert.equal(scoreMove(game,next,previous,{},20000).state.score,0);
});

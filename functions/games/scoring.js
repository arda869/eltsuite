import {splitKey} from '../ai/import-question-core.js';
import {questionIds,scoreQuestion} from '../learning/question-core.js';
const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
export function scoreMove(game,state,previous={},awards={},now=Date.now()){
 const next={...state};const ledger={...awards};const rounds=game.rounds;
 const timed=['shark','taxi','drive','blocks'].includes(game.type);let gameOver=false;
 if(timed){
  const old=previous.arcade||{};next.arcade={...next.arcade};
  if(next.arcade.phase==='running'&&old.phase!=='running')next.arcade.deadline=now+([20,30,60,120].includes(game.roundSeconds)?game.roundSeconds:30)*1000;
  else if(old.phase==='running'){
   next.arcade.deadline=old.deadline;
   const expired=now>=old.deadline,blocked=game.type==='blocks'&&next.arcade.loss==='stack'&&(old.stack||[]).some(i=>i<20);
   if(expired||blocked){next.arcade.phase='lost';next.arcade.loss=blocked?'stack':'time';next.answer='';next.feedback=blocked?'The blocks reached the top.':'Time ran out.';gameOver=true;}
   else if(next.arcade.phase==='lost')return {state:previous,awards:{...awards}};
  }
 }

 // Game show: the server owns the clock and remembers which lifelines were spent. A deadline is set
 // when a question opens; an answer locked after it (plus a little latency) earns nothing.
 if(game.type==='show'&&next.show){
  const old=previous.show||{};const seconds=[15,30,45,60,90].includes(game.showTimer)?game.showTimer:0;next.show={...next.show};
  const opened=next.show.phase==='play'&&(next.round!==(previous.round||0)||!old.deadline&&old.phase!=='locked');
  if(!seconds)next.show.deadline=0;
  else if(opened)next.show.deadline=now+seconds*1000;
  else next.show.deadline=old.deadline||0;
  if(old.fifty!==undefined&&old.fifty!==null)next.show.fifty=old.fifty;
  if(old.extra!==undefined&&old.extra!==null)next.show.extra=old.extra;
  else if(seconds&&next.show.extra!==null&&next.show.extra!==undefined&&!opened&&next.show.deadline)next.show.deadline+=20000;
  next.show.lockedAt=next.show.phase==='locked'&&old.phase!=='locked'?now:(old.lockedAt||0);
  if(next.feedback!==null&&previous.feedback==null&&next.show.deadline){
   const at=old.phase==='locked'&&old.lockedAt?old.lockedAt:now;
   if(at>next.show.deadline+1500){next.answer='';next.feedback='Time ran out.';}
  }
 }
 if(previous.finished)return {state:previous,awards:ledger};
 if(next.round>(previous.round||0)+1||next.round<(previous.round||0))throw Error('Wait for the current round to finish.');
 if(next.round>(previous.round||0)&&previous.feedback==null)throw Error('Answer the current round first.');
 if(game.type==='pairs'||game.type==='search'){
  const field=game.type==='pairs'?'matched':'found';next[field]=[...new Set(next[field])].filter(id=>rounds.some(r=>r.id===id));next.score=next[field].length*10;next.finished=next[field].length===rounds.length;return {state:next,awards:ledger};
 }
 if(game.type==='auction'){
  const seen=new Set();const lots=next.auction.bought.filter(b=>{if(seen.has(b.lot))return false;seen.add(b.lot);return true;});next.auction.bought=lots;next.score=lots.filter(b=>norm(rounds[b.lot].answer)==='correct').length*10;next.finished=next.auction.complete&&next.auction.lot===rounds.length-1;return {state:next,awards:ledger};
 }
 if(next.feedback!==null&&ledger[next.round]===undefined){
  const r=rounds[next.round];let correct=norm(next.answer)===norm(r.answer),unscored=false;
  if(r.content){const {content,key}=splitKey(r.content);const questions=questionIds(content);unscored=!questions.length||questions.some(q=>['writing','reflect','upload'].includes(q.type));const scores=questions.map(q=>scoreQuestion(key[q.id],next.responses[q.id]));correct=!unscored&&scores.length>0&&scores.every(s=>s.max>0&&s.got===s.max);}
  if(game.type==='show'&&next.feedback==='Time ran out.')correct=false;
  const stake=[5,10,20,50].includes(next.stake)?next.stake:10;ledger[next.round]=unscored?0:game.type==='wager'?(correct?stake:-stake):(correct?10:0);
 }
 next.score=Object.values(ledger).reduce((n,p)=>n+p,0);next.finished=gameOver||(next.finished&&next.round===rounds.length-1&&Object.keys(ledger).length===rounds.length);
 // The progress ladder shown to everyone follows the ledger, not what a client claims.
 if(game.type==='show'&&next.show){const claimed=next.show.results||'';next.show.results=rounds.map((_,i)=>ledger[i]===undefined?'.':ledger[i]>0?'1':(claimed[i]==='x'?'x':'0')).join('').replace(/\.+$/,'');}
 return {state:next,awards:ledger};
}

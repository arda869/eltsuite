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
  const stake=[5,10,20,50].includes(next.stake)?next.stake:10;ledger[next.round]=unscored?0:game.type==='wager'?(correct?stake:-stake):(correct?10:0);
 }
 next.score=Object.values(ledger).reduce((n,p)=>n+p,0);next.finished=gameOver||(next.finished&&next.round===rounds.length-1&&Object.keys(ledger).length===rounds.length);return {state:next,awards:ledger};
}

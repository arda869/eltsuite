import {splitKey} from '../lib/questions';
import { bingoCards, bingoClaim, checkDominoes, dominoTiles, shuffled, validateActivity, type ActivityConfig, type Participant, boardJumps, boardStyleOf } from './model';

export type ActivityState = {
  actorRevisions?: Record<string, number>;
  seq: number; phase: 'ready' | 'running' | 'revealed' | 'ended'; people: Participant[]; turn: number;
  positions: Record<string, number>; skip: Record<string, boolean>; scores: Record<string, number>; die: number | null;
  order: string[]; agreed: string[]; submitted: boolean; checked: boolean; correct: boolean | null;
  cards: Record<string, string[]>; marked: Record<string, string[]>; called: string[]; currentCall: string | null;
  claims: Record<string, { valid: boolean; lines: number; uncalled: string[] }>;
  deckMap?: Record<string,{itemId:string;side:'a'|'b'}>; faceUp: string[]; won: Record<string, string>; deck: string[];
  assignments: Record<string, string[]>; cardIndex: number; round: number;
  answers: Record<string, Record<string, string>>; details: Record<string, Record<string, string>>;
  opinions: Record<string, { value: number; reason: string }>;
  summaries?: Record<string, string>;
  foundPoints?: Record<string, Record<string, {x: number; y: number}>>;
  surveyResults?: Record<string, Record<string, number>>;
  found: Record<string, string[]>; startedAt: number | null; endsAt: number | null;
};
export type ActivityAction =
  | { type: 'start' | 'reveal' | 'end' | 'reset' | 'settle' | 'nextTurn' | 'claim' | 'agree' | 'check' | 'skip' | 'gotIt' | 'swap' | 'timerElapsed' }
  | { type: 'roll'; die: number }
  | { type: 'call'; itemId: string }
  | { type: 'mark'; itemId: string }
  | { type: 'flip'; cardId: string }
  | { type: 'order'; ids: string[] }
  | { type: 'assign'; assignments: Record<string, string[]> }
  | { type: 'answer'; itemId: string; value: string; detail?: string }
  | { type: 'opinion'; value: number; reason?: string }
  | { type: 'found'; x: number; y: number }
  | { type: 'summary'; text: string };
export type ActivityActor = { id: string; teacher: boolean };

export function initialActivity(c: ActivityConfig, people: Participant[], random: () => number = Math.random): ActivityState {
  const deckMap: NonNullable<ActivityState['deckMap']> = {};
  if(c.kind==='memory')for(const item of c.items)for(const side of ['a','b'] as const){let id='';for(let tries=0;tries<32;tries++){id=Math.floor(random()*4294967295).toString(36)+Math.floor(random()*4294967295).toString(36);if(!deckMap[id])break;}if(deckMap[id])throw new Error('Shuffle the cards again.');deckMap[id]={itemId:item.id,side};}
  return {
    actorRevisions: {}, seq: 0, phase: 'ready', people: c.settings.turnOrder === 'random' ? shuffled(people, random) : [...people], turn: 0,
    positions: Object.fromEntries(people.map(p => [p.id, 0])), skip: {}, scores: {}, die: null,
    order: ['strips', 'dominoes', 'ranking', 'speaking'].includes(c.kind) ? shuffled(c.items.map(i => i.id), random) : c.items.map(i => i.id),
    agreed: [], submitted: false, checked: false, correct: null,
    cards: c.kind === 'bingo' ? bingoCards(c, people, random) : {}, marked: {}, called: [], currentCall: null, claims: {},
    faceUp: [], won: {}, deckMap, deck: c.kind === 'memory' ? shuffled(Object.keys(deckMap), random) : [],
    assignments: {}, cardIndex: 0, round: 0, answers: {}, details: {}, opinions: {}, found: {}, startedAt: null, endsAt: null,
  };
}

export const currentPerson = (s: ActivityState) => s.people[s.turn % Math.max(1, s.people.length)];
export const learnerCallVisibility = (c: ActivityConfig): 'none' | 'current' | 'list' =>
  c.settings.learnerCalls ?? (c.settings.showCalls ? 'current' : 'none');
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(a).size === a.length && a.every(id => b.includes(id));
const cardPair = (s: ActivityState,id: string) => s.deckMap?.[id]?.itemId ?? id.slice(0,-2);

// This transition runs against the canonical state, inside the live service's transaction.
// A client supplies intent, not replacement scores or another learner's responses.
export function transition(c: ActivityConfig, state: ActivityState, a: ActivityAction, actor: ActivityActor, now: number, random: () => number = Math.random): ActivityState {
  const member = state.people.some(p => p.id === actor.id);
  if (!actor.teacher && !member) throw new Error('Join this activity before playing.');
  const teacherOnly = () => { if (!actor.teacher) throw new Error('Your teacher controls this step.'); };
  const ownTurn = () => { if (!actor.teacher && currentPerson(state)?.id !== actor.id) throw new Error('Wait for your turn.'); };
  const running = () => { if (state.phase !== 'running') throw new Error('Wait for your teacher to start.'); };
  const itemExists = (id: string) => c.items.some(i => i.id === id);
  let s: ActivityState = structuredClone(state);
  const advance = () => {
    if (!s.people.length) return;
    for (let n = 0; n < s.people.length * 2; n++) {
      s.turn = (s.turn + 1) % s.people.length;
      const id = currentPerson(s)!.id;
      if (!s.skip[id]) break;
      delete s.skip[id];
    }
  };
  switch (a.type) {
    case 'start':
      teacherOnly();
      if (validateActivity(c).length) throw new Error(validateActivity(c)[0].message);
      if (state.phase !== 'ready') throw new Error('Reset the activity before starting again.');
      if (!s.people.length) throw new Error('Add learners before starting.');
      s.phase = 'running'; s.startedAt = now;
      if (['speaking', 'taboo'].includes(c.kind)) s.endsAt = now + (c.settings.seconds ?? 60) * 1000;
      if (c.kind === 'cue' && !Object.keys(s.assignments).length) {
        const items = shuffled(c.items, random);
        s.assignments = Object.fromEntries(s.people.map((p, n) => [p.id, [items[n % items.length].id]]));
      }
      if (c.kind === 'spot') s.assignments = Object.fromEntries(s.people.map((p, n) => [p.id, [String(n % 2)]]));
      break;
    case 'reset': teacherOnly(); s = initialActivity(c, s.people, random); break;
    case 'reveal': teacherOnly(); s.phase = 'revealed'; if(['strips','dominoes'].includes(c.kind)){s.order=c.items.map(i=>i.id);s.correct=true;s.checked=true;}if(c.kind==='memory')s.faceUp=[...s.deck];break;
    case 'end': teacherOnly(); s.phase = 'ended'; s.endsAt = null; break;
    case 'assign': {
      teacherOnly();
      if (c.kind !== 'cue') throw new Error('This activity does not use cue-card assignments.');
      for (const [id, cards] of Object.entries(a.assignments)) {
        if (!s.people.some(p => p.id === id) || !cards.every(itemExists)) throw new Error('Choose a learner and an available card.');
      }
      s.assignments = structuredClone(a.assignments); break;
    }
    case 'roll': {
      running();
      if (c.kind !== 'board') throw new Error('Use the controls for this activity.');
      // The next player's roll also ends the last turn, so nobody has to press a "Finish turn" button.
      if (s.die !== null) { const again = c.items[s.positions[currentPerson(s)!.id]]?.special === 'again'; s.die = null; if (!again) advance(); }
      if (!actor.teacher && currentPerson(s)?.id !== actor.id) throw new Error('Wait for your turn.');
      if (!Number.isInteger(a.die) || a.die < 1 || a.die > 6) throw new Error('Roll a six-sided die.');
      const who = currentPerson(s)!.id;
      const pos = Math.min(c.items.length - 1, (s.positions[who] ?? 0) + a.die);
      const item = c.items[pos]; s.positions[who] = pos; s.die = a.die;
      if (boardStyleOf(c.settings.boardStyle) === 'ladders') { const jump = boardJumps(c.items.length)[pos]; if (jump !== undefined) s.positions[who] = jump; }
      if (item.special === 'back') s.positions[who] = Math.max(0, pos - Math.max(1, item.move ?? 2));
      if (item.special === 'miss') s.skip[who] = true;
      if (pos === c.items.length - 1 || item.special === 'finish') { s.phase = 'ended'; s.scores[currentPerson(s)?.teamId ?? who] = 1; }
      break;
    }
    case 'nextTurn':
      running(); ownTurn();
      if (c.kind === 'board') {
        if (s.die === null) throw new Error('Roll the die first.');
        const again = c.items[s.positions[currentPerson(s)!.id]]?.special === 'again';
        s.die = null; if (!again) advance();
      } else throw new Error('Use the controls for this activity.');
      break;
    case 'call':
      teacherOnly(); running();
      if (c.kind !== 'bingo' || !itemExists(a.itemId) || s.called.includes(a.itemId)) throw new Error('Choose an item that has not been called.');
      s.called.push(a.itemId); s.currentCall = a.itemId; break;
    case 'mark': {
      running();
      if (c.kind !== 'bingo' || !s.cards[actor.id]?.includes(a.itemId) || a.itemId === '__free__') throw new Error('Choose a square on your card.');
      const marks = s.marked[actor.id] ?? []; s.marked[actor.id] = marks.includes(a.itemId) ? marks.filter(id => id !== a.itemId) : [...marks, a.itemId];
      delete s.claims[actor.id]; break;
    }
    case 'claim':
      running();
      if (c.kind !== 'bingo' || !s.cards[actor.id]) throw new Error('Choose your Bingo card first.');
      s.claims[actor.id] = bingoClaim(s.cards[actor.id], s.marked[actor.id] ?? [], s.called, c.settings.gridSize ?? 4, c.settings.winRule); break;
    case 'flip': {
      running(); ownTurn();
      if (c.kind !== 'memory' || !s.deck.includes(a.cardId) || s.won[cardPair(s,a.cardId)] || s.faceUp.includes(a.cardId) || s.faceUp.length === 2) throw new Error('Choose a face-down card.');
      s.faceUp.push(a.cardId);
      if (s.faceUp.length === 2 && cardPair(s,s.faceUp[0]) === cardPair(s,s.faceUp[1])) {
        const who = currentPerson(s)!; s.won[cardPair(s,a.cardId)] = who.id;
        const scoreId = who.teamId ?? who.id; s.scores[scoreId] = (s.scores[scoreId] ?? 0) + 1;
        s.faceUp = []; if (Object.keys(s.won).length === c.items.length) s.phase = 'ended';
      }
      break;
    }
    case 'settle': running(); ownTurn(); if (c.kind !== 'memory' || s.faceUp.length !== 2) throw new Error('Turn over two cards first.'); s.faceUp = []; advance(); break;
    case 'order':
      running();
      if (!['ranking', 'strips', 'dominoes'].includes(c.kind) || !sameIds(a.ids, c.items.map(i => i.id))) throw new Error('Keep every item in the list once.');
      s.order = [...a.ids]; s.agreed = []; s.submitted = false; s.checked = false; s.correct = null; break;
    case 'agree':
      running();
      if (c.kind !== 'ranking' || !member) throw new Error('Only this group can agree its ranking.');
      if (!s.agreed.includes(actor.id)) s.agreed.push(actor.id);
      s.submitted = s.people.every(p => s.agreed.includes(p.id)); break;
    case 'check':
      running();
      if (!['strips', 'dominoes'].includes(c.kind)) throw new Error('This activity has no order to check.');
      s.checked = true; s.correct = c.kind === 'dominoes' ? checkDominoes(c.items, s.order) : s.order.every((id, n) => id === c.items[n].id); break;
    case 'answer': {
      running();
      const item = c.items.find(i => i.id === a.itemId);
      if (!item || !['findSomeone', 'survey'].includes(c.kind)) throw new Error('Choose an available question.');
      if (c.kind === 'survey' && !item.options?.includes(a.value)) throw new Error('Choose one of the available answers.');
      if (c.kind === 'findSomeone') {
        if (!s.people.some(p => p.id === a.value) || a.value === actor.id) throw new Error('Choose a classmate.');
        if (c.settings.nameOnce && Object.entries(s.answers[actor.id] ?? {}).some(([id, value]) => id !== a.itemId && value === a.value)) throw new Error('Choose a name you have not used yet.');
      }
      s.answers[actor.id] = { ...s.answers[actor.id], [a.itemId]: a.value };
      if (a.detail !== undefined) s.details[actor.id] = { ...s.details[actor.id], [a.itemId]: a.detail.slice(0, 1000) };
      break;
    }
    case 'summary':
      running();
      if (c.kind !== 'survey' || !member || typeof a.text !== 'string') throw new Error('Write a summary of your survey.');
      s.summaries = {...s.summaries, [actor.id]: a.text.slice(0, 2500)}; break;
    case 'opinion':
      running();
      if (c.kind !== 'opinion' || !Number.isFinite(a.value) || a.value < 0 || a.value > 100) throw new Error('Choose a place on the line.');
      s.opinions[actor.id] = { value: a.value, reason: (a.reason ?? '').slice(0, 1000) }; break;
    case 'found': {
      running();
      if (c.kind !== 'spot' || !Number.isFinite(a.x) || !Number.isFinite(a.y) || a.x < 0 || a.x > 100 || a.y < 0 || a.y > 100) throw new Error('Choose a point inside your picture.');
      const hit = c.settings.differences?.find(d => Math.hypot(d.x - a.x, d.y - a.y) <= d.radius);
      if (hit) { const own = s.found[actor.id] ?? []; const points = {...s.foundPoints?.[actor.id]}; if (own.includes(hit.id)) delete points[hit.id]; else points[hit.id] = {x: a.x, y: a.y}; s.found[actor.id] = own.includes(hit.id) ? own.filter(id => id !== hit.id) : [...own, hit.id]; s.foundPoints = {...s.foundPoints, [actor.id]: points}; }
      break;
    }
    case 'gotIt': case 'skip': {
      running(); ownTurn();
      if (c.kind !== 'taboo' || (s.endsAt !== null && now >= s.endsAt)) throw new Error('This turn has finished.');
      if (a.type === 'gotIt' && c.settings.scoring !== false) { const who = currentPerson(s)!; const key = who.teamId ?? who.id; s.scores[key] = (s.scores[key] ?? 0) + 1; }
      s.cardIndex++; if (s.cardIndex >= c.items.length) s.phase = 'ended'; break;
    }
    case 'timerElapsed':
      running();
      if(c.kind!=='speaking'||c.settings.mode!=='groups'||s.people.length!==2||s.endsAt===null||now<s.endsAt)throw new Error('Wait for this speaking turn to finish.');
      advance();s.round++;s.startedAt=now;s.endsAt=now+(c.settings.seconds??60)*1000;break;
    case 'swap':
      teacherOnly();
      if (!['speaking', 'taboo'].includes(c.kind) || !['running', 'ended'].includes(s.phase)) throw new Error('Start the speaking turns first.');
      advance(); s.round++; s.phase = 'running'; s.startedAt = now; s.endsAt = now + (c.settings.seconds ?? 60) * 1000; break;
    default:
      throw new Error('Choose an available action.');
  }
  s.seq = state.seq + 1;
  return s;
}

// Server-side projection: never send another learner's card or an unrevealed opinion.
export function stateForLearner(c: ActivityConfig, s: ActivityState, learnerId: string): ActivityState {
  const out = structuredClone(s);
  out.actorRevisions = s.actorRevisions?.[learnerId] !== undefined ? {[learnerId]: s.actorRevisions[learnerId]} : {};
  out.deckMap = Object.fromEntries(Object.entries(s.deckMap??{}).filter(([id,entry])=>s.faceUp.includes(id)||s.won[entry.itemId]));
  out.cards = s.cards[learnerId] ? { [learnerId]: s.cards[learnerId] } : {};
  out.marked = s.marked[learnerId] ? { [learnerId]: s.marked[learnerId] } : {};
  out.assignments = s.assignments[learnerId] ? { [learnerId]: s.assignments[learnerId] } : {};
  out.answers = s.answers[learnerId] ? { [learnerId]: s.answers[learnerId] } : {};
  out.details = s.details[learnerId] ? { [learnerId]: s.details[learnerId] } : {};
  out.claims = s.claims[learnerId] ? { [learnerId]: s.claims[learnerId] } : {};
  out.summaries = s.summaries?.[learnerId] ? {[learnerId]: s.summaries[learnerId]} : {};
  out.foundPoints = s.foundPoints?.[learnerId] ? {[learnerId]: s.foundPoints[learnerId]} : {};
  out.found = s.found[learnerId] ? { [learnerId]: s.found[learnerId] } : {};
  if (c.kind === 'survey') out.surveyResults = Object.fromEntries(c.items.map(item => [item.id, surveyCounts(s, item.id)]));
  if (c.kind === 'opinion' && s.phase !== 'revealed') out.opinions = s.opinions[learnerId] ? { [learnerId]: s.opinions[learnerId] } : {};
  else if (c.kind === 'opinion' && c.settings.showNames === false) out.opinions = Object.fromEntries(Object.values(s.opinions).map((v, n) => [`anonymous-${n}`, v]));
  if (c.kind === 'bingo') {
    const visibility = learnerCallVisibility(c);
    out.currentCall = visibility === 'current' ? s.currentCall : null;
    out.called = visibility === 'list' ? [...s.called] : visibility === 'current' && s.currentCall ? [s.currentCall] : [];
  }
  return out;
}

export function configForLearner(c: ActivityConfig, s: ActivityState, learnerId: string): ActivityConfig {
  const out = structuredClone(c);
  out.items=out.items.map(item=>({...item,...(item.content?{content:splitKey({type:'doc',content:item.content}).content.content}:{})}));
  if (c.kind === 'bingo') {
    const visibility = learnerCallVisibility(c);
    const visibleCalls = visibility === 'list' ? s.called : visibility === 'current' && s.currentCall ? [s.currentCall] : [];
    const visibleIds = new Set([...(s.cards[learnerId] ?? []), ...visibleCalls]);
    const callIds = new Set(visibleCalls);
    out.items = out.items.filter(item => visibleIds.has(item.id)).map(item => ({ ...item, call: callIds.has(item.id) ? item.call : undefined }));
  }
  if (c.kind==='memory') {
    const visible=Object.entries(s.deckMap??{}).filter(([id,entry])=>s.faceUp.includes(id)||s.won[entry.itemId]);
    if(s.deckMap)out.items=out.items.filter(item=>visible.some(([,entry])=>entry.itemId===item.id)).map(item=>{
      const a=visible.some(([,entry])=>entry.itemId===item.id&&entry.side==='a'),b=visible.some(([,entry])=>entry.itemId===item.id&&entry.side==='b');
      return {...item,...(!a?{title:'',content:[],picture:undefined}:{}),...(!b?{match:'',matchPicture:undefined}:{})};
    });
  }
  if (c.kind==='dominoes') {
    const tiles=dominoTiles(c.items);
    out.items=s.order.map(id=>out.items.find(item=>item.id===id)!).filter(Boolean).map(item=>{const tile=tiles.find(t=>t.id===item.id)!;return {...item,match:undefined,matchPicture:undefined,dominoRight:{text:tile.right,...(tile.rightPicture?{picture:tile.rightPicture}:{})}};});
  }
  if (c.kind==='strips'&&s.phase!=='revealed') out.items=s.order.map(id=>out.items.find(item=>item.id===id)!).filter(Boolean);
  if (s.phase === 'revealed') return out;
  if (c.kind === 'cue') out.items = out.items.filter(i => s.assignments[learnerId]?.includes(i.id));
  if (c.kind === 'taboo') out.items = currentPerson(s)?.id === learnerId ? out.items.slice(s.cardIndex, s.cardIndex + 1) : [];
  if (c.kind === 'spot') {
    const version = Number(s.assignments[learnerId]?.[0]);
    out.items = Number.isInteger(version) ? out.items.slice(version,version+1) : [];
    out.settings.versions = Number.isInteger(version) && out.settings.versions?.[version] ? [out.settings.versions[version]] : [];
    out.settings.differences = [];
  }
  return out;
}

export function surveyCounts(s: ActivityState, itemId: string): Record<string, number> {
  if (s.surveyResults?.[itemId]) return s.surveyResults[itemId];
  return Object.values(s.answers).reduce<Record<string, number>>((out, answers) => { const a = answers[itemId]; if (a) out[a] = (out[a] ?? 0) + 1; return out; }, {});
}

// Who rolls next on a board: the current player before they roll, then the next player (or the same one
// after "Roll again"). Missed turns are skipped, as in the reducer.
export function nextRoller(c: ActivityConfig, state: ActivityState): string | undefined {
  if (state.die === null) return currentPerson(state)?.id;
  const t = structuredClone(state);
  if (c.items[t.positions[currentPerson(t)?.id ?? ''] ?? 0]?.special !== 'again' && t.people.length) {
    for (let n = 0; n < t.people.length * 2; n++) { t.turn = (t.turn + 1) % t.people.length; const id = currentPerson(t)!.id; if (!t.skip[id]) break; delete t.skip[id]; }
  }
  return currentPerson(t)?.id;
}

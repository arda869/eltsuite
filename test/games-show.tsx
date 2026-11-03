// The game show on its own, for tests and screenshots: /test/games-show.html?theme=space&timer=15
// Query: theme, timer (seconds), lock=0, lifelines=0, title, set=mixed|long|text|task, live=1 (a
// controller and a spectator sharing one board through the real server checks).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import { GamePlayer } from '../src/games/GamePlayer';
import type { GameConfig, GameTheme } from '../src/games/model';
import { cleanState } from '../functions/games/state.js';
import { scoreMove } from '../functions/games/scoring.js';

const q = new URLSearchParams(location.search);
const theme = (q.get('theme') || 'wood') as GameTheme;
const town = [
  { id: 'r1', prompt: 'Where do you borrow books?', answer: 'library', choices: ['bakery', 'garage', 'airport'], note: 'We borrow books from a library. A bookshop sells them.' },
  { id: 'r2', prompt: 'You buy bread here.', answer: 'bakery', choices: ['library', 'museum', 'station'] },
  { id: 'r3', prompt: 'Trains stop here.', answer: 'station', choices: ['school', 'bakery', 'zoo'] },
  { id: 'r4', prompt: 'You see animals here.', answer: 'zoo', choices: ['bank', 'station', 'park'] },
  { id: 'r5', prompt: 'You keep money here.', answer: 'bank', choices: ['zoo', 'hotel', 'library'] },
  { id: 'r6', prompt: 'You sleep here on holiday.', answer: 'hotel', choices: ['bank', 'office', 'zoo'] },
];
const sets: Record<string, GameConfig['rounds']> = {
  town,
  long: [{ id: 'l1', prompt: 'Read the message and choose the best reply. “Hi Sam, I’m so sorry but I can’t make it to the cinema tonight. My little brother is ill and my parents are both working late, so I have to stay at home and look after him. Could we go on Saturday afternoon instead? I’ll pay for the popcorn to make up for it. Let me know what you think. Jo”', answer: 'No problem. Saturday’s fine. I hope your brother feels better soon.', choices: ['Why didn’t you tell me earlier? I already bought the tickets and now they’re wasted.', 'OK. Which film do you want to see tonight? I can be there at seven.', 'I don’t like popcorn, so you don’t need to pay for it.'] }, ...town.slice(0, 2)],
  text: [{ id: 't1', prompt: 'Complete the word: a place where you catch a plane. air_ _ _ _', answer: 'airport', choices: [] }, ...town.slice(0, 1)],
  task: [{ id: 'k1', prompt: 'Complete the sentence.', answer: 'library', choices: [], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A place to borrow books is a ' }, { type: 'gap', attrs: { id: 'g', answers: ['library'] } }] }] } }, ...town.slice(1, 2)],
};
const game: GameConfig = { version: 1, type: 'show', theme, sound: q.get('sound') === '1', rounds: sets[q.get('set') || 'town'] || town, showTimer: Number(q.get('timer') || 0), showLock: q.get('lock') !== '0', showLifelines: q.get('lifelines') !== '0' };
const title = q.get('title') || 'Places in town';

function Live() {
  const [board, setBoard] = useState<{ state: Record<string, any> | null; awards: Record<string, number> }>({ state: null, awards: {} });
  const [writes, setWrites] = useState(0);
  return <>
    <output aria-label="Writes">{writes}</output>
    <section aria-label="Controller"><GamePlayer game={game} title={title} remote={board.state} onState={s => { setWrites(n => n + 1); setBoard(b => { const checked = scoreMove(game, cleanState(s, game.rounds.length), b.state || {}, b.awards, Date.now()); return { state: checked.state, awards: checked.awards }; }); }} /></section>
    <section aria-label="Spectator"><GamePlayer game={game} title={title} remote={board.state} readOnly /></section>
  </>;
}
createRoot(document.getElementById('root')!).render(<div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>{q.get('live') === '1' ? <Live /> : <GamePlayer game={game} title={title} />}</div>);

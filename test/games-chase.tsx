// Shark escape and Taxi town on their own, for tests and screenshots:
// /test/games-chase.html?type=taxi&theme=space&seconds=20&live=1
// Query: type=shark|taxi, theme, seconds (20|30|60|120), title, live=1 (a controller and a
// spectator sharing one board through the real server checks).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import { GamePlayer } from '../src/games/GamePlayer';
import type { GameConfig, GameTheme, GameType } from '../src/games/model';
import { cleanState } from '../functions/games/state.js';
import { scoreMove } from '../functions/games/scoring.js';

const q = new URLSearchParams(location.search);
const type = (q.get('type') === 'taxi' ? 'taxi' : 'shark') as GameType;
const theme = (q.get('theme') || 'wood') as GameTheme;
const rounds = [
  { id: 'r1', prompt: 'Where do you borrow books?', answer: 'library', choices: ['bakery', 'garage', 'airport'] },
  { id: 'r2', prompt: 'You buy bread here.', answer: 'bakery', choices: ['library', 'museum'] },
  { id: 'r3', prompt: 'Trains stop here.', answer: 'station', choices: ['school', 'bakery', 'zoo'] },
  { id: 'r4', prompt: 'You see animals here.', answer: 'zoo', choices: ['bank'] },
];
const game: GameConfig = { version: 1, type, theme, sound: q.get('sound') === '1', rounds, roundSeconds: Number(q.get('seconds') || 30) };
const title = q.get('title') || (type === 'taxi' ? 'Places in town' : 'Island hopping');

function Live() {
  const [board, setBoard] = useState<{ state: Record<string, any> | null; awards: Record<string, number> }>(() => q.has('resume') ? {
    state: { round: 1, score: 10, feedback: null, finished: false, arcade: { phase: 'ready' } },
    awards: { 0: 10 },
  } : { state: null, awards: {} });
  const [writes, setWrites] = useState(0);
  return <>
    <output aria-label="Writes">{writes}</output>
    <section aria-label="Controller"><GamePlayer game={game} title={title} remote={board.state} onState={s => { setWrites(n => n + 1); setBoard(b => { const checked = scoreMove(game, cleanState(s, game.rounds.length), b.state || {}, b.awards, Date.now()); return { state: checked.state, awards: checked.awards }; }); }} /></section>
    <section aria-label="Spectator"><GamePlayer game={game} title={title} remote={board.state} readOnly onState={() => { throw Error('A spectator tried to write to the board.'); }} /></section>
  </>;
}
createRoot(document.getElementById('root')!).render(<div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>{q.get('live') === '1' ? <Live /> : <GamePlayer game={game} title={title} />}</div>);

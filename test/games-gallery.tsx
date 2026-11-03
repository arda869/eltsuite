// One game, full size, for screenshots: /test/games-gallery.html?type=maze&theme=space
import '../src/styles.css';
import '../src/cohesion.css';
import { createRoot } from 'react-dom/client';
import { GamePlayer } from '../src/games/GamePlayer';
import type { GameConfig, GameTheme, GameType } from '../src/games/model';
const q = new URLSearchParams(location.search);
const type = (q.get('type') || 'show') as GameType;
const theme = (q.get('theme') || 'wood') as GameTheme;
const rounds = [
  { id: 'r1', prompt: 'Where do you borrow books?', answer: 'library', choices: ['bakery', 'garage', 'airport'] },
  { id: 'r2', prompt: 'You buy bread here.', answer: 'bakery', choices: ['library', 'museum', 'station'] },
  { id: 'r3', prompt: 'Trains stop here.', answer: 'station', choices: ['school', 'bakery', 'zoo'] },
  { id: 'r4', prompt: 'You see animals here.', answer: 'zoo', choices: ['bank', 'station', 'park'] },
  { id: 'r5', prompt: 'You keep money here.', answer: 'bank', choices: ['zoo', 'hotel', 'library'] },
  { id: 'r6', prompt: 'You sleep here on holiday.', answer: 'hotel', choices: ['bank', 'office', 'zoo'] },
];
const game: GameConfig = { version: 1, type, theme, sound: true, rounds };
createRoot(document.getElementById('root')!).render(<div style={{ padding: 16 }}><GamePlayer game={game} /></div>);

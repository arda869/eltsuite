// The Games home: pick a game, make it, bring it to class. Rendered by AppFiles above the file list.
import { useId, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { newSharedDoc } from '../lib/sharedDocs';
import { blankGame, GAME_TYPES, THEMES, type GameType } from './model';
import { GAME_LOOK, GameMark } from './home/GameArt';
import './games.css';
import './home/home.css';

type Group = { id: string; name: string; blurb: string; games: GameType[] };
const GROUPS: Group[] = [
  { id: 'clock', name: 'Beat the clock', blurb: 'A timer runs. Answer in time and the story moves on.', games: ['shark', 'taxi', 'drive', 'blocks'] },
  { id: 'show', name: 'Quiz show', blurb: 'Whole-class rounds with scores, stakes and reveals.', games: ['show', 'wager', 'auction', 'targets'] },
  { id: 'aim', name: 'Aim and act', blurb: 'Choose an answer, then make something happen.', games: ['pinball', 'slice', 'moles', 'maze'] },
  { id: 'words', name: 'Words and letters', blurb: 'Spelling, recall and vocabulary in close-up.', games: ['hangman', 'search', 'pairs', 'cloud'] },
];
const FEATURED: GameType[] = ['shark', 'taxi', 'show'];
const FEATURE_NOTE: Partial<Record<GameType, string>> = {
  shark: 'Row from island to island. Every right answer puts water between you and the shark.',
  taxi: 'Drive a passenger across town. Steer round cones and answer before the fare runs out.',
  show: 'Choose an answer, lock it in and compare scores. Add a question or an inline activity.',
};
const STEPS = [
  { title: 'Pick a game', text: 'Choose a game that fits the language you want to practise.' },
  { title: 'Add questions', text: 'Type them, reuse a flashcard set, or ask AI for a first draft to edit.' },
  { title: 'Play in class', text: 'Open it on the board, share a link so learners play along, or print it.' },
];
const byId = Object.fromEntries(GAME_TYPES.map(g => [g.id, g])) as Record<GameType, typeof GAME_TYPES[number]>;

export function GameGallery() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<GameType | ''>('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const headingId = useId();
  const groups = useMemo(() => filter === 'all' ? GROUPS : GROUPS.filter(g => g.id === filter), [filter]);

  const create = async (type: GameType) => {
    if (!user || busy) return;
    const w = window.open('about:blank', '_blank');
    setBusy(type); setError('');
    try {
      const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'game');
      await setDoc(doc(db, 'sharedDocs', id, 'game', 'main'), { ...blankGame(), type });
      if (w) w.location.href = '/doc/' + id; else setError('Your game was saved. Open it from the file list below.');
    } catch {
      w?.close();
      setError('We couldn’t make that game just now. Check your connection and try again.');
    } finally { setBusy(''); }
  };

  const card = (type: GameType, big = false) => {
    const g = byId[type], look = GAME_LOOK[type];
    const style = { '--ga-bg': look.bg, '--ga-a': look.a, '--ga-b': look.b, '--ga-ink': look.ink } as React.CSSProperties;
    return <button type="button" key={type} className={big ? 'gh-card gh-card-big' : 'gh-card'} style={style} disabled={!!busy} aria-busy={busy === type} data-game={type} onClick={() => void create(type)}>
      <span className="gh-art" aria-hidden="true"><GameMark type={type} /></span>
      <span className="gh-text">
        <strong>{g.name}</strong>
        <span className="gh-about">{big ? FEATURE_NOTE[type] || g.about : g.about}</span>
        <span className="gh-cta">{busy === type ? 'Making your game…' : 'Make this game'}</span>
      </span>
    </button>;
  };

  return <section className="games-home" aria-labelledby={headingId}>
    <header className="gh-hero">
      <div className="gh-hero-text">
        <span className="gh-kicker">Make room for play</span>
        <h2 id={headingId}>A little competition.<br />A lot of language.</h2>
        <p>Choose from sixteen games, add questions for your learners and play together in class.</p>
      </div>
      <ol className="gh-steps" aria-label="How it works">
        {STEPS.map((s, i) => <li key={s.title}><i>{i + 1}</i><strong>{s.title}</strong><span>{s.text}</span></li>)}
      </ol>
    </header>

    {error && <p className="gh-error" role="alert">{error}</p>}

    <section className="gh-featured" aria-label="Featured games">
      <div className="gh-section-head"><h3>Start here</h3><p>Favourites that work for almost any class.</p></div>
      <div className="gh-grid gh-grid-featured">{FEATURED.map(t => card(t, true))}</div>
    </section>

    <section className="gh-all" aria-label="All games">
      <div className="gh-section-head gh-section-head-row">
        <h3>All games</h3>
        <div className="gh-filter" role="group" aria-label="Show">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {GROUPS.map(g => <button type="button" key={g.id} aria-pressed={filter === g.id} onClick={() => setFilter(g.id)}>{g.name}</button>)}
        </div>
      </div>
      {groups.map(g => <div className="gh-group" key={g.id}>
        <div className="gh-group-head"><h4>{g.name}</h4><p>{g.blurb}</p></div>
        <div className="gh-grid">{g.games.map(t => card(t))}</div>
      </div>)}
    </section>

    <footer className="gh-foot">
      <ul className="gh-themes" aria-label="Looks">{THEMES.map(t => <li key={t.id} data-theme-id={t.id}><i aria-hidden="true" /><span>{t.name}</span></li>)}</ul>
      <p>Five looks for every game. Change the look any time in the game’s settings.</p>
    </footer>
  </section>;
}

// A game's big screen: the lobby with the join code, then each question with a countdown, a
// timer and answers coming in, the reveal, the leaderboard and, at the end, the podium. The host runs
// it with one button (or the space bar); everything else happens on its own.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { TaskRenderer } from '../components/TaskRenderer';
import { learnOrigin } from '../lib/site';
import { Backdrop, Confetti, Flame, Medal, Shape, TimerRing, answerStyle, fmt } from './Stage';
import { AnswerPad, type Skin } from './Skins';
import { joinPath, leaders, quizApi, useClock, useLive, type LivePlayer, type LiveState } from './live';
import { musicState, playMusic, preloadMusic, setMusicMuted, stopMusic, unlockMusic } from './music';
import { playSfx, setSfxOn, warmSfx } from './sfx';
import './quiz.css';

export function HostPage() {
  const { runId = '' } = useParams();
  const live = useLive(runId);
  if (live === null) return <Backdrop className="qz-host"><p className="qz-loading" role="status">One moment…</p></Backdrop>;
  if (live === false) return <Backdrop className="qz-host"><div className="qz-center"><h1 className="qz-big">This game isn’t here any more.</h1><a className="qz-btn" href="/games">Go to your gamezes</a></div></Backdrop>;
  return <Host runId={runId} live={live} />;
}

function Host({ runId, live }: { runId: string; live: LiveState }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(!musicState().muted);
  const [unlocked, setUnlocked] = useState(false);
  const now = useClock(100, true);
  const phase = live.phase;
  const q = live.q;
  const players = live.players || {};
  const count = Object.keys(players).length;
  const answered = live.answered?.[String(live.slide)] || 0;
  const counting = phase === 'question' && !!live.startsAt && now < live.startsAt;
  const open = phase === 'question' && !counting;
  const left = open && live.endsAt ? Math.max(0, (live.endsAt - now) / 1000) : 0;
  const last = live.slide + 1 >= live.total;

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      setError('');
      try {
        await quizApi(action, { runId, ...extra });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [runId],
  );

  // Sound needs one click on the page first (a browser rule).
  useEffect(() => {
    preloadMusic();
    const first = () => {
      unlockMusic();
      warmSfx();
      setUnlocked(true);
    };
    window.addEventListener('pointerdown', first, { once: true });
    window.addEventListener('keydown', first, { once: true });
    return () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      stopMusic(0.3);
    };
  }, []);
  useEffect(() => {
    setMusicMuted(!sound);
    setSfxOn(sound);
  }, [sound]);

  // The music follows the game.
  const hurry = open && left > 0 && left <= 5;
  useEffect(() => {
    if (!unlocked) return;
    if (phase === 'lobby' || phase === 'self') void playMusic('lobby');
    else if (counting) stopMusic(0.4);
    else if (open && left > 0) void playMusic(hurry ? 'hurry' : 'question', hurry ? 0.15 : 0.4);
    else if (phase === 'reveal') stopMusic(0.25);
    else if (phase === 'board') void playMusic('leaderboard');
    else if (phase === 'podium') void playMusic('podium', 0.1);
    else if (phase === 'ended') stopMusic(1);
  }, [unlocked, phase, counting, open, hurry, left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown beats, the clock's last seconds, and the moment time runs out.
  const beat = counting && live.startsAt ? Math.ceil((live.startsAt - now) / 1000) : open ? -1 : 0;
  const lastBeat = useRef(0);
  useEffect(() => {
    if (beat === lastBeat.current) return;
    lastBeat.current = beat;
    if (beat >= 1 && beat <= 3) playSfx('count');
    else if (beat === -1) playSfx('go');
  }, [beat]);
  const lastTick = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(left);
    if (!open || s === lastTick.current) return;
    lastTick.current = s;
    if (s <= 5 && s >= 1) playSfx('tick');
  }, [left, open]);

  // Close the question when time is up or everyone has answered. The timer isn't cleared when the
  // clock ticks on, or the question would never close; the ref makes sure it closes once.
  const closing = useRef(-1);
  useEffect(() => {
    if (phase !== 'question' || counting || closing.current === live.slide) return;
    const everyone = count > 0 && answered >= count;
    if (left > 0 && !everyone) return;
    closing.current = live.slide;
    if (left <= 0) playSfx('timeup');
    setTimeout(() => void act('close'), everyone ? 700 : 300);
  }, [phase, counting, left, answered, count, live.slide, act]);

  // Joins pop in the lobby.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const ids = Object.keys(players);
    const fresh = ids.filter((id) => !seen.current.has(id));
    ids.forEach((id) => seen.current.add(id));
    if (phase === 'lobby' && fresh.length && seen.current.size > fresh.length) playSfx('join');
  }, [players, phase]);
  useEffect(() => {
    if (phase === 'reveal') playSfx('reveal');
  }, [phase, live.slide]);

  const nextLabel =
    phase === 'self' ? 'End and see results' : phase === 'lobby' ? 'Start the game' : phase === 'question' ? (counting ? '' : 'Show the answer') : phase === 'reveal' ? (last ? 'Show the winners' : 'Leaderboard') : phase === 'board' ? 'Next question' : phase === 'podium' ? 'End and see results' : '';
  const next = useCallback(() => {
    if (busy) return;
    if (phase === 'lobby' || phase === 'board') void act('next');
    else if (phase === 'question' && !counting) {
      closing.current = live.slide;
      void act('close');
    } else if (phase === 'reveal') void act(last ? 'next' : 'board');
    else if (phase === 'podium' || phase === 'self') void act('end').then(() => nav('/game-results/' + runId));
  }, [busy, phase, counting, last, act, nav, runId, live.slide]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable]')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [next]);

  const end = async () => {
    if (!confirm('End this game? Players can’t join or answer after this. Everyone’s answers are kept.')) return;
    await act('end');
    nav('/game-results/' + runId);
  };
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

  return (
    <Backdrop className={'qz-host qz-phase-' + phase + (counting ? ' qz-counting' : '')}>
      <header className="qz-top">
        <span className="qz-brand">ELT Suite <b>Games</b></span>
        {phase !== 'lobby' && phase !== 'ended' && (
          <span className="qz-joinline">
            Join at <b>{learnOrigin().replace(/^https?:\/\//, '')}/game</b> · code <b className="qz-code-sm">{spaced(live.code)}</b>
          </span>
        )}
        <span className="qz-tools">
          <span className="qz-count" title="Players">
            <PeopleIcon /> {count}
          </span>
          <button type="button" className="qz-tool" aria-pressed={sound} onClick={() => setSound((v) => !v)} title={sound ? 'Turn sound off' : 'Turn sound on'}>
            {sound ? 'Sound on' : 'Sound off'}
          </button>
          <button type="button" className="qz-tool" onClick={full} title="Full screen">
            Full screen
          </button>
          {phase !== 'ended' && (
            <button type="button" className="qz-tool" onClick={() => void end()}>
              End game
            </button>
          )}
        </span>
      </header>
      {!unlocked && phase !== 'ended' && <p className="qz-unlock">Click anywhere to turn on the music.</p>}
      <main className="qz-main">
        {live.mode === 'self' && <SelfHost live={live} count={count} act={act} />}
        {phase === 'lobby' && <Lobby live={live} count={count} act={act} />}
        {counting && <Countdown n={beat} index={live.slide} total={live.total} poll={!!q?.poll} points={q?.points ?? 1} />}
        {open && q && <Question q={q} left={left} answered={answered} count={count} />}
        {phase === 'reveal' && q && live.reveal && <Reveal q={q} live={live} />}
        {phase === 'board' && <Board players={players} index={live.slide} total={live.total} />}
        {phase === 'podium' && <Podium players={players} />}
        {phase === 'ended' && (
          <div className="qz-center">
            <h1 className="qz-big">This game has finished.</h1>
            <a className="qz-btn" href={'/game-results/' + runId}>
              See the results
            </a>
          </div>
        )}
      </main>
      <footer className="qz-bottom">
        {error && (
          <p className="qz-error" role="alert">
            {error}
          </p>
        )}
        {nextLabel && (
          <button type="button" className="qz-btn qz-next" disabled={busy || (phase === 'lobby' && count === 0)} onClick={next}>
            {nextLabel}
          </button>
        )}
        {phase === 'lobby' && count === 0 && <span className="qz-hint">The game can start when someone has joined.</span>}
        {phase !== 'lobby' && phase !== 'ended' && <span className="qz-hint">Space bar: next</span>}
      </footer>
    </Backdrop>
  );
}

const spaced = (code: string) => (code || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="4" fill="currentColor" />
      <path d="M1 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor" />
      <circle cx="18" cy="9" r="3" fill="currentColor" opacity=".6" />
      <path d="M17 14c3.5 0 6 2 6 6h-4" fill="currentColor" opacity=".6" />
    </svg>
  );
}

function Lobby({ live, count, act, compact }: { live: LiveState; count: number; act: (a: string, x?: Record<string, unknown>) => Promise<void>; compact?: boolean }) {
  const [qr, setQr] = useState('');
  const link = learnOrigin() + joinPath(live.code);
  useEffect(() => {
    void QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: '#1a1033', light: '#ffffff' } }).then(setQr);
  }, [link]);
  const list = Object.entries(live.players || {}).sort((a, b) => a[1].n.localeCompare(b[1].n));
  return (
    <div className="qz-lobby">
      <section className="qz-join-card">
        <div className="qz-join-text">
          <p className="qz-kicker">Join on your phone</p>
          <p className="qz-join-url">{learnOrigin().replace(/^https?:\/\//, '')}/game</p>
          <p className="qz-kicker">Game code</p>
          <p className="qz-code" aria-label={'Game code ' + live.code.split('').join(' ')}>
            {spaced(live.code)}
          </p>
        </div>
        {qr && <img className="qz-qr" src={qr} alt="Scan to join" width={180} height={180} />}
      </section>
      <h1 className="qz-title">{live.title}</h1>
      {!compact && <div className="qz-lobby-bar">
        <span className="qz-players-count">
          <b>{count}</b> {count === 1 ? 'player' : 'players'}
        </span>
        {live.guests && (
          <label className="qz-switch">
            <input type="checkbox" checked={!!live.locked} onChange={(e) => void act('lock', { locked: e.target.checked })} /> Close to new players
          </label>
        )}
      </div>}
      {!compact && <ul className="qz-names" aria-live="polite">
        {list.length === 0 && <li className="qz-waiting">Waiting for players…</li>}
        {list.map(([id, p]) => (
          <li key={id} className="qz-name">
            {p.n}
            <button type="button" className="qz-kick" aria-label={`Remove ${p.n}`} title={`Remove ${p.n}`} onClick={() => confirm(`Remove ${p.n} from the game?`) && void act('kick', { pid: id })}>
              ×
            </button>
          </li>
        ))}
      </ul>}
    </div>
  );
}

function Countdown({ n, index, total, poll, points }: { n: number; index: number; total: number; poll: boolean; points: number }) {
  return (
    <div className="qz-countdown">
      <p className="qz-kicker">
        Question {index + 1} of {total}
        {poll ? ' · Poll' : points === 2 ? ' · Double points' : points === 0 ? ' · No points' : ''}
      </p>
      <div className="qz-count-num" key={n}>
        {Math.max(1, n)}
      </div>
    </div>
  );
}

function Question({ q, left, answered, count }: { q: NonNullable<LiveState['q']>; left: number; answered: number; count: number }) {
  const prompt = q.kind === 'choice' ? q.prompt : '';
  return (
    <div className="qz-question">
      <div className="qz-panel">
        <p className="qz-kicker">
          Question {q.index + 1} of {q.total}
          {q.poll ? ' · Poll' : q.points === 2 ? ' · Double points' : q.points === 0 ? ' · No points' : ''}
        </p>
        {q.kind === 'choice' && q.lead && <div className="qz-lead"><TaskRenderer content={q.lead} responses={{}} disabled /></div>}
        {prompt ? <h1 className={'qz-prompt ' + size(prompt)}>{prompt}</h1> : <div className="qz-task"><TaskRenderer content={q.content || null} responses={{}} disabled /></div>}
        {q.multi && <p className="qz-sub">Choose every right answer.</p>}
      </div>
      <div className="qz-mid">
        <TimerRing left={left} total={q.seconds} size={150} />
        <div className="qz-answered">
          <b>{answered}</b>
          <span>{answered === 1 ? 'answer' : 'answers'}{count ? ` of ${count}` : ''}</span>
        </div>
      </div>
      {q.kind === 'choice' && q.options ? (
        <div className={'qz-pad skin-' + (q.skin || 'cards')}>
          <AnswerPad key={q.index} skin={(q.skin as Skin) || 'cards'} options={q.options} display big />
        </div>
      ) : (
        <p className="qz-phone-hint">Answer on your phone or tablet.</p>
      )}
    </div>
  );
}

const size = (t: string) => (t.length <= 50 ? 'xl' : t.length <= 110 ? 'lg' : t.length <= 200 ? 'md' : 'sm');

function Reveal({ q, live }: { q: NonNullable<LiveState['q']>; live: LiveState }) {
  const r = live.reveal!;
  const correct = new Set(r.correct || []);
  const counts = r.counts || [];
  const most = Math.max(1, ...counts, 1);
  const note = Object.values(r.key || {}).map((k) => k.feedback).filter(Boolean)[0];
  const scored = r.right + r.partly + r.wrong;
  return (
    <div className="qz-reveal">
      <div className="qz-panel">
        <p className="qz-kicker">
          Question {q.index + 1} of {q.total}
        </p>
        {q.kind === 'choice' ? <h1 className={'qz-prompt ' + size(q.prompt || '')}>{q.prompt}</h1> : <div className="qz-task"><TaskRenderer content={q.content || null} responses={{}} revealed={r.key} disabled /></div>}
        {note && <p className="qz-note">{note}</p>}
      </div>
      {q.kind === 'choice' && q.options ? (
        <>
          <div className="qz-bars" role="img" aria-label={q.options.map((o, i) => `${o}: ${counts[i] || 0}${correct.has(i) ? ', right' : ''}`).join('; ')}>
            {q.options.map((_, i) => (
              <div key={i} className={'qz-bar' + (q.poll || correct.has(i) ? ' right' : ' dim')} style={answerStyle(i)}>
                <span className="qz-bar-n">{counts[i] || 0}</span>
                <span className="qz-bar-fill" style={{ height: `${Math.max(4, ((counts[i] || 0) / most) * 100)}%` }} />
                <span className="qz-bar-foot">
                  <Shape i={i} size={22} />
                  {!q.poll && correct.has(i) && <Tick />}
                </span>
              </div>
            ))}
          </div>
          <div className={'qz-tiles n' + q.options.length}>
            {q.options.map((o, i) => (
              <div key={i} className={'qz-tile' + (q.poll || correct.has(i) ? ' right' : ' dim')} style={answerStyle(i)}>
                <Shape i={i} size={36} />
                <span className="qz-tile-text">{o}</span>
                {!q.poll && correct.has(i) && <Tick />}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="qz-split">
          <Stat n={r.right} label="Right" tone="right" total={scored} />
          <Stat n={r.partly} label="Partly right" tone="partly" total={scored} />
          <Stat n={r.wrong} label="Not right" tone="wrong" total={scored} />
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone, total }: { n: number; label: string; tone: string; total: number }) {
  return (
    <div className={'qz-stat ' + tone}>
      <b>{n}</b>
      <span>{label}</span>
      <i style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
    </div>
  );
}

function Tick() {
  return (
    <svg className="qz-tick" width="34" height="34" viewBox="0 0 24 24" aria-label="Right answer">
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="#2e9b5c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Board({ players, index, total }: { players: Record<string, LivePlayer>; index: number; total: number }) {
  const top = leaders(players).slice(0, 5);
  const best = Math.max(1, top[0]?.s || 1);
  const prev = useMemo(() => new Map(leaders(Object.fromEntries(Object.entries(players).map(([k, p]) => [k, { ...p, s: (p.s || 0) - (p.g || 0) }]))).map((p, i) => [p.id, i + 1])), [players]);
  useEffect(() => {
    playSfx('place');
  }, []);
  return (
    <div className="qz-board">
      <h1 className="qz-title">Leaderboard</h1>
      <p className="qz-kicker">
        After question {index + 1} of {total}
      </p>
      <ol className="qz-leaders">
        {top.map((p, i) => {
          const was = prev.get(p.id) || i + 1;
          return (
            <li key={p.id} className="qz-leader" style={{ ['--i' as string]: i }}>
              <span className="qz-place">{i + 1}</span>
              <span className="qz-leader-name">
                {p.n}
                {(p.k || 0) >= 2 && (
                  <span className="qz-streak" title={`${p.k} right in a row`}>
                    <Flame /> {p.k}
                  </span>
                )}
                {was > i + 1 && <span className="qz-up">up {was - (i + 1)}</span>}
              </span>
              <span className="qz-leader-bar" style={{ width: `${Math.max(6, ((p.s || 0) / best) * 100)}%` }} />
              <span className="qz-leader-score">
                {fmt(p.s || 0)}
                {!!p.g && <small>+{fmt(p.g)}</small>}
              </span>
            </li>
          );
        })}
      </ol>
      {top.length === 0 && <p className="qz-waiting">No scores yet.</p>}
    </div>
  );
}

function Podium({ players }: { players: Record<string, LivePlayer> }) {
  const top = leaders(players).slice(0, 3);
  const [step, setStep] = useState(0); // 0 nothing, 1 third, 2 second, 3 winner
  useEffect(() => {
    const at = [1800, 3600, 5600];
    const ts = at.map((ms, i) =>
      setTimeout(() => {
        setStep(i + 1);
        playSfx(i === 0 ? 'third' : i === 1 ? 'second' : 'first');
      }, ms),
    );
    return () => ts.forEach(clearTimeout);
  }, []);
  const spot = (place: number) => {
    const p = top[place - 1];
    const shown = step >= 4 - place;
    return (
      <div className={'qz-podium-spot p' + place + (shown ? ' shown' : '')}>
        {p && shown && (
          <div className="qz-podium-who">
            <b>{p.n}</b>
            <span>{fmt(p.s || 0)} points</span>
          </div>
        )}
        <div className="qz-podium-block">
          <Medal place={place as 1 | 2 | 3} size={place === 1 ? 150 : 120} />
        </div>
      </div>
    );
  };
  return (
    <div className="qz-podium">
      {step >= 3 && <Confetti n={110} />}
      <h1 className="qz-title">{step >= 3 && top[0] ? `${top[0].n} wins` : 'And the winners are…'}</h1>
      <div className="qz-podium-row">
        {spot(2)}
        {spot(1)}
        {spot(3)}
      </div>
      {top.length === 0 && <p className="qz-waiting">Nobody played this time.</p>}
    </div>
  );
}

/** At their own pace: the code stays up, and the teacher sees everyone's progress and the leaderboard. */
function SelfHost({ live, count, act }: { live: LiveState; count: number; act: (a: string, x?: Record<string, unknown>) => Promise<void> }) {
  const list = leaders(live.players || {});
  const done = list.filter((p) => (p as { f?: number }).f).length;
  return (
    <div className="qz-self">
      <Lobby live={live} count={count} act={act} compact />
      <section className="qz-self-board" aria-label="Progress">
        <p className="qz-kicker">
          At their own pace · {done} of {count} finished
        </p>
        <ol className="qz-progress">
          {list.map((p, i) => (
            <li key={p.id}>
              <span className="qz-place">{i + 1}</span>
              <span className="qz-progress-name">{p.n}</span>
              <span className="qz-progress-bar" aria-label={`${p.d || 0} of ${live.total} questions`}>
                <i style={{ width: `${((p.d || 0) / Math.max(1, live.total)) * 100}%` }} />
              </span>
              <span className="qz-progress-n">
                {p.d || 0}/{live.total}
              </span>
              <span className="qz-leader-score">{fmt(p.s || 0)}</span>
            </li>
          ))}
          {!list.length && <li className="qz-waiting">Waiting for players…</li>}
        </ol>
      </section>
    </div>
  );
}

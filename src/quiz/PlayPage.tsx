// A game on a player's own screen, at /game (type the code) and /game/{code}, or inside a lesson.
// Guests choose a nickname; a learner signed in to the game's class plays under their own name.
// Live: the screen follows the teacher's game and shows everything the big screen shows.
// At their own pace: the player moves through the questions themselves.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TaskRenderer } from '../components/TaskRenderer';
import { useAuth } from '../lib/auth';
import type { AnswerKey, Responses } from '../lib/questions';
import { Backdrop, Confetti, TimeBar, fmt, ordinal } from './Stage';
import { AnswerPad, Cards, type Skin } from './Skins';
import { Explanation, LeaderList, QuestionCard, RevealOptions, ResultBanner, Winners, kicker, placeLine } from './Screens';
import { leaders, loadSeat, quizApi, saveSeat, useClock, useLive, type LiveSlide, type LiveState, type Seat } from './live';
import { playSfx, warmSfx } from './sfx';
import './quiz.css';

export function QuizPlayPage() {
  const { code: codeParam = '' } = useParams();
  const [params] = useSearchParams();
  const runParam = params.get('run') || '';
  const { user, ready } = useAuth();
  const [seat, setSeat] = useState<Seat | null>(() => loadSeat());
  const live = useLive(seat?.runId);
  const leave = () => (saveSeat(null), setSeat(null));
  const code = /^\d{6}$/.test(codeParam) ? codeParam : '';
  const differentGame = seat && ((code && live && live.code !== code) || (runParam && seat.runId !== runParam));
  if (seat && !differentGame && live !== false) {
    if (live === null) return <Backdrop className="qz-phone"><p className="qz-loading" role="status">One moment…</p></Backdrop>;
    return <GamePlayer seat={seat} live={live} onLeave={leave} />;
  }
  if (!ready) return <Backdrop className="qz-phone"><p className="qz-loading" role="status">One moment…</p></Backdrop>;
  return <JoinForm initialCode={code} runId={runParam} signedIn={!!user} onJoined={(s) => (saveSeat(s), setSeat(s))} />;
}

function JoinForm({ initialCode, runId, signedIn, onJoined }: { initialCode: string; runId: string; signedIn: boolean; onJoined: (s: Seat) => void }) {
  const nav = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [step, setStep] = useState<'code' | 'name'>(initialCode.length === 6 || runId ? 'name' : 'code');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('quiz.name') || '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tried = useRef(false);
  const join = async (withName: boolean) => {
    setBusy(true);
    setError('');
    warmSfx();
    try {
      const r = await quizApi<Seat>('join', { ...(runId ? { runId } : { code }), ...(withName ? { name } : {}) });
      try {
        if (withName) localStorage.setItem('quiz.name', name);
      } catch {
        /* private window */
      }
      if (!runId && code !== initialCode) nav('/game/' + code, { replace: true });
      onJoined({ runId: r.runId, pid: r.pid, token: r.token, name: r.name, member: r.member });
    } catch (e) {
      const msg = (e as Error).message;
      if (/nickname/i.test(msg) && !withName) setStep('name');
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };
  // A learner signed in to the class goes straight in under their own name.
  useEffect(() => {
    if (signedIn && step === 'name' && !tried.current) {
      tried.current = true;
      void join(false);
    }
  }, [signedIn, step]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Backdrop className="qz-phone">
      <main className="qz-join">
        <p className="qz-brand">ELT Suite <b>Games</b></p>
        {step === 'code' ? (
          <form className="qz-form" onSubmit={(e) => (e.preventDefault(), code.length === 6 ? setStep('name') : setError('Type the 6-digit code from the screen.'))}>
            <label htmlFor="qz-code">Game code</label>
            <input id="qz-code" className="qz-input qz-input-code" inputMode="numeric" autoComplete="off" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
            <button className="qz-btn qz-wide" disabled={code.length !== 6}>
              Next
            </button>
          </form>
        ) : (
          <form className="qz-form" onSubmit={(e) => (e.preventDefault(), void join(true))}>
            <label htmlFor="qz-name">Your nickname</label>
            <input id="qz-name" className="qz-input" maxLength={20} autoComplete="nickname" placeholder="Your first name or a nickname" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!signedIn} />
            <button className="qz-btn qz-wide" disabled={busy || !name.trim()}>
              {busy ? 'Joining…' : 'Join'}
            </button>
            {!runId && (
              <button type="button" className="qz-link" onClick={() => (setStep('code'), setError(''))}>
                Use a different code
              </button>
            )}
          </form>
        )}
        {error && (
          <p className="qz-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </Backdrop>
  );
}

/** A player's game: live or at their own pace. `inline` sizes it for a lesson page. */
export function GamePlayer({ seat, live, onLeave, inline }: { seat: Seat; live: LiveState; onLeave: () => void; inline?: boolean }) {
  const me = live.players?.[seat.pid];
  const shell = (body: JSX.Element) => (
    <Backdrop className={'qz-phone qz-phase-' + live.phase + (inline ? ' qz-inline' : '')}>
      <header className="qz-phone-top">
        <span className="qz-me">{me?.n || seat.name}</span>
        <span className="qz-phone-title">{live.title}</span>
        <span className="qz-me-score">{me ? fmt(me.s || 0) : ''}</span>
      </header>
      <main className="qz-phone-main">{body}</main>
    </Backdrop>
  );
  if (live.kicked?.[seat.pid]) return shell(<Message title="The teacher has taken you out of this game." action={<button className="qz-btn" onClick={onLeave}>Join another game</button>} />);
  if (!me && live.phase !== 'ended' && live.phase !== 'podium') return shell(<Message title="You’re not in this game any more." action={<button className="qz-btn" onClick={onLeave}>Join again</button>} />);
  return shell(live.mode === 'self' ? <SelfPlay seat={seat} live={live} onLeave={onLeave} /> : <LivePlay seat={seat} live={live} onLeave={onLeave} />);
}

// ---- Live: following the teacher's game ---------------------------------------------------------------
function LivePlay({ seat, live, onLeave }: { seat: Seat; live: LiveState; onLeave: () => void }) {
  const now = useClock(200, live.phase === 'question');
  const me = live.players?.[seat.pid];
  const q = live.q;
  const slide = live.slide;
  const store = 'quiz.sent.' + seat.runId;
  const [sent, setSent] = useState<Record<number, { picked?: number[]; responses?: Responses }>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(store) || '{}');
    } catch {
      return {};
    }
  });
  const [picked, setPicked] = useState<number[]>([]);
  const [draft, setDraft] = useState<Responses>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => (setPicked([]), setDraft({}), setError('')), [slide]);
  const remember = (i: number, v: { picked?: number[]; responses?: Responses }) => {
    const next = { ...sent, [i]: v };
    setSent(next);
    try {
      sessionStorage.setItem(store, JSON.stringify(next));
    } catch {
      /* private window */
    }
  };
  const shownFor = useRef(-1);
  useEffect(() => {
    if (live.phase !== 'reveal' || shownFor.current === slide || !me) return;
    shownFor.current = slide;
    if (q?.poll || me.ok === null || me.ok === undefined) return;
    if (me.ok === 1) playSfx((me.k || 0) >= 3 ? 'streak' : 'right');
    else if (me.a) playSfx('wrong');
  }, [live.phase, slide, me, q?.poll]);

  const send = async (responses: Responses, pick?: number[]) => {
    if (!q || busy) return;
    setBusy(true);
    setError('');
    try {
      await quizApi('answer', { runId: seat.runId, pid: seat.pid, token: seat.token, slide, responses });
      remember(slide, { picked: pick, responses });
      playSfx('lock');
    } catch (e) {
      const msg = (e as Error).message;
      if (/already/i.test(msg)) remember(slide, { picked: pick, responses });
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };
  const players = live.players || {};
  const count = Object.keys(players).length;
  const answered = live.answered?.[String(slide)] || 0;
  const place = me?.r || leaders(players).findIndex((p) => p.id === seat.pid) + 1;

  let body: JSX.Element;
  if (live.phase === 'lobby') {
    body = <Message kicker={live.title} title="You’re in." text={`${count} ${count === 1 ? 'player' : 'players'} so far. The game starts soon.`} pulse />;
  } else if (live.phase === 'question' && q) {
    const counting = !!live.startsAt && now < live.startsAt;
    const left = live.endsAt ? Math.max(0, (live.endsAt - now) / 1000) : 0;
    const mine = sent[slide];
    if (counting) body = <Message kicker={kicker(q)} title="Get ready" big={String(Math.max(1, Math.ceil((live.startsAt! - now) / 1000)))} />;
    else
      body = (
        <>
          <TimeBar left={left} total={q.seconds} />
          <QuestionCard q={q} classId={live.classId || ''}>{q.kind === 'task' && !mine && left > 0 && <TaskAnswer q={q} draft={draft} setDraft={setDraft} busy={busy} classId={live.classId || ''} />}</QuestionCard>
          <p className="qz-answered-line">
            {answered} of {count} answered
          </p>
          {mine ? (
            <>
              <p className="qz-sent" role="status">
                Your answer is in. Waiting for the others…
              </p>
              {q.kind === 'choice' && <Cards skin="cards" options={q.options || []} picked={mine.picked} display />}
            </>
          ) : left <= 0 ? (
            <Message title="Time’s up." text="Watch for the answer." />
          ) : q.kind === 'choice' ? (
            <ChoiceAnswer q={q} picked={picked} setPicked={setPicked} busy={busy} onSend={(r, p) => void send(r, p)} />
          ) : (
            <button type="button" className="qz-btn qz-wide" disabled={busy} onClick={() => void send(draft)}>
              {busy ? 'Sending…' : 'Send answer'}
            </button>
          )}
        </>
      );
  } else if (live.phase === 'reveal' && q && me) {
    const r = live.reveal;
    const tone = q.poll ? 'poll' : !me.a ? 'none' : me.ok === 1 ? 'right' : me.ok === 0.5 ? 'partly' : me.ok === null || me.ok === undefined ? 'poll' : 'wrong';
    const title = q.poll ? 'Thanks for your answer.' : !me.a ? 'No answer this time.' : me.ok === 1 ? 'Right' : me.ok === 0.5 ? 'Partly right' : me.ok === null || me.ok === undefined ? 'Answer sent' : 'Not this time';
    body = (
      <>
        {tone === 'right' && <Confetti n={36} />}
        <ResultBanner tone={tone} title={title} gained={me.g} streak={me.k} line={placeLine(place, me.s, players)} />
        <QuestionCard q={q} classId={live.classId || ''} results={q.kind === 'task' ? r?.key : undefined} responses={sent[slide]?.responses}>
          {q.kind === 'choice' && <RevealOptions q={q} correct={r?.correct} counts={r?.counts} mine={sent[slide]?.picked} />}
        </QuestionCard>
        {q.kind === 'task' && r && <p className="qz-answered-line">{r.right} right · {r.partly} partly right · {r.wrong} not right</p>}
        <Explanation keyed={r?.key} />
      </>
    );
  } else if (live.phase === 'board' && me) {
    body = (
      <>
        <p className="qz-kicker">Leaderboard · after question {slide + 1} of {live.total}</p>
        <LeaderList players={players} me={seat.pid} />
        <p className="qz-place-line">{placeLine(place, me.s, players)}</p>
      </>
    );
  } else if (live.phase === 'podium' || live.phase === 'ended') {
    body = (
      <>
        {me && (leaders(players)[0]?.s || 0) > 0 && place > 0 && place <= 3 && <Confetti n={60} />}
        <Winners players={players} />
        <Message kicker={live.phase === 'ended' ? 'The game has finished' : 'Final scores'} title={me ? ((leaders(players)[0]?.s || 0) > 0 ? `You came ${ordinal(place)}` : 'No points this round') : 'Thanks for playing.'} text={me ? `${fmt(me.s || 0)} points` : ''} action={live.phase === 'ended' ? <button className="qz-btn" onClick={onLeave}>Join another game</button> : undefined} />
      </>
    );
  } else body = <Message title="One moment…" />;
  return (
    <>
      {body}
      {error && (
        <p className="qz-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function ChoiceAnswer({ q, picked, setPicked, busy, onSend }: { q: LiveSlide; picked: number[]; setPicked: (f: (p: number[]) => number[]) => void; busy: boolean; onSend: (r: Responses, picked: number[]) => void }) {
  const qid = q.qids[0];
  if (q.multi)
    return (
      <>
        <Cards skin="cards" options={q.options || []} picked={picked} disabled={busy} onPick={(i) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
        <button type="button" className="qz-btn qz-wide" disabled={busy || !picked.length} onClick={() => onSend({ [qid]: [...picked].sort((a, b) => a - b) }, picked)}>
          Send {picked.length || ''} {picked.length === 1 ? 'answer' : 'answers'}
        </button>
      </>
    );
  return <AnswerPad key={q.index} skin={(q.skin as Skin) || 'cards'} options={q.options || []} disabled={busy} onPick={(i) => onSend({ [qid]: i }, [i])} />;
}

function TaskAnswer({ q, draft, setDraft, busy, classId }: { q: LiveSlide; draft: Responses; setDraft: (f: (d: Responses) => Responses) => void; busy: boolean; classId: string }) {
  return (
    <div className="qz-qcard-task">
      <TaskRenderer content={q.content || null} responses={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} classId={classId} disabled={busy} />
    </div>
  );
}

// ---- At their own pace -------------------------------------------------------------------------------
type SelfQ = { done: boolean; total: number; startsAt?: number; endsAt?: number; q?: LiveSlide; answered?: boolean };
type SelfResult = { late?: boolean; gained: number; score: number; streak: number; frac: number | null; scored: boolean; reveal: { key: AnswerKey; correct: number[] | null }; last: boolean };
function SelfPlay({ seat, live, onLeave }: { seat: Seat; live: LiveState; onLeave: () => void }) {
  const [cur, setCur] = useState<SelfQ | null>(null);
  const [result, setResult] = useState<SelfResult | null>(null);
  const [mine, setMine] = useState<{ picked?: number[]; responses?: Responses }>({});
  const [picked, setPicked] = useState<number[]>([]);
  const [draft, setDraft] = useState<Responses>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const now = useClock(200, !!cur && !cur.done && !result);
  const call = async (advance: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await quizApi<SelfQ>('self-next', { runId: seat.runId, pid: seat.pid, token: seat.token, advance });
      setCur(r);
      setResult(null);
      setMine({});
      setPicked([]);
      setDraft({});
      if (r.done) playSfx('first');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void call(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (responses: Responses, pick?: number[]) => {
    if (!cur?.q || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await quizApi<SelfResult>('answer', { runId: seat.runId, pid: seat.pid, token: seat.token, slide: cur.q.index, responses });
      setMine({ picked: pick, responses });
      setResult(r);
      if (!r.scored) playSfx('lock');
      else if (r.frac === 1) playSfx((r.streak || 0) >= 3 ? 'streak' : 'right');
      else playSfx(r.late ? 'timeup' : 'wrong');
    } catch (e) {
      const msg = (e as Error).message;
      if (/already/i.test(msg)) void call(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };
  // Time runs out: the question is sent with no answer.
  const left = cur?.endsAt ? Math.max(0, (cur.endsAt - now) / 1000) : 0;
  const expired = useRef(-1);
  useEffect(() => {
    if (!cur?.q || cur.done || result || cur.answered || busy || left > 0 || now < (cur.startsAt || 0) || expired.current === cur.q.index) return;
    expired.current = cur.q.index;
    void send({});
  }, [left, cur, result, busy, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = live.players || {};
  const me = players[seat.pid];
  const place = leaders(players).findIndex((p) => p.id === seat.pid) + 1;
  const finished = Object.values(players).filter((p) => (p as { f?: number }).f).length;
  let body: JSX.Element;
  if (!cur) body = <Message title={error ? 'We couldn’t load the game.' : 'One moment…'} text={error} action={error ? <button className="qz-btn" onClick={() => void call(false)}>Try again</button> : undefined} />;
  else if (cur.done)
    body = (
      <>
        {(leaders(players)[0]?.s || 0) > 0 && place > 0 && place <= 3 && <Confetti n={50} />}
        <Message kicker="You’ve finished" title={me ? `${fmt(me.s || 0)} points` : 'Well done.'} text={me ? `You’re ${ordinal(place)} so far. ${finished} of ${Object.keys(players).length} players have finished.` : ''} />
        <LeaderList players={players} me={seat.pid} />
        <button className="qz-btn" onClick={onLeave}>
          Close
        </button>
      </>
    );
  else if (cur.answered && !result)
    body = (
      <Message
        kicker={cur.q ? kicker(cur.q) : ''}
        title="You’ve answered this one."
        action={
          <button className="qz-btn" disabled={busy} onClick={() => void call(true)}>
            Next question
          </button>
        }
      />
    );
  else if (cur.q && now < (cur.startsAt || 0) && !result) body = <Message kicker={kicker(cur.q)} title="Get ready" big={String(Math.max(1, Math.ceil(((cur.startsAt || 0) - now) / 1000)))} />;
  else if (cur.q && result) {
    const q = cur.q;
    const tone = !result.scored ? (result.late ? 'none' : 'poll') : result.frac === 1 ? 'right' : (result.frac || 0) > 0 ? 'partly' : 'wrong';
    const title = result.late ? 'Time’s up.' : !result.scored ? 'Answer sent' : result.frac === 1 ? 'Right' : (result.frac || 0) > 0 ? 'Partly right' : 'Not this time';
    body = (
      <>
        {tone === 'right' && <Confetti n={30} />}
        <ResultBanner tone={tone} title={title} gained={result.gained} streak={result.streak} line={place > 0 ? placeLine(place, result.score, players) : ''} />
        <QuestionCard q={q} classId={live.classId || ''} results={q.kind === 'task' ? result.reveal.key : undefined} responses={mine.responses}>
          {q.kind === 'choice' && <RevealOptions q={q} correct={result.reveal.correct} mine={mine.picked} />}
        </QuestionCard>
        <Explanation keyed={result.reveal.key} />
        <button className="qz-btn qz-wide" disabled={busy} onClick={() => void call(true)}>
          {result.last ? 'See how you did' : 'Next question'}
        </button>
      </>
    );
  } else if (cur.q) {
    const q = cur.q;
    body = (
      <>
        <TimeBar left={left} total={q.seconds} />
        <QuestionCard q={q} classId={live.classId || ''}>{q.kind === 'task' && <TaskAnswer q={q} draft={draft} setDraft={setDraft} busy={busy} classId={live.classId || ''} />}</QuestionCard>
        {q.kind === 'choice' ? (
          <ChoiceAnswer q={q} picked={picked} setPicked={setPicked} busy={busy} onSend={(r, p) => void send(r, p)} />
        ) : (
          <button type="button" className="qz-btn qz-wide" disabled={busy} onClick={() => void send(draft)}>
            {busy ? 'Sending…' : 'Send answer'}
          </button>
        )}
      </>
    );
  } else body = <Message title="One moment…" />;
  return (
    <>
      {body}
      {error && cur && (
        <p className="qz-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Message({ kicker: k, title, text, big, action, pulse }: { kicker?: string; title: string; text?: string; big?: string; action?: JSX.Element; pulse?: boolean }) {
  return (
    <div className={'qz-message' + (pulse ? ' pulse' : '')} role="status">
      {k && <p className="qz-kicker">{k}</p>}
      <h1>{title}</h1>
      {big && (
        <div className="qz-count-num" key={big}>
          {big}
        </div>
      )}
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

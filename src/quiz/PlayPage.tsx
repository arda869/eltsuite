// The quiz show on a player's phone, at /quiz (type the code) and /quiz/{code}. Guests choose a
// nickname; a learner signed in to the quiz's class plays under their own name. The phone shows the
// answer buttons, then how the player did, their points and their place.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TaskRenderer } from '../components/TaskRenderer';
import { useAuth } from '../lib/auth';
import type { Responses } from '../lib/questions';
import { Backdrop, Confetti, Flame, Shape, answerStyle, fmt, ordinal } from './Stage';
import { leaders, loadSeat, quizApi, saveSeat, useClock, useLive, type LiveState, type Seat } from './live';
import { playSfx, warmSfx } from './sfx';
import './quiz.css';

export function QuizPlayPage() {
  const { code: codeParam = '' } = useParams();
  const [params] = useSearchParams();
  const runParam = params.get('run') || '';
  const { user, ready } = useAuth();
  const [seat, setSeat] = useState<Seat | null>(() => loadSeat());
  const live = useLive(seat?.runId);

  const leave = () => {
    saveSeat(null);
    setSeat(null);
  };
  const differentGame = seat && ((codeParam && live && live.code !== codeParam) || (runParam && seat.runId !== runParam));
  if (seat && !differentGame && live !== false) {
    if (live === null) return <Backdrop className="qz-phone"><p className="qz-loading" role="status">One moment…</p></Backdrop>;
    return <Player seat={seat} live={live} onLeave={leave} />;
  }
  if (!ready) return <Backdrop className="qz-phone"><p className="qz-loading" role="status">One moment…</p></Backdrop>;
  return <JoinForm initialCode={codeParam} runId={runParam} signedIn={!!user} onJoined={(s) => (saveSeat(s), setSeat(s))} />;
}

function JoinForm({ initialCode, runId, signedIn, onJoined }: { initialCode: string; runId: string; signedIn: boolean; onJoined: (s: Seat) => void }) {
  const nav = useNavigate();
  const [code, setCode] = useState(initialCode.replace(/\D/g, '').slice(0, 6));
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
      if (!runId && code !== initialCode) nav('/quiz/' + code, { replace: true });
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
        <p className="qz-brand">ELT Suite <b>Quiz show</b></p>
        {step === 'code' ? (
          <form
            className="qz-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) setStep('name');
              else setError('Type the 6-digit code from the screen.');
            }}
          >
            <label htmlFor="qz-code">Game code</label>
            <input id="qz-code" className="qz-input qz-input-code" inputMode="numeric" autoComplete="off" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
            <button className="qz-btn qz-wide" disabled={code.length !== 6}>
              Next
            </button>
          </form>
        ) : (
          <form
            className="qz-form"
            onSubmit={(e) => {
              e.preventDefault();
              void join(true);
            }}
          >
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

function Player({ seat, live, onLeave }: { seat: Seat; live: LiveState; onLeave: () => void }) {
  const now = useClock(200, live.phase === 'question');
  const me = live.players?.[seat.pid];
  const q = live.q;
  const slide = live.slide;
  const [sent, setSent] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('quiz.sent.' + seat.runId) || '{}');
    } catch {
      return {};
    }
  });
  const [picked, setPicked] = useState<number[]>([]);
  const [draft, setDraft] = useState<Responses>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPicked([]);
    setDraft({});
    setError('');
  }, [slide]);
  const markSent = (i: number) => {
    const next = { ...sent, [i]: true };
    setSent(next);
    try {
      sessionStorage.setItem('quiz.sent.' + seat.runId, JSON.stringify(next));
    } catch {
      /* private window */
    }
  };

  // How the player did, with a sound when the answer is shown.
  const shownFor = useRef(-1);
  useEffect(() => {
    if (live.phase !== 'reveal' || shownFor.current === slide || !me) return;
    shownFor.current = slide;
    if (q?.poll || me.ok === null || me.ok === undefined) return;
    if (me.ok === 1) playSfx((me.k || 0) >= 3 ? 'streak' : 'right');
    else if (me.a) playSfx('wrong');
  }, [live.phase, slide, me, q?.poll]);

  if (live.kicked?.[seat.pid]) return <Shell live={live} name={seat.name}><Message title="The teacher has taken you out of this quiz." action={<button className="qz-btn" onClick={onLeave}>Join another quiz</button>} /></Shell>;
  if (!me && live.phase !== 'ended' && live.phase !== 'podium') return <Shell live={live} name={seat.name}><Message title="You’re not in this quiz any more." action={<button className="qz-btn" onClick={onLeave}>Join again</button>} /></Shell>;

  const send = async (responses: Responses) => {
    if (!q || busy) return;
    setBusy(true);
    setError('');
    try {
      await quizApi('answer', { runId: seat.runId, pid: seat.pid, token: seat.token, slide, responses });
      markSent(slide);
      playSfx('lock');
    } catch (e) {
      const msg = (e as Error).message;
      if (/already/i.test(msg)) markSent(slide);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const place = me?.r || leaders(live.players).findIndex((p) => p.id === seat.pid) + 1;
  const ahead = leaders(live.players)[Math.max(0, place - 2)];

  let body: JSX.Element;
  if (live.phase === 'lobby') {
    body = <Message title="You’re in." text="Look for your name on the big screen. The quiz starts soon." pulse />;
  } else if (live.phase === 'question' && q) {
    const counting = !!live.startsAt && now < live.startsAt;
    const left = live.endsAt ? Math.max(0, Math.ceil((live.endsAt - now) / 1000)) : 0;
    if (counting) body = <Message kicker={`Question ${slide + 1} of ${live.total}`} title="Get ready" big={String(Math.max(1, Math.ceil((live.startsAt! - now) / 1000)))} />;
    else if (sent[slide]) body = <Message title="Answer sent." text="Waiting for everyone else…" pulse />;
    else if (left <= 0) body = <Message title="Time’s up." text="Your answer will be shown on the big screen." />;
    else if (q.kind === 'choice' && q.options) {
      const qid = q.qids[0];
      body = (
        <div className="qz-answer">
          <p className="qz-answer-top">
            <span>
              {slide + 1} / {live.total}
            </span>
            <b className={left <= 5 ? 'urgent' : ''}>{left}</b>
          </p>
          <div className={'qz-buttons n' + q.options.length}>
            {q.options.map((o, i) => (
              <button
                key={i}
                type="button"
                className={'qz-answer-btn' + (picked.includes(i) ? ' picked' : '')}
                style={answerStyle(i)}
                aria-pressed={q.multi ? picked.includes(i) : undefined}
                disabled={busy}
                onClick={() => (q.multi ? setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])) : void send({ [qid]: i }))}
              >
                <Shape i={i} size={44} />
                <span>{o}</span>
              </button>
            ))}
          </div>
          {q.multi && (
            <button type="button" className="qz-btn qz-wide" disabled={busy || !picked.length} onClick={() => void send({ [qid]: [...picked].sort((a, b) => a - b) })}>
              Send {picked.length || ''} {picked.length === 1 ? 'answer' : 'answers'}
            </button>
          )}
        </div>
      );
    } else
      body = (
        <div className="qz-answer qz-answer-task">
          <p className="qz-answer-top">
            <span>
              {slide + 1} / {live.total}
            </span>
            <b className={left <= 5 ? 'urgent' : ''}>{left}</b>
          </p>
          <div className="qz-phone-task">
            <TaskRenderer content={q.content || null} responses={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} disabled={busy} />
          </div>
          <button type="button" className="qz-btn qz-wide" disabled={busy} onClick={() => void send(draft)}>
            {busy ? 'Sending…' : 'Send answer'}
          </button>
        </div>
      );
  } else if (live.phase === 'reveal' && me) {
    const answeredIt = !!me.a;
    const ok = me.ok;
    const tone = q?.poll ? 'poll' : !answeredIt ? 'none' : ok === 1 ? 'right' : ok === 0.5 ? 'partly' : 'wrong';
    const title = q?.poll ? 'Thanks for your answer.' : !answeredIt ? 'No answer this time.' : ok === 1 ? 'Right' : ok === 0.5 ? 'Partly right' : ok === null ? 'Answer sent' : 'Not this time';
    body = (
      <div className={'qz-result ' + tone}>
        {tone === 'right' && <Confetti n={40} />}
        <h1>{title}</h1>
        {!!me.g && <p className="qz-gain">+{fmt(me.g)}</p>}
        {(me.k || 0) >= 2 && tone === 'right' && (
          <p className="qz-streak-big">
            <Flame size={26} /> {me.k} right in a row
          </p>
        )}
        <p className="qz-place-line">{placeLine(place, me.s, ahead)}</p>
      </div>
    );
  } else if (live.phase === 'board' && me) {
    body = <Message kicker="Leaderboard" title={`You’re ${ordinal(place)}`} text={`${fmt(me.s || 0)} points. ${placeLine(place, me.s, ahead)}`} />;
  } else if (live.phase === 'podium' || live.phase === 'ended') {
    const final = me ? place : 0;
    body = (
      <div className={'qz-result ' + (final && final <= 3 ? 'right' : 'poll')}>
        {final > 0 && final <= 3 && <Confetti n={60} />}
        <p className="qz-kicker">{live.phase === 'ended' ? 'The quiz has finished' : 'Look at the big screen'}</p>
        {me ? <h1>You came {ordinal(final)}</h1> : <h1>Thanks for playing.</h1>}
        {me && <p className="qz-gain">{fmt(me.s || 0)} points</p>}
        {live.phase === 'ended' && (
          <button className="qz-btn" onClick={onLeave}>
            Join another quiz
          </button>
        )}
      </div>
    );
  } else body = <Message title="One moment…" />;

  return (
    <Shell live={live} name={me?.n || seat.name} score={me?.s}>
      {body}
      {error && (
        <p className="qz-error" role="alert">
          {error}
        </p>
      )}
    </Shell>
  );
}

function placeLine(place: number, score = 0, ahead?: { n: string; s: number; id: string }) {
  if (place <= 0) return '';
  if (place === 1) return 'You’re in the lead.';
  if (!ahead) return `You’re ${ordinal(place)}.`;
  const gap = Math.max(0, (ahead.s || 0) - (score || 0));
  return gap ? `${ordinal(place)}, ${fmt(gap)} behind ${ahead.n}.` : `${ordinal(place)}, level with ${ahead.n}.`;
}

function Shell({ live, name, score, children }: { live: LiveState; name: string; score?: number; children: React.ReactNode }) {
  return (
    <Backdrop className={'qz-phone qz-phase-' + live.phase}>
      <header className="qz-phone-top">
        <span className="qz-me">{name}</span>
        <span className="qz-me-score">{score !== undefined ? fmt(score) : ''}</span>
      </header>
      <main className="qz-phone-main">{children}</main>
    </Backdrop>
  );
}

function Message({ kicker, title, text, big, action, pulse }: { kicker?: string; title: string; text?: string; big?: string; action?: JSX.Element; pulse?: boolean }) {
  return (
    <div className={'qz-message' + (pulse ? ' pulse' : '')} role="status">
      {kicker && <p className="qz-kicker">{kicker}</p>}
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

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from './PublicSite';
import './home.css';

// Screens from ELT Suite with a fictional class (test/landing-seed.ts, test/landing-shots.mjs).
// Each is in public/landing at 2400 × 1500, with a 1100 × 688 copy for small screens.
const W = 2400, H = 1500;
const PAPER = { w: 1130, h: 1598 }; // public/landing/paper.webp, the printed page
const src = (name: string) => `/landing/${name}.webp`;
const srcSet = (name: string) => `/landing/${name}-sm.webp 1100w, /landing/${name}.webp 2400w`;

// Part of a screen, cut to the region given as fractions of the whole picture.
type Region = { x: number; y: number; w: number; h: number };
function Crop({ name, at, alt, width = 300, eager = false }: { name: string; at: Region; alt: string; width?: number; eager?: boolean }) {
  const style = { aspectRatio: `${at.w * W} / ${at.h * H}`, '--cx': at.x, '--cy': at.y, '--cw': at.w, '--ch': at.h } as CSSProperties;
  return (
    <span className="pub-crop" style={style}>
      <img src={src(name)} srcSet={srcSet(name)} sizes={`${Math.round(width / at.w)}px`} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </span>
  );
}

function Screen({ name, alt, eager = false, sizes = '(min-width: 1100px) 760px, 100vw' }: { name: string; alt: string; eager?: boolean; sizes?: string }) {
  return <img className="pub-screen" src={src(name)} srcSet={srcSet(name)} sizes={sizes} width={W} height={H} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

// A screenshot (or part of one) in a light frame that opens full size.
function Shot({ name, alt, caption, eager, at, className = '' }: { name: string; alt: string; caption?: string; eager?: boolean; at?: Region; className?: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <figure className={'pub-figure ' + className}>
      <button type="button" className="pub-frame" onClick={() => dlg.current?.showModal()} aria-label={`Show full size: ${alt}`}>
        {at ? <Crop name={name} at={at} alt="" width={420} /> : <Screen name={name} alt="" eager={eager} />}
        <span className="pub-enlarge" aria-hidden="true">Full size ↗</span>
      </button>
      {caption && <figcaption>{caption}</figcaption>}
      <dialog ref={dlg} className="pub-lightbox" aria-label={alt} onClick={(e) => { if (e.target === dlg.current) dlg.current.close(); }}>
        <img src={src(name)} width={W} height={H} alt={alt} loading="lazy" />
        <form method="dialog"><button className="pub-secondary">Close</button></form>
      </dialog>
    </figure>
  );
}

// A phone around a screenshot: body, side buttons, the status bar with the island, and the home bar.
function Phone({ name, alt = '', eager = false }: { name: string; alt?: string; eager?: boolean }) {
  return (
    <span className="pub-device">
      <span className="pub-device-screen">
        <span className="pub-device-bar" aria-hidden="true"><b>9:41</b><i /><span className="pub-device-icons"><u /><u /><u /></span></span>
        <img src={src(name)} width={780} height={1440} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        <span className="pub-device-home" aria-hidden="true" />
      </span>
    </span>
  );
}

// A screenshot that isn't a full screen (a phone, a printed page), framed to suit, that opens full size.
function PicShot({ name, alt, caption, w, h, kind }: { name: string; alt: string; caption: string; w: number; h: number; kind: 'phone' | 'paper' }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <figure className={'pub-figure pub-' + kind}>
      <button type="button" className={'pub-frame pub-' + kind + '-frame'} onClick={() => dlg.current?.showModal()} aria-label={`Show full size: ${alt}`}>
        {kind === 'phone' ? <Phone name={name} /> : <img src={src(name)} width={w} height={h} alt="" loading="lazy" decoding="async" />}
      </button>
      <figcaption>{caption}</figcaption>
      <dialog ref={dlg} className={'pub-lightbox pub-lightbox-' + kind} aria-label={alt} onClick={(e) => { if (e.target === dlg.current) dlg.current.close(); }}>
        <img src={src(name)} width={w} height={h} alt={alt} loading="lazy" />
        <form method="dialog"><button className="pub-secondary">Close</button></form>
      </dialog>
    </figure>
  );
}

// ------------------------------------------------------------------ hero

// ------------------------------------------------------------------ the teaching cycle
// The hero's steps, the screens that show them and the tabs in “How it works” all follow this.

type Step = { id: string; label: string; screen: 'editor' | 'phone' | 'report' | 'coach' | 'collab' };
const CYCLE: Step[] = [
  { id: 'plan', label: 'Plan', screen: 'editor' },
  { id: 'teach', label: 'Teach', screen: 'phone' },
  { id: 'results', label: 'See results', screen: 'report' },
  { id: 'reflect', label: 'Reflect', screen: 'editor' },
  { id: 'grow', label: 'Grow with your coach', screen: 'coach' },
  { id: 'connect', label: 'Connect with colleagues', screen: 'editor' },
];
const SCREENS: Record<Step['screen'], [string, string]> = {
  editor: ['Lesson editor', 'Plan each task, with your notes beside it.'],
  phone: ['A learner’s phone', 'Learners answer, and their answers are checked.'],
  report: ['Class report', 'Every learner’s results, lesson by lesson.'],
  coach: ['Teacher’s Companion', 'Talk your teaching through, in private.'],
  collab: ['Collab', 'Work on ideas with colleagues.'],
};

// ------------------------------------------------------------------ hero: fills the first screen

function Hero({ onStep }: { onStep: (i: number) => void }) {
  const [on, setOn] = useState<Step['screen'] | null>(null);
  const hot = (k: Step['screen']) => ({ onMouseEnter: () => setOn(k), onMouseLeave: () => setOn(null), onClick: () => setOn(k), 'data-on': on === k || undefined });
  const [title, line] = on ? SCREENS[on] : ['', ''];
  return (
    <section className="pub-hero" aria-labelledby="pub-hero-h">
      <div className="pub-hero-copy">
        <span className="pub-kicker">By teachers, for teachers</span>
        <h1 id="pub-hero-h">Plan it, teach it, see how it went. Then keep growing.</h1>
        <ol className="pub-cycle" aria-label="Your teaching cycle">
          {CYCLE.map((c, i) => (
            <li key={c.id}>
              <a href="#how" onMouseEnter={() => setOn(c.screen)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(c.screen)} onBlur={() => setOn(null)} onClick={() => onStep(i)}>{c.label}</a>
            </li>
          ))}
        </ol>
        <p>Everything you do as a teacher, in one place. Teach online, on the classroom screen or on paper. You choose.</p>
        <div className="pub-actions">
          <a className="pub-button" href="#invite">Ask for an invitation</a>
          <Link className="pub-secondary" to="/signin">Sign in</Link>
        </div>
        <span className="pub-note">We’re open by invitation for now.</span>
      </div>
      <figure className="pub-hero-shot" data-focus={on ?? undefined}>
        <div className="pub-hero-stage">
          <span className="pub-hot pub-hot-editor" {...hot('editor')}>
            <Screen name="editor" eager sizes="(min-width: 1100px) 760px, 100vw" alt="The ELT Suite lesson editor: a lesson’s tasks on the left, the task being edited, and the teacher’s notes." />
          </span>
          <div className="pub-hero-pops">
            <span className="pub-pop pub-pop-report pub-hot" {...hot('report')}><Crop name="reports" at={{ x: 0.005, y: 0.5, w: 0.56, h: 0.37 }} alt="" width={320} eager /></span>
            <span className="pub-pop pub-pop-coach pub-hot" {...hot('coach')}><Crop name="companion" at={{ x: 0.26, y: 0.46, w: 0.58, h: 0.4 }} alt="" width={340} eager /></span>
            <span className="pub-pop pub-pop-phone pub-hot" {...hot('phone')}><Phone name="learner-phone" eager /></span>
          </div>
        </div>
        <figcaption className={'pub-hero-cap' + (on ? ' on' : '')} aria-live="polite">
          {on ? <><strong>{title}</strong> {line}</> : 'Point at a screen to see what it does.'}
        </figcaption>
      </figure>
    </section>
  );
}

// A fictional class answering one question. Each learner's answer arrives in turn, as it would in
// Teach live, then the demonstration starts again.
const CHOICES = ['I don’t mind.', 'I’d rather go by train, because it’s cheaper.', 'The train.'];
const RIGHT = 1;
const CLASS = [
  { name: 'Kan', initials: 'KN', pick: 1 },
  { name: 'Ana', initials: 'AS', pick: 1 },
  { name: 'Leo', initials: 'LO', pick: 0 },
  { name: 'Mia', initials: 'MC', pick: 1 },
  { name: 'Tom', initials: 'TH', pick: 2 },
  { name: 'Sara', initials: 'SL', pick: 1 },
];
const MIA = CLASS.findIndex((l) => l.name === 'Mia');
const HOLD = 4; // steps the finished picture stays before it starts again
const LETTER = 'ABC';

function LiveDemo() {
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(still ? CLASS.length : 0);
  const [playing, setPlaying] = useState(!still);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setSeen(true);
    const io = new IntersectionObserver((es) => setSeen(es.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || !seen) return;
    const t = window.setInterval(() => setStep((s) => (s >= CLASS.length + HOLD ? 0 : s + 1)), 1100);
    return () => window.clearInterval(t);
  }, [playing, seen]);
  const done = Math.min(step, CLASS.length);
  const answered = CLASS.slice(0, done);
  const counts = CHOICES.map((_, i) => answered.filter((l) => l.pick === i).length);
  const miaSent = done > MIA;
  return (
    <div className="pub-live" ref={ref}>
      <p className="sr-only">An example with a made-up class. Six learners answer a question on their own screens. As each answer arrives, the teacher sees who chose what and how many got it right.</p>
      <div className="pub-live-stage" aria-hidden="true">
        <div className="pub-live-learner">
          <div className="pub-live-bar"><span>A learner’s phone</span><span>Task 3</span></div>
          <div className="pub-live-task">
            <span className="pub-live-k">Choose a reply</span>
            <p className="pub-live-q">“Shall we go by bus or by train?”</p>
            <p className="pub-live-i">Which reply gives a reason?</p>
            <ul>
              {CHOICES.map((c, i) => (
                <li key={c} className={miaSent && i === CLASS[MIA].pick ? 'on' : ''}>
                  <b>{LETTER[i]}</b>{c}
                </li>
              ))}
            </ul>
            <span className={'pub-live-sent' + (miaSent ? ' on' : '')}>{miaSent ? 'Sent to your teacher' : 'Choose an answer'}</span>
          </div>
        </div>
        <div className="pub-live-teacher">
          <div className="pub-live-bar"><span>Teach live</span><span>{done} of {CLASS.length} answered</span></div>
          <div className="pub-live-tally">
            {CHOICES.map((c, i) => (
              <div key={c} className={'pub-live-row' + (i === RIGHT ? ' right' : '')}>
                <b>{LETTER[i]}</b>
                <span className="pub-live-track"><span style={{ width: `${(counts[i] / CLASS.length) * 100}%` }} /></span>
                <span className="pub-live-n">{counts[i]}</span>
              </div>
            ))}
          </div>
          <ul className="pub-live-who">
            {CLASS.map((l, i) => {
              const has = i < done;
              const ok = l.pick === RIGHT;
              return (
                <li key={l.name} className={has ? (ok ? 'right' : 'wrong') : 'waiting'} data-new={i === done - 1 || undefined}>
                  <span className="pub-live-av">{l.initials}</span>
                  <span className="pub-live-name">{l.name}</span>
                  <span className="pub-live-pick">{has ? `${LETTER[l.pick]} ${ok ? '✓' : '✗'}` : '…'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="pub-live-foot">
        <span className="pub-note">An example with a made-up class.</span>
        <button type="button" className="pub-secondary pub-small" aria-pressed={!playing} onClick={() => { if (!playing && step >= CLASS.length + HOLD) setStep(0); setPlaying(!playing); }}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ how it works: one tab per step

type Pane = { title: string; text: string; points?: string[]; main?: { name: string; alt: string }; detail?: { name: string; at: Region; alt: string; caption: string } };
const PANES: Record<string, Pane> = {
  plan: {
    title: 'Plan your lesson.',
    text: 'Build a lesson task by task and keep your notes beside each one. Get help with a first draft when you want it.',
    points: ['Gap-fills, speaking cards, recordings and more', 'Dialogues and songs for your class', 'Pronunciation and grammar marks'],
    main: { name: 'editor-language', alt: 'The lesson editor: a useful language box, sentences with gaps, and the teacher’s notes.' },
    detail: { name: 'speech', at: { x: 0.13, y: 0.08, w: 0.74, h: 0.84 }, alt: 'Making a dialogue: two speakers and their lines.', caption: 'Make a dialogue with two voices' },
  },
  teach: {
    title: 'Teach it your way.',
    text: 'Teach the same lesson online, on the classroom screen or on paper. Learners answer on a phone or laptop, and you see each answer as it arrives.',
  },
  results: {
    title: 'See how it went.',
    text: 'See every learner’s results, lesson by lesson. Open a learner to see their work and your feedback.',
    points: ['Results for the whole class', 'A portfolio for each learner', 'What to look at before the next lesson'],
    main: { name: 'reports', alt: 'The class report: each learner’s score in each lesson.' },
    detail: { name: 'portfolio', at: { x: 0.19, y: 0.55, w: 0.81, h: 0.25 }, alt: 'A learner’s portfolio: average, lessons done and work kept.', caption: 'One learner’s portfolio' },
  },
  reflect: {
    title: 'Look back on the lesson.',
    text: 'Write down what you noticed while it’s fresh. Come back to it when you plan the next lesson.',
    points: ['Notes and reflections on your own lessons', 'On your own or with colleagues'],
    main: { name: 'collab', alt: 'Collab: a page to reflect on a lesson or look into a question.' },
  },
  grow: {
    title: 'Talk it through with your coach.',
    text: 'Teacher’s Companion asks good questions and suggests one small change to try. It can draft a note for you to keep. It’s private to you.',
    main: { name: 'companion', alt: 'Teacher’s Companion: a conversation about a quiet speaking activity, with a small change to try next time.' },
  },
  connect: {
    title: 'Share ideas with colleagues.',
    text: 'Call a colleague, work on materials together and swap ideas. Spaces for teachers who share an interest are coming later.',
    main: { name: 'rooms', alt: 'Rooms: call a colleague or open a class’s video room.' },
    detail: { name: 'collab-editor', at: { x: 0, y: 0, w: 1, h: 0.62 }, alt: 'A shared plan that colleagues edit together.', caption: 'A plan you write together' },
  },
};

function TeachPane() {
  const [live, setLive] = useState(false);
  return (
    <>
      <div className="pub-same-row">
        <Shot name="editor" alt="The lesson in the editor." caption="As you edit it" className="pub-same-edit" />
        <PicShot kind="phone" name="learner-phone" w={780} h={1440} alt="The same task on a learner’s phone, with the right answer checked." caption="On a learner’s phone" />
        <PicShot kind="paper" name="paper" w={PAPER.w} h={PAPER.h} alt="The same lesson as a printed worksheet, with a QR code to play the recording." caption="On paper" />
      </div>
      <div className="pub-more">
        <button type="button" className="pub-secondary" aria-expanded={live} aria-controls="pub-live" onClick={() => setLive(!live)}>
          {live ? 'Hide the example' : 'See answers arrive live'}
        </button>
      </div>
      {live && <div id="pub-live"><LiveDemo /></div>}
    </>
  );
}

function How({ at, setAt }: { at: number; setAt: (i: number) => void }) {
  const step = CYCLE[at];
  const pane = PANES[step.id];
  return (
    <section id="how" className="pub-how" aria-labelledby="pub-how-h">
      <div className="pub-band-head">
        <span className="pub-kicker">How it works</span>
        <h2 id="pub-how-h">Your whole teaching cycle, in one place.</h2>
      </div>
      <div className="pub-how-tabs" role="tablist" aria-label="Steps of your teaching cycle">
        {CYCLE.map((c, i) => (
          <button key={c.id} type="button" role="tab" id={`pub-t-${c.id}`} aria-selected={at === i} aria-controls="pub-how-panel" tabIndex={at === i ? 0 : -1} onClick={() => setAt(i)}
            onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const n = (at + d + CYCLE.length) % CYCLE.length; setAt(n); document.getElementById(`pub-t-${CYCLE[n].id}`)?.focus(); } }}>
            <span>{i + 1}</span>{c.label}
          </button>
        ))}
      </div>
      <div id="pub-how-panel" role="tabpanel" aria-labelledby={`pub-t-${step.id}`} className={'pub-how-panel pub-how-' + step.id} key={step.id}>
        <div className="pub-how-copy">
          <h3>{pane.title}</h3>
          <p>{pane.text}</p>
          {pane.points && <ul>{pane.points.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
        <div className="pub-how-media">
          {step.id === 'teach' ? <TeachPane /> : (
            <>
              {pane.main && <Shot name={pane.main.name} alt={pane.main.alt} />}
              {pane.detail && <Shot name={pane.detail.name} at={pane.detail.at} alt={pane.detail.alt} caption={pane.detail.caption} className="pub-detail" />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ why we made it

function Care() {
  return (
    <section className="pub-care" aria-labelledby="pub-care-h">
      <span className="pub-kicker">Why we made ELT Suite</span>
      <h2 id="pub-care-h">Made with care, by teachers, for teachers.</h2>
      <p>We know the late nights planning, the queue at the photocopier and the moment a class finally gets it.</p>
      <p>We made ELT Suite to take some of the weight off, so you have more time for your learners.</p>
      <p className="pub-care-ask"><Link to="/contact">Tell us what would help your teaching</Link>. We’re listening.</p>
    </section>
  );
}

const TEACHES = ['Adults', 'Teenagers', 'Young learners', 'Exam classes', 'Business English', 'A mix'];

function InviteForm() {
  const [f, setF] = useState({ name: '', email: '', place: '', teaches: '', note: '', website: '' });
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  const [sentTo, setSentTo] = useState({ name: '', email: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const nameOk = f.name.trim().length > 0;
  const emailOk = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(f.email.trim());
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!nameOk || !emailOk || state === 'busy') return;
    setState('busy');
    try {
      // A filled-in hidden field means a bot: say thanks and keep nothing.
      if (!f.website) await (await import('../lib/invitationRequests')).askForInvitation(f);
      setSentTo({ name: f.name.trim().split(/\s+/)[0], email: f.email.trim() });
      setF({ name: '', email: '', place: '', teaches: '', note: '', website: '' });
      setTried(false);
      setState('sent');
    } catch {
      setState('failed');
    }
  };
  if (state === 'sent') {
    return (
      <div className="pub-invite-form pub-invite-done" role="status">
        <h3>Thanks, {sentTo.name}.</h3>
        <p>We’ve got your request. We’ll email {sentTo.email} when there’s a place for you.</p>
        <button type="button" className="pub-text-button" onClick={() => setState('idle')}>Send another request</button>
      </div>
    );
  }
  return (
    <form className="pub-invite-form" onSubmit={(e) => void send(e)} noValidate aria-labelledby="pub-invite-h">
      <label className="pub-field">
        <span>Your name</span>
        <input autoComplete="name" maxLength={80} value={f.name} onChange={set('name')} aria-invalid={tried && !nameOk} aria-describedby={tried && !nameOk ? 'pub-inv-name-err' : undefined} />
        {tried && !nameOk && <span className="pub-field-err" id="pub-inv-name-err">Add your name.</span>}
      </label>
      <label className="pub-field">
        <span>Email</span>
        <input type="email" autoComplete="email" maxLength={120} value={f.email} onChange={set('email')} aria-invalid={tried && !emailOk} aria-describedby={tried && !emailOk ? 'pub-inv-email-err' : undefined} />
        {tried && !emailOk && <span className="pub-field-err" id="pub-inv-email-err">Check your email address.</span>}
      </label>
      <div className="pub-field-pair">
        <label className="pub-field">
          <span>Where you teach <i>(optional)</i></span>
          <input autoComplete="organization" maxLength={120} placeholder="A school, or on your own" value={f.place} onChange={set('place')} />
        </label>
        <label className="pub-field">
          <span>Who you teach <i>(optional)</i></span>
          <select value={f.teaches} onChange={set('teaches')}>
            <option value="">Choose…</option>
            {TEACHES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="pub-field">
        <span>Anything you’d like us to know <i>(optional)</i></span>
        <textarea rows={3} maxLength={600} placeholder="What you’d like to use ELT Suite for" value={f.note} onChange={set('note')} />
      </label>
      <label className="pub-hp" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label>
      {state === 'failed' && <p className="pub-form-err" role="alert">We couldn’t send that just now. Check your connection and try again. What you typed is still here.</p>}
      <div className="pub-actions">
        <button type="submit" className="pub-button" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Ask for an invitation'}</button>
      </div>
      <p className="pub-note">We only use your email to reply about your invitation.</p>
    </form>
  );
}

function Invite() {
  return (
    <section id="invite" className="pub-band pub-invite" aria-labelledby="pub-invite-h">
      <div className="pub-invite-copy">
        <span className="pub-kicker">Invitations</span>
        <h2 id="pub-invite-h">Ask for an invitation.</h2>
        <p>We’re letting teachers in a few at a time. Tell us a little about your teaching and we’ll email you when there’s a place.</p>
        <p className="pub-audience">ELT Suite is for ELT professionals: English language teachers, teacher trainers and the schools they work in.</p>
        <p className="pub-invite-have">Already have a code? <Link to="/signin?invite">Sign in with your code</Link></p>
      </div>
      <InviteForm />
    </section>
  );
}

// Screens on the page when it opens ease in as they come into view (only the pictures, never text,
// and not with reduced motion). Screens in a tab opened later come in with the tab.
function useReveal() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...root.querySelectorAll<HTMLElement>('.pub-frame, .pub-hero-shot .pub-screen')];
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { (e.target as HTMLElement).dataset.shown = ''; io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    root.classList.add('pub-reveal');
    els.forEach((el) => { el.dataset.reveal = ''; io.observe(el); });
    return () => { io.disconnect(); root.classList.remove('pub-reveal'); els.forEach((el) => { delete el.dataset.shown; delete el.dataset.reveal; }); };
  }, []);
  return ref;
}

export function PublicHome() {
  const ref = useReveal();
  const [at, setAt] = useState(0);
  return (
    <PublicLayout>
      <main id="public-main" className="pub-home" ref={ref}>
        <Hero onStep={setAt} />
        <How at={at} setAt={setAt} />
        <Care />
        <Invite />
      </main>
    </PublicLayout>
  );
}

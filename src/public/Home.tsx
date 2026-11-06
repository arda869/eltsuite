import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from './PublicSite';
import './home.css';

const LanguageMoment = lazy(() => import('./LanguageMoment').then((m) => ({ default: m.LanguageMoment })));

// Screens from ELT Suite with a fictional class (test/landing-seed.ts, test/landing-shots.mjs).
// Each is in public/landing at 2400 × 1500, with a 1100 × 688 copy for small screens.
const W = 2400, H = 1500;
const PAPER = { w: 1130, h: 1598 }; // public/landing/paper.webp, the printed page
const src = (name: string) => `/landing/${name}.webp`;
const srcSet = (name: string) => `/landing/${name}-sm.webp 1100w, /landing/${name}.webp 2400w`;

function Mounted({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setOn(true);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="pub-mounted">{on ? <Suspense fallback={<p className="pub-note">One moment…</p>}>{children}</Suspense> : <p className="pub-note">{label}</p>}</div>;
}

// Part of a screen, cut to the region given as fractions of the whole picture.
type Region = { x: number; y: number; w: number; h: number };
// A close-up of part of a screenshot. Where the close-up cuts into the screen, that side fades out, so
// it reads as a deliberate detail rather than a picture cropped by mistake. Real screen edges stay sharp.
function cropFade(at: Region): CSSProperties {
  const sides: [string, boolean][] = [['to right', at.x > 0.01], ['to left', at.x + at.w < 0.99], ['to bottom', at.y > 0.01], ['to top', at.y + at.h < 0.99]];
  const masks = sides.filter(([, cut]) => cut).map(([dir]) => `linear-gradient(${dir}, transparent 0, #000 9%)`);
  if (!masks.length) return {};
  const image = masks.join(', ');
  return { WebkitMaskImage: image, maskImage: image, WebkitMaskComposite: masks.map(() => 'source-in').join(', '), maskComposite: 'intersect' } as CSSProperties;
}

function Crop({ name, at, alt, width = 300, eager = false }: { name: string; at: Region; alt: string; width?: number; eager?: boolean }) {
  const style = { aspectRatio: `${at.w * W} / ${at.h * H}`, '--cx': at.x, '--cy': at.y, '--cw': at.w, '--ch': at.h, ...cropFade(at) } as CSSProperties;
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
        <form method="dialog"><button className="pub-lightbox-close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></form>
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
        <form method="dialog"><button className="pub-lightbox-close" aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></form>
      </dialog>
    </figure>
  );
}

// ------------------------------------------------------------------ hero

const CYCLE = ['Plan', 'Teach', 'See results', 'Reflect', 'Grow with your coach', 'Connect with colleagues'];

function Hero() {
  return (
    <section className="pub-hero" aria-labelledby="pub-hero-h">
      <div className="pub-hero-copy">
        <span className="pub-kicker">By teachers, for teachers</span>
        <h1 id="pub-hero-h">Plan it, teach it, see how it went. Then keep growing.</h1>
        <ol className="pub-cycle" aria-label="Your teaching cycle in ELT Suite">
          {CYCLE.map((c) => <li key={c}>{c}</li>)}
        </ol>
        <p>Your whole teaching cycle, in one place: plan the lesson, teach it, see your learners’ results, reflect on it, talk it through with your coach and share ideas with colleagues. And teach it your way: online, on the classroom screen or on paper.</p>
        <div className="pub-actions">
          <a className="pub-button" href="#invite">Ask for an invitation</a>
          <Link className="pub-secondary" to="/signin">Sign in</Link>
        </div>
        <span className="pub-note">We’re open by invitation for now. Ask, and we’ll email you when there’s a place.</span>
      </div>
      <figure className="pub-hero-shot">
        <div className="pub-hero-stage">
          <Screen name="editor" eager sizes="(min-width: 1100px) 760px, 100vw" alt="The ELT Suite lesson editor with the B1 lesson “Expressing and Justifying Opinions”: lesson aims, a two-person recording with numbered lines, and the teacher’s notes." />
          <div className="pub-hero-pops" aria-hidden="true">
            <span className="pub-pop pub-pop-report"><Crop name="reports" at={{ x: 0.005, y: 0.5, w: 0.56, h: 0.37 }} alt="" width={320} eager /></span>
            <span className="pub-pop pub-pop-coach"><Crop name="companion" at={{ x: 0.26, y: 0.46, w: 0.58, h: 0.4 }} alt="" width={340} eager /></span>
            <span className="pub-pop pub-pop-phone"><Phone name="learner-phone" eager /></span>
          </div>
        </div>
      </figure>
    </section>
  );
}

// ------------------------------------------------------------------ teach your way

const ic = (d: ReactNode) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const WAYS: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'Teach online', text: 'Meet your class in a video room and teach from your lesson. Learners follow and answer on their own screens.', icon: ic(<><rect x="3" y="5" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>) },
  { title: 'On the classroom screen', text: 'Put your lesson on the smart screen or projector and teach the room from it, with your notes beside you.', icon: ic(<><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8" /></>) },
  { title: 'On paper', text: 'Print any lesson as a worksheet, with an answer key, and teach without screens or a connection.', icon: ic(<><path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></>) },
  { title: 'Answers checked online', text: 'Learners answer in class or at home on a phone or laptop. Their answers are checked, and you see the results.', icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></>) },
];

function Ways() {
  return (
    <section id="your-way" className="pub-ways" aria-labelledby="pub-ways-h">
      <div className="pub-band-head">
        <span className="pub-kicker">Teach your way</span>
        <h2 id="pub-ways-h">You decide how you use it.</h2>
        <p>Every class and every room is different. Use ELT Suite online, in the classroom or on paper, and mix them as you like: print the worksheet for the lesson, then set the practice online for homework.</p>
      </div>
      <figure className="pub-same" aria-labelledby="pub-same-cap">
        <figcaption id="pub-same-cap"><strong>The same lesson, three ways.</strong> One lesson, “Expressing and justifying opinions”, as you edit it, as a learner sees it on their phone, and as it comes out of the printer.</figcaption>
        <div className="pub-same-row">
          <Shot name="editor" alt="The lesson in the editor: the task “Two neighbours decide” with its aims, the recording and the teacher’s notes." caption="In the editor" className="pub-same-edit" />
          <PicShot kind="phone" name="learner-phone" w={780} h={1440} alt="The same task on a learner’s phone: the recording and a question, with the right answer checked." caption="On a learner’s phone" />
          <PicShot kind="paper" name="paper" w={PAPER.w} h={PAPER.h} alt="The same lesson as a printed worksheet: the task with a QR code to play the recording, the useful language and gaps to complete." caption="On paper" />
        </div>
      </figure>
      <ul className="pub-ways-list">
        {WAYS.map((w) => (
          <li key={w.title}>
            <span className="pub-ways-icon">{w.icon}</span>
            <h3>{w.title}</h3>
            <p>{w.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ everything in one place

const ALL: { k: string; title: string; text: string; to: string; name: string; at: Region }[] = [
  { k: '01', title: 'Lesson planning', text: 'Plan lessons task by task, with aims, activities and your notes.', to: '#plan', name: 'editor-language', at: { x: 0.28, y: 0.1, w: 0.52, h: 0.42 } },
  { k: '02', title: 'Teaching', text: 'Teach online, on the classroom screen or from printed worksheets.', to: '#your-way', name: 'teach', at: { x: 0.5, y: 0.08, w: 0.5, h: 0.42 } },
  { k: '03', title: 'Learner progress', text: 'Every learner’s answers, results and portfolio, lesson by lesson.', to: '#understand', name: 'reports', at: { x: 0.005, y: 0.5, w: 0.5, h: 0.36 } },
  { k: '04', title: 'Materials and recordings', text: 'Worksheets, dialogues, recordings and classroom songs.', to: '#audio', name: 'speech', at: { x: 0.13, y: 0.5, w: 0.6, h: 0.42 } },
  { k: '05', title: 'Your development', text: 'Talk your teaching through with Teacher’s Companion, and reflect with colleagues.', to: '#reflect', name: 'companion', at: { x: 0.26, y: 0.46, w: 0.58, h: 0.4 } },
  { k: '06', title: 'Language', text: 'Pronunciation marks and real example sentences for your teaching.', to: '#language', name: 'concordance', at: { x: 0.12, y: 0.1, w: 0.6, h: 0.45 } },
];

function AllInOne() {
  return (
    <section className="pub-all" aria-labelledby="pub-all-h">
      <div className="pub-band-head">
        <span className="pub-kicker">All in one place</span>
        <h2 id="pub-all-h">One place for everything you teach.</h2>
        <p>No more jumping between apps, folders and spreadsheets. Your planning, your classes, your learners’ progress and your own growth as a teacher live together, and each part builds on the others.</p>
      </div>
      <ul className="pub-all-list">
        {ALL.map((a) => (
          <li key={a.k}>
            <a href={a.to}>
              <Crop name={a.name} at={a.at} alt="" width={360} />
              <span className="pub-all-k">{a.k}</span>
              <strong>{a.title}</strong>
              <span className="pub-all-t">{a.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ why we made it

function Care() {
  return (
    <section className="pub-care" aria-labelledby="pub-care-h">
      <div className="pub-care-copy">
        <span className="pub-kicker">Why we made ELT Suite</span>
        <h2 id="pub-care-h">Made with care, by teachers, for teachers.</h2>
        <p>ELT Suite began with a love of English language teaching. We know the late nights planning, the queue at the photocopier and the moment a class finally gets it.</p>
        <p>We built it to take some of the weight off you, so you have more time and energy for your learners. Every part of it is shaped by what teachers tell us they need.</p>
        <p className="pub-care-ask">We’re listening. <Link to="/contact">Tell us what would help your teaching</Link>, and we’ll keep building.</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ teach live: a short demonstration

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
      <p className="sr-only">A short demonstration with a fictional class. Six learners answer the question “Which reply gives a reason?” on their own screens. As each answer arrives, the teacher’s panel shows who chose which reply and how many chose the right one.</p>
      <div className="pub-live-stage" aria-hidden="true">
        <div className="pub-live-learner">
          <div className="pub-live-bar"><span>Mia’s phone</span><span>B1 English for Communication</span></div>
          <div className="pub-live-task">
            <span className="pub-live-k">Task 3 · Choose a reply</span>
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
        <span className="pub-note">A short demonstration with a fictional class.</span>
        <button type="button" className="pub-secondary pub-small" aria-pressed={!playing} onClick={() => { if (!playing && step >= CLASS.length + HOLD) setStep(0); setPlaying(!playing); }}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
    </div>
  );
}

function Live() {
  return (
    <section id="teach" className="pub-band pub-live-band" aria-labelledby="pub-teach-h">
      <div className="pub-band-head">
        <span className="pub-kicker">Teach live</span>
        <h2 id="pub-teach-h">See every answer as it arrives.</h2>
        <p>Learners answer on their own phone or laptop. You see each answer the moment they choose, so you know who needs help before you move on. It works in the classroom and online.</p>
      </div>
      <LiveDemo />
    </section>
  );
}

// ------------------------------------------------------------------ showcases

type Detail = { name: string; alt: string; at: Region; caption?: string };
type Showcase = { id: string; kicker: string; title: string; body: string[]; points: string[]; status?: string; main: { name: string; alt: string }; details?: Detail[]; extra?: ReactNode };
const SHOWCASES: Showcase[] = [
  {
    id: 'plan', kicker: 'Plan', title: 'From first idea to finished lesson.',
    body: ['Plan a lesson task by task, with its aims, activities and your notes together.', 'Make materials yourself, or ask for help with a first draft when you want it. The lesson stays yours.'],
    points: ['Gaps, speaking cards, recordings and more in one lesson.', 'Units and lessons for each class.', 'Print any lesson as a worksheet.'],
    main: { name: 'editor-language', alt: 'The lesson editor on the task “Notice the language”: a useful language box, sentences with gaps for point, about and because, and the teacher’s notes.' },
    details: [{ name: 'class', alt: 'The class page: Unit 1 · Talking together and Unit 2 · Opinions and decisions, with their lessons.', at: { x: 0.01, y: 0.44, w: 0.6, h: 0.56 }, caption: 'Units and lessons in a class' }],
  },
  {
    id: 'understand', kicker: 'Understand', title: 'See how each learner is doing.',
    body: ['The class report shows every learner’s score in every lesson.', 'Open a learner to see their work, your feedback and what they’ve kept in their portfolio.'],
    points: ['Results for the class, lesson by lesson.', 'A portfolio for each learner.', 'A clear picture before you plan the next lesson.'],
    main: { name: 'reports', alt: 'The class report: eight learners and their scores in each of eight lessons.' },
    details: [{ name: 'portfolio', alt: 'A learner’s portfolio: her average, lessons completed and pieces of work kept.', at: { x: 0.19, y: 0.55, w: 0.81, h: 0.25 }, caption: 'One learner’s portfolio' }],
  },
  {
    id: 'audio', kicker: 'Recordings', title: 'Make recordings for your class.',
    body: ['Record and edit audio, or make a dialogue with different voices from a script you write.', 'You can also make a short song for a lesson, at your learners’ level.'],
    points: ['A recording editor with the script and timings.', 'Dialogues with two or more voices.', 'Classroom songs for young learners, teenagers and adults.'],
    main: { name: 'sound', alt: 'The recording editor: a dialogue between Flo and Dan as a waveform, their lines on separate script tracks and the script with timings.' },
    details: [{ name: 'song', alt: 'Making a classroom song: choose young learners, teenagers or adults, a language level and a lesson.', at: { x: 0.15, y: 0.02, w: 0.7, h: 0.5 } }],
  },
  {
    id: 'language', kicker: 'Language', title: 'Look closely at language.',
    body: ['Mark pronunciation and grammar in your lessons: linking, sounds and grammar labels, as you’d draw them on the board.', 'Look up how a phrase is used in real example sentences, and bring good examples back into your teaching.'],
    points: ['Pronunciation and grammar marks in your lessons.', 'Example sentences for any word or phrase.'],
    status: 'Examples come from Tatoeba. They show how a phrase is used, not how common it is.',
    main: { name: 'concordance', alt: 'A concordance for “your point”: example sentences lined up around the phrase, such as “I see your point.” and “What’s your point?”' },
    extra: <Mounted label="Good teaching is worth sharing."><LanguageMoment /></Mounted>,
  },
];

function ShowcaseSection({ s, i }: { s: Showcase; i: number }) {
  return (
    <section id={s.id} className={'pub-show' + (i % 2 ? ' pub-show-flip' : '')} aria-labelledby={`pub-${s.id}-h`}>
      <div className="pub-show-copy">
        <span className="pub-kicker">{s.kicker}</span>
        <h2 id={`pub-${s.id}-h`}>{s.title}</h2>
        {s.body.map((b) => <p key={b}>{b}</p>)}
        <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
        {s.status && <p className="pub-status">{s.status}</p>}
      </div>
      <div className="pub-show-media">
        {s.extra}
        <Shot name={s.main.name} alt={s.main.alt} />
        {s.details && (
          <div className="pub-details">
            {s.details.map((d) => <Shot key={d.name} name={d.name} at={d.at} alt={d.alt} caption={d.caption} className="pub-detail" />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ one lesson to the next

const STEPS = [
  { k: 'Plan', line: 'Prepare the activities, language and notes you’ll need.', name: 'editor-speaking', alt: 'Planning a speaking task: a prompt, questions for the card and the teacher’s notes.' },
  { k: 'Teach', line: 'Teach from your lesson and get every learner involved.', name: 'teach', alt: 'Teaching live, with learners’ answers in the side panel.' },
  { k: 'Understand', line: 'Look at your learners’ answers, results and feedback.', name: 'reports', alt: 'The class report, learner by lesson.' },
  { k: 'Reflect', line: 'Think back on the lesson in Collab, on your own or with colleagues.', name: 'collab', alt: 'Collab: reflect on a lesson or investigate a question.' },
  { k: 'Grow', line: 'Talk it through with Teacher’s Companion and take your ideas into the next lesson.', name: 'companion', alt: 'Teacher’s Companion: a conversation about a quiet B1 opinions discussion, with a small change to try next lesson.' },
];

function Steps() {
  const [at, setAt] = useState(0);
  const step = STEPS[at];
  return (
    <section id="reflect" className="pub-band pub-journey" aria-labelledby="pub-journey-h">
      <div className="pub-band-head">
        <span className="pub-kicker">Plan, teach, reflect</span>
        <h2 id="pub-journey-h">One lesson leads to the next.</h2>
        <p>Plan a lesson and teach it. See how your learners did. Think about what worked, then take it into the next lesson. ELT Suite keeps all of it together, so you build on what you’ve already done.</p>
      </div>
      <div className="pub-journey-steps" role="tablist" aria-label="From one lesson to the next">
        {STEPS.map((j, i) => (
          <button key={j.k} type="button" role="tab" id={`pub-j-${i}`} aria-selected={at === i} aria-controls="pub-j-panel" tabIndex={at === i ? 0 : -1} onClick={() => setAt(i)}
            onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const n = (at + d + STEPS.length) % STEPS.length; setAt(n); document.getElementById(`pub-j-${n}`)?.focus(); } }}>
            <span>{i + 1}</span>{j.k}
          </button>
        ))}
      </div>
      <div id="pub-j-panel" role="tabpanel" aria-labelledby={`pub-j-${at}`} className="pub-journey-panel">
        <p>{step.line}</p>
        <Shot key={step.name} name={step.name} alt={step.alt} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ ask for an invitation

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
        <p>We’re opening ELT Suite to teachers a few at a time, so we can listen and get things right.</p>
        <p>Tell us a little about your teaching and we’ll email you when there’s a place.</p>
        <p className="pub-audience">ELT Suite is for ELT professionals: English language teachers, teacher trainers and the schools they work in.</p>
        <p className="pub-invite-have">Already have an invitation code? <Link to="/signin?invite">Sign in with your code</Link></p>
        <div className="pub-future">
          <strong>Coming later: communities for teachers</strong>
          <p>Spaces where teachers with shared interests can swap ideas and learn from each other.</p>
        </div>
      </div>
      <InviteForm />
    </section>
  );
}

// ------------------------------------------------------------------ page

// Screens ease in as they come into view (only the pictures, never text, and not with reduced motion).
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
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove('pub-reveal'); els.forEach((el) => delete el.dataset.shown); };
  }, []);
  return ref;
}

export function PublicHome() {
  const ref = useReveal();
  return (
    <PublicLayout>
      <main id="public-main" className="pub-home" ref={ref}>
        <Hero />
        <AllInOne />
        <Care />
        <Ways />
        <Live />
        <div className="pub-shows">
          {SHOWCASES.map((s, i) => <ShowcaseSection key={s.id} s={s} i={i} />)}
        </div>
        <Steps />
        <Invite />
      </main>
    </PublicLayout>
  );
}

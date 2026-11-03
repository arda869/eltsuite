import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicLayout } from './PublicSite';
import './home.css';

const LanguageMoment = lazy(() => import('./LanguageMoment').then((m) => ({ default: m.LanguageMoment })));

// Screens from ELT Suite with a fictional class (test/landing-seed.ts, test/landing-shots.mjs).
// Each is in public/landing at 2400 × 1500, with a 1100 × 688 copy for small screens.
const W = 2400, H = 1500;
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

// ------------------------------------------------------------------ hero

type Preview = { id: string; title: string; line: string; more: string; to: string; name: string; at: Region; alt: string };
const PREVIEWS: Preview[] = [
  { id: 'a', title: 'See how your learners are progressing.', line: 'Progress, feedback and next steps.', more: 'See what your learners have done and use their progress to inform what you teach next.', to: '#understand', name: 'reports', at: { x: 0.005, y: 0.495, w: 0.56, h: 0.37 }, alt: 'Class report: each learner’s score in every lesson' },
  { id: 'b', title: 'Record. Edit. Refine.', line: 'Shape audio for your classroom.', more: 'Record your own audio, edit it or generate a new recording. Then bring it straight into your lesson.', to: '#audio', name: 'sound', at: { x: 0, y: 0.065, w: 0.72, h: 0.6 }, alt: 'Recording editor: a dialogue’s waveform with each speaker’s lines' },
  { id: 'c', title: 'Create with AI. Make it your own.', line: 'Voices, recordings and songs.', more: 'Create a song for your lesson, refine the result and make it work for your learners.', to: '#audio', name: 'speech', at: { x: 0.13, y: 0.53, w: 0.74, h: 0.38 }, alt: 'Speech composer: a two-person dialogue, line by line' },
  { id: 'd', title: 'Bring your lesson to life.', line: 'Activities made for participation.', more: 'Move from planning to participation with activities learners can actually use.', to: '#teach', name: 'teach', at: { x: 0.815, y: 0.1, w: 0.185, h: 0.48 }, alt: 'Live teaching panel: learners’ answers arriving as they choose' },
];

function HeroPreview({ p, i }: { p: Preview; i: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const touch = () => window.matchMedia('(hover: none)').matches;
  return (
    <div className={`pub-float pub-float-${p.id}`} data-open={open || undefined} style={{ '--i': i } as CSSProperties}>
      <button type="button" className="pub-float-card" aria-expanded={touch() ? open : undefined} aria-describedby={`pub-float-more-${p.id}`} onClick={() => (touch() ? setOpen(!open) : navigate(p.to))}>
        <Crop name={p.name} at={p.at} alt={p.alt} width={p.id === 'd' ? 180 : 300} eager />
        <span className="pub-float-text">
          <strong>{p.title}</strong>
          <span>{p.line}</span>
        </span>
      </button>
      <p id={`pub-float-more-${p.id}`} className="pub-float-more">
        {p.more} <Link to={p.to} tabIndex={open ? 0 : -1}>Take a closer look →</Link>
      </p>
    </div>
  );
}

function Hero() {
  return (
    <section className="pub-hero" aria-labelledby="pub-hero-h">
      <div className="pub-hero-copy">
        <span className="pub-kicker">A place for English language teachers.</span>
        <h1 id="pub-hero-h">Everything you need to <em>teach.</em><br />A community to <em>grow with.</em></h1>
        <p>Created out of a love for English language teaching, ELT Suite brings lesson planning, classroom tools, professional learning and collaboration into one connected space. Built around teachers and the work they do every day.</p>
        <div className="pub-actions">
          <a className="pub-button" href="#plan">Explore ELT Suite</a>
          <Link className="pub-secondary" to="/signin">Sign In</Link>
        </div>
        <span className="pub-note">Take a look around. No account needed.</span>
      </div>
      <div className="pub-stage">
        <figure className="pub-stage-main">
          <Screen name="editor" eager sizes="(min-width: 1100px) 900px, 100vw" alt="The ELT Suite lesson editor with the B1 lesson “Expressing and Justifying Opinions”: lesson aims, a two-person recording with numbered lines, and the teacher’s notes." />
        </figure>
        <div className="pub-floats" role="list" aria-label="More of ELT Suite">
          {PREVIEWS.map((p, i) => <div role="listitem" key={p.id}><HeroPreview p={p} i={i} /></div>)}
        </div>
      </div>
      <p className="pub-stage-note">Real screens from ELT Suite, with a fictional class.</p>
    </section>
  );
}

// ------------------------------------------------------------------ showcases

type Detail = { name: string; alt: string; at: Region; caption: string };
type Showcase = { id: string; kicker: string; title: string; body: string[]; points: string[]; status: string; main: { name: string; alt: string }; details?: Detail[] };
const SHOWCASES: Showcase[] = [
  {
    id: 'plan', kicker: 'PLAN', title: 'From the first idea to the finished lesson.',
    body: ['Build a lesson task by task: a recording to listen to, the language to notice, a speaking activity and a moment to look back. Each task keeps its own teaching notes, and only you see them.'],
    points: ['Questions, gaps, writing, speaking prompts and post-it boards in one lesson.', 'Language boxes and pronunciation, marked the way you’d mark them on the board.', 'Every lesson sits in its class, unit by unit.'],
    status: 'Available now. AI can help create and adapt individual activities.',
    main: { name: 'editor-language', alt: 'The lesson editor on the task “Notice the language”: a useful language box, sentences with gaps for point, about and because, and the teacher’s notes.' },
    details: [{ name: 'class', alt: 'The class page: Unit 1 · Talking together and Unit 2 · Opinions and decisions, with their lessons.', at: { x: 0.01, y: 0.44, w: 0.6, h: 0.56 }, caption: 'Units and lessons in the class' }],
  },
  {
    id: 'teach', kicker: 'TEACH', title: 'Bring your lesson to life.',
    body: ['Teach from the same lesson you planned. Show one task at a time, keep your notes beside you and see each learner’s answer arrive as they choose it. In the room or online.'],
    points: ['Learners follow along on their own devices.', 'Show an answer to the whole class with one click.', 'Rooms gives every class its own video room. Start it from the lesson, or call a colleague.', 'Timers and games when the class needs a change of pace.'],
    status: 'Available now.',
    main: { name: 'teach', alt: 'Teaching the lesson live: the task on screen, the teacher’s notes below and, on the right, each learner’s answer to the question.' },
    details: [
      { name: 'learner', alt: 'What a learner sees: the same task with the recording and three answer choices.', at: { x: 0.17, y: 0.08, w: 0.83, h: 0.55 }, caption: 'The learner’s view of the same task' },
      { name: 'rooms', alt: 'Rooms: start a call, call a colleague, or open a class’s own video room.', at: { x: 0.005, y: 0.1, w: 0.99, h: 0.86 }, caption: 'Rooms: a video room for every class' },
    ],
  },
  {
    id: 'understand', kicker: 'UNDERSTAND', title: 'Every learner has a story to tell.',
    body: ['See the whole class at a glance, then open one learner’s portfolio. Results, kept pieces of work and skills sit together, so the next step is easier to see.'],
    points: ['A class report across every lesson.', 'A portfolio for each learner, with their results over the course.', 'A grey dot means not started, not a score of zero.'],
    status: 'Available now.',
    main: { name: 'reports', alt: 'The class report: eight learners and their scores in each of eight lessons.' },
    details: [{ name: 'portfolio', alt: 'A learner’s portfolio: her average, lessons completed and pieces of work kept.', at: { x: 0.19, y: 0.55, w: 0.81, h: 0.25 }, caption: 'One learner’s portfolio' }],
  },
  {
    id: 'audio', kicker: 'AUDIO AND MEDIA', title: 'Make your materials sound the way you want.',
    body: ['Record a dialogue, trim it and give each line to a speaker. Learners can follow the words as they listen. Or write the conversation and choose voices, or make a short song for your lesson.'],
    points: ['A recording editor with tracks, a script and sound cues.', 'Two-voice dialogues, written line by line.', 'Songs made for a level, a group of learners and a lesson.'],
    status: 'Available now. Voices and songs made with AI have running costs, so how much you can make may be limited.',
    main: { name: 'sound', alt: 'The recording editor: a dialogue between Flo and Dan as a waveform, their lines on separate script tracks and the script with timings.' },
    details: [{ name: 'song', alt: 'Making a classroom song: choose young learners, teenagers or adults, a language level and a lesson.', at: { x: 0.15, y: 0.02, w: 0.7, h: 0.5 }, caption: 'Making a classroom song' }],
  },
  {
    id: 'language', kicker: 'LANGUAGE', title: 'A deeper understanding of language.',
    body: ['Look at a phrase the way learners meet it. Search real example sentences, line them up around the words you’re teaching and keep the ones that help.'],
    points: ['A concordance with left and right context.', 'Keep examples with their source, and note what you notice.', 'The examples come from Tatoeba, a shared collection of sentences. It isn’t a balanced corpus, and the page says so.'],
    status: 'Available now in Development Studio.',
    main: { name: 'concordance', alt: 'A concordance for “your point”: example sentences lined up around the phrase, such as “I see your point.” and “What’s your point?”' },
  },
  {
    id: 'collaborate', kicker: 'COLLABORATE', title: 'Good teaching doesn’t happen in isolation.',
    body: ['Plan with colleagues in the same document, at the same time. Then make room for your own reflection, reading and questions in Development Studio.'],
    points: ['Documents and slides you write together, live.', 'An organisation’s shared library.', 'Private reflections, reading journals and a teaching coach.'],
    status: 'Available now.',
    main: { name: 'development', alt: 'Development Studio: reflect on a lesson, explore your reading, investigate a question or discuss with your coach.' },
    details: [{ name: 'collab', alt: 'Collab: your documents, the ones shared with you and the Harbour School library.', at: { x: 0, y: 0.09, w: 0.62, h: 0.25 }, caption: 'Collab: documents and slides you write together' }],
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
        <p className="pub-status">{s.status}</p>
      </div>
      <div className="pub-show-media">
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

// ------------------------------------------------------------------ connected journey

const JOURNEY = [
  { k: 'Plan', line: 'Choose the tasks, the language and the notes you’ll need.', name: 'editor-speaking', alt: 'Planning a speaking task: a prompt, questions for the card and the teacher’s notes.' },
  { k: 'Teach', line: 'Teach from the same lesson, in the classroom or in Rooms, and see answers as they arrive.', name: 'teach', alt: 'Teaching live, with learners’ answers in the side panel.' },
  { k: 'Understand', line: 'See what each learner did, lesson by lesson.', name: 'reports', alt: 'The class report, learner by lesson.' },
  { k: 'Reflect', line: 'Write down what worked, and what you’d like to try.', name: 'development', alt: 'Development Studio: reflect on a lesson or investigate a question.' },
  { k: 'Grow', line: 'Talk it through with a coach, then take it into the next lesson.', name: 'coach', alt: 'The teaching coach in Development Studio.' },
];

function Journey() {
  const [at, setAt] = useState(0);
  const step = JOURNEY[at];
  return (
    <section className="pub-journey" aria-labelledby="pub-journey-h">
      <div className="pub-journey-head">
        <span className="pub-kicker">YOUR TEACHING, CONNECTED</span>
        <h2 id="pub-journey-h">One lesson leads to another.</h2>
        <p>Plan a lesson. Teach it. Explore what your learners have done. Reflect on what worked. Then take what you’ve learned into the next lesson. ELT Suite brings these moments together, so your teaching can develop as you go.</p>
      </div>
      <div className="pub-journey-steps" role="tablist" aria-label="From one lesson to the next">
        {JOURNEY.map((j, i) => (
          <button key={j.k} type="button" role="tab" id={`pub-j-${i}`} aria-selected={at === i} aria-controls="pub-j-panel" tabIndex={at === i ? 0 : -1} onClick={() => setAt(i)}
            onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const n = (at + d + JOURNEY.length) % JOURNEY.length; setAt(n); document.getElementById(`pub-j-${n}`)?.focus(); } }}>
            <span>{String(i + 1).padStart(2, '0')}</span>{j.k}
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

// ------------------------------------------------------------------ page

export function PublicHome() {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-home">
        <Hero />
        <section className="pub-lang" aria-labelledby="pub-lang-h">
          <div className="pub-lang-copy">
            <span className="pub-kicker">WE SPEAK YOUR LANGUAGE</span>
            <h2 id="pub-lang-h">The little things matter in teaching.</h2>
            <p>From a phonemic transcription to a classroom recording, from a carefully chosen activity to a learner’s next step, we’ve thought about the details that make teaching work.</p>
          </div>
          <Mounted label="Good teaching is worth sharing."><LanguageMoment /></Mounted>
          <p className="pub-lang-close">From the sounds of a word to the shape of a lesson, ELT Suite is built for the details of teaching.</p>
        </section>
        <div className="pub-shows">
          {SHOWCASES.map((s, i) => <ShowcaseSection key={s.id} s={s} i={i} />)}
        </div>
        <Journey />
        <section className="pub-community" aria-labelledby="pub-community-h">
          <span className="pub-kicker">BETTER TOGETHER</span>
          <h2 id="pub-community-h">Good ideas are worth sharing.</h2>
          <p>Some of the most valuable things we learn about teaching come from other teachers. ELT Suite is designed to make that exchange easier, bringing teachers and their ideas closer together.</p>
          <div className="pub-future">
            <strong>Coming later: Communities for teachers.</strong>
            <p>We’re working towards a space where teachers with shared interests can find one another, exchange ideas and explore their practice together. It isn’t open yet.</p>
          </div>
        </section>
        <section className="pub-closing" aria-labelledby="pub-closing-h">
          <h2 id="pub-closing-h">Made for teachers. Built for teaching. Better together.</h2>
          <div className="pub-actions">
            <Link className="pub-button" to="/signin">Sign In</Link>
            <Link className="pub-secondary" to="/pricing">Plans & Pricing</Link>
          </div>
          <span className="pub-note">ELT Suite is open to invited teachers for now. More coming soon.</span>
        </section>
      </main>
    </PublicLayout>
  );
}

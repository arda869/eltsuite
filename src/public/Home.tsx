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
  { id: 'a', title: 'See how your learners are progressing.', line: "Learner progress", more: "Explore responses, feedback and progress across lessons.", to: '#understand', name: 'reports', at: { x: 0.005, y: 0.495, w: 0.56, h: 0.37 }, alt: 'Class report: each learner’s score in every lesson' },
  { id: 'b', title: 'Record. Edit. Refine.', line: "Audio editor", more: "Create and shape recordings for your classroom.", to: '#audio', name: 'sound', at: { x: 0, y: 0.065, w: 0.72, h: 0.6 }, alt: 'Recording editor: a dialogue’s waveform with each speaker’s lines' },
  { id: 'c', title: 'Create with AI. Make it your own.', line: "AI media", more: "Develop voices, dialogues and songs that fit your lesson.", to: '#audio', name: 'speech', at: { x: 0.13, y: 0.53, w: 0.74, h: 0.38 }, alt: 'Speech composer: a two-person dialogue, line by line' },
  { id: 'd', title: 'Bring your lesson to life.', line: "Interactive teaching", more: "Turn activities into opportunities for participation.", to: '#teach', name: 'teach', at: { x: 0.815, y: 0.1, w: 0.185, h: 0.48 }, alt: 'Live teaching panel: learners’ answers arriving as they choose' },
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
        {p.more} <Link to={p.to} >Take a closer look →</Link>
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
        <p>ELT Suite brings lesson planning, classroom activities, assessment, creative tools and professional development into one connected space. Built for English language teachers, and shaped by the work they do every day.</p>
        <div className="pub-actions">
          <a className="pub-button" href="#plan">Discover the Platform</a>
          <Link className="pub-secondary" to="/signin">Sign In</Link>
        </div>
        <span className="pub-note">Currently welcoming teachers by invitation.</span>
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
    id: 'plan', kicker: 'PLAN', title: "From first idea to finished lesson.",
    body: ["Plan lessons task by task, with clear aims, engaging activities and your own teaching notes in one place.", "Create materials yourself or draw on AI support when it helps. Every lesson remains yours to shape."],
    points: ["Build lessons around your learners.", "Bring different activity types together.", "Keep your materials and teaching notes organised."],
    status: "",
    main: { name: 'editor-language', alt: 'The lesson editor on the task “Notice the language”: a useful language box, sentences with gaps for point, about and because, and the teacher’s notes.' },
    details: [{ name: 'class', alt: 'The class page: Unit 1 · Talking together and Unit 2 · Opinions and decisions, with their lessons.', at: { x: 0.01, y: 0.44, w: 0.6, h: 0.56 }, caption: 'Units and lessons in the class' }],
  },
  {
    id: 'teach', kicker: 'TEACH', title: "Bring your lesson to life.",
    body: ["Teach from the lesson you prepared. Present activities, involve learners and follow their responses as the class progresses.", "Whether you're teaching in person or online, your lesson stays at the centre."],
    points: ["Interactive activities for learners.", "Responses and feedback during teaching.", "Classroom and online teaching tools."],
    status: "",
    main: { name: 'teach', alt: 'Teaching the lesson live: the task on screen, the teacher’s notes below and, on the right, each learner’s answer to the question.' },
    details: [
      { name: 'learner', alt: 'What a learner sees: the same task with the recording and three answer choices.', at: { x: 0.17, y: 0.08, w: 0.83, h: 0.55 }, caption: 'The learner’s view of the same task' },
      { name: 'rooms', alt: 'Rooms: start a call, call a colleague, or open a class’s own video room.', at: { x: 0.005, y: 0.1, w: 0.99, h: 0.86 }, caption: 'Rooms: a video room for every class' },
    ],
  },
  {
    id: 'understand', kicker: 'UNDERSTAND', title: "See how your learners are progressing.",
    body: ["Explore results across lessons and take a closer look at each learner's work.", "Notice patterns, revisit feedback and use what you discover to decide where to go next."],
    points: ["Class-level progress and results.", "Individual learner portfolios.", "Evidence to inform your next lesson."],
    status: "",
    main: { name: 'reports', alt: 'The class report: eight learners and their scores in each of eight lessons.' },
    details: [{ name: 'portfolio', alt: 'A learner’s portfolio: her average, lessons completed and pieces of work kept.', at: { x: 0.19, y: 0.55, w: 0.81, h: 0.25 }, caption: 'One learner’s portfolio' }],
  },
  {
    id: 'audio', kicker: 'AUDIO AND MEDIA', title: "Make materials that sound like your classroom.",
    body: ["Record and edit audio, create dialogues with different voices, or develop original songs for your lessons.", "Refine your materials until they fit your teaching aims and your learners."],
    points: ["Recordings with editing and transcript tools.", "Speech and dialogue creation.", "Songs and other classroom media."],
    status: "",
    main: { name: 'sound', alt: 'The recording editor: a dialogue between Flo and Dan as a waveform, their lines on separate script tracks and the script with timings.' },
    details: [{ name: 'song', alt: 'Making a classroom song: choose young learners, teenagers or adults, a language level and a lesson.', at: { x: 0.15, y: 0.02, w: 0.7, h: 0.5 }, caption: 'Making a classroom song' }],
  },
  {
    id: 'language', kicker: 'LANGUAGE', title: "Look more closely at language.",
    body: ["Explore language through real examples, investigate patterns and examine how words and phrases are used in context.", "Keep useful evidence and bring what you've discovered back into your teaching."],
    points: ["Concordances and contextual examples.", "Language analysis and investigation.", "Connections to professional learning."],
    status: "Examples from Tatoeba illustrate usage. They do not measure how common a phrase is.",
    main: { name: 'concordance', alt: 'A concordance for “your point”: example sentences lined up around the phrase, such as “I see your point.” and “What’s your point?”' },
  },
  {
    id: 'collaborate', kicker: 'COLLABORATE', title: "Better teaching, together.",
    body: ["Work on materials with colleagues, exchange ideas and make room for reflection.", "With Collab and Development Studio, the practical and professional sides of teaching become part of the same journey."],
    points: ["Collaborative documents and shared materials.", "Reflection and professional learning.", "Support for questions about teaching practice."],
    status: "",
    main: { name: 'collab', alt: 'Collab materials shared by a fictional teaching team.' },
    details: [{ name: 'development', alt: 'Development Studio', at: {x:0,y:0,w:1,h:1}, caption: 'Reflection and professional learning in Development Studio' }],
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
  { k: 'Plan', line: "Prepare the activities, language and notes you'll need.", name: 'editor-speaking', alt: 'Planning a speaking task: a prompt, questions for the card and the teacher’s notes.' },
  { k: 'Teach', line: "Bring your lesson into the classroom and involve your learners.", name: 'teach', alt: 'Teaching live, with learners’ answers in the side panel.' },
  { k: 'Understand', line: "Review learner responses, results and feedback.", name: 'reports', alt: 'The class report, learner by lesson.' },
  { k: 'Reflect', line: "Look back on your teaching and explore what you noticed.", name: 'development', alt: 'Development Studio: reflect on a lesson or investigate a question.' },
  { k: 'Grow', line: "Develop your practice and carry new ideas into the next lesson.", name: 'coach', alt: 'The teaching coach in Development Studio.' },
];

function Journey() {
  const [at, setAt] = useState(0);
  const step = JOURNEY[at];
  return (
    <section className="pub-journey" aria-labelledby="pub-journey-h">
      <div className="pub-journey-head">
        <span className="pub-kicker">YOUR TEACHING, CONNECTED</span>
        <h2 id="pub-journey-h">One lesson leads to another.</h2>
        <p>Plan a lesson. Teach it. See how your learners respond. Reflect on what worked, then take what you've learned into the next lesson.</p><p>ELT Suite connects these parts of teaching, helping you build on the work you've already done.</p>
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
            <p>From pronunciation and language analysis to classroom recordings and learner responses, the details matter. ELT Suite brings tools for those details into the everyday work of teaching.</p>
          </div>
          <Mounted label="Good teaching is worth sharing."><LanguageMoment /></Mounted>
          <p className="pub-lang-close">From the sounds of a word to the shape of a lesson, ELT Suite is built for the details of teaching.</p>
        </section>
        <div className="pub-shows">
          {SHOWCASES.map((s, i) => <ShowcaseSection key={s.id} s={s} i={i} />)}
        </div>
        <Journey />
        <section className="pub-community pub-belief"><span className="pub-kicker">BUILT AROUND TEACHERS</span><h2>Good teaching begins with teachers.</h2><p>Every class is different. Teachers bring their experience, creativity and understanding of their learners to the decisions they make every day.</p><p>We believe technology should support that expertise, not replace it.</p><p>That's why ELT Suite is designed to put useful tools within reach while keeping teachers at the centre of their work.</p><aside aria-label="Lesson aim"><strong>Lesson aim</strong><p>Give an opinion, ask for a reason and respond to a partner.</p></aside></section>
        <section className="pub-community" aria-labelledby="pub-community-h">
          <span className="pub-kicker">BETTER TOGETHER</span>
          <h2 id="pub-community-h">Good ideas are worth sharing.</h2>
          <p>Some of the most useful things we learn about teaching come from other teachers.</p><p>A conversation after class. A resource shared by a colleague. A different way of approaching a familiar challenge.</p><p>We want ELT Suite to make those exchanges easier and create more opportunities for teachers to learn from one another.</p>
          <div className="pub-future">
            <strong>Coming later: Communities for teachers.</strong>
            <p>We’re building towards a professional space where teachers with shared interests can connect, exchange ideas and explore their practice together.</p>
          </div>
        </section>
        <section className="pub-closing" aria-labelledby="pub-closing-h">
          <span className="pub-kicker">THE NEXT CHAPTER</span><h2 id="pub-closing-h">We’re growing something together.</h2><p>ELT Suite was created out of a love for English language teaching and a belief that teachers grow stronger together.</p><p>We're starting small, bringing teaching tools, professional learning and collaboration into one connected space.</p><p>And there's more to come.</p>
          <div className="pub-actions">
            <a className="pub-button" href="#plan">See the Platform</a><Link className="pub-secondary" to="/signin">Sign In</Link>
          </div>
          <span className="pub-note">ELT Suite is currently available to invited teachers.</span>
        </section>
      </main>
    </PublicLayout>
  );
}

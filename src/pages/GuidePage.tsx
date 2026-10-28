import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { playSound } from '../lib/phonAudio';
import './guide.css';

// Guide: what ELT Suite does, for teachers, one topic at a time. Each topic has a picture of how it
// works and, where it helps, something to try: a question to answer as a learner would, a word to
// stress, a sound to hear. Nothing here is saved; it is all for practice.

type Topic = { id: string; title: string; short: string; body: () => JSX.Element };

const TOPICS: Topic[] = [
  { id: 'start', title: 'Getting around', short: 'Start here', body: Start },
  { id: 'lessons', title: 'Lessons and tasks', short: 'Lessons', body: Lessons },
  { id: 'questions', title: 'Question types', short: 'Questions', body: Questions },
  { id: 'pron', title: 'Pronunciation tools', short: 'Pronunciation', body: Pronunciation },
  { id: 'live', title: 'Teaching live', short: 'Teaching live', body: Live },
  { id: 'games', title: 'Games and activities', short: 'Games', body: Games },
  { id: 'progress', title: 'Marking and progress', short: 'Progress', body: Progress },
  { id: 'week', title: 'Timetable and Rooms', short: 'Timetable, Rooms', body: Week },
  { id: 'share', title: 'Files, Messages and Colleagues', short: 'Files and sharing', body: Share },
];

export function GuidePage() {
  const [on, setOn] = useState(TOPICS[0].id);
  const main = useRef<HTMLElement>(null);
  // The topic in view is the one lit in the list.
  useEffect(() => {
    const els = TOPICS.map((t) => document.getElementById('gu-' + t.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (es) => {
        const seen = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen) setOn(seen.target.id.slice(3));
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const go = (id: string) => {
    setOn(id);
    document.getElementById('gu-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="shell">
      <TopBar />
      <div className="gu">
        <nav className="gu-nav" aria-label="Guide topics">
          <span className="gu-nav-h">Guide</span>
          {TOPICS.map((t, i) => (
            <a key={t.id} href={'#gu-' + t.id} className={'gu-nav-i' + (on === t.id ? ' on' : '')} aria-current={on === t.id ? 'true' : undefined} onClick={(e) => (e.preventDefault(), go(t.id))}>
              <span className="gu-n">{i + 1}</span>
              {t.short}
            </a>
          ))}
        </nav>
        <main className="gu-main" ref={main}>
          <header className="gu-hero">
            <span className="gu-eyebrow">Guide</span>
            <h1>How ELT Suite works</h1>
            <p>Everything an English teacher needs, in one place: plan the lesson, teach it live and follow every learner’s progress. Here is each part, with something to try. Nothing you do here is saved.</p>
          </header>
          {TOPICS.map((t, i) => (
            <section key={t.id} id={'gu-' + t.id} className="gu-sec" aria-labelledby={'gu-h-' + t.id}>
              <h2 id={'gu-h-' + t.id}>
                <span className="gu-n big">{i + 1}</span>
                {t.title}
              </h2>
              <t.body />
            </section>
          ))}
          <footer className="gu-end">
            <b>Ready?</b> Make a class in <Link to="/classes">Classes</Link>, add a lesson, and press <i>/</i> in it to see every element. Stuck? Ask your organisation’s admin, or write to ELT Suite from Support.
          </footer>
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small parts

function Try({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="gu-try">
      <span className="gu-try-h">
        <span className="gu-try-tag">Try it</span>
        {title}
      </span>
      {children}
      {note && <span className="gu-try-note">{note}</span>}
    </div>
  );
}
function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="gu-tip">
      <b>Tip</b> {children}
    </p>
  );
}
function Steps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <ol className="gu-steps">
      {items.map((s) => (
        <li key={s.t}>
          <b>{s.t}</b>
          <span>{s.d}</span>
        </li>
      ))}
    </ol>
  );
}
// Right or wrong, after Check.
function Mark({ ok, show }: { ok: boolean; show: boolean }) {
  if (!show) return null;
  return <span className={'gu-mark ' + (ok ? 'ok' : 'no')} aria-label={ok ? 'Right' : 'Not quite'}>{ok ? '✓' : '✗'}</span>;
}
function Checker({ onCheck, onReset, result }: { onCheck: () => void; onReset: () => void; result: string }) {
  return (
    <span className="gu-check">
      <button type="button" className="btn small primary" onClick={onCheck}>
        Check
      </button>
      <button type="button" className="btn small" onClick={onReset}>
        Start again
      </button>
      {result && (
        <span className="gu-result" role="status">
          {result}
        </span>
      )}
    </span>
  );
}
const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

// ------------------------------------------------------------------ 1. getting around

const APPS: { name: string; color: string; about: string; d: string }[] = [
  { name: 'Home', color: '#8b3d6b', about: 'Your day: classes, what is new', d: 'M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z' },
  { name: 'Classes', color: '#c8764a', about: 'Lessons, learners, live teaching', d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z' },
  { name: 'Timetable', color: '#8a6a4a', about: 'Your week of classes and meetings', d: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4' },
  { name: 'Rooms', color: '#3b7f7a', about: 'Video and audio calls', d: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM15.5 10.5l5-3v9l-5-3' },
  { name: 'Files', color: '#3667a6', about: 'Library, documents, flashcards', d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z' },
  { name: 'Messages', color: '#7a4fa3', about: 'Chat with learners and teachers', d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z' },
  { name: 'Colleagues', color: '#4f6b7a', about: 'Share lessons with teachers', d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2' },
];

function Start() {
  const [pick, setPick] = useState(1);
  const a = APPS[pick];
  return (
    <>
      <p>ELT Suite is one account with several apps. The <b>nine dots</b> at the top right of every page open them; the name under “ELT Suite” at the top left tells you which app you are in, and takes you home.</p>
      <div className="gu-grid2">
        <figure className="gu-fig">
          <svg viewBox="0 0 360 230" role="img" aria-label="The top bar: the app's name on the left, the nine-dot apps button and your picture on the right">
            <rect x="8" y="8" width="344" height="214" rx="14" className="gu-s-card" />
            <rect x="8" y="8" width="344" height="46" rx="14" className="gu-s-bar" />
            <rect x="24" y="20" width="22" height="22" rx="6" fill="#d98f63" />
            <text x="54" y="29" className="gu-s-small">ELT Suite</text>
            <text x="54" y="44" className="gu-s-b" style={{ fill: a.color }}>
              {a.name}
            </text>
            {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={286 + c * 7} cy={24 + r * 7} r="2" className="gu-s-ink" />))}
            <circle cx="326" cy="31" r="11" className="gu-s-soft" />
            <path d="M302 60 l-8 14" className="gu-s-arrow" />
            <text x="232" y="88" className="gu-s-note">all your apps</text>
            <path d="M74 60 l6 14" className="gu-s-arrow" />
            <text x="60" y="88" className="gu-s-note">where you are · home</text>
            {APPS.slice(0, 6).map((p, i) => (
              <g key={p.name} transform={`translate(${30 + (i % 3) * 104} ${108 + Math.floor(i / 3) * 56})`}>
                <rect width="92" height="44" rx="10" fill={p.color} opacity={i === pick ? 1 : 0.16} />
                <text x="46" y="27" textAnchor="middle" className="gu-s-b" style={{ fill: i === pick ? '#fff' : p.color }}>
                  {p.name}
                </text>
              </g>
            ))}
          </svg>
        </figure>
        <Try title="Choose an app to see what it is for">
          <div className="gu-apps" role="radiogroup" aria-label="Apps">
            {APPS.map((p, i) => (
              <button key={p.name} type="button" role="radio" aria-checked={i === pick} className={'gu-app' + (i === pick ? ' on' : '')} style={{ ['--c' as string]: p.color }} onClick={() => setPick(i)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={p.d} />
                </svg>
                {p.name}
              </button>
            ))}
          </div>
          <p className="gu-say" aria-live="polite">
            <b style={{ color: `color-mix(in srgb, ${a.color} 72%, #000)` }}>{a.name}:</b> {a.about}.
          </p>
        </Try>
      </div>
      <Tip>Text too small or too big? The <b>Aa</b> menu in the top bar changes the size, and Settings has reading options: a clearer font, line focus and more space.</Tip>
    </>
  );
}

// ------------------------------------------------------------------ 2. lessons

function Lessons() {
  return (
    <>
      <p>A <b>class</b> holds its learners and its lessons. A <b>lesson</b> is a page of <b>tasks</b>; each task mixes text, pictures, sound and questions. Learners join with the class code and a PIN you give them: no email needed.</p>
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 190" role="img" aria-label="Class, then lessons, then tasks, then elements such as text and questions">
          {[
            { x: 10, t: 'Class', s: 'B1 Evening', c: '#c8764a' },
            { x: 190, t: 'Lesson', s: 'Present perfect', c: '#3667a6' },
            { x: 370, t: 'Task', s: '1. Warm-up', c: '#7a4fa3' },
            { x: 550, t: 'Elements', s: 'text, gaps, sound…', c: '#3b7f7a' },
          ].map((b, i) => (
            <g key={b.t}>
              <rect x={b.x} y="40" width="160" height="96" rx="14" className="gu-s-card" />
              <rect x={b.x} y="40" width="160" height="8" rx="4" fill={b.c} />
              <text x={b.x + 16} y="80" className="gu-s-h" style={{ fill: b.c }}>
                {b.t}
              </text>
              <text x={b.x + 16} y="104" className="gu-s-small">
                {b.s}
              </text>
              {i < 3 && <path d={`M${b.x + 166} 88 h14 m-6 -6 l6 6 -6 6`} className="gu-s-arrow" />}
            </g>
          ))}
          <text x="10" y="170" className="gu-s-note">One class has many lessons; one lesson has many tasks; a task is made of elements.</text>
        </svg>
      </figure>
      <Steps
        items={[
          { t: 'Make a class', d: 'Classes → New class. Choose a name, a level and a colour.' },
          { t: 'Add learners', d: 'In the class, Learners → Add. Each learner gets a PIN; print the sign-in cards.' },
          { t: 'Write a lesson', d: 'Lessons → New lesson. Type in it like a document; press / for any element.' },
          { t: 'Teach it or set it', d: 'Teach it live in class, or open it as homework with a due date.' },
        ]}
      />
      <Try title="Press / to insert an element" note="In a real lesson, pressing / opens this list; type to search it.">
        <SlashDemo />
      </Try>
    </>
  );
}

const SLASH = [
  { k: 'Gap fill', g: 'Questions', h: 'A blank inside a sentence' },
  { k: 'Multiple choice in line', g: 'Questions', h: 'go / goes / going · learners circle one' },
  { k: 'Matching', g: 'Questions', h: 'Match items on the left to the right' },
  { k: 'Word order', g: 'Questions', h: 'Put the words in the right order' },
  { k: 'Long answer', g: 'Questions', h: 'Writing with a word count; you mark it' },
  { k: 'Dialogue', g: 'Text', h: 'A and B, with gaps and choices inside' },
  { k: 'Timeline', g: 'Text', h: 'A tense timeline: events, periods, arrows' },
  { k: 'Sound or video', g: 'Text', h: 'Record, upload or link, with a karaoke script' },
  { k: 'Phonemic chart', g: 'Text', h: 'The sounds of English; tap to hear' },
  { k: 'Board', g: 'Blocks', h: 'A drawing board, live in class' },
  { k: 'Post-it wall', g: 'Questions', h: 'Learners stick notes on a shared wall' },
  { k: 'Crossword', g: 'Questions', h: 'Made from words and clues' },
];
function SlashDemo() {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState('');
  const list = SLASH.filter((s) => !q.trim() || `${s.k} ${s.h}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="gu-slash">
      <label className="gu-slash-in">
        <span aria-hidden="true">/</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type: gap, sound, match…" aria-label="Search elements" />
      </label>
      <ul className="gu-slash-list" aria-label="Elements">
        {list.slice(0, 6).map((s) => (
          <li key={s.k}>
            <button type="button" aria-pressed={chosen === s.k} onClick={() => setChosen(s.k)}>
              <b>{s.k}</b>
              <span>{s.h}</span>
              <i>{s.g}</i>
            </button>
          </li>
        ))}
        {!list.length && <li className="gu-slash-none">Nothing called that: try “gap”.</li>}
      </ul>
      {chosen && (
        <span className="gu-say" role="status">
          <b>{chosen}</b> would go into your task here.
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 3. question types

function Questions() {
  return (
    <>
      <p>
        More than 30 question types, all <b>marked for you</b> except long answers, which you mark with codes and comments. Answer these as a learner would, then press <b>Check</b>.
      </p>
      <div className="gu-qs">
        <GapFill />
        <Inline />
        <TrueFalse />
        <WordOrder />
        <Matching />
        <FindFix />
      </div>
      <Tip>Every question can be saved to <b>your question bank</b> and used again in another lesson: right-click it, or use “From my question bank…” in the / list.</Tip>
    </>
  );
}

function GapFill() {
  const [a, setA] = useState(['', '']);
  const [shown, setShown] = useState(false);
  const key = [['has lived', "'s lived"], ['have never been']];
  const ok = a.map((v, i) => key[i].includes(norm(v)));
  return (
    <Try title="Gap fill: put the verb in the present perfect">
      <p className="gu-q">
        1. Maria <input className="gu-gap" value={a[0]} onChange={(e) => setA([e.target.value, a[1]])} aria-label="Gap 1" /> <Mark ok={ok[0]} show={shown} /> (live) in London since 2019.
      </p>
      <p className="gu-q">
        2. I <input className="gu-gap" value={a[1]} onChange={(e) => setA([a[0], e.target.value])} aria-label="Gap 2" /> <Mark ok={ok[1]} show={shown} /> (never / be) to Japan.
      </p>
      <Checker result={shown ? `${ok.filter(Boolean).length} of 2${ok.every(Boolean) ? '. Well done!' : '. Answers: has lived · have never been'}` : ''} onCheck={() => setShown(true)} onReset={() => (setA(['', '']), setShown(false))} />
    </Try>
  );
}

function Inline() {
  const [a, setA] = useState<(number | null)[]>([null, null]);
  const [shown, setShown] = useState(false);
  const qs = [
    { pre: 'She', opts: ['go', 'goes', 'going'], post: 'to work by bike every day.', key: 1 },
    { pre: 'Look! It', opts: ['rains', 'is raining', 'rained'], post: 'again.', key: 1 },
  ];
  return (
    <Try title="Multiple choice in line: circle the right form">
      {qs.map((q, i) => (
        <p key={i} className="gu-q">
          {i + 1}. {q.pre}{' '}
          <span className="gu-inline" role="radiogroup" aria-label={`Question ${i + 1}`}>
            {q.opts.map((o, j) => (
              <button key={o} type="button" role="radio" aria-checked={a[i] === j} className={'gu-opt' + (a[i] === j ? ' on' : '') + (shown && a[i] === j ? (j === q.key ? ' ok' : ' no') : '')} onClick={() => setA(a.map((x, k) => (k === i ? j : x)))}>
                {o}
              </button>
            ))}
          </span>{' '}
          {q.post}
        </p>
      ))}
      <Checker result={shown ? `${qs.filter((q, i) => a[i] === q.key).length} of 2` : ''} onCheck={() => setShown(true)} onReset={() => (setA([null, null]), setShown(false))} />
    </Try>
  );
}

function TrueFalse() {
  const items = [
    { s: 'In a reading task, “not given” means the text does not say.', key: true },
    { s: '“Since” goes with a period of time, like “since three years”.', key: false },
  ];
  const [a, setA] = useState<(boolean | null)[]>([null, null]);
  const [shown, setShown] = useState(false);
  return (
    <Try title="True or false">
      {items.map((it, i) => (
        <p key={i} className="gu-q gu-tf">
          <span>
            {i + 1}. {it.s}
          </span>
          <span className="gu-inline" role="radiogroup" aria-label={`Statement ${i + 1}`}>
            {[true, false].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={a[i] === v} className={'gu-opt' + (a[i] === v ? ' on' : '') + (shown && a[i] === v ? (v === it.key ? ' ok' : ' no') : '')} onClick={() => setA(a.map((x, k) => (k === i ? v : x)))}>
                {v ? 'True' : 'False'}
              </button>
            ))}
          </span>
        </p>
      ))}
      <Checker result={shown ? `${items.filter((it, i) => a[i] === it.key).length} of 2${a[1] === true ? '. It is “for three years”, or “since 2021”.' : ''}` : ''} onCheck={() => setShown(true)} onReset={() => (setA([null, null]), setShown(false))} />
    </Try>
  );
}

function WordOrder() {
  const words = useMemo(() => ['ever', 'you', 'Have', 'sushi', 'eaten', '?'], []);
  const right = 'Have you ever eaten sushi ?';
  const [built, setBuilt] = useState<number[]>([]);
  const [shown, setShown] = useState(false);
  const sentence = built.map((i) => words[i]).join(' ');
  return (
    <Try title="Word order: tap the words in order">
      <div className="gu-wo-line" aria-live="polite">
        {built.length ? (
          built.map((i, k) => (
            <button key={k} type="button" className="gu-chip on" onClick={() => setBuilt(built.filter((_, x) => x !== k))} aria-label={`Take out ${words[i]}`}>
              {words[i]}
            </button>
          ))
        ) : (
          <span className="gu-ph">Your sentence goes here</span>
        )}
        <Mark ok={sentence === right} show={shown && built.length === words.length} />
      </div>
      <div className="gu-wo-bank">
        {words.map((w, i) => (
          <button key={i} type="button" className="gu-chip" disabled={built.includes(i)} onClick={() => setBuilt([...built, i])}>
            {w}
          </button>
        ))}
      </div>
      <Checker result={shown ? (sentence === right ? 'Right!' : built.length < words.length ? 'Use every word.' : 'Not quite: a question starts with Have.') : ''} onCheck={() => setShown(true)} onReset={() => (setBuilt([]), setShown(false))} />
    </Try>
  );
}

function Matching() {
  const left = ['make', 'do', 'take'];
  const right = ['a photo', 'your homework', 'a mistake'];
  const key: Record<number, number> = { 0: 2, 1: 1, 2: 0 };
  const [pick, setPick] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [shown, setShown] = useState(false);
  const colours = ['#3667a6', '#c8764a', '#3b7f7a'];
  return (
    <Try title="Matching: tap a verb, then what goes with it">
      <div className="gu-match">
        <div>
          {left.map((l, i) => (
            <button key={l} type="button" className={'gu-chip' + (pick === i ? ' on' : '')} style={pairs[i] !== undefined ? { borderColor: colours[i], color: colours[i] } : undefined} onClick={() => setPick(i)}>
              {l}
              <Mark ok={key[i] === pairs[i]} show={shown && pairs[i] !== undefined} />
            </button>
          ))}
        </div>
        <svg className="gu-match-lines" viewBox="0 0 60 120" aria-hidden="true" preserveAspectRatio="none">
          {Object.entries(pairs).map(([l, r]) => (
            <line key={l} x1="0" y1={20 + Number(l) * 40} x2="60" y2={20 + r * 40} stroke={colours[Number(l)]} strokeWidth="2.5" />
          ))}
        </svg>
        <div>
          {right.map((r, j) => {
            const by = Object.entries(pairs).find(([, x]) => x === j)?.[0];
            return (
              <button key={r} type="button" className="gu-chip" style={by !== undefined ? { borderColor: colours[Number(by)], color: colours[Number(by)] } : undefined} aria-disabled={pick === null} onClick={() => pick !== null && (setPairs({ ...Object.fromEntries(Object.entries(pairs).filter(([, x]) => x !== j)), [pick]: j }), setPick(null))}>
                {r}
              </button>
            );
          })}
        </div>
      </div>
      <Checker result={shown ? `${left.filter((_, i) => key[i] === pairs[i]).length} of 3` : ''} onCheck={() => setShown(true)} onReset={() => (setPairs({}), setPick(null), setShown(false))} />
    </Try>
  );
}

function FindFix() {
  const words = ['Last', 'night', 'I', 'see', 'a', 'great', 'film', 'with', 'my', 'sister.'];
  const wrong = 3;
  const [tapped, setTapped] = useState<number | null>(null);
  const [fix, setFix] = useState('');
  const [shown, setShown] = useState(false);
  const ok = tapped === wrong && norm(fix) === 'saw';
  return (
    <Try title="Find and fix the mistake: tap the wrong word, then correct it">
      <p className="gu-q gu-ff">
        {words.map((w, i) => (
          <button key={i} type="button" aria-pressed={tapped === i} className={'gu-ffw' + (tapped === i ? ' on' : '') + (shown && tapped === i ? (i === wrong ? ' ok' : ' no') : '')} onClick={() => (setTapped(i), setShown(false))}>
            {w}
          </button>
        ))}
      </p>
      {tapped !== null && (
        <label className="gu-ff-fix">
          Correct “{words[tapped]}” to
          <input className="gu-gap" value={fix} onChange={(e) => setFix(e.target.value)} aria-label="The correction" />
          <Mark ok={ok} show={shown} />
        </label>
      )}
      <Checker result={shown ? (ok ? 'Right: “Last night I saw a great film”.' : tapped !== wrong ? 'That word is fine. Look at the verb: “last night” is in the past.' : 'Right word; now its past form.') : ''} onCheck={() => setShown(true)} onReset={() => (setTapped(null), setFix(''), setShown(false))} />
    </Try>
  );
}

// ------------------------------------------------------------------ 4. pronunciation

const CARDS: { id: string; sym: string; ex: string; kind: 'mono' | 'diph' | 'cons' }[] = [
  { id: 'iy', sym: 'iː', ex: 'shEEp', kind: 'mono' },
  { id: 'i', sym: 'ɪ', ex: 'shIp', kind: 'mono' },
  { id: 'schwa', sym: 'ə', ex: 'teachER', kind: 'mono' },
  { id: 'ei', sym: 'eɪ', ex: 'dAY', kind: 'diph' },
  { id: 'th', sym: 'θ', ex: 'THink', kind: 'cons' },
  { id: 'sh', sym: 'ʃ', ex: 'SHe', kind: 'cons' },
];
const KIND: Record<string, { name: string; c: string }> = { mono: { name: 'Single vowel', c: '#3667a6' }, diph: { name: 'Diphthong', c: '#7a4fa3' }, cons: { name: 'Consonant', c: '#a8701f' } };
const bold = (ex: string) => ex.split(/([A-Z]+)/).map((p, i) => (/^[A-Z]+$/.test(p) ? <b key={i}>{p.toLowerCase()}</b> : <span key={i}>{p}</span>));

function Pronunciation() {
  const [heard, setHeard] = useState('');
  const hear = async (c: (typeof CARDS)[number]) => {
    setHeard(c.id);
    const r = await playSound('RP', c.id, undefined, true).catch(() => false);
    if (r === false) setHeard('none');
  };
  return (
    <>
      <p>Pronunciation lives inside your lessons, not beside them: the <b>phonemic chart</b>, <b>sound cards</b>, <b>stress</b> and <b>intonation</b> marks, IPA and minimal pairs. Each kind of sound has its own colour, the same everywhere.</p>
      <div className="gu-grid2">
        <Try title="Sound cards: tap one to hear it">
          <div className="gu-cards">
            {CARDS.map((c) => (
              <button key={c.id} type="button" className={'gu-card' + (heard === c.id ? ' on' : '')} style={{ ['--c' as string]: KIND[c.kind].c }} onClick={() => void hear(c)} aria-label={`/${c.sym}/ as in ${c.ex.toLowerCase()}, ${KIND[c.kind].name}. Play`}>
                <span className="gu-card-s">/{c.sym}/</span>
                <span className="gu-card-w">{bold(c.ex)}</span>
              </button>
            ))}
          </div>
          <span className="gu-legend">
            {Object.values(KIND).map((k) => (
              <span key={k.name}>
                <i style={{ background: k.c }} /> {k.name}
              </span>
            ))}
          </span>
          {heard === 'none' && <span className="gu-try-note">No recording for this sound yet: you can record your own in Settings → Sounds.</span>}
        </Try>
        <Try title="Word stress: tap the stressed syllable">
          <Stress />
        </Try>
      </div>
      <Try title="Intonation: does the voice go up or down at the end?">
        <Intonation />
      </Try>
    </>
  );
}

function Stress() {
  const words = [
    { syl: ['pho', 'to', 'graph'], key: 0 },
    { syl: ['pho', 'to', 'gra', 'pher'], key: 1 },
    { syl: ['pho', 'to', 'gra', 'phic'], key: 2 },
  ];
  const [a, setA] = useState<(number | null)[]>([null, null, null]);
  const [shown, setShown] = useState(false);
  return (
    <>
      {words.map((w, i) => (
        <p key={i} className="gu-stress">
          {w.syl.map((s, j) => (
            <button key={j} type="button" aria-pressed={a[i] === j} className={'gu-syl' + (a[i] === j ? ' on' : '') + (shown && a[i] === j ? (j === w.key ? ' ok' : ' no') : '')} onClick={() => setA(a.map((x, k) => (k === i ? j : x)))}>
              {a[i] === j ? s.toUpperCase() : s}
            </button>
          ))}
          <Mark ok={a[i] === w.key} show={shown && a[i] !== null} />
        </p>
      ))}
      <Checker result={shown ? `${words.filter((w, i) => a[i] === w.key).length} of 3. The stress moves: PHOtograph, phoTOgrapher, photoGRAphic.` : ''} onCheck={() => setShown(true)} onReset={() => (setA([null, null, null]), setShown(false))} />
    </>
  );
}

function Intonation() {
  const items = [
    { s: 'Are you coming tonight?', key: 'rise', why: 'Yes/no questions usually go up.' },
    { s: 'Where do you live?', key: 'fall', why: 'Wh- questions usually go down.' },
  ];
  const [a, setA] = useState<Record<number, string>>({});
  return (
    <div className="gu-inton">
      {items.map((it, i) => (
        <div key={i} className="gu-inton-row">
          <span className="gu-q">{it.s}</span>
          <span className="gu-inline" role="radiogroup" aria-label={it.s}>
            {(['rise', 'fall'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={a[i] === k} className={'gu-opt' + (a[i] === k ? (k === it.key ? ' ok' : ' no') : '')} onClick={() => setA({ ...a, [i]: k })}>
                <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
                  <path d={k === 'rise' ? 'M2 13 C14 13 22 11 30 3' : 'M2 3 C14 3 22 5 30 13'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d={k === 'rise' ? 'M24 3 h6 v6' : 'M24 13 h6 v-6'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {k === 'rise' ? 'Up' : 'Down'}
              </button>
            ))}
          </span>
          {a[i] && <span className={'gu-why ' + (a[i] === it.key ? 'ok' : 'no')}>{a[i] === it.key ? '✓ ' : '✗ '}{it.why}</span>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 5. teaching live

function Live() {
  const [step, setStep] = useState(0);
  const STEPS = [
    { t: 'You start the lesson', d: 'Press Teach live. Learners who are signed in get a notice and join; the lesson opens on their screens.' },
    { t: 'Everyone follows you', d: 'Turn the pages and their screens follow. Point, highlight and draw on the screen: they see it at once.' },
    { t: 'They answer', d: 'Answers arrive as they type them. You see who has finished, who is stuck, and the most common mistakes.' },
    { t: 'You show and talk', d: 'Show the answers to everyone, or one learner’s work without their name. Open the video room for the class.' },
  ];
  const s = STEPS[step];
  return (
    <>
      <p>Teach from the same lesson in class, online or both. Your screen is the conductor; the learners’ screens follow it.</p>
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 220" role="img" aria-label={`Your screen connected to four learners' screens. Step ${step + 1}: ${s.t}`}>
          <rect x="20" y="40" width="230" height="140" rx="14" className="gu-s-card" />
          <rect x="20" y="40" width="230" height="26" rx="12" fill="#c8764a" />
          <text x="34" y="58" className="gu-s-b" style={{ fill: '#fff' }}>
            You · Teach live
          </text>
          <rect x="40" y="82" width="190" height="10" rx="5" className="gu-s-soft" />
          <rect x="40" y="100" width="140" height="10" rx="5" className="gu-s-soft" />
          {step >= 2 && [0, 1, 2, 3].map((i) => <rect key={i} x={40 + i * 48} y="124" width="40" height={i === 2 ? 20 : 40} rx="4" fill={i === 2 ? '#c94f3d' : '#3b7f7a'} opacity="0.85" className="gu-grow" />)}
          {step === 1 && <circle cx="160" cy="105" r="7" fill="#c94f3d" className="gu-pulse" />}
          {[0, 1, 2, 3].map((i) => {
            const x = 330 + (i % 2) * 190;
            const y = 22 + Math.floor(i / 2) * 102;
            return <path key={i} d={i % 2 ? `M250 110 C 300 110 300 ${y + 92} 340 ${y + 92} H ${x - 30} C ${x - 14} ${y + 92} ${x - 14} ${y + 40} ${x} ${y + 40}` : `M250 110 C 290 110 ${x - 40} ${y + 40} ${x} ${y + 40}`} className={'gu-s-line' + (step >= 1 ? ' on' : '')} />;
          })}
          {[0, 1, 2, 3].map((i) => {
            const x = 330 + (i % 2) * 190;
            const y = 22 + Math.floor(i / 2) * 102;
            return (
              <g key={i}>
                <rect x={x} y={y} width="160" height="80" rx="12" className="gu-s-card" />
                <text x={x + 12} y={y + 22} className="gu-s-small">
                  {['Mia', 'Leo', 'Ana', 'Sam'][i]}
                </text>
                {step >= 1 && <rect x={x + 12} y={y + 32} width="120" height="8" rx="4" className="gu-s-soft" />}
                {step >= 1 && i === 1 && <circle cx={x + 90} cy={y + 36} r="5" fill="#c94f3d" />}
                {step >= 2 && <rect x={x + 12} y={y + 50} width={[90, 60, 30, 110][i]} height="14" rx="4" fill="#3b7f7a" opacity="0.25" />}
                {step >= 2 && <text x={x + 140} y={y + 62} textAnchor="end" className="gu-s-b" style={{ fill: i === 2 ? '#c94f3d' : '#3b7f7a' }}>{i === 2 ? '…' : '✓'}</text>}
                {step === 3 && <rect x={x + 112} y={y + 8} width="36" height="16" rx="8" fill="#3b7f7a" />}
              </g>
            );
          })}
        </svg>
      </figure>
      <div className="gu-stepper">
        {STEPS.map((x, i) => (
          <button key={x.t} type="button" className={'gu-step' + (i === step ? ' on' : '')} aria-pressed={i === step} onClick={() => setStep(i)}>
            <span className="gu-n">{i + 1}</span>
            {x.t}
          </button>
        ))}
      </div>
      <p className="gu-say" aria-live="polite">
        <b>{s.t}.</b> {s.d}
      </p>
      <Tip>In the live panel: a <b>timer</b>, <b>random picker</b>, <b>polls</b>, <b>hand raise</b>, breakout <b>groups</b>, and “view as learner” to see exactly what they see.</Tip>
    </>
  );
}

// ------------------------------------------------------------------ 6. games

function Games() {
  return (
    <>
      <p>Turn any task with marked questions into a <b>team quiz</b>: a timer for each question, points for speed and accuracy, a leaderboard after each one and a podium at the end. Or add a card pile, a spinning wheel or boxes to open for speaking practice.</p>
      <div className="gu-grid2">
        <Try title="Spin the wheel for a speaking topic">
          <Wheel />
        </Try>
        <figure className="gu-fig">
          <svg viewBox="0 0 320 220" role="img" aria-label="A team quiz podium: Team Blue first with 1250 points, Team Orange second, Team Green third">
            {[
              { x: 120, h: 120, n: 'Blue', p: 1250, c: '#3667a6', r: '1' },
              { x: 30, h: 90, n: 'Orange', p: 980, c: '#c8764a', r: '2' },
              { x: 210, h: 66, n: 'Green', p: 760, c: '#3b7f7a', r: '3' },
            ].map((b) => (
              <g key={b.n}>
                <rect x={b.x} y={200 - b.h} width="80" height={b.h} rx="8" fill={b.c} className="gu-rise" />
                <text x={b.x + 40} y={200 - b.h + 30} textAnchor="middle" className="gu-s-big" style={{ fill: '#fff' }}>
                  {b.r}
                </text>
                <text x={b.x + 40} y={200 - b.h - 26} textAnchor="middle" className="gu-s-b" style={{ fill: b.c }}>
                  Team {b.n}
                </text>
                <text x={b.x + 40} y={200 - b.h - 10} textAnchor="middle" className="gu-s-small">
                  {b.p} pts
                </text>
              </g>
            ))}
          </svg>
          <figcaption>The podium at the end of a team quiz.</figcaption>
        </figure>
      </div>
      <Tip>Puzzles too: <b>crosswords</b> and <b>word searches</b> are made for you from a list of words and clues.</Tip>
    </>
  );
}

function Wheel() {
  const topics = ['Your last holiday', 'A good film', 'Your hometown', 'A useful app', 'Your dream job', 'A family meal'];
  const colours = ['#3667a6', '#c8764a', '#3b7f7a', '#7a4fa3', '#a8701f', '#8b3d6b'];
  const [turn, setTurn] = useState(0);
  const [got, setGot] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const spin = () => {
    if (spinning) return;
    const pick = Math.floor(Math.random() * topics.length);
    const seg = 360 / topics.length;
    // The pointer is at the top: land the middle of the chosen slice under it.
    const target = 360 * 5 + (360 - (pick * seg + seg / 2));
    setSpinning(true);
    setGot(null);
    setTurn((t) => t - (t % 360) + target);
    window.setTimeout(() => (setGot(pick), setSpinning(false)), 2600);
  };
  const seg = 360 / topics.length;
  const pt = (deg: number, r: number) => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)];
  return (
    <div className="gu-wheel">
      <svg viewBox="0 0 200 210" aria-hidden="true">
        <g style={{ transform: `rotate(${turn}deg)`, transformOrigin: '100px 100px', transition: spinning ? 'transform 2.5s cubic-bezier(.2,.8,.2,1)' : 'none' }}>
          {topics.map((t, i) => {
            const [x1, y1] = pt(i * seg, 92);
            const [x2, y2] = pt((i + 1) * seg, 92);
            const [tx, ty] = pt(i * seg + seg / 2, 58);
            return (
              <g key={t}>
                <path d={`M100 100 L${x1} ${y1} A92 92 0 0 1 ${x2} ${y2} Z`} fill={colours[i]} />
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" style={{ fill: '#fff' }} fontSize="9" fontWeight="700" transform={`rotate(${i * seg + seg / 2} ${tx} ${ty})`}>
                  {t.split(' ').slice(-1)[0]}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="12" fill="#fff" />
        </g>
        <path d="M100 4 l-8 -2 8 16 8 -16z" fill="var(--ink)" />
      </svg>
      <button type="button" className="btn primary" onClick={spin} disabled={spinning}>
        {spinning ? 'Spinning…' : 'Spin'}
      </button>
      <span className="gu-say" role="status">
        {got !== null ? (
          <>
            Talk for one minute about: <b>{topics[got]}</b>
          </>
        ) : (
          ' '
        )}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ 7. progress

function Progress() {
  const [code, setCode] = useState<string | null>(null);
  const CODES: Record<string, { name: string; c: string; fix: string }> = {
    T: { name: 'Tense', c: '#c94f3d', fix: 'went' },
    WO: { name: 'Word order', c: '#3667a6', fix: 'I usually' },
    Sp: { name: 'Spelling', c: '#7a4fa3', fix: 'beautiful' },
  };
  return (
    <>
      <p>Most questions mark themselves. For writing, you mark with <b>codes</b> the learner has to correct, and comments; then you approve their corrections. Everything adds up in <b>Reports</b> and each learner’s <b>portfolio</b>.</p>
      <div className="gu-grid2">
        <Try title="Correction codes: tap a code to see what the learner sees">
          <p className="gu-essay">
            Last summer I <span className={'gu-err' + (code === 'T' ? ' on' : '')}>go</span> to Spain with my family. <span className={'gu-err' + (code === 'WO' ? ' on' : '')}>Usually I</span> stay at home, but the beach was <span className={'gu-err' + (code === 'Sp' ? ' on' : '')}>beatiful</span>.
          </p>
          <span className="gu-codes">
            {Object.entries(CODES).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={code === k} className={'gu-code' + (code === k ? ' on' : '')} style={{ ['--c' as string]: v.c }} onClick={() => setCode(code === k ? null : k)}>
                <b>{k}</b> {v.name}
              </button>
            ))}
          </span>
          {code && (
            <p className="gu-say" role="status">
              The learner sees <b style={{ color: `color-mix(in srgb, ${CODES[code].c} 80%, #000)` }}>{code}</b> over the words and writes a correction (“{CODES[code].fix}”). You approve it, or ask again.
            </p>
          )}
        </Try>
        <figure className="gu-fig">
          <svg viewBox="0 0 320 210" role="img" aria-label="Reports: a bar for each skill, with grammar at 82%, vocabulary 74%, listening 61% and reading 88%">
            {[
              { n: 'Grammar', v: 82 },
              { n: 'Vocabulary', v: 74 },
              { n: 'Listening', v: 61 },
              { n: 'Reading', v: 88 },
            ].map((b, i) => (
              <g key={b.n} transform={`translate(0 ${20 + i * 44})`}>
                <text x="10" y="16" className="gu-s-small">
                  {b.n}
                </text>
                <rect x="100" y="4" width="180" height="16" rx="8" className="gu-s-soft" />
                <rect x="100" y="4" width={1.8 * b.v} height="16" rx="8" fill={b.v < 65 ? '#c8764a' : '#3b7f7a'} className="gu-grow-x" />
                <text x="290" y="17" className="gu-s-b">
                  {b.v}%
                </text>
              </g>
            ))}
          </svg>
          <figcaption>Reports show the class, one learner, or one task; low areas stand out.</figcaption>
        </figure>
      </div>
      <Tip>Learners and parents get a <b>recap</b> after a lesson; you check the draft and share it with a link.</Tip>
    </>
  );
}

// ------------------------------------------------------------------ 8. timetable and rooms

function Week() {
  const [made, setMade] = useState<number[]>([]);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const fixed: Record<number, { t: string; c: string }> = { 0: { t: 'B1 Evening', c: '#c8764a' }, 2: { t: 'B1 Evening', c: '#c8764a' }, 3: { t: 'IELTS', c: '#3667a6' } };
  return (
    <>
      <p>The <b>Timetable</b> shows your classes and meetings week by week; drag across the hours to add one. <b>Rooms</b> starts a video or audio call in one click, with a link anyone can join, and every class has its own video room.</p>
      <Try title="Tap an empty slot to add a speaking club" note="In the real timetable you drag across the hours, and a card asks for the name.">
        <div className="gu-week" aria-label="This week, 6pm">
          {days.map((d, i) => {
            const ev = fixed[i] ?? (made.includes(i) ? { t: 'Speaking club', c: '#3b7f7a' } : null);
            return (
              <div key={d} className="gu-day">
                <span className="gu-day-h">{d}</span>
                {ev ? (
                  <span className="gu-ev" style={{ ['--c' as string]: ev.c }}>
                    <b>{ev.t}</b>
                    <span>18:00–19:30</span>
                  </span>
                ) : (
                  <button type="button" className="gu-slot" onClick={() => setMade([...made, i])} aria-label={`Add a speaking club on ${d}`}>
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Try>
    </>
  );
}

// ------------------------------------------------------------------ 9. sharing

function Share() {
  return (
    <>
      <p>Your work is yours, and easy to share.</p>
      <div className="gu-tiles">
        {[
          { n: 'Files', c: '#3667a6', t: 'Your library of lessons, documents, flashcards and PD reading. Documents are written together live, with suggestions and comments.' },
          { n: 'Messages', c: '#7a4fa3', t: 'Chat with learners and teachers, one to one or in groups, and call from a chat. Learners can message you about a task.' },
          { n: 'Colleagues', c: '#4f6b7a', t: 'Connect with teachers by link, then share a lesson to edit together, or copy it into their class.' },
          { n: 'Organisation library', c: '#7a5a3a', t: 'If you belong to a school, its shared lessons and materials, ready to copy into your classes.' },
        ].map((x) => (
          <div key={x.n} className="gu-tile" style={{ ['--c' as string]: x.c }}>
            <b>{x.n}</b>
            <span>{x.t}</span>
          </div>
        ))}
      </div>
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 150" role="img" aria-label="Sharing a lesson: you send a link to a colleague, who either edits it with you or copies it into their own class">
          <rect x="20" y="40" width="170" height="70" rx="14" className="gu-s-card" />
          <text x="105" y="70" textAnchor="middle" className="gu-s-h" style={{ fill: '#c8764a' }}>
            Your lesson
          </text>
          <text x="105" y="92" textAnchor="middle" className="gu-s-small">
            Share → a link
          </text>
          <path d="M196 75 h110 m-8 -7 l8 7 -8 7" className="gu-s-arrow" />
          <rect x="312" y="40" width="150" height="70" rx="14" className="gu-s-card" />
          <text x="387" y="80" textAnchor="middle" className="gu-s-h" style={{ fill: '#4f6b7a' }}>
            A colleague
          </text>
          <path d="M468 62 C 510 40 520 30 548 30 m-8 -6 l8 6 -8 6" className="gu-s-arrow" />
          <path d="M468 88 C 510 110 520 120 548 120 m-8 -6 l8 6 -8 6" className="gu-s-arrow" />
          <text x="556" y="34" className="gu-s-b">
            edits it with you, live
          </text>
          <text x="556" y="124" className="gu-s-b">
            copies it to their class
          </text>
        </svg>
      </figure>
    </>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { playSound } from '../lib/phonAudio';
import './guide.css';

// Guide: what ELT Suite does, for teachers, one topic at a time. Each topic has a picture of how it
// works and, where it helps, something to try: a question to answer as a learner would, a word to
// stress, a sound to hear.

type Topic = { id: string; title: string; short: string; body: () => JSX.Element };

const TOPICS: Topic[] = [
  { id: 'start', title: 'One place for all your teaching', short: 'Start here', body: Start },
  { id: 'blend', title: 'Teach your way: choose your blend', short: 'Your blend', body: Blend },
  { id: 'lessons', title: 'Lessons and tasks', short: 'Lessons', body: Lessons },
  { id: 'questions', title: 'Question types', short: 'Questions', body: Questions },
  { id: 'notation', title: 'Language notation: the marks teachers use', short: 'Language notation', body: Notation },
  { id: 'live', title: 'Teaching live', short: 'Teaching live', body: Live },
  { id: 'games', title: 'Games and activities', short: 'Games', body: Games },
  { id: 'progress', title: 'Marking and progress', short: 'Progress', body: Progress },
  { id: 'studio', title: 'Studio: record and edit sound', short: 'Studio', body: Studio },
  { id: 'print', title: 'PDFs, printing and worksheets', short: 'Print and PDF', body: Print },
  { id: 'files', title: 'Your files and their apps', short: 'Files and apps', body: FilesTopic },
  { id: 'week', title: 'Timetable and Rooms', short: 'Timetable, Rooms', body: Week },
  { id: 'share', title: 'Colleagues and Messages', short: 'Colleagues', body: Share },
  { id: 'org', title: 'Running an organisation', short: 'Organisation', body: OrgTopic },
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
            <p>Everything an English teacher needs, in one place: make materials, record and edit sound, teach in class or online, print worksheets, keep your reading notes and work with colleagues. Here is each app, with something to try.</p>
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
    <ol className="gu-flow gu-flow-d">
      {items.map((s, i) => (
        <li key={s.t}>
          <span className="gu-flow-n">{i + 1}</span>
          <span>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </span>
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

type GuideApp = { k: string; name: string; color: string; to: string; tag: string; about: string; can: string[]; d: string; soon?: boolean };
const APPS: GuideApp[] = [
  {
    k: 'home', name: 'Home', color: '#8b3d6b', to: '/', tag: 'Your day in one look',
    about: 'Opens on today: the classes you teach next, the files you were working on and what is new, so the first thing you see is what you need.',
    can: ['Join today’s live lesson in one tap', 'Pick up the file you were working on', 'Starred files and new messages, without searching'],
    d: 'M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  },
  {
    k: 'classes', name: 'Classes', color: '#c8764a', to: '/classes', tag: 'Lessons, learners and live teaching',
    about: 'Each class holds its learners and its lessons. Write a lesson like a document, with questions, sound and language notation inside, then teach it live or set it as homework.',
    can: ['Many question types, marked for you', 'Teach live: every learner’s screen follows yours', 'See who answered what, mark writing, send a recap'],
    d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z',
  },
  {
    k: 'timetable', name: 'Timetable', color: '#8a6a4a', to: '/timetable', tag: 'Your week, planned',
    about: 'Every class and meeting in your week. Add a session once and it repeats each week; open the class or its video room straight from it.',
    can: ['Drag sessions to plan the week', 'Weekly sessions repeat on their own', 'Start the lesson or the call from the session'],
    d: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4',
  },
  {
    k: 'rooms', name: 'Rooms', color: '#3b7f7a', to: '/rooms', tag: 'Video and audio calls for teaching',
    about: 'A video room for every class, always at the same link, and calls with anyone you work with. Teach in it, or keep using Zoom, Teams or Meet if you prefer.',
    can: ['One room per class, the same link every week', 'Video or audio only', 'Calls with colleagues and learners from Messages'],
    d: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM15.5 10.5l5-3v9l-5-3',
  },
  {
    k: 'collab', name: 'Collab', color: '#2f6f9f', to: '/collab', tag: 'Write together, live',
    about: 'Documents and slides you write at the same time as others: with colleagues to plan a course, or with learners for a class story or a shared essay. Unlike other editors, it speaks ELT: the marks you use on the board are built in.',
    can: ['Tense timelines, substitution slots, word and sentence stress, IPA and sound cards, from the / menu', 'See each other’s cursors; suggest changes and comment', 'Download as Word, PDF or PowerPoint'],
    d: 'M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 12.5h6M9 16h4',
  },
  {
    k: 'reading', name: 'Reading Journal', color: '#6b5a8a', to: '/reading', tag: 'Your reading and notes',
    about: 'For CELTA, Delta, an MA or your own development: each book or article with your notes, and its reference written for you.',
    can: ['Notes under each source', 'References in APA, Harvard and more', 'Cite a source in a Collab document in one click'],
    d: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5',
  },
  {
    k: 'pdf', name: 'PDF', color: '#a6463a', to: '/pdf', tag: 'Write on any PDF',
    about: 'Bring in a coursebook page or a worksheet as a PDF and write on it: on your own, with a colleague, or with your learners in class.',
    can: ['Type in the gaps, highlight and draw', 'Write on it together, live', 'Print it with everything you added'],
    d: 'M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 16.5l2-5 2 5M9.6 15h2.8',
  },
  {
    k: 'recordings', name: 'Recordings', color: '#a8473a', to: '/recordings', tag: 'Make your own listening',
    about: 'Record yourself, edit like audio software, or record a dialogue with colleagues, each on their own device. The script lights up as it plays, like karaoke.',
    can: ['Cut, move and change the volume of each clip', 'A speaker for each track, with their lines', 'Use it in any lesson, or download an MP3'],
    d: 'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5',
  },
  {
    k: 'files', name: 'Files', color: '#3667a6', to: '/archive', tag: 'Everything you keep',
    about: 'Lessons, documents, flashcards, PDFs, pictures and recordings in one place, in folders like on your computer, with your organisation’s library beside them.',
    can: ['Folders, tags and search', 'Share a folder with colleagues', 'Copy from the library into a class'],
    d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
  },
  {
    k: 'messages', name: 'Messages', color: '#7a4fa3', to: '/messages', tag: 'Talk to learners and teachers',
    about: 'Chats with your learners and colleagues, one to one or in groups, with lessons and files inside the messages.',
    can: ['One-to-one and group chats', 'Send a lesson or a file in a message', 'Start a call from the chat'],
    d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z',
  },
  {
    k: 'colleagues', name: 'Colleagues', color: '#4f6b7a', to: '/colleagues', tag: 'Share and plan together',
    about: 'The teachers you work with, and everything you share with them, so nobody starts from a blank page.',
    can: ['Invite a colleague with a link', 'Share lessons, folders and recordings', 'Plan in Collab, record together in Studio'],
    d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2',
  },
  {
    k: 'money', name: 'Money', color: '#2f7a5a', to: '/', soon: true, tag: 'For freelance teachers · under development',
    about: 'Being built now: for teachers who work for themselves. Your rates and lesson packages, invoices made from the lessons you taught, who has paid, and what to put aside, from the Timetable you already keep.',
    can: ['Your real hourly rate, after prep and holidays', 'Invoices from your Timetable, in your learner’s currency', 'Paid, due and late at a glance; a cushion for quiet months'],
    d: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 9v6M17 9v6',
  },
];

function Start() {
  const [pick, setPick] = useState(1);
  const a = APPS[pick];
  return (
    <>
      <p>ELT Suite is for all your work as an English teacher, not only your classes: making materials, recording listening, printing worksheets, reading for your development, timetabling and working with colleagues. It is one account with several apps. The <b>nine dots</b> at the top right of every page open them; the name under “ELT Suite” at the top left tells you which app you are in.</p>
      <div className="gu-explore">
        <div className="gu-apps" role="radiogroup" aria-label="Apps">
          {APPS.map((p, i) => (
            <button key={p.k} type="button" role="radio" aria-checked={i === pick} className={'gu-app' + (i === pick ? ' on' : '')} style={{ ['--c' as string]: p.color }} onClick={() => setPick(i)}>
              <span className="gu-app-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={p.d} />
                </svg>
              </span>
              {p.name}
              {p.soon && <span className="gu-soon">Soon</span>}
            </button>
          ))}
        </div>
        <div className="gu-win gu-slide" key={a.k} style={{ ['--c' as string]: a.color }} aria-live="polite">
          <div className="gu-win-bar">
            <span className="gu-win-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="gu-win-t">
              ELT Suite · <b>{a.name}</b>
            </span>
          </div>
          <div className="gu-win-pic">
            <AppScreen k={a.k} c={a.color} />
          </div>
          <div className="gu-win-text">
            <span className="gu-win-tag">{a.tag}</span>
            <p>{a.about}</p>
            <ul>
              {a.can.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {a.soon ? (
              <span className="gu-win-soon">Under development: it comes to ELT Suite soon.</span>
            ) : (
              <Link className="gu-win-go" to={a.to} target="_blank" rel="noopener">
                Open {a.name} in a new tab ↗
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// A small picture of each app's screen, drawn rather than a screenshot, so it reads at any size.
const ln = (x: number, y: number, w: number, o = 1) => <rect x={x} y={y} width={w} height="6" rx="3" className="gu-s-soft" opacity={o} />;
function AppScreen({ k, c }: { k: string; c: string }) {
  const tint = (o: number) => ({ fill: c, opacity: o });
  const pic = (() => {
    switch (k) {
      case 'home':
        return (
          <>
            <text x="20" y="34" className="gu-s-h">Good morning, Arda</text>
            <text x="20" y="52" className="gu-s-small">Wednesday · 3 classes today</text>
            <rect x="20" y="66" width="200" height="140" rx="12" className="gu-s-card" />
            <text x="34" y="88" className="gu-s-b">Today</text>
            {[['09:00', 'B1 Evening', '#c8764a'], ['11:30', 'IELTS Prep', '#3667a6'], ['16:00', 'Kids A2', '#3b7f4f']].map(([t, n, col], i) => (
              <g key={t} transform={`translate(34 ${98 + i * 32})`}>
                <rect width="4" height="26" rx="2" style={{ fill: col }} />
                <text x="12" y="10" className="gu-s-small" style={{ fontSize: 10 }}>{t}</text>
                <text x="12" y="24" className="gu-s-b">{n}</text>
                {i === 0 && (
                  <g>
                    <rect x="118" y="2" width="50" height="20" rx="10" style={{ fill: c }} />
                    <text x="143" y="16" textAnchor="middle" className="gu-s-b" style={{ fill: '#fff', fontSize: 11 }}>Join</text>
                  </g>
                )}
              </g>
            ))}
            <rect x="232" y="66" width="108" height="62" rx="12" className="gu-s-card" />
            <text x="244" y="86" className="gu-s-b">★ Starred</text>
            {ln(244, 96, 80)}
            {ln(244, 110, 60)}
            <rect x="232" y="136" width="108" height="62" rx="12" className="gu-s-card" />
            <text x="244" y="156" className="gu-s-b">Messages</text>
            <circle cx="252" cy="176" r="8" style={tint(0.35)} />
            {ln(266, 173, 60)}
          </>
        );
      case 'classes':
        return (
          <>
            <text x="20" y="34" className="gu-s-h">Classes</text>
            <rect x="268" y="18" width="68" height="22" rx="11" style={{ fill: c }} />
            <text x="302" y="33" textAnchor="middle" style={{ fill: '#fff', font: '600 11px var(--sans)' }}>+ New class</text>
            {[['B1 Evening', '14 learners', '#c8764a'], ['IELTS Prep', '9 learners', '#3667a6'], ['Kids A2', '18 learners', '#3b7f4f'], ['Business B2', '6 learners', '#7a4fa3']].map(([n, l, col], i) => (
              <g key={n} transform={`translate(${20 + (i % 2) * 164} ${50 + Math.floor(i / 2) * 76})`}>
                <rect width="152" height="66" rx="12" className="gu-s-card" />
                <rect width="152" height="10" rx="5" style={{ fill: col }} />
                <text x="14" y="36" className="gu-s-b">{n}</text>
                <text x="14" y="54" className="gu-s-small">{l}</text>
              </g>
            ))}
            <rect x="20" y="202" width="316" height="0" />
            <g transform="translate(20 204)">
              <text y="-4" className="gu-s-small" style={{ fontSize: 10 }}>Next: B1 Evening · Present perfect · 09:00</text>
            </g>
          </>
        );
      case 'timetable':
        return (
          <>
            <text x="20" y="34" className="gu-s-h">This week</text>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
              <g key={d} transform={`translate(${20 + i * 64} 46)`}>
                <text x="28" y="10" textAnchor="middle" className="gu-s-small">{d}</text>
                <rect y="18" width="56" height="150" rx="8" className="gu-s-card" />
              </g>
            ))}
            {[[0, 6, 30, '#c8764a'], [2, 6, 30, '#c8764a'], [1, 50, 40, '#3667a6'], [3, 50, 40, '#3667a6'], [4, 26, 24, '#8a6a4a'], [2, 96, 30, '#3b7f4f'], [0, 108, 28, '#7a4fa3']].map(([d, y, h, col], i) => (
              <rect key={i} x={24 + (d as number) * 64} y={64 + (y as number)} width="48" height={h as number} rx="6" style={{ fill: col as string, opacity: 0.85 }} />
            ))}
          </>
        );
      case 'rooms':
        return (
          <>
            <rect x="20" y="16" width="320" height="188" rx="14" fill="#1f1d1b" />
            {[['Arda', '#c8764a'], ['Mei', '#3667a6'], ['Omar', '#3b7f4f'], ['Lena', '#7a4fa3']].map(([n, col], i) => (
              <g key={n} transform={`translate(${32 + (i % 2) * 152} ${28 + Math.floor(i / 2) * 70})`}>
                <rect width="144" height="62" rx="10" fill="#33302c" stroke={i === 0 ? c : 'none'} strokeWidth="2" />
                <circle cx="72" cy="26" r="15" style={{ fill: col }} />
                <text x="72" y="31" textAnchor="middle" style={{ fill: '#fff', font: '600 13px var(--sans)' }}>{n[0]}</text>
                <text x="8" y="55" style={{ fill: '#e9e5df', font: '11px var(--sans)' }}>{n}</text>
              </g>
            ))}
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={150 + i * 30} cy="186" r="11" fill={i === 2 ? '#c94f3d' : '#4a4641'} />
            ))}
          </>
        );
      case 'collab':
        return (
          <>
            <rect x="14" y="10" width="232" height="202" rx="6" className="gu-s-card" />
            <text x="28" y="34" className="gu-s-h" style={{ fontSize: 14 }}>Present perfect: our notes</text>
            {[['I’ve', 0], ['lived', 1], ['here', 0], ['for', 0], ['years.', 1]].map(([w, st], i, arr) => {
              const x = 28 + arr.slice(0, i).reduce((n, [ww]) => n + String(ww).length * 7.4 + 8, 0);
              return (
                <g key={i}>
                  {st ? <circle cx={x + String(w).length * 3.6} cy="48" r="3" style={{ fill: c }} /> : null}
                  <text x={x} y="64" style={{ fill: 'var(--ink)', font: `${st ? 700 : 400} 13px var(--serif)` }}>{w}</text>
                </g>
              );
            })}
            <text x="58" y="78" style={{ fill: '#7a4fa3', font: '10px var(--sans)' }}>/lɪvd/</text>
            <line x1="28" y1="96" x2="226" y2="96" stroke="var(--ink)" strokeWidth="1.4" />
            <path d="M222 92 l5 4 -5 4" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
            <line x1="190" y1="88" x2="190" y2="104" stroke="var(--ink)" strokeWidth="1.4" />
            <text x="190" y="116" textAnchor="middle" style={{ fill: 'var(--muted)', font: '8.5px var(--sans)' }}>NOW</text>
            <rect x="70" y="91" width="120" height="10" rx="3" style={{ fill: c, opacity: 0.35 }} />
            <text x="70" y="114" style={{ fill: c, font: '600 9px var(--sans)' }}>since 2019</text>
            <text x="28" y="140" style={{ fill: 'var(--ink)', font: '12px var(--serif)' }}>She has been to</text>
            <line x1="122" y1="126" x2="122" y2="168" stroke="var(--ink)" strokeWidth="1.4" />
            <line x1="176" y1="126" x2="176" y2="168" stroke="var(--ink)" strokeWidth="1.4" />
            {['Lisbon', 'Paris', 'Seoul'].map((w, i) => (
              <text key={w} x="130" y={138 + i * 13} style={{ fill: i ? 'var(--muted)' : 'var(--ink)', font: `${i ? 400 : 700} 11px var(--serif)` }}>{w}</text>
            ))}
            {ln(28, 184, 180)}
            {ln(28, 198, 130)}
            <rect x="150" y="186" width="2" height="16" style={{ fill: '#c8764a' }} />
            <rect x="132" y="172" width="40" height="13" rx="3" style={{ fill: '#c8764a' }} />
            <text x="152" y="182" textAnchor="middle" style={{ fill: '#fff', font: '600 9px var(--sans)' }}>Tom</text>
            <g transform="translate(256 24)">
              <rect width="94" height="104" rx="10" className="gu-s-card" />
              <text x="10" y="18" style={{ fill: c, font: '700 12px var(--mono, monospace)' }}>/</text>
              <text x="22" y="18" className="gu-s-small" style={{ fontSize: 9.5 }}>Language</text>
              {['Timeline', 'Stress', 'IPA', 'Substitution', 'Sound card'].map((t, i) => (
                <g key={t}>
                  <rect x="6" y={26 + i * 15} width="82" height="13" rx="4" style={{ fill: i === 0 ? c : 'transparent', opacity: i === 0 ? 0.16 : 1 }} />
                  <text x="12" y={36 + i * 15} className="gu-s-small" style={{ fontSize: 10, fill: 'var(--ink)' }}>{t}</text>
                </g>
              ))}
            </g>
            <g transform="translate(256 142)">
              <rect width="94" height="56" rx="10" className="gu-s-card" />
              <circle cx="15" cy="15" r="7" style={{ fill: '#3667a6' }} />
              <text x="27" y="19" className="gu-s-small" style={{ fontSize: 10 }}>Selin</text>
              <text x="10" y="36" className="gu-s-small" style={{ fontSize: 9.5, fill: 'var(--ink)' }}>Add “since 2019”?</text>
              {ln(10, 44, 60, 0.7)}
            </g>
          </>
        );
      case 'reading':
        return (
          <>
            <rect x="12" y="14" width="122" height="192" rx="10" className="gu-s-card" />
            {['Unplugged', 'How Languages', 'Learning Teaching'].map((t, i) => (
              <g key={t} transform={`translate(20 ${26 + i * 40})`}>
                <rect width="106" height="32" rx="7" style={tint(i === 0 ? 0.16 : 0)} />
                <rect x="6" y="6" width="12" height="20" rx="2" style={tint(0.7 - i * 0.2)} />
                <text x="22" y="20" className="gu-s-small" style={{ fontSize: 9 }}>{t}</text>
              </g>
            ))}
            <rect x="142" y="14" width="204" height="192" rx="10" style={{ fill: '#fffdf6', stroke: 'var(--hair-strong)' }} />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <line key={i} x1="142" x2="346" y1={46 + i * 24} y2={46 + i * 24} stroke="#a9c3e0" strokeWidth="1" />
            ))}
            <line x1="176" x2="176" y1="14" y2="206" stroke="#d9534f" strokeWidth="1.5" />
            <text x="182" y="36" style={{ fill: '#33302c', font: '600 12px var(--serif)' }}>Ch. 2 · Materials-light</text>
            {[['p. 12', 'Dogme: conversation first'], ['p. 15', 'Emergent language'], ['p. 21', 'Try: no coursebook day']].map(([pg, t], i) => (
              <g key={pg}>
                <text x="148" y={66 + i * 24} style={{ fill: '#d9534f', font: '9.5px var(--sans)' }}>{pg}</text>
                <text x="182" y={66 + i * 24} style={{ fill: '#33302c', font: 'italic 11.5px var(--serif)' }}>{t}</text>
              </g>
            ))}
          </>
        );
      case 'pdf':
        return (
          <>
            <rect x="70" y="10" width="160" height="200" rx="4" className="gu-s-card" />
            <text x="86" y="34" className="gu-s-b">Unit 3 · Past simple</text>
            {[48, 62, 76].map((y, i) => ln(86, y, [124, 110, 90][i]))}
            <rect x="84" y="58" width="80" height="10" rx="2" fill="#f3d36b" opacity="0.6" />
            <text x="86" y="104" className="gu-s-small">1. Yesterday I</text>
            <rect x="160" y="92" width="44" height="16" rx="3" style={{ fill: 'none', stroke: c, strokeWidth: 1.5 }} />
            <text x="182" y="104" textAnchor="middle" style={{ fill: c, font: '600 11px var(--sans)' }}>went</text>
            <text x="86" y="128" className="gu-s-small">2. She</text>
            <rect x="120" y="116" width="44" height="16" rx="3" style={{ fill: 'none', stroke: c, strokeWidth: 1.5, strokeDasharray: '3 3' }} />
            {[148, 162, 176].map((y, i) => ln(86, y, [120, 100, 116][i]))}
            <path d="M190 150 q10 -16 22 -4 t20 -2" style={{ fill: 'none', stroke: '#3667a6', strokeWidth: 2, strokeLinecap: 'round' }} />
            <g transform="translate(250 50)">
              {['pen', 'mark', 'text'].map((t, i) => (
                <g key={t} transform={`translate(0 ${i * 40})`}>
                  <rect width="80" height="30" rx="8" className="gu-s-card" />
                  <text x="40" y="19" textAnchor="middle" className="gu-s-small">{t === 'pen' ? '✎ Pen' : t === 'mark' ? '▮ Highlight' : 'T Type'}</text>
                </g>
              ))}
            </g>
          </>
        );
      case 'recordings':
        return (
          <>
            <rect x="16" y="14" width="328" height="192" rx="12" fill="#1f1d1b" />
            {['Speaker 1', 'Speaker 2'].map((n, t) => (
              <g key={n} transform={`translate(26 ${30 + t * 62})`}>
                <text y="10" style={{ fill: '#e9e5df', font: '600 10px var(--sans)' }}>{n}</text>
                {(t ? [[120, 90], [250, 60]] : [[60, 80], [180, 60]]).map(([x, w]) => (
                  <g key={x}>
                    <rect x={x} y="0" width={w} height="44" rx="6" fill={t ? '#3667a6' : c} opacity="0.85" />
                    {Array.from({ length: Math.floor(w / 5) }, (_, j) => (
                      <rect key={j} x={x + 3 + j * 5} y={22 - ((j * 7) % 13) - 3} width="2" height={2 * (((j * 7) % 13) + 3)} fill="#fff" opacity="0.7" />
                    ))}
                  </g>
                ))}
              </g>
            ))}
            <line x1="200" x2="200" y1="24" y2="160" stroke="#f3d36b" strokeWidth="2" />
            <text x="30" y="186" style={{ fill: '#8f8a82', font: '13px var(--serif)' }}>
              A: Is this the train to <tspan style={{ fill: '#f3d36b', fontWeight: 700 }}>Leeds?</tspan> B: No, that’s platform 4.
            </text>
          </>
        );
      case 'money':
        return (
          <>
            <text x="20" y="32" className="gu-s-h">This month</text>
            {[['Earned', '£2,140', '#2f7a5a'], ['Due', '£360', '#c9a227'], ['Late', '£90', '#c94f3d']].map(([l, v, col], i) => (
              <g key={l} transform={`translate(${20 + i * 108} 44)`}>
                <rect width="100" height="58" rx="10" className="gu-s-card" />
                <text x="12" y="22" className="gu-s-small">{l}</text>
                <text x="12" y="46" style={{ fill: col, font: '700 18px var(--sans)' }}>{v}</text>
              </g>
            ))}
            <rect x="20" y="114" width="316" height="94" rx="10" className="gu-s-card" />
            <text x="32" y="134" className="gu-s-b">Invoices</text>
            {[['Mei · 8 lessons', 'Paid', '#2f7a5a'], ['Omar · 4 lessons', 'Due Fri', '#c9a227'], ['Lena · 2 lessons', '6 days late', '#c94f3d']].map(([n, st, col], i) => (
              <g key={n} transform={`translate(32 ${146 + i * 20})`}>
                <text y="10" className="gu-s-small" style={{ fill: 'var(--ink)' }}>{n}</text>
                <rect x="196" y="-1" width="84" height="15" rx="7.5" style={{ fill: col, opacity: 0.16 }} />
                <text x="238" y="10" textAnchor="middle" style={{ fill: col, font: '600 10px var(--sans)' }}>{st}</text>
              </g>
            ))}
          </>
        );
      case 'files':
        return (
          <>
            <text x="20" y="34" className="gu-s-h">Files</text>
            {[['Term 2', 'folder'], ['Speaking', 'folder'], ['Unit 3 quiz', '#c8764a'], ['Course plan', '#2f6f9f'], ['Phrasal verbs', '#a8701f'], ['Dialogue', '#a8473a'], ['Workbook p.12', '#a6463a'], ['Notes', '#6b5a8a']].map(([n, kind], i) => (
              <g key={n} transform={`translate(${24 + (i % 4) * 80} ${52 + Math.floor(i / 4) * 78})`}>
                {kind === 'folder' ? (
                  <path d="M6 14h20l6 6h30a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" style={tint(0.55)} />
                ) : (
                  <g>
                    <path d="M18 4h22l12 12v36H18z" className="gu-s-card" />
                    <rect x="22" y="38" width="26" height="8" rx="2" style={{ fill: kind }} />
                  </g>
                )}
                <text x="34" y="66" textAnchor="middle" className="gu-s-small" style={{ fontSize: 10 }}>{n}</text>
              </g>
            ))}
          </>
        );
      case 'messages':
        return (
          <>
            <rect x="16" y="14" width="96" height="192" rx="10" className="gu-s-card" />
            {['B1 Evening', 'Mei', 'Tom'].map((n, i) => (
              <g key={n} transform={`translate(24 ${26 + i * 34})`}>
                <rect width="80" height="28" rx="7" style={tint(i === 0 ? 0.16 : 0)} />
                <circle cx="13" cy="14" r="8" style={tint(0.5)} />
                <text x="26" y="18" className="gu-s-small" style={{ fontSize: 10 }}>{n}</text>
              </g>
            ))}
            <rect x="124" y="28" width="162" height="28" rx="12" className="gu-s-soft" />
            <text x="136" y="46" style={{ fill: 'var(--ink)', font: '11px var(--sans)' }}>Is homework due on Friday?</text>
            <rect x="170" y="66" width="166" height="28" rx="12" style={{ fill: c }} />
            <text x="182" y="84" style={{ fill: '#fff', font: '11px var(--sans)' }}>Yes, here is the lesson:</text>
            <rect x="196" y="104" width="140" height="44" rx="10" className="gu-s-card" />
            <rect x="206" y="114" width="18" height="24" rx="3" style={{ fill: '#c8764a' }} />
            <text x="232" y="126" className="gu-s-b" style={{ fontSize: 11 }}>Unit 3 homework</text>
            <text x="232" y="140" className="gu-s-small" style={{ fontSize: 9 }}>Lesson · due Friday</text>
            <rect x="124" y="172" width="212" height="28" rx="14" className="gu-s-card" />
            <text x="138" y="190" className="gu-s-small">Write a message…</text>
          </>
        );
      default:
        return (
          <>
            {[['A', 80, 70, '#c8764a'], ['S', 180, 46, '#3667a6'], ['T', 280, 70, '#3b7f4f']].map(([l, x, y, col]) => (
              <g key={l as string}>
                <circle cx={x as number} cy={(y as number) + 20} r="22" style={{ fill: col as string }} />
                <text x={x as number} y={(y as number) + 26} textAnchor="middle" style={{ fill: '#fff', font: '600 16px var(--sans)' }}>{l}</text>
              </g>
            ))}
            <path d="M102 92 L158 72 M202 72 L258 92 M106 100 L254 100" className="gu-s-line on" />
            <rect x="100" y="130" width="160" height="66" rx="12" className="gu-s-card" />
            <rect x="114" y="144" width="22" height="30" rx="3" style={{ fill: '#c8764a' }} />
            <text x="146" y="158" className="gu-s-b">Shared with you</text>
            <text x="146" y="176" className="gu-s-small">Speaking lesson · Selin</text>
          </>
        );
    }
  })();
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={`A picture of the ${APPS.find((x) => x.k === k)?.name} screen`}>
      {pic}
    </svg>
  );
}


// ------------------------------------------------------------------ 2. lessons

function Lessons() {
  return (
    <>
      <p>A <b>class</b> holds its learners and its lessons. A <b>lesson</b> is a page of <b>tasks</b>; each task mixes text, pictures, sound and questions. Learners join with the class code and a PIN you give them: no email needed.</p>
      <Privacy />
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 250" role="img" aria-label="A class holds lessons; the open lesson holds tasks; the open task is made of elements such as text, a gap fill, a recording and a timeline">
          <rect x="10" y="10" width="700" height="230" rx="16" className="gu-s-card" />
          <rect x="10" y="10" width="700" height="40" rx="16" style={{ fill: '#c8764a' }} />
          <rect x="10" y="34" width="700" height="16" style={{ fill: '#c8764a' }} />
          <text x="28" y="36" style={{ fill: '#fff', font: '600 15px var(--sans)' }}>B1 Evening</text>
          <text x="128" y="36" style={{ fill: '#fff', font: '12px var(--sans)', opacity: 0.9 }}>CLASS · 14 learners · code BEV-482</text>
          {['Travel vocabulary', 'Present perfect', 'Exam practice'].map((t, i) => (
            <g key={t} transform={`translate(28 ${66 + i * 54})`}>
              <rect width="170" height="44" rx="10" style={{ fill: i === 1 ? 'color-mix(in srgb, #3667a6 12%, var(--paper))' : 'var(--paper)', stroke: i === 1 ? '#3667a6' : 'var(--hair-strong)', strokeWidth: i === 1 ? 2 : 1 }} />
              <text x="14" y="19" className="gu-s-small" style={{ fontSize: 10, fill: '#3667a6' }}>LESSON {i + 1}</text>
              <text x="14" y="34" className="gu-s-b">{t}</text>
            </g>
          ))}
          <path d="M200 142 h22" className="gu-s-arrow" />
          <rect x="226" y="62" width="200" height="164" rx="12" style={{ fill: 'color-mix(in srgb, #3667a6 5%, var(--paper))', stroke: '#3667a6' }} />
          <text x="242" y="84" className="gu-s-small" style={{ fontSize: 10, fill: '#3667a6' }}>LESSON · Present perfect</text>
          {['1. Warm-up', '2. Listening', '3. Practice', '4. Speaking'].map((t, i) => (
            <g key={t} transform={`translate(242 ${96 + i * 31})`}>
              <rect width="168" height="25" rx="7" style={{ fill: i === 2 ? 'color-mix(in srgb, #7a4fa3 14%, var(--paper))' : 'var(--paper)', stroke: i === 2 ? '#7a4fa3' : 'var(--hair-strong)', strokeWidth: i === 2 ? 2 : 1 }} />
              <text x="10" y="17" className="gu-s-b" style={{ fontSize: 12 }}>{t}</text>
              <text x="158" y="17" textAnchor="end" className="gu-s-small" style={{ fontSize: 9.5, fill: '#7a4fa3' }}>TASK</text>
            </g>
          ))}
          <path d="M428 170 h22" className="gu-s-arrow" />
          <rect x="454" y="62" width="240" height="164" rx="12" style={{ fill: 'color-mix(in srgb, #7a4fa3 5%, var(--paper))', stroke: '#7a4fa3' }} />
          <text x="470" y="84" className="gu-s-small" style={{ fontSize: 10, fill: '#7a4fa3' }}>TASK · 3. Practice · its elements</text>
          <rect x="470" y="94" width="208" height="22" rx="6" style={{ fill: 'var(--paper)', stroke: '#3b7f7a' }} />
          <text x="480" y="109" className="gu-s-small" style={{ fill: 'var(--ink)' }}>Text: “Complete the sentences.”</text>
          <rect x="470" y="122" width="208" height="22" rx="6" style={{ fill: 'var(--paper)', stroke: '#3b7f7a' }} />
          <text x="480" y="137" className="gu-s-small" style={{ fill: 'var(--ink)' }}>She</text>
          <rect x="502" y="129" width="46" height="10" rx="2" style={{ fill: 'color-mix(in srgb, #3b7f4f 18%, var(--paper))', stroke: '#3b7f4f' }} />
          <text x="554" y="137" className="gu-s-small" style={{ fill: 'var(--ink)' }}>(live) here since 2019.</text>
          <rect x="470" y="150" width="100" height="32" rx="6" style={{ fill: '#1f1d1b' }} />
          {Array.from({ length: 14 }, (_, j) => <rect key={j} x={478 + j * 6} y={166 - ((j * 5) % 9) - 2} width="2.5" height={2 * (((j * 5) % 9) + 2)} fill="#e9a27a" />)}
          <rect x="576" y="150" width="102" height="32" rx="6" style={{ fill: 'var(--paper)', stroke: '#3b7f7a' }} />
          <line x1="584" y1="168" x2="670" y2="168" stroke="var(--ink)" strokeWidth="1.4" />
          <line x1="640" y1="161" x2="640" y2="175" stroke="var(--ink)" strokeWidth="1.4" />
          <path d="M600 162 l6 12 M606 162 l-6 12" stroke="#3b7f4f" strokeWidth="1.8" />
          {['text', 'gap fill', 'sound', 'timeline'].map((t, i) => (
            <g key={t} transform={`translate(${470 + i * 54} 194)`}>
              <rect width="48" height="18" rx="9" style={{ fill: 'color-mix(in srgb, #3b7f7a 14%, var(--paper))' }} />
              <text x="24" y="13" textAnchor="middle" className="gu-s-small" style={{ fontSize: 9.5, fill: 'var(--ink)' }}>{t}</text>
            </g>
          ))}
        </svg>
        <figcaption>A class holds lessons; a lesson holds tasks; a task is made of elements, which you add with /.</figcaption>
      </figure>
      <Steps
        items={[
          { t: 'Make a class', d: 'Classes → New class. Choose a name, a level and a colour.' },
          { t: 'Add learners', d: 'In the class, Learners → Add. Each learner gets a PIN; print the sign-in cards.' },
          { t: 'Write a lesson', d: 'Lessons → New lesson. Type in it like a document; press / for any element.' },
          { t: 'Teach it or set it', d: 'Teach it live in class, or open it as homework with a due date.' },
        ]}
      />
      <Try title="Press / and choose an element to see it in a lesson" note="In a real lesson, pressing / opens this list where you are typing; type to search it.">
        <SlashDemo />
      </Try>
    </>
  );
}

type El = { k: string; g: string; h: string; learners: string; mark: 'auto' | 'you' | 'show'; view: () => JSX.Element };
const SLASH: El[] = [
  {
    k: 'Gap fill', g: 'Questions', h: 'A blank inside a sentence', mark: 'auto',
    learners: 'Type the missing word. A hint in brackets can say which verb or word to use.',
    view: () => (
      <p className="gu-el-p">1. She <span className="gu-el-gap">has lived</span> (live) here since 2019.<br />2. We <span className="gu-el-gap" /> (never / try) sushi.</p>
    ),
  },
  {
    k: 'Multiple choice in line', g: 'Questions', h: 'go / goes / going · learners circle one', mark: 'auto',
    learners: 'Tap the right form inside the sentence, the way they would circle it on paper.',
    view: () => (
      <p className="gu-el-p">She <span className="gu-el-pill">go</span> <span className="gu-el-pill on">goes</span> <span className="gu-el-pill">going</span> to work by bike.</p>
    ),
  },
  {
    k: 'Matching', g: 'Questions', h: 'Match items on the left to the right', mark: 'auto',
    learners: 'Tap one on the left, then the one it goes with. Lines join them.',
    view: () => (
      <svg viewBox="0 0 260 96" className="gu-el-svg" aria-hidden="true">
        {['make', 'do', 'take'].map((w, i) => (
          <g key={w}>
            <rect x="6" y={6 + i * 30} width="70" height="24" rx="12" style={{ fill: 'var(--paper)', stroke: 'var(--hair-strong)' }} />
            <text x="41" y={22 + i * 30} textAnchor="middle" style={{ fill: 'var(--ink)', font: '12px var(--sans)' }}>{w}</text>
          </g>
        ))}
        {['a mistake', 'homework', 'a photo'].map((w, i) => (
          <g key={w}>
            <rect x="166" y={6 + i * 30} width="88" height="24" rx="12" style={{ fill: 'var(--paper)', stroke: 'var(--hair-strong)' }} />
            <text x="210" y={22 + i * 30} textAnchor="middle" style={{ fill: 'var(--ink)', font: '12px var(--sans)' }}>{w}</text>
          </g>
        ))}
        <path d="M76 18 C 120 18 122 18 166 18 M76 48 C 120 48 122 48 166 48 M76 78 C 120 78 122 78 166 78" style={{ fill: 'none', stroke: 'var(--gu)', strokeWidth: 2 }} />
      </svg>
    ),
  },
  {
    k: 'Word order', g: 'Questions', h: 'Put the words in the right order', mark: 'auto',
    learners: 'Tap the words in order to build the sentence; tap one again to take it back.',
    view: () => (
      <div className="gu-el-col">
        <span className="gu-el-line">Have you ever</span>
        <span className="gu-el-row">
          <span className="gu-el-pill">eaten</span> <span className="gu-el-pill">sushi</span> <span className="gu-el-pill">?</span>
        </span>
      </div>
    ),
  },
  {
    k: 'Long answer', g: 'Questions', h: 'Writing with a word count; you mark it', mark: 'you',
    learners: 'Write in a box that counts their words, then hand it in. You mark it with codes and comments.',
    view: () => (
      <div className="gu-el-col">
        <span className="gu-el-box">Last summer I went to Spain with my family. The beach was beautiful and…</span>
        <span className="gu-el-small">84 / 120 words</span>
      </div>
    ),
  },
  {
    k: 'Dialogue', g: 'Text', h: 'A and B, with gaps and choices inside', mark: 'auto',
    learners: 'Read the conversation, fill its gaps, and read it aloud with a partner.',
    view: () => (
      <p className="gu-el-p">
        <b>A:</b> <span className="gu-el-gap">Have</span> you been here before?
        <br />
        <b>B:</b> No, it’s my first time.
      </p>
    ),
  },
  {
    k: 'Timeline', g: 'Language', h: 'A tense timeline: events, periods, arrows', mark: 'show',
    learners: 'See when things happen. You can turn it into a task: learners place the cross themselves.',
    view: () => (
      <svg viewBox="0 0 260 70" className="gu-el-svg" aria-hidden="true">
        <line x1="10" y1="34" x2="246" y2="34" stroke="var(--ink)" strokeWidth="2" />
        <path d="M240 28 l7 6 -7 6" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <rect x="70" y="28" width="120" height="12" rx="4" style={{ fill: 'var(--gu)', opacity: 0.35 }} />
        <line x1="190" y1="22" x2="190" y2="46" stroke="var(--ink)" strokeWidth="2" />
        <text x="190" y="62" textAnchor="middle" style={{ fill: 'var(--muted)', font: '600 10px var(--sans)' }}>NOW</text>
        <text x="70" y="20" style={{ fill: 'var(--ink)', font: '11px var(--sans)' }}>2019</text>
      </svg>
    ),
  },
  {
    k: 'Sound or video', g: 'Media', h: 'Record, upload or link, with a karaoke script', mark: 'show',
    learners: 'Listen, and follow the script as each line lights up. Slow it down, or hear a line again.',
    view: () => (
      <div className="gu-el-col">
        <span className="gu-el-player">
          <span className="gu-el-play">▶</span>
          <span className="gu-el-bar"><i /></span>
          <span className="gu-el-small">0:12</span>
        </span>
        <span className="gu-el-p">A: Is this the train to <mark>Leeds?</mark> B: No, that’s platform 4.</span>
      </div>
    ),
  },
  {
    k: 'Phonemic chart', g: 'Language', h: 'The sounds of English; tap to hear', mark: 'show',
    learners: 'Tap a sound to hear it, with an example word. Good for pointing at sounds while you teach.',
    view: () => (
      <span className="gu-el-chart">
        {['iː', 'ɪ', 'ʊ', 'uː', 'e', 'ə', 'ɜː', 'ɔː', 'æ', 'ʌ', 'ɑː', 'ɒ'].map((x) => (
          <span key={x}>/{x}/</span>
        ))}
      </span>
    ),
  },
  {
    k: 'Board', g: 'Blocks', h: 'A drawing board, live in class', mark: 'show',
    learners: 'Draw and write on the same board as you and their classmates, live.',
    view: () => (
      <svg viewBox="0 0 260 90" className="gu-el-svg" aria-hidden="true">
        <rect x="2" y="2" width="256" height="86" rx="10" style={{ fill: 'var(--paper)', stroke: 'var(--hair-strong)' }} />
        <path d="M24 60 q20 -40 40 0 t40 0" fill="none" stroke="#3667a6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="170" cy="44" r="20" fill="none" stroke="#c94f3d" strokeWidth="3" />
        <text x="152" y="49" style={{ fill: '#c94f3d', font: '600 13px var(--sans)' }}>cat</text>
        <path d="M206 26 l30 30 M236 26 l-30 30" stroke="#3b7f4f" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    k: 'Post-it wall', g: 'Questions', h: 'Learners stick notes on a shared wall', mark: 'show',
    learners: 'Add a note to the wall; everyone sees the notes appear, and you can move them into groups.',
    view: () => (
      <span className="gu-el-wall">
        {[['My best holiday', '#f6e08a'], ['A place I want to visit', '#bfe3c9'], ['Something I’ve never done', '#f4c6b8']].map(([t, c]) => (
          <span key={t} style={{ background: c }}>{t}</span>
        ))}
      </span>
    ),
  },
  {
    k: 'Crossword', g: 'Questions', h: 'Made from words and clues', mark: 'auto',
    learners: 'Fill the crossword from the clues; it is made for you from a list of words.',
    view: () => (
      <span className="gu-el-cross" aria-hidden="true">
        {['TRAIN', 'R..X.', 'A..I.', 'V..T.', 'E....', 'L....'].flatMap((r, y) => r.split('').map((ch, x) => (
          <span key={`${x}${y}`} className={ch === '.' ? 'off' : ''}>{y === 0 ? ch : ''}</span>
        )))}
      </span>
    ),
  },
];
const MARK: Record<El['mark'], string> = { auto: 'Marked for you', you: 'You mark it', show: 'To show and use' };
function SlashDemo() {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState(SLASH[0].k);
  const list = SLASH.filter((s) => !q.trim() || `${s.k} ${s.h} ${s.g}`.toLowerCase().includes(q.trim().toLowerCase()));
  const el = SLASH.find((s) => s.k === chosen) ?? SLASH[0];
  return (
    <div className="gu-els">
      <div className="gu-slash">
        <label className="gu-slash-in">
          <span aria-hidden="true">/</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type: gap, sound, match…" aria-label="Search elements" />
        </label>
        <ul className="gu-slash-list" aria-label="Elements">
          {list.map((s) => (
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
      </div>
      <div className="gu-el gu-slide" key={el.k} aria-live="polite">
        <span className="gu-el-head">
          <b>{el.k}</b>
          <span className={'gu-el-mark m-' + el.mark}>{MARK[el.mark]}</span>
        </span>
        <div className="gu-el-page">
          <span className="gu-el-task">3. Practice</span>
          <el.view />
        </div>
        <p className="gu-say">
          <b>Learners:</b> {el.learners}
        </p>
      </div>
    </div>
  );
}

// The question bank: questions saved once and used again.
function BankDemo() {
  const QS = [
    { t: 'She ___ (live) here since 2019.', tag: 'Present perfect · gap fill' },
    { t: 'go / goes / going to work by bike', tag: 'Present simple · choice' },
    { t: 'make / do / take + a photo, homework…', tag: 'Collocations · matching' },
  ];
  const [saved, setSaved] = useState<number[]>([1, 2]);
  const [used, setUsed] = useState<number[]>([]);
  return (
    <div className="gu-bank">
      <div className="gu-bank-col">
        <span className="gu-el-task">B1 Evening · Present perfect</span>
        <div className="gu-bank-q">
          <span>{QS[0].t}</span>
          <button type="button" className="btn small" disabled={saved.includes(0)} onClick={() => setSaved([0, ...saved])}>
            {saved.includes(0) ? 'Saved ✓' : 'Save to my bank'}
          </button>
        </div>
      </div>
      <svg className="gu-bank-arrow" width="34" height="22" viewBox="0 0 34 22" aria-hidden="true"><path d="M2 11h28M22 4l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="gu-bank-col gu-bank-list">
        <span className="gu-el-task">My question bank · {saved.length}</span>
        {saved.map((k) => (
          <div key={k} className="gu-bank-item gu-slide">
            <span>
              <b>{QS[k].t}</b>
              <i>{QS[k].tag}</i>
            </span>
            <button type="button" className="btn small" disabled={used.includes(k)} onClick={() => setUsed([...used, k])}>
              {used.includes(k) ? 'Added ✓' : 'Use'}
            </button>
          </div>
        ))}
      </div>
      <svg className="gu-bank-arrow" width="34" height="22" viewBox="0 0 34 22" aria-hidden="true"><path d="M2 11h28M22 4l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="gu-bank-col">
        <span className="gu-el-task">IELTS Prep · Revision</span>
        {used.length ? used.map((k) => <div key={k} className="gu-bank-q gu-slide"><span>{QS[k].t}</span></div>) : <span className="hint">Press Use on a saved question.</span>}
      </div>
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
      <Try title="Your question bank: save a question once, use it in any lesson" note="In a lesson: right-click a question → Save to my question bank. To use one: press / → From my question bank….">
        <BankDemo />
      </Try>
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

function Notation() {
  const [heard, setHeard] = useState('');
  const hear = async (c: (typeof CARDS)[number]) => {
    setHeard(c.id);
    const r = await playSound('RP', c.id, undefined, true).catch(() => false);
    if (r === false) setHeard('none');
  };
  return (
    <>
      <p>
        The marks you draw on the board, ready to use in any lesson: <b>tense timelines</b>, <b>substitution slots</b> (the vertical lines), <b>word and sentence stress</b>, <b>intonation arrows</b>, <b>linking</b>, weak vowels, IPA and sound cards. Each kind of mark looks the same everywhere, so learners always read them the same way.
      </p>
      <div className="gu-grid2">
        <Try title="Tense timelines: choose a tense">
          <TimelineDemo />
        </Try>
        <Try title="Substitution table: pick one from each column">
          <SubstDemo />
        </Try>
      </div>
      <Try title="Sentence stress, linking and intonation: turn the marks on and off">
        <SentenceMarks />
      </Try>
      <div className="gu-grid2">
        <Try title="Word stress: tap the stressed syllable">
          <Stress />
        </Try>
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
      </div>
      <Try title="Intonation: does the voice go up or down at the end?">
        <Intonation />
      </Try>
    </>
  );
}

// A tense on a timeline, as in the Timeline element: × an event, ~ in progress, [ ] a period, → up to now.
const TENSES: { k: string; ex: string; draw: 'x' | 'wave' | 'arrow' | 'xwave' | 'repeat' | 'future' }[] = [
  { k: 'Past simple', ex: 'I visited Rome last year.', draw: 'x' },
  { k: 'Past continuous', ex: 'I was cooking when you called.', draw: 'xwave' },
  { k: 'Present perfect', ex: 'I have lived here since 2019.', draw: 'arrow' },
  { k: 'Present continuous', ex: 'I am reading a good book.', draw: 'wave' },
  { k: 'Present simple', ex: 'I swim every Saturday.', draw: 'repeat' },
  { k: 'Will future', ex: 'I will call you tomorrow.', draw: 'future' },
];
function TimelineDemo() {
  const [k, setK] = useState(0);
  const t = TENSES[k];
  const ink = 'var(--gu)';
  return (
    <>
      <div className="gu-inline gu-tenses" role="radiogroup" aria-label="Tense">
        {TENSES.map((x, i) => (
          <button key={x.k} type="button" role="radio" aria-checked={i === k} className={'gu-opt' + (i === k ? ' on' : '')} onClick={() => setK(i)}>
            {x.k}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 340 120" className="gu-tl" role="img" aria-label={`${t.k} on a timeline: ${t.ex}`}>
        <line x1="14" y1="64" x2="324" y2="64" stroke="var(--ink)" strokeWidth="2" />
        <path d="M318 58 l8 6 -8 6" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <line x1="190" y1="50" x2="190" y2="78" stroke="var(--ink)" strokeWidth="2" />
        <text x="190" y="96" textAnchor="middle" className="gu-s-b">NOW</text>
        <text x="20" y="96" className="gu-s-small">past</text>
        <text x="320" y="96" textAnchor="end" className="gu-s-small">future</text>
        <g key={k} className="gu-pop" style={{ stroke: ink }} strokeWidth="3" fill="none" strokeLinecap="round">
          {(t.draw === 'x' || t.draw === 'xwave') && <path d={t.draw === 'x' ? 'M92 54 l14 20 M106 54 l-14 20' : 'M118 54 l14 20 M132 54 l-14 20'} />}
          {(t.draw === 'wave' || t.draw === 'xwave') && <path d={t.draw === 'wave' ? 'M150 44 q8 -8 16 0 t16 0 t16 0 t16 0' : 'M86 44 q8 -8 16 0 t16 0 t16 0 t16 0 t16 0'} />}
          {t.draw === 'arrow' && <path d="M70 40 C 110 18 160 18 186 40 M176 34 l10 6 -12 3" />}
          {t.draw === 'arrow' && <path d="M70 54 l0 20" />}
          {t.draw === 'repeat' && [60, 100, 140, 180, 220, 260].map((x) => <path key={x} d={`M${x} 56 l0 16`} />)}
          {t.draw === 'future' && <path d="M240 54 l14 20 M254 54 l-14 20" />}
        </g>
      </svg>
      <p className="gu-say">
        <b>{t.k}:</b> “{t.ex}”
      </p>
    </>
  );
}

function SubstDemo() {
  const COLS = [['I', 'We', 'My sister'], ['want to go to', 'would love to visit', 'am going to'], ['Lisbon', 'Istanbul', 'Hong Kong'], ['this summer.', 'next year.', 'one day.']];
  const [pick, setPick] = useState([0, 0, 0, 0]);
  const fix = (w: string, c: number) => (c === 2 || c === 0 ? w : pick[0] === 1 && c === 1 && w === 'am going to' ? 'are going to' : pick[0] === 2 && c === 1 ? w.replace('want', 'wants').replace('am going', 'is going') : w);
  return (
    <div className="gu-stab" role="group" aria-label="A substitution table: choose one word or phrase from each column">
      {COLS.map((col, c) => (
        <span key={c} className="gu-stab-col">
          {col.map((w, k) => (
            <button key={w} type="button" aria-pressed={pick[c] === k} className={pick[c] === k ? 'on' : ''} onClick={() => setPick(pick.map((x, j) => (j === c ? k : x)))}>
              {fix(w, c)}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}

function SentenceMarks() {
  const [on, setOn] = useState({ stress: true, link: true, weak: false, inton: true });
  const flip = (k: keyof typeof on) => setOn({ ...on, [k]: !on[k] });
  // "What do you want to do?" — stressed: WHAT, WANT, DO; linking want‿to; weak "to" /tə/; falling intonation at the end.
  const words: { w: string; stress?: boolean; weak?: string; link?: boolean }[] = [
    { w: 'What', stress: true },
    { w: 'do', weak: 'də' },
    { w: 'you' },
    { w: 'want', stress: true, link: true },
    { w: 'to', weak: 'tə' },
    { w: 'do?', stress: true },
  ];
  return (
    <div className="gu-marks">
      <div className="gu-inline" role="group" aria-label="Marks to show">
        {(
          [
            ['stress', 'Sentence stress'],
            ['link', 'Linking'],
            ['weak', 'Weak vowels'],
            ['inton', 'Intonation'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={on[k]} className={'gu-opt' + (on[k] ? ' on' : '')} onClick={() => flip(k)}>
            {l}
          </button>
        ))}
      </div>
      <p className="gu-sent" aria-label="What do you want to do?">
        {words.map((x, i) => (
          <span key={i} className="gu-w">
            {on.stress && x.stress && <i className="gu-dot" aria-hidden="true" />}
            <span className={on.stress && x.stress ? 'gu-big' : ''}>{x.w}</span>
            {on.weak && x.weak && <sup className="gu-weak">/{x.weak}/</sup>}
            {on.link && x.link && <span className="gu-link" aria-hidden="true">‿</span>}
          </span>
        ))}
        {on.inton && (
          <svg className="gu-arrow" width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
            <path d="M2 4 C14 4 22 8 30 17 M24 17 h6 v-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        )}
      </p>
      <span className="gu-try-note">In a lesson you add these marks to any text from the toolbar, and choose one look for each kind (dots or capitals, for example).</span>
    </div>
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

// ------------------------------------------------------------------ teach your way

// What each way of teaching is made of, as a glass filled with its parts.
const PARTS: Record<string, { n: string; c: string }> = {
  live: { n: 'Teaching live in ELT Suite', c: '#3b7f4f' },
  call: { n: 'Video calls: Rooms or your own tool', c: '#3b7f7a' },
  board: { n: 'Presenting on the board', c: '#c8764a' },
  print: { n: 'Printed worksheets', c: '#c9a227' },
  make: { n: 'Making materials and listening', c: '#3667a6' },
};
const BLENDS: { k: string; t: string; d: string; mix: [string, number][]; steps: string[]; uses: string[] }[] = [
  {
    k: 'online',
    t: 'Teach online',
    d: 'Teach live in ELT Suite, with Rooms for video, or your own call tool (Zoom, Teams, Meet) beside it.',
    mix: [['make', 25], ['call', 35], ['live', 40]],
    steps: ['Plan the lesson in Classes', 'Start Teach live: learners join on their own devices', 'Talk in Rooms, or share a link to your own call', 'Answers, marking and the recap afterwards'],
    uses: ['Classes', 'Rooms', 'Teach live', 'Reports'],
  },
  {
    k: 'present',
    t: 'Present in class, print the rest',
    d: 'In a classroom: show the lesson on the board from ELT Suite, and give learners printed worksheets.',
    mix: [['make', 25], ['print', 35], ['board', 40]],
    steps: ['Plan the lesson in Classes', 'Present it on the board, with notation, timelines and sound', 'Print the tasks as a worksheet (PDF or Word)', 'Learners write on paper'],
    uses: ['Classes', 'Present', 'Print'],
  },
  {
    k: 'make',
    t: 'Make materials only',
    d: 'Use ELT Suite to make your materials and listening, then print them or take them to whatever you teach with.',
    mix: [['call', 15], ['print', 25], ['make', 60]],
    steps: ['Make the lesson and its tasks', 'Record and edit the listening in Studio', 'Print a worksheet or download Word and MP3', 'Teach with them anywhere'],
    uses: ['Classes', 'Studio', 'Print', 'Files'],
  },
];
function Glass({ mix, on, id }: { mix: [string, number][]; on: boolean; id: string }) {
  const top = 34;
  const bottom = 150;
  let y = bottom;
  return (
    <svg className={'gu-glass' + (on ? ' on' : '')} viewBox="0 0 120 160" aria-hidden="true">
      <defs>
        <clipPath id={'gu-gl-' + id}>
          <path d="M16 12h88l-10 136a6 6 0 0 1-6 5.5H32a6 6 0 0 1-6-5.5z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#gu-gl-${id})`}>
        <rect x="0" y="0" width="120" height="160" className="gu-glass-air" />
        {mix.map(([p, n], i) => {
          const h = ((bottom - top) * n) / 100;
          y -= h;
          return <rect key={on ? p + '-on' : p} className={on ? 'gu-rise' : undefined} style={{ fill: PARTS[p].c, animationDelay: `${i * 0.28}s` }} x="0" y={y} width="120" height={h + 0.5} />;
        })}
        <path key={on ? 'top-on' : 'top'} d={`M0 ${top} q15 -4 30 0 t30 0 t30 0 t30 0 v4 H0z`} fill="#fff" opacity="0.35" className={on ? 'gu-rise' : undefined} style={{ animationDelay: `${mix.length * 0.28}s` }} />
        <rect x="26" y="20" width="9" height="118" rx="4.5" fill="#fff" opacity="0.28" />
      </g>
      <path d="M16 12h88l-10 136a6 6 0 0 1-6 5.5H32a6 6 0 0 1-6-5.5z" className="gu-glass-edge" />
    </svg>
  );
}
function Blend() {
  const [k, setK] = useState(0);
  const b = BLENDS[k];
  return (
    <>
      <p>There is no one right way to use ELT Suite. Use as much or as little as suits you and your learners, and change it from class to class. Each glass shows what one way of teaching is made of.</p>
      <div className="gu-blends" role="radiogroup" aria-label="Ways to teach">
        {BLENDS.map((x, i) => (
          <button key={x.k} type="button" role="radio" aria-checked={i === k} className={'gu-blend' + (i === k ? ' on' : '')} onClick={() => setK(i)}>
            <Glass mix={x.mix} on={i === k} id={x.k} />
            <b>{x.t}</b>
            <span>{x.d}</span>
          </button>
        ))}
      </div>
      <p className="gu-blend-d gu-slide" key={'d' + b.k}>{b.d}</p>
      <ul className="gu-mix" aria-label={`What “${b.t}” is made of`} key={'m' + b.k}>
        {[...b.mix].reverse().map(([p, n]) => (
          <li key={p} className="gu-slide">
            <i style={{ background: PARTS[p].c }} />
            {PARTS[p].n}
            <b>{n}%</b>
          </li>
        ))}
      </ul>
      <ol className="gu-flow" key={b.k} aria-label={`${b.t}, step by step`}>
        {b.steps.map((st, i) => (
          <li key={st} className="gu-slide" style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="gu-flow-n">{i + 1}</span>
            <span>{st}</span>
          </li>
        ))}
      </ol>
      <p className="gu-say">
        <b>You use:</b> {b.uses.join(' · ')}
      </p>
    </>
  );
}

// Why learners sign in with a class code and a PIN.
function Privacy() {
  return (
    <div className="gu-priv">
      <svg className="gu-priv-card" viewBox="0 0 220 140" role="img" aria-label="A learner's sign-in card: the class code and a four-digit PIN, and no email">
        <rect x="6" y="6" width="208" height="128" rx="14" className="gu-s-card" />
        <rect x="6" y="6" width="208" height="30" rx="14" style={{ fill: '#c8764a' }} />
        <rect x="6" y="24" width="208" height="12" style={{ fill: '#c8764a' }} />
        <text x="20" y="26" style={{ fill: '#fff', font: '600 12px var(--sans)' }}>B1 Evening · sign-in card</text>
        <text x="20" y="58" className="gu-s-small">Name</text>
        <text x="20" y="74" className="gu-s-b">Mei</text>
        <text x="110" y="58" className="gu-s-small">Class code</text>
        <text x="110" y="74" className="gu-s-b" style={{ letterSpacing: '0.08em' }}>BEV-482</text>
        <text x="20" y="100" className="gu-s-small">PIN</text>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={24 + i * 14} cy="114" r="4.5" className="gu-s-ink" />
        ))}
        <text x="110" y="100" className="gu-s-small">Email</text>
        <text x="110" y="118" style={{ fill: '#3b7f4f', font: '600 12px var(--sans)' }}>not needed ✓</text>
      </svg>
      <div className="gu-priv-t">
        <b>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3z" />
          </svg>
          Why a class code and a PIN, not an email?
        </b>
        <span>Because we care about your learners’ privacy. Many of them are children or teenagers, and many adults would rather not give out their email or phone number. With a code and a PIN, nobody needs to share personal details to join a class.</span>
        <ul>
          <li>No email, phone number or social account to sign in.</li>
          <li>A first name or a nickname is enough: you choose what each learner is called.</li>
          <li>You stay in charge: add or remove learners, and give a new PIN if one is lost.</li>
        </ul>
      </div>
    </div>
  );
}


// ------------------------------------------------------------------ studio

function Studio() {
  return (
    <>
      <p>Make your own listening: record yourself, edit it like audio software, or record a dialogue live with colleagues, each on their own device. The script turns into karaoke text that lights up as it plays.</p>
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 200" role="img" aria-label="The Sound editor: two speakers' tracks with their scripts, sound effects below, and a playhead">
          <rect x="10" y="10" width="700" height="180" rx="14" fill="#1f1d1b" />
          {[
            { y: 30, n: 'Speaker 1', c: '#d98f63', clips: [[120, 160], [330, 120]] },
            { y: 92, n: 'Speaker 2', c: '#8aa5c4', clips: [[290, 50], [470, 170]] },
          ].map((t) => (
            <g key={t.n}>
              <text x="24" y={t.y + 22} style={{ fill: '#ece7df', font: '600 13px var(--sans)' }}>
                {t.n}
              </text>
              {t.clips.map(([x, w], i) => (
                <g key={i}>
                  <rect x={x} y={t.y} width={w} height="34" rx="6" style={{ fill: t.c, opacity: 0.35 }} />
                  {Array.from({ length: Math.floor(w / 5) }, (_, j) => {
                    const h = 6 + Math.abs(Math.sin((j + x) * 0.7)) * 22;
                    return <rect key={j} x={x + 3 + j * 5} y={t.y + 17 - h / 2} width="2.5" height={h} style={{ fill: t.c }} />;
                  })}
                </g>
              ))}
              <rect x={t.clips[0][0]} y={t.y + 38} width="150" height="16" rx="5" style={{ fill: 'rgba(255,255,255,.12)' }} />
              <text x={t.clips[0][0] + 8} y={t.y + 50} style={{ fill: '#ece7df', font: '11px var(--sans)' }}>
                {t.n === 'Speaker 1' ? 'Hi! Are you new here?' : 'Yes, I started today.'}
              </text>
            </g>
          ))}
          <text x="24" y="172" style={{ fill: '#b9cde2', font: '600 13px var(--sans)' }}>
            Effects
          </text>
          <rect x="120" y="158" width="60" height="20" rx="5" style={{ fill: 'rgba(138,165,196,.4)' }} />
          <text x="128" y="172" style={{ fill: '#ece7df', font: '11px var(--sans)' }}>
            door
          </text>
          <line x1="400" y1="20" x2="400" y2="186" stroke="#fff" strokeWidth="2" />
        </svg>
      </figure>
      <Steps
        items={[
          { t: 'Record', d: 'Record in the browser, reading your script: press Space at each line so the script follows the sound.' },
          { t: 'Edit', d: 'Split, trim, fade, move clips between speakers, change a clip’s volume, add silence and sound effects.' },
          { t: 'Record with a colleague', d: 'Start a recording session: each of you records on your own device, hearing each other; the takes come in as tracks.' },
          { t: 'Use it', d: 'Save it to Files and put it into any lesson as karaoke listening, or download the MP3 and each speaker’s track.' },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ print and PDF

function Print() {
  const [as, setAs] = useState<'pdf' | 'word'>('pdf');
  const [answers, setAnswers] = useState(false);
  const [logo, setLogo] = useState(true);
  const word = as === 'word';
  return (
    <>
      <p>Everything you make can go on paper. Print a lesson as a worksheet with your organisation’s logo, with or without the answers, or download it as a Word file to change it there. Bring coursebook PDFs in and add gaps, text boxes and highlights on top of the pages.</p>
      <div className="gu-grid2">
        <figure className="gu-fig">
          <svg viewBox="0 0 300 240" role="img" aria-label={`A worksheet as ${word ? 'a Word file' : 'a PDF'}${answers ? ', with the answers' : ''}${logo ? ', with your logo' : ''}`}>
            {word && (
              <g>
                <rect x="40" y="8" width="220" height="22" rx="5" fill="#2b579a" />
                <text x="52" y="23" style={{ fill: '#fff', font: '600 10.5px var(--sans)' }}>worksheet.docx · editing</text>
              </g>
            )}
            <rect x="60" y={word ? 34 : 14} width="180" height={word ? 200 : 216} rx="4" className="gu-s-card" />
            {logo && (
              <g>
                <rect x="74" y={word ? 46 : 26} width="22" height="22" rx="6" fill="#d98f63" />
                <text x="102" y={word ? 61 : 41} className="gu-s-small" style={{ fontSize: 9 }}>Bright English</text>
              </g>
            )}
            <text x="74" y={word ? 88 : 68} style={{ fill: 'var(--ink)', font: '600 12px var(--serif)' }}>Present perfect · Practice</text>
            {[
              ['She', 'has lived', 'here.'],
              ['I', 'have never been', 'to Rio.'],
              ['They', 'have just left', '.'],
            ].map(([a, g, b], i) => {
              const y = (word ? 108 : 88) + i * 24;
              return (
                <g key={i}>
                  <text x="74" y={y} style={{ fill: 'var(--ink)', font: '10.5px var(--serif)' }}>{i + 1}. {a}</text>
                  <line x1="106" y1={y + 2} x2="176" y2={y + 2} stroke="var(--ink)" strokeWidth="1" />
                  {answers && <text x="141" y={y - 1} textAnchor="middle" style={{ fill: '#c94f3d', font: 'italic 9.5px var(--sans)' }}>{g}</text>}
                  <text x="180" y={y} style={{ fill: 'var(--ink)', font: '10.5px var(--serif)' }}>{b}</text>
                </g>
              );
            })}
            <line x1="80" y1={word ? 196 : 176} x2="220" y2={word ? 196 : 176} stroke="var(--ink)" strokeWidth="1.4" />
            <line x1="190" y1={word ? 189 : 169} x2="190" y2={word ? 203 : 183} stroke="var(--ink)" strokeWidth="1.4" />
            <path d={word ? 'M118 190 l8 12 M126 190 l-8 12' : 'M118 170 l8 12 M126 170 l-8 12'} style={{ stroke: 'var(--gu)' }} strokeWidth="2" />
            <text x="190" y={word ? 216 : 196} textAnchor="middle" style={{ fill: 'var(--muted)', font: '8px var(--sans)' }}>NOW</text>
            {answers && <text x="150" y={word ? 228 : 218} textAnchor="middle" style={{ fill: '#c94f3d', font: '600 8.5px var(--sans)' }}>TEACHER’S COPY</text>}
          </svg>
        </figure>
        <Try title="Print a lesson: choose how, and watch the page">
          <div className="gu-inline" role="radiogroup" aria-label="Format">
            <button type="button" role="radio" aria-checked={!word} className={'gu-opt' + (!word ? ' on' : '')} onClick={() => setAs('pdf')}>
              Print or PDF
            </button>
            <button type="button" role="radio" aria-checked={word} className={'gu-opt' + (word ? ' on' : '')} onClick={() => setAs('word')}>
              Word file
            </button>
          </div>
          <label className="gu-tog">
            <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> With the answers (a teacher’s copy)
          </label>
          <label className="gu-tog">
            <input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} /> Your organisation’s logo
          </label>
          <p className="gu-say">{word ? 'In a lesson: ⋯ → Download as Word. Change it in Word, Pages or Google Docs; the gaps and timelines come too.' : 'In a lesson: ⋯ → Print as a worksheet. Choose the tasks, then your printer or “Save as PDF”.'}</p>
        </Try>
      </div>
      <Steps
        items={[
          { t: 'Upload a PDF', d: 'A coursebook page or a worksheet, into the PDF app or into Files.' },
          { t: 'Add to the page', d: 'Gaps, text boxes and highlights exactly where learners write.' },
          { t: 'Use it', d: 'Put the page into a lesson, write on it together live, or print it with your additions.' },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ files

function FilesTopic() {
  return (
    <>
      <p>Everything you make that is not a lesson has an app of its own, like Docs and Slides in Google’s suite, and is in Files too. Each app lists <b>your files</b>, the ones <b>shared with you</b>, your <b>organisation’s library</b> and the ones you <b>starred</b>.</p>
      <div className="gu-grid2">
        <Try title="Flashcards: tap the card to turn it over">
          <FlipCard />
        </Try>
        <div className="gu-fapps">
          {[
            { k: 'collab', t: 'Documents and slides written together, live, with suggestions and comments. Download as Word, PDF or PowerPoint.' },
            { k: 'reading', t: 'Your sources with full references in the style you choose, and notes page by page or chapter by chapter.' },
            { k: 'pdf', t: 'Coursebook pages and worksheets to write on, alone or with others.' },
            { k: 'recordings', t: 'Everything you record or upload, with its script, ready for any lesson.' },
            { k: 'files', t: 'All of it in one place, in folders, with flashcards, pictures and your organisation’s library.' },
          ].map((x) => {
            const ap = APPS.find((y) => y.k === x.k)!;
            return (
              <Link key={x.k} to={ap.to} target="_blank" rel="noopener" className="gu-fapp" style={{ ['--c' as string]: ap.color }}>
                <span className="gu-logo" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ap.d} />
                  </svg>
                </span>
                <span>
                  <b>{ap.name}</b>
                  <span>{x.t}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
function FlipCard() {
  const cards = [
    { f: 'to look forward to', b: 'to feel happy about something that will happen', ex: 'I’m looking forward to the holiday.' },
    { f: 'to put off', b: 'to do something later than planned', ex: 'Don’t put off your homework.' },
    { f: 'to get on with', b: 'to have a good relationship with someone', ex: 'I get on well with my sister.' },
  ];
  const [i, setI] = useState(0);
  const [back, setBack] = useState(false);
  const c = cards[i];
  return (
    <div className="gu-flash">
      <button type="button" className={'gu-flip' + (back ? ' back' : '')} onClick={() => setBack(!back)} aria-label={back ? `${c.b}. ${c.ex}` : `${c.f}. Turn over`}>
        <span className="gu-flip-in">
          <span className="gu-flip-f">{c.f}</span>
          <span className="gu-flip-b">
            <b>{c.b}</b>
            <i>{c.ex}</i>
          </span>
        </span>
      </button>
      <span className="gu-check">
        <button type="button" className="btn small" onClick={() => (setI((i + cards.length - 1) % cards.length), setBack(false))}>
          ‹ Back
        </button>
        <span className="gu-result">
          {i + 1} of {cards.length}
        </span>
        <button type="button" className="btn small" onClick={() => (setI((i + 1) % cards.length), setBack(false))}>
          Next ›
        </button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ 5. teaching live

function Live() {
  const [step, setStep] = useState(0);
  const STEPS = [
    { t: 'You start the lesson', d: 'Press Teach live. Learners who are signed in get a notice and join; the lesson opens on their screens, whatever they use: a laptop, a tablet or a phone.' },
    { t: 'Everyone follows you', d: 'Turn the page, point or highlight a word, and every screen follows at once. Nobody gets lost on the wrong page.' },
    { t: 'They answer', d: 'Answers arrive as learners type. You see who has finished and which answers are most common, before anyone says a word.' },
    { t: 'You show and talk', d: 'Put one answer on every screen, without the learner’s name, and talk about it. Good for mistakes everyone made.' },
  ];
  const s = STEPS[step];
  const ans = ['has lived', 'has lived', 'lived', 'has lived'];
  const who = ['Mia', 'Leo', 'Ana', 'Sam'];
  // One sentence as it looks on a screen, at a size.
  const Sentence = ({ x, y, k, i }: { x: number; y: number; k: number; i?: number }) => {
    const spot = step === 3;
    const a = spot ? 'has lived' : step >= 2 && i !== undefined ? ans[i] : '';
    const hl = step === 1;
    return (
      <g transform={`translate(${x} ${y}) scale(${k})`}>
        <text x="0" y="12" style={{ fill: 'var(--ink)', font: '13px var(--serif)' }}>She</text>
        {hl && <rect x="28" y="-1" width="72" height="18" rx="3" fill="#f3d36b" opacity="0.7" />}
        <rect x="30" y="0" width="68" height="16" rx="3" style={{ fill: a ? (a === 'lived' && !spot ? '#fbe3de' : '#e5f2e8') : 'color-mix(in srgb, var(--gu) 8%, var(--paper))', stroke: a ? (a === 'lived' && !spot ? '#c94f3d' : '#3b7f4f') : 'var(--hair-strong)' }} />
        {a && <text x="64" y="12" textAnchor="middle" style={{ fill: a === 'lived' && !spot ? '#a33a2a' : '#24572f', font: '600 11px var(--sans)' }}>{a}</text>}
        <text x="104" y="12" style={{ fill: 'var(--ink)', font: '13px var(--serif)' }}>here since 2019.</text>
      </g>
    );
  };
  const devices = [
    { x: 400, y: 20, w: 150, h: 96, kind: 'laptop' },
    { x: 568, y: 20, w: 132, h: 96, kind: 'tablet' },
    { x: 410, y: 134, w: 130, h: 86, kind: 'tablet' },
    { x: 600, y: 128, w: 74, h: 104, kind: 'phone' },
  ];
  return (
    <>
      <p>Teach from the same lesson in class, online or both. Your screen leads and every learner’s screen follows it, so you can see what each of them is doing and answer as it happens.</p>
      <figure className="gu-fig wide">
        <svg viewBox="0 0 720 245" role="img" aria-label={`Your screen and four learners' screens showing the same gap fill. Step ${step + 1}: ${s.t}`}>
          <rect x="16" y="16" width="330" height="214" rx="14" className="gu-s-card" />
          <rect x="16" y="16" width="330" height="30" rx="14" fill="#b05f37" />
          <rect x="16" y="34" width="330" height="12" fill="#b05f37" />
          <text x="30" y="36" style={{ fill: '#fff', font: '600 12.5px var(--sans)' }}>You · Teach live · page 2 of 5</text>
          <circle cx="322" cy="31" r="5" fill={step ? '#7fd18b' : '#fff'} opacity={step ? 1 : 0.5} />
          <text x="34" y="74" className="gu-s-b">Put the verb in the present perfect.</text>
          <Sentence x={34} y={90} k={1.18} />
          {step === 1 && <path d="M158 132 l10 22 4-9 9-4z" fill="#1f1d1b" className="gu-pulse" />}
          {step === 0 && <text x="34" y="150" className="gu-s-small">Joining: {who.join(', ')}…</text>}
          {step >= 2 && (
            <g>
              <text x="34" y="150" className="gu-s-small">Answers: 4 of 4</text>
              <rect x="34" y="160" width="180" height="16" rx="4" fill="#3b7f4f" className="gu-grow-x" />
              <text x="222" y="173" className="gu-s-b" style={{ fontSize: 12 }}>has lived · 3</text>
              <rect x="34" y="182" width="60" height="16" rx="4" fill="#c94f3d" className="gu-grow-x" />
              <text x="102" y="195" className="gu-s-b" style={{ fontSize: 12 }}>lived · 1</text>
            </g>
          )}
          {step === 3 && (
            <g>
              <rect x="230" y="200" width="104" height="22" rx="11" fill="#2f6b3b" />
              <text x="282" y="215" textAnchor="middle" style={{ fill: '#fff', font: '600 11px var(--sans)' }}>On every screen</text>
            </g>
          )}
          {devices.map((d, i) => (
            <path key={'l' + i} d={`M346 ${110 + i * 8} C 372 ${110 + i * 8} 372 ${d.y + d.h / 2} ${d.x} ${d.y + d.h / 2}`} className={'gu-s-line' + (step >= 1 ? ' on' : '')} />
          ))}
          {devices.map((d, i) => (
            <g key={i}>
              <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={d.kind === 'phone' ? 12 : 8} style={{ fill: 'var(--paper)', stroke: 'var(--ink)', strokeOpacity: 0.55, strokeWidth: d.kind === 'laptop' ? 2 : 3 }} />
              {d.kind === 'laptop' && <path d={`M${d.x - 8} ${d.y + d.h + 2} h${d.w + 16} l-6 6 h-${d.w + 4} z`} style={{ fill: 'var(--ink)', opacity: 0.5 }} />}
              <text x={d.x + 8} y={d.y + 16} className="gu-s-small" style={{ fontSize: 10 }}>{who[i]}</text>
              {step >= 2 && step < 3 && <text x={d.x + d.w - 8} y={d.y + 16} textAnchor="end" style={{ fill: ans[i] === 'lived' ? '#c94f3d' : '#3b7f4f', font: '700 11px var(--sans)' }}>{ans[i] === 'lived' ? '✗' : '✓'}</text>}
              {step === 0 ? (
                <text x={d.x + d.w / 2} y={d.y + d.h / 2 + 4} textAnchor="middle" className="gu-s-small" style={{ fontSize: 10 }}>joining…</text>
              ) : d.kind === 'phone' ? (
                <g>
                  <text x={d.x + 8} y={d.y + 38} className="gu-s-small" style={{ fontSize: 9.5 }}>She … here</text>
                  <rect x={d.x + 8} y={d.y + 50} width={d.w - 16} height="34" rx="5" style={{ fill: 'color-mix(in srgb, var(--gu) 6%, var(--paper))' }} />
                  <text x={d.x + d.w / 2} y={d.y + 71} textAnchor="middle" style={{ fill: 'var(--ink)', font: '600 10px var(--sans)' }}>{step >= 2 ? ans[i] : '…'}</text>
                </g>
              ) : (
                <Sentence x={d.x + 8} y={d.y + 36} k={(d.w - 16) / 220} i={i} />
              )}
            </g>
          ))}
        </svg>
      </figure>
      <ol className="gu-flow gu-flow-tabs" aria-label="Teaching live, step by step">
        {STEPS.map((x, i) => (
          <li key={x.t}>
            <button type="button" className={i === step ? 'on' : ''} aria-pressed={i === step} onClick={() => setStep(i)}>
              <span className="gu-flow-n">{i + 1}</span>
              <span>{x.t}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="gu-say" aria-live="polite">
        <b>{s.t}.</b> {s.d}
        {step < 3 && (
          <button type="button" className="btn small gu-next" onClick={() => setStep(step + 1)}>
            Next step →
          </button>
        )}
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
      <Steps
        items={[
          { t: 'Make teams', d: 'Learners join on their devices; ELT Suite makes the teams, or you choose them.' },
          { t: 'Answer against the clock', d: 'Each question has a timer. Faster right answers win more points.' },
          { t: 'See the leaderboard', d: 'After each question, the scores and the right answer, so mistakes are talked about at once.' },
          { t: 'The podium', d: 'The winners at the end, and every answer saved for you to look at later.' },
        ]}
      />
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
      <Steps
        items={[
          { t: 'They hand in', d: 'A learner writes in a long-answer task, in class or as homework.' },
          { t: 'You mark with codes', d: 'Select words and give a code (T, WO, Sp…) and a comment, instead of writing the answer.' },
          { t: 'They correct', d: 'The learner sees the codes and writes their own corrections: they learn more than from a red pen.' },
          { t: 'You approve', d: 'Accept each correction or ask again. The work goes into their portfolio and the report.' },
        ]}
      />
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
      <p>The <b>Timetable</b> shows your classes and meetings week by week; drag across the hours to add one, and weekly ones repeat on their own. <b>Rooms</b> starts a video or audio call in one click, and every class has its own video room, so its link never changes.</p>
      <div className="gu-grid2 gu-grid-week">
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
      <RoomCard />
      </div>
    </>
  );
}

function RoomCard() {
  const [copied, setCopied] = useState(false);
  return (
    <Try title="Every class has its own room">
      <div className="gu-room">
        <div className="gu-room-v" aria-hidden="true">
          {['#c8764a', '#3667a6', '#3b7f4f', '#7a4fa3'].map((c, i) => (
            <span key={c} style={{ background: c }}>{['A', 'M', 'O', 'L'][i]}</span>
          ))}
        </div>
        <b>B1 Evening · video room</b>
        <span className="gu-room-link">eltsuite.com/call/BEV-482</span>
        <button type="button" className="btn small primary" onClick={() => setCopied(true)}>
          {copied ? 'Copied ✓' : 'Copy the link'}
        </button>
        <span className="hint" role="status">{copied ? 'Put it in your timetable or a message once: it is the same every week.' : 'The same link every lesson: learners save it once.'}</span>
      </div>
    </Try>
  );
}

// ------------------------------------------------------------------ 9. sharing

function Share() {
  return (
    <>
      <p>Nobody should start from a blank page. Connect with the teachers you work with once, then share lessons, folders and recordings with them, or plan together in the same document. Messages keeps the conversations with colleagues and learners next to the work.</p>
      <Steps
        items={[
          { t: 'Invite a colleague', d: 'Colleagues → Invite. Send them the link; they open it and you are connected.' },
          { t: 'Share', d: 'A lesson, a folder, a recording or a document, with them or with everyone in a shared folder.' },
          { t: 'Edit together, or copy', d: 'Work on it together live, or they copy it into their own class and change it.' },
        ]}
      />
      <div className="gu-grid2">
        <figure className="gu-fig">
          <svg viewBox="0 0 320 210" role="img" aria-label="A shared folder: you and two colleagues, with three lessons in it">
            <path d="M20 56h88l14 14h178a8 8 0 0 1 8 8v112a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V64a8 8 0 0 1 8-8z" fill="#4f6b7a" opacity="0.16" />
            <text x="30" y="92" className="gu-s-b">Speaking lessons · shared folder</text>
            {['Small talk', 'Debate: cities', 'Job interviews'].map((t, i) => (
              <g key={t} transform={`translate(${30 + i * 92} 108)`}>
                <path d="M6 0h50l16 16v60H6z" className="gu-s-card" />
                <rect x="14" y="52" width="44" height="10" rx="3" fill="#c8764a" />
                <text x="40" y="94" textAnchor="middle" className="gu-s-small" style={{ fontSize: 10 }}>{t}</text>
              </g>
            ))}
            {[['A', '#c8764a'], ['S', '#3667a6'], ['T', '#3b7f4f']].map(([l, c], i) => (
              <g key={l}>
                <circle cx={226 + i * 24} cy="30" r="15" style={{ fill: c, stroke: 'var(--paper)', strokeWidth: 3 }} />
                <text x={226 + i * 24} y="35" textAnchor="middle" style={{ fill: '#fff', font: '600 12px var(--sans)' }}>{l}</text>
              </g>
            ))}
            <text x="140" y="34" className="gu-s-small">shared with</text>
          </svg>
          <figcaption>A shared folder: everything in it is shared with everyone in it.</figcaption>
        </figure>
        <figure className="gu-fig">
          <svg viewBox="0 0 320 210" role="img" aria-label="Messages: a colleague asks for a lesson and you send it in the chat">
            <circle cx="30" cy="34" r="13" fill="#3667a6" />
            <text x="30" y="39" textAnchor="middle" style={{ fill: '#fff', font: '600 11px var(--sans)' }}>S</text>
            <rect x="50" y="18" width="200" height="32" rx="14" className="gu-s-soft" />
            <text x="64" y="38" style={{ fill: 'var(--ink)', font: '12px var(--sans)' }}>Do you have a lesson on small talk?</text>
            <rect x="110" y="62" width="196" height="32" rx="14" fill="#7a4fa3" />
            <text x="124" y="82" style={{ fill: '#fff', font: '12px var(--sans)' }}>Yes! Use it with your B2s 👇</text>
            <rect x="150" y="102" width="156" height="52" rx="12" className="gu-s-card" />
            <path d="M162 112h18l8 8v24h-26z" fill="#c8764a" opacity="0.9" />
            <text x="198" y="124" className="gu-s-b" style={{ fontSize: 12 }}>Small talk</text>
            <text x="198" y="142" className="gu-s-small" style={{ fontSize: 10 }}>Lesson · Copy to a class</text>
            <rect x="14" y="170" width="292" height="28" rx="14" className="gu-s-card" />
            <text x="30" y="188" className="gu-s-small">Write a message…</text>
          </svg>
          <figcaption>Send a lesson or file in a message; they open it, or copy it to a class.</figcaption>
        </figure>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ running an organisation

const ORG_PAGES: { g: string; k: string; t: string; d: string; can: string[] }[] = [
  { g: 'People', k: 'Teachers', t: 'Everyone who teaches in your organisation', d: 'Each teacher with their classes, learners and the space their files take.', can: ['See who is active', 'Make a teacher an admin', 'Take a teacher out of the organisation'] },
  { g: 'People', k: 'Invitations', t: 'Bring teachers in', d: 'Invite a teacher by email, or make invitation codes to give to many at once. A teacher who uses your code joins your organisation.', can: ['Invite by email', 'Codes for a whole team, with how many uses', 'See who has not answered yet'] },
  { g: 'People', k: 'Admins', t: 'Who runs it with you', d: 'Admins see this page and can change everything in it.', can: ['Add or remove admins', 'Admins can still teach their own classes'] },
  { g: 'Teaching', k: 'Classes', t: 'Every class in the organisation', d: 'Who teaches each class, and its learners. You can add learners, give new PINs and print sign-in cards; lessons and answers stay with the teacher.', can: ['Add learners for a teacher', 'Give a new PIN', 'Print sign-in cards'] },
  { g: 'Teaching', k: 'Library', t: 'Your shared lessons and materials', d: 'Folders of lessons, documents, flashcards and PDFs for all your teachers, ready to copy into their classes.', can: ['Folders by course or level', 'Choose who can add and who can only use', 'Copy a lesson into a class in one step'] },
  { g: 'Settings', k: 'Rules', t: 'How your organisation works', d: 'Which apps your teachers use, the levels you teach, and what teachers fill in on their profile.', can: ['Turn apps on or off for everyone', 'Your own list of levels', 'Profile fields you need'] },
  { g: 'Settings', k: 'Branding', t: 'Your school’s look', d: 'Your logo and colour, on the top bar and on every worksheet your teachers print.', can: ['A square and a long logo', 'Your colour', 'Your name on worksheets'] },
  { g: 'Settings', k: 'Plan and limits', t: 'What your plan includes', d: 'How many teachers, classes and learners you can have, call minutes each month and space for files, with what you use now.', can: ['See what is left this month', 'Know before you reach a limit', 'Ask for more from Support'] },
  { g: '', k: 'Activity', t: 'What has changed', d: 'What your admins changed, who joined, who was invited and which classes are new.', can: ['Day by day', 'Filter by people, classes or changes'] },
];
function OrgTopic() {
  const [k, setK] = useState(0);
  const p = ORG_PAGES[k];
  const groups = ['', 'People', 'Teaching', 'Settings'];
  return (
    <>
      <p>A school or a team of teachers can be an <b>organisation</b> in ELT Suite. Its admins open <b>Organisation admin</b> from the Apps menu: one place to bring teachers in, share materials, set the rules and see what the plan includes. Teachers in it teach as usual; the organisation is there to help them.</p>
      <div className="gu-org">
        <nav className="gu-org-nav" aria-label="Organisation admin pages">
          <span className="gu-org-id">
            <span className="gu-org-logo" aria-hidden="true">B</span>
            <span>
              <b>Bright English</b>
              <span>Organisation admin</span>
            </span>
          </span>
          {groups.map((g) => (
            <span key={g || '-'} className="gu-org-g">
              {g && <span className="gu-org-h">{g}</span>}
              {ORG_PAGES.map((x, i) =>
                x.g === g ? (
                  <button key={x.k} type="button" aria-pressed={i === k} className={i === k ? 'on' : ''} onClick={() => setK(i)}>
                    {x.k}
                  </button>
                ) : null,
              )}
            </span>
          ))}
        </nav>
        <div className="gu-org-page gu-slide" key={p.k} aria-live="polite">
          <span className="gu-org-crumb">Organisation admin · {p.k}</span>
          <b className="gu-org-t">{p.t}</b>
          <p>{p.d}</p>
          <ul>
            {p.can.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <Steps
        items={[
          { t: 'Invite your teachers', d: 'By email, or with a code you give to the whole team.' },
          { t: 'Set the rules', d: 'The apps you use, your levels and what teachers fill in.' },
          { t: 'Add your branding', d: 'Your logo and colour, on screen and on worksheets.' },
          { t: 'Fill the library', d: 'Shared lessons and materials, ready to copy into classes.' },
        ]}
      />
    </>
  );
}

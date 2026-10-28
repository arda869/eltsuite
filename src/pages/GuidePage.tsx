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
  { id: 'files', title: 'Files: documents, flashcards and reading', short: 'Files', body: FilesTopic },
  { id: 'week', title: 'Timetable and Rooms', short: 'Timetable, Rooms', body: Week },
  { id: 'share', title: 'Colleagues and Messages', short: 'Colleagues', body: Share },
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

type GuideApp = { k: string; name: string; color: string; to: string; tag: string; about: string; can: string[]; d: string };
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
    about: 'Documents and slides you write at the same time as others: with colleagues to plan a course, or with learners for a class story or a shared essay.',
    can: ['See each other’s cursors as you type', 'Suggest changes and comment', 'Download as Word, PDF or PowerPoint'],
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
            <Link className="gu-win-go" to={a.to}>
              Open {a.name} →
            </Link>
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
            <rect x="40" y="14" width="210" height="196" rx="6" className="gu-s-card" />
            <text x="58" y="42" className="gu-s-h">Course plan: Term 2</text>
            {[60, 74, 88, 110, 124, 138, 160, 174].map((y, i) => ln(58, y, [170, 150, 120, 168, 140, 90, 160, 110][i]))}
            <rect x="178" y="84" width="2" height="16" style={{ fill: '#3667a6' }} />
            <rect x="160" y="70" width="40" height="13" rx="3" style={{ fill: '#3667a6' }} />
            <text x="180" y="80" textAnchor="middle" style={{ fill: '#fff', font: '600 9px var(--sans)' }}>Selin</text>
            <rect x="112" y="134" width="2" height="16" style={{ fill: '#c8764a' }} />
            <rect x="94" y="120" width="40" height="13" rx="3" style={{ fill: '#c8764a' }} />
            <text x="114" y="130" textAnchor="middle" style={{ fill: '#fff', font: '600 9px var(--sans)' }}>Tom</text>
            <rect x="58" y="108" width="100" height="10" rx="2" style={tint(0.18)} />
            <g transform="translate(262 100)">
              <rect width="86" height="58" rx="10" className="gu-s-card" />
              <circle cx="16" cy="16" r="7" style={{ fill: '#3667a6' }} />
              <text x="28" y="20" className="gu-s-small">Selin</text>
              {ln(10, 32, 64)}
              {ln(10, 44, 44)}
              <path d="M0 22 l-10 -6" className="gu-s-arrow" />
            </g>
          </>
        );
      case 'reading':
        return (
          <>
            <rect x="16" y="14" width="110" height="192" rx="10" className="gu-s-card" />
            {['Unplugged', 'How Languages…', 'Learning Teaching'].map((t, i) => (
              <g key={t} transform={`translate(26 ${26 + i * 40})`}>
                <rect width="90" height="32" rx="7" style={tint(i === 0 ? 0.16 : 0)} />
                <rect x="6" y="6" width="12" height="20" rx="2" style={tint(0.7 - i * 0.2)} />
                <text x="24" y="20" className="gu-s-small" style={{ fontSize: 9.5 }}>{t}</text>
              </g>
            ))}
            <rect x="136" y="14" width="208" height="192" rx="10" style={{ fill: '#fffdf6', stroke: 'var(--hair-strong)' }} />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <line key={i} x1="136" x2="344" y1={46 + i * 24} y2={46 + i * 24} stroke="#a9c3e0" strokeWidth="1" />
            ))}
            <line x1="172" x2="172" y1="14" y2="206" stroke="#d9534f" strokeWidth="1.5" />
            <text x="146" y="36" style={{ fill: '#33302c', font: '600 12px var(--serif)' }}>Ch. 2 · Materials-light</text>
            {[['p. 12', 'Dogme: conversation first'], ['p. 15', 'Emergent language'], ['p. 21', 'Try: no coursebook day']].map(([pg, t], i) => (
              <g key={pg}>
                <text x="146" y={66 + i * 24} style={{ fill: '#d9534f', font: '10px var(--sans)' }}>{pg}</text>
                <text x="180" y={66 + i * 24} style={{ fill: '#33302c', font: 'italic 12px var(--serif)' }}>{t}</text>
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
            <rect x="124" y="30" width="140" height="30" rx="12" className="gu-s-soft" />
            <text x="136" y="49" className="gu-s-small" style={{ fill: 'var(--ink)' }}>Is homework due Friday?</text>
            <rect x="180" y="72" width="156" height="30" rx="12" style={{ fill: c }} />
            <text x="192" y="91" style={{ fill: '#fff', font: '12px var(--sans)' }}>Yes! Here’s the lesson 👇</text>
            <rect x="200" y="110" width="136" height="44" rx="10" className="gu-s-card" />
            <rect x="210" y="120" width="18" height="24" rx="3" style={{ fill: '#c8764a' }} />
            <text x="236" y="136" className="gu-s-b" style={{ fontSize: 11.5 }}>Unit 3 homework</text>
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
        <Try title="Substitution slot: the words that can go in one place">
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
  const slot = ['Lisbon', 'Istanbul', 'Hong Kong'];
  const [i, setI] = useState(0);
  return (
    <>
      <div className="gu-subst" aria-label="I want to go to Lisbon, Istanbul or Hong Kong this summer">
        <span className="gu-q">I want to go to</span>
        <span className="gu-subst-slot">
          {slot.map((w, k) => (
            <button key={w} type="button" aria-pressed={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>
              {w}
            </button>
          ))}
        </span>
        <span className="gu-q">this summer.</span>
      </div>
      <p className="gu-say">
        Learners say: “I want to go to <b>{slot[i]}</b> this summer.” Tap another word in the slot.
      </p>
    </>
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
          return <rect key={p + (on ? 'on' : '')} className="gu-rise" style={{ fill: PARTS[p].c, animationDelay: `${i * 0.28}s` }} x="0" y={y} width="120" height={h + 0.5} />;
        })}
        <path d={`M0 ${top} q15 -4 30 0 t30 0 t30 0 t30 0 v4 H0z`} fill="#fff" opacity="0.35" className="gu-rise" style={{ animationDelay: `${mix.length * 0.28}s` }} />
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
  return (
    <>
      <p>Everything you make can go on paper. Print a lesson as a worksheet, with your organisation’s logo, or download it as a Word file to change it there. Bring PDFs in and add gaps, text boxes and highlights on top of the pages.</p>
      <div className="gu-grid2">
        <figure className="gu-fig">
          <svg viewBox="0 0 300 220" role="img" aria-label="A printed worksheet: a heading, a gap fill and a timeline">
            <rect x="70" y="10" width="160" height="200" rx="4" className="gu-s-card" />
            <rect x="84" y="24" width="36" height="10" rx="3" fill="#d98f63" />
            <rect x="84" y="44" width="110" height="10" rx="3" className="gu-s-ink" opacity=".8" />
            {[66, 84, 102].map((y) => (
              <g key={y}>
                <rect x="84" y={y} width="50" height="6" rx="3" className="gu-s-soft" />
                <rect x="138" y={y + 5} width="34" height="1.5" className="gu-s-ink" />
                <rect x="176" y={y} width="38" height="6" rx="3" className="gu-s-soft" />
              </g>
            ))}
            <line x1="90" y1="150" x2="210" y2="150" stroke="var(--ink)" strokeWidth="1.5" />
            <line x1="170" y1="143" x2="170" y2="157" stroke="var(--ink)" strokeWidth="1.5" />
            <path d="M118 144 l8 12 M126 144 l-8 12" style={{ stroke: 'var(--gu)' }} strokeWidth="2" />
            <text x="170" y="170" textAnchor="middle" style={{ fill: 'var(--muted)', font: '8px var(--sans)' }}>
              NOW
            </text>
            <text x="150" y="200" textAnchor="middle" style={{ fill: 'var(--muted)', font: '8px var(--sans)' }}>
              {as === 'pdf' ? 'worksheet.pdf' : 'worksheet.docx'}
            </text>
          </svg>
        </figure>
        <Try title="Print a lesson: choose how">
          <div className="gu-inline" role="radiogroup" aria-label="Format">
            <button type="button" role="radio" aria-checked={as === 'pdf'} className={'gu-opt' + (as === 'pdf' ? ' on' : '')} onClick={() => setAs('pdf')}>
              Print or PDF
            </button>
            <button type="button" role="radio" aria-checked={as === 'word'} className={'gu-opt' + (as === 'word' ? ' on' : '')} onClick={() => setAs('word')}>
              Word file
            </button>
          </div>
          <p className="gu-say">{as === 'pdf' ? 'In a lesson: ⋯ → Print as a worksheet. Choose the tasks, with or without answers, and your printer or “Save as PDF”.' : 'In a lesson: ⋯ → Download as Word. Change it in Word, Pages or Google Docs; the gaps and timelines come too.'}</p>
        </Try>
      </div>
      <Tip>Teaching from a coursebook? Upload the PDF to Files, put a page into a lesson, and add gaps and text boxes where learners write.</Tip>
    </>
  );
}

// ------------------------------------------------------------------ files

function FilesTopic() {
  return (
    <>
      <p>Your own library, and more than lessons: <b>documents</b> you write with colleagues or learners live (Collab), <b>flashcard</b> sets, <b>reading notes</b> for your development with references made for you, recordings and PDFs. Star what you use most.</p>
      <div className="gu-grid2">
        <Try title="Flashcards: tap the card to turn it over">
          <FlipCard />
        </Try>
        <div className="gu-tiles">
          {[
            { n: 'Documents (Collab)', c: '#3667a6', t: 'Write together live, with suggestions and comments; export to Word or PDF.' },
            { n: 'Flashcards', c: '#a8701f', t: 'A table you type into like a spreadsheet, cards to flip and a study view for learners.' },
            { n: 'Reading notes', c: '#7a4fa3', t: 'Your sources with full references in the style you choose, and notes page by page.' },
            { n: 'Recordings and PDFs', c: '#a8473a', t: 'Everything you record or upload, ready to put into lessons.' },
          ].map((x) => (
            <div key={x.n} className="gu-tile" style={{ ['--c' as string]: x.c }}>
              <b>{x.n}</b>
              <span>{x.t}</span>
            </div>
          ))}
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
          { n: 'Files', c: '#3667a6', t: 'Your library of lessons, documents, flashcards and Reading Journal. Documents are written together live, with suggestions and comments.' },
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

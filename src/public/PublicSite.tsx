import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { stages } from './sample';
import './public.css';

export const publicLaunch = { mode: 'invitation-only', registration: false, checkout: false } as const;

const TITLES: Record<string, string> = { '/': 'Made for teachers. Better together.', '/explore': 'Explore', '/pricing': 'Plans & Pricing', '/about': 'About', '/signin': 'Sign In', '/contact': 'Contact', '/privacy': 'Privacy', '/terms': 'Terms' };
const DESCRIPTION = 'A connected space for English language teaching, lesson planning, collaboration and professional learning. Explore ELT Suite without an account.';
const FOOTER: [string, string][] = [['/pricing', 'Plans & Pricing'], ['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMenu(false);
    if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    document.title = (TITLES[location.pathname] ?? 'Page not found') + ' — ELT Suite';
    const url = 'https://eltsuite.com' + location.pathname;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = url;
    const tags = [['property', 'og:title', document.title], ['property', 'og:description', DESCRIPTION], ['property', 'og:url', url], ['name', 'description', DESCRIPTION], ['name', 'robots', TITLES[location.pathname] ? 'index,follow' : 'noindex,nofollow']];
    for (const [attr, key, value] of tags) {
      let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!meta) { meta = document.createElement('meta'); meta.setAttribute(attr, key); document.head.append(meta); }
      meta.content = value;
    }
    return () => { canonical?.remove(); document.head.querySelector('meta[name="robots"]')?.remove(); };
  }, [location.pathname]);
  return (
    <div className="pub">
      <a className="pub-skip" href="#public-main">Skip to content</a>
      <header className="pub-header" onKeyDown={(e) => { if (e.key === 'Escape' && menu) { setMenu(false); toggle.current?.focus(); } }}>
        <Link to="/" className="pub-home-link" aria-label="ELT Suite home"><Wordmark /></Link>
        <button ref={toggle} className="pub-menu" aria-expanded={menu} aria-controls="public-nav" onClick={() => setMenu(!menu)}>{menu ? 'Close menu −' : 'Menu +'}</button>
        <nav id="public-nav" className={menu ? 'is-open' : ''} aria-label="Main navigation">
          <NavLink to="/pricing">Plans & Pricing</NavLink>
          <NavLink to="/about">About</NavLink>
          <Link className="pub-signin" to="/signin">Sign In <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      {children}
      <footer className="pub-footer">
        <div className="pub-footer-brand">
          <Link to="/" aria-label="ELT Suite home"><Wordmark /></Link>
          <p>Made for teachers. Built for teaching. Better together.</p>
        </div>
        <nav aria-label="Footer">{FOOTER.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav>
        <small>ELT Suite is open to invited teachers for now. More coming soon.</small>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ the lesson preview in the demo

const NativeActivity = lazy(() => import('./ProductDemo').then((m) => ({ default: m.NativeActivity })));
const EvidencePreview = lazy(() => import('./ProductDemo').then((m) => ({ default: m.EvidencePreview })));
const VIEWS: [string, string, string][] = [
  ['plan', '1. Plan the lesson', 'Organise your objective, teaching sequence and notes in one lesson. Select a stage to see what learners will do.'],
  ['teach', '2. Try the activity', 'The lesson becomes an interactive task. Try an answer and check the feedback, just as a learner would.'],
  ['review', '3. Review learner work', 'See a learner’s response alongside feedback, then use that evidence to inform the next lesson.'],
];

export function LessonPreview({ title }: { title?: string }) {
  const [stage, setStage] = useState(1), [view, setView] = useState('plan');
  const s = stages[stage];
  return (
    <div className="pub-lesson">
      <div className="pub-window"><strong>ELT Suite</strong><span>Lesson 08 · B1 · 60 minutes</span><span className="pub-demo-label">Interactive sample</span></div>
      <div className="pub-preview-switch" role="group" aria-label="Explore the lesson experience">
        {VIEWS.map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
      </div>
      <p className="pub-preview-explainer">{VIEWS.find((v) => v[0] === view)![2]}</p>
      {view === 'plan' ? (
        <div className="pub-lesson-body">
          <aside>
            <span className="pub-kicker">YOUR LESSON PLAN</span>
            <strong>{title ?? 'Expressing Opinions'}</strong>
            <p>Choose an activity ↓</p>
            <ol>{stages.map((st, i) => <li key={st.title}><button aria-pressed={stage === i} onClick={() => setStage(i)}><span>0{i + 1}</span>{st.title}</button></li>)}</ol>
          </aside>
          <section className="pub-lesson-paper" aria-label="Sample lesson stage">
            <div className="pub-aim"><span>WHAT LEARNERS WILL ACHIEVE</span><p>{s.aim}</p></div>
            <div className="pub-preview-activity"><div className="pub-lesson-meta"><span>{s.kind}</span><span>{s.minutes} min</span></div><h3>{s.title}</h3><p>{s.prompt}</p></div>
            <div className="pub-language"><span>Language to build on</span><p>“I see your point, <em>but what about…?</em>”</p></div>
            <p className="pub-teacher-note"><strong>YOUR TEACHING NOTE</strong>Give partners different information. Listen for reasons before offering a model.</p>
          </section>
        </div>
      ) : (
        <div className="pub-preview-working"><Suspense fallback={<p>Opening the interactive example…</p>}>{view === 'teach' ? <NativeActivity /> : <EvidencePreview />}</Suspense></div>
      )}
      <div className="pub-preview-footer"><span>Fictional lesson · changes stay in this demo</span><Link to="/explore?step=lesson">Explore the full lesson →</Link></div>
    </div>
  );
}

// ------------------------------------------------------------------ about and contact

const ABOUT: [string, string[]][] = [
  ['Teachers are at the heart of everything we do.', ['No two classrooms are exactly alike.', 'Teachers bring their experience, judgment, creativity and understanding of their learners to every lesson.', 'We believe technology should support that expertise, not replace it.', 'ELT Suite is designed to give teachers practical support while leaving teaching decisions where they belong: with the teacher.']],
  ['We believe teachers grow together.', ['Some of our most useful teaching ideas begin with a conversation.', 'A colleague shares an activity. A teacher asks a question. Someone offers a different perspective.', 'We want ELT Suite to make those exchanges easier and more meaningful, connecting the tools teachers use with opportunities to collaborate and learn from one another.']],
  ['Built to grow with teachers.', ['We want ELT Suite to remain accessible while continuing to develop reliable, useful tools.', 'That means being transparent about operating costs, making thoughtful decisions about pricing and ensuring the platform can sustain itself for the long term.']],
];

export function AboutPage() {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-page pub-about">
        <header className="pub-page-hero">
          <span className="pub-kicker">ABOUT ELT SUITE</span>
          <h1>Created out of a love for English language teaching.</h1>
          <p className="pub-lede">ELT Suite began with a simple belief: teachers deserve tools that understand their work and a space where they can learn from one another.</p>
          <p>We’re bringing together the different parts of English language teaching, from planning and classroom practice to reflection, research and professional development.</p>
          <p>Our aim is to make this work more connected, more collaborative and easier to carry forward from one lesson to the next.</p>
        </header>
        {ABOUT.map(([h, ps]) => (
          <section key={h} className="pub-split">
            <h2>{h}</h2>
            <div>{ps.map((p) => <p key={p}>{p}</p>)}</div>
          </section>
        ))}
        <section className="pub-mission" aria-label="Mission and vision">
          <div><span className="pub-kicker">OUR MISSION</span><h2 className="sr-only">Our Mission</h2><p>To bring the tools, knowledge and collaborative opportunities English language teachers need into one connected space, helping them teach confidently and grow together.</p></div>
          <div><span className="pub-kicker">OUR VISION</span><h2 className="sr-only">Our Vision</h2><p>A world where every English language teacher has access to the tools, knowledge and professional community they need to develop their practice.</p></div>
        </section>
        <section className="pub-page-end">
          <h2>Come and take a look.</h2>
          <p>We’re starting small, with more to come. Explore ELT Suite and discover what we’re building for English language teachers.</p>
          <Link className="pub-button" to="/">Explore ELT Suite</Link>
        </section>
      </main>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-page pub-contact">
        <header className="pub-page-hero">
          <span className="pub-kicker">CONTACT</span>
          <h1>We’d like to hear from you.</h1>
          <p className="pub-lede">Have a question about ELT Suite, an idea you’d like to share or something you’d like to discuss?</p>
          <p>Get in touch. We value thoughtful conversations about English language teaching and the work we’re building.</p>
        </header>
        <div className="pub-contact-card">
          <span className="pub-kicker">EMAIL</span>
          <a className="pub-contact-mail" href="mailto:arda@eltsuite.com">arda@eltsuite.com <span aria-hidden="true">↗</span></a>
          <p className="pub-note">Opens your email application. We read every message.</p>
        </div>
      </main>
    </PublicLayout>
  );
}

// ------------------------------------------------------------------ errors

export type PublicErrorKind = 'notFound' | 'restricted' | 'loadFailed' | 'auth' | 'unavailable';
const ERRORS: Record<PublicErrorKind, { kicker: string; title: string; body: string; action: [string, string] }> = {
  notFound: { kicker: 'PAGE NOT FOUND', title: 'We couldn’t find that page.', body: 'The page may have moved, or the link may no longer be available.', action: ['/signin', 'Sign In'] },
  restricted: { kicker: 'MEMBER ACCESS', title: 'This area is for ELT Suite members.', body: 'Sign in with an account that has access to continue.', action: ['/signin', 'Sign In'] },
  loadFailed: { kicker: 'SOMETHING WENT WRONG', title: 'We couldn’t load this page just now.', body: 'Check your connection and try again. If you were working on something, it’s still saved.', action: ['', 'Try again'] },
  auth: { kicker: 'SIGNING IN', title: 'We couldn’t sign you in just now.', body: 'Your link may have expired, or something went wrong on our side. Try signing in again.', action: ['/signin', 'Sign In'] },
  unavailable: { kicker: 'BACK SOON', title: 'ELT Suite isn’t available just now.', body: 'We’re making some changes. Your work is safe. Please try again in a few minutes.', action: ['', 'Try again'] },
};

export function PublicError({ restricted = false, kind }: { restricted?: boolean; kind?: PublicErrorKind }) {
  const e = ERRORS[kind ?? (restricted ? 'restricted' : 'notFound')];
  const [to, label] = e.action;
  return (
    <PublicLayout>
      <main id="public-main" className="pub-page pub-error">
        <header className="pub-page-hero">
          <span className="pub-kicker">{e.kicker}</span>
          <h1>{e.title}</h1>
          <p>{e.body}</p>
          <div className="pub-actions">
            {to ? <Link className="pub-button" to={to}>{label}</Link> : <button className="pub-button" onClick={() => window.location.reload()}>{label}</button>}
            <Link className="pub-secondary" to="/">Return to Homepage</Link>
          </div>
        </header>
      </main>
    </PublicLayout>
  );
}

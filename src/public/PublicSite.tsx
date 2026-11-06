import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import './public.css';

export const publicLaunch = { mode: 'invitation-only', registration: false, checkout: false } as const;

const TITLES: Record<string, string> = { '/': 'Lesson planning and live teaching for English teachers', '/pricing': 'Plans and pricing', '/about': 'About', '/signin': 'Sign in', '/contact': 'Contact', '/privacy': 'Privacy', '/terms': 'Terms' };
const DESCRIPTION = 'ELT Suite is a teaching space for ELT professionals. Plan lessons, teach them live, see every learner’s answer and grow as a teacher. Open by invitation.';
const FOOTER: [string, string][] = [['/pricing', 'Plans and pricing'], ['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];

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
          <Link to="/#how">What it does</Link><NavLink to="/pricing">Plans and pricing</NavLink>
          <NavLink to="/about">About</NavLink>
          <Link className="pub-signin" to="/signin">Sign in</Link>
          <Link className="pub-ask" to="/#invite">Ask for an invitation</Link>
        </nav>
      </header>
      {children}
      <footer className="pub-footer">
        <div className="pub-footer-brand">
          <Link to="/" aria-label="ELT Suite home"><Wordmark /></Link>
          <p>A teaching space for ELT professionals. Made for teachers. Better together.</p>
        </div>
        <nav aria-label="Footer">{FOOTER.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}</nav>
        <small>ELT Suite is open to invited teachers for now. <Link to="/#invite">Ask for an invitation</Link></small>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ the lesson preview in the demo

// ------------------------------------------------------------------ about and contact

const ABOUT: [string, string[]][] = [
  [
    "Good teaching begins with teachers.",
    [
      "No two classrooms are exactly alike.",
      "Teachers bring their knowledge, judgment, creativity and understanding of their learners to every lesson.",
      "We believe technology should support that expertise, not replace it."
    ]
  ],
  [
    "We believe teachers grow together.",
    [
      "A useful teaching idea often begins with a conversation.",
      "A colleague shares an activity. Someone asks a question. Another teacher offers a different perspective.",
      "We want ELT Suite to make those exchanges easier, connecting teachers' everyday work with opportunities to collaborate and grow professionally."
    ]
  ],
  [
    "Built to grow with teachers.",
    [
      "We're building ELT Suite for the long term.",
      "That means listening to teachers, making thoughtful product decisions and being transparent about the costs of running and improving the platform."
    ]
  ]
];

export function AboutPage() {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-page pub-about">
        <header className="pub-page-hero">
          <span className="pub-kicker">ABOUT ELT SUITE</span>
          <h1>Created out of a love for English language teaching.</h1>
<p>ELT Suite grew from a simple belief: teachers deserve tools that understand their work, and opportunities to learn from one another.</p><p>We're bringing together lesson planning, classroom practice, assessment, materials development and professional learning.</p><p>Our aim is to make these parts of teaching more connected, practical and collaborative.</p></header>
        {ABOUT.map(([h, ps]) => (
          <section key={h} className="pub-split">
            <h2>{h}</h2>
            <div>{ps.map((p) => <p key={p}>{p}</p>)}</div>
          </section>
        ))}
        <section className="pub-mission" aria-label="Mission and vision">
          <div><span className="pub-kicker">OUR MISSION</span><h2 className="sr-only">Our mission</h2><p>To bring the tools, knowledge and collaborative opportunities English language teachers need into one connected space, helping them teach confidently and grow together.</p></div>
          <div><span className="pub-kicker">OUR VISION</span><h2 className="sr-only">Our vision</h2><p>A world where every English language teacher has access to the tools, knowledge and professional community they need to develop their practice.</p></div>
        </section>
        <section className="pub-page-end">
          <h2>Take a closer look.</h2>
          <p>See what ELT Suite does, or ask for an invitation to try it with your classes.</p>
          <div className="pub-actions"><Link className="pub-button" to="/#invite">Ask for an invitation</Link><Link className="pub-secondary" to="/#how">See what it does</Link></div>
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
          <p className="pub-lede">Have a question about ELT Suite, feedback to share or an idea you’d like to discuss?</p>
          <p>Get in touch. We welcome conversations about English language teaching and the platform we’re building.</p>
        </header>
        <div className="pub-contact-card">
          <span className="pub-kicker">EMAIL</span>
          <a className="pub-contact-mail" href="mailto:arda@eltsuite.com">arda@eltsuite.com <span aria-hidden="true">↗</span></a>
          <p className="pub-note">Opens your email application.</p>
        </div>
      </main>
    </PublicLayout>
  );
}

// ------------------------------------------------------------------ errors

export type PublicErrorKind = 'notFound' | 'restricted' | 'loadFailed' | 'auth' | 'unavailable';
const ERRORS: Record<PublicErrorKind, { kicker: string; title: string; body: string; action: [string, string] }> = {
  notFound: { kicker: 'PAGE NOT FOUND', title: 'We couldn’t find that page.', body: 'The page may have moved, or the link may no longer be available.', action: ['/', 'Go to the homepage'] },
  restricted: { kicker: 'SIGN IN FIRST', title: 'This area is for ELT Suite members.', body: 'Sign in with an account that has access to see it.', action: ['/signin', 'Sign in'] },
  loadFailed: { kicker: 'SOMETHING WENT WRONG', title: 'This page couldn’t be loaded.', body: 'Check your connection and try again.', action: ['', 'Try again'] },
  auth: { kicker: 'SIGNING IN', title: 'We couldn’t sign you in just now.', body: 'Your link may have expired, or something went wrong on our side. Try signing in again.', action: ['/signin', 'Sign in'] },
  unavailable: { kicker: 'BACK SOON', title: 'ELT Suite is temporarily unavailable.', body: 'We’re having trouble loading the service. Try again in a few minutes.', action: ['', 'Try again'] },
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
            {to !== '/' && <Link className="pub-secondary" to="/">Go to the homepage</Link>}
          </div>
        </header>
      </main>
    </PublicLayout>
  );
}

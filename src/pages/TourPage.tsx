import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { Blend, GapFill, Live, Progress, Start, TimelineDemo } from './GuidePage';
import './guide.css';
import './welcome.css';
import { TEACHER_PATHS } from '../lib/teacherPaths';

// What ELT Suite is, for people who have not signed in yet: the Guide made short, to show why it is
// worth having rather than how to use it. Linked from the sign-in page.

const WHY: { t: string; d: string; c: string }[] = [
  { t: 'Less time on prep', d: 'Write a lesson once, with questions that mark themselves, and use it in class, online or as homework.', c: '#c8764a' },
  { t: 'Made for English teaching', d: 'Tense timelines, stress, IPA and correction codes are built in, not drawn by hand.', c: '#2f6f9f' },
  { t: 'Your whole job, one account', d: 'Classes, timetable, video rooms, materials, recordings and colleagues in one place.', c: '#3b7f7a' },
];

function Part({ n, eyebrow, title, lede, children }: { n: number; eyebrow: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="gu-sec tr-sec" aria-labelledby={'tr-' + n}>
      <span className="gu-eyebrow">{eyebrow}</span>
      <h2 id={'tr-' + n}>{title}</h2>
      <p className="tr-lede">{lede}</p>
      {children}
    </section>
  );
}

export function TourPage() {
  const [goal, setGoal] = useState(0);
  const path = TEACHER_PATHS[goal];
  useEffect(() => {
    document.title = 'ELT Suite: what it can do';
  }, []);
  return (
    <div className="tr">
      <header className="tr-top">
        <Link to="/" aria-label="ELT Suite: sign in">
          <Wordmark />
        </Link>
        <span className="tr-beta">Beta</span>
        <Link className="btn small-btn" to="/">
          Sign in
        </Link>
      </header>
      <main className="tr-main">
        <header className="gu-hero tr-hero">
          <span className="gu-eyebrow">For English teachers and their schools</span>
          <h1>Your next lesson. Your best ideas. One place.</h1>
          <p>Spend your energy on the teaching. Bring preparation, materials and feedback together, with tools that understand English teachers. Start with the part of your day you’d like to make easier.</p>
          <ul className="tr-why">
            {WHY.map((w) => (
              <li key={w.t} style={{ ['--c' as string]: w.c }}>
                <b>{w.t}</b>
                <span>{w.d}</span>
              </li>
            ))}
          </ul>
        </header>

        <section className="tour-paths" aria-label="Find your starting point"><span className="path-eyebrow">Start with your teaching</span><h2>What would make tomorrow easier?</h2><div className="path-grid">{TEACHER_PATHS.map((p, i) => <button key={p.id} className="path-card" aria-pressed={goal === i} onClick={() => setGoal(i)}><b>{p.title}</b><span>{p.detail}</span></button>)}</div><div className="path-plan" aria-live="polite"><span className="path-eyebrow">Picture your first small win</span><h3>{path.result}</h3><ol>{path.steps.map(s => <li key={s}>{s}</li>)}</ol><a className="btn primary" href="mailto:arda@eltsuite.com?subject=ELT%20Suite%20invitation">Ask for an invitation →</a><p className="hint">Invitation-only beta. Explore the examples below without an account.</p></div></section>

        <Part n={2} eyebrow="Questions" title="Questions that mark themselves" lede="Gap fills, matching, word order and more. Learners see what they got right straight away, and you see everyone’s answers. Have a go:">
          <GapFill />
        </Part>

        <Part n={3} eyebrow="Teaching live" title="Every screen follows yours" lede="In class or online, learners see the page you’re on and answer as you teach. Step through a lesson:">
          <Live />
        </Part>

        <Part n={4} eyebrow="Language notation" title="The marks you use on the board, built in" lede="Tense timelines, sentence stress and sounds, ready to drop into any lesson or document. Pick a tense:">
          <TimelineDemo />
        </Part>

        <Part n={5} eyebrow="Feedback" title="Marking writing, without the red pen" lede="Correction codes learners can tap to understand, and progress you can see at a glance.">
          <Progress />
        </Part>

        <Part n={6} eyebrow="Your way" title="Use as much or as little as you like" lede="Paper in class, fully online, or a bit of both: ELT Suite fits how you already teach.">
          <Blend />
        </Part>

        <section className="gu-sec tr-sec tr-two" aria-label="For schools, and what is coming">
          <div>
            <span className="gu-eyebrow">For schools</span>
            <h2>Give your teachers a shared starting point</h2>
            <ul className="tr-list">
              <li>Invite teachers and share a library of your own materials</li>
              <li>Your brand on lessons and documents</li>
              <li>See classes, learners and use at a glance</li>
            </ul>
          </div>
          <div className="tr-soon">
            <span className="gu-eyebrow">Coming soon</span>
            <h2>Money, for freelance teachers</h2>
            <p>Your rates, invoices made from the lessons you taught, and who has paid, from the timetable you already keep.</p>
          </div>
        </section>

        <details className="tour-directory"><summary>Explore every app in ELT Suite</summary><Start tour /></details>
        <footer className="tr-end">
          <h2>Want to try it with your classes?</h2>
          <p>ELT Suite is in beta and teachers join by invitation for now.</p>
          <span className="tr-ctas">
            <a className="btn primary" href="mailto:arda@eltsuite.com?subject=ELT%20Suite%20invitation">
              Ask for an invitation
            </a>
            <Link className="btn" to="/">
              I have an invitation
            </Link>
          </span>
          <p className="hint">
            Questions? Email <a href="mailto:arda@eltsuite.com">arda@eltsuite.com</a>
          </p>
        </footer>
      </main>
    </div>
  );
}

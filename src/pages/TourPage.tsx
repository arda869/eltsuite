import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { Blend, GapFill, Live, Progress, Start, TimelineDemo } from './GuidePage';
import './guide.css';

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
          <h1>Everything you need to teach English, in one place</h1>
          <p>Plan the lesson, teach it live in class or online, and see how every learner is doing, without juggling five different tools. Try the parts below: they work just like the real thing.</p>
          <ul className="tr-why">
            {WHY.map((w) => (
              <li key={w.t} style={{ ['--c' as string]: w.c }}>
                <b>{w.t}</b>
                <span>{w.d}</span>
              </li>
            ))}
          </ul>
        </header>

        <Part n={1} eyebrow="One account" title="All your apps, side by side" lede="Tap an app to see what it does.">
          <Start tour />
        </Part>

        <Part n={2} eyebrow="Questions" title="Questions that mark themselves" lede="Gap fills, matching, word order and more. Learners see what they got right straight away, and you see everyone’s answers. Have a go:">
          <GapFill />
        </Part>

        <Part n={3} eyebrow="Teaching live" title="Every screen follows yours" lede="In class or online, learners see the page you are on and answer as you teach. Step through a lesson:">
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
            <h2>Run your teachers in one place</h2>
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

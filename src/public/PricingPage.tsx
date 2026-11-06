import { Link } from 'react-router-dom';
import { PublicLayout } from './PublicSite';

// Plans, prices, allowances and welcome credits are proposals, not current entitlements.
// Nothing here may promise a price, an amount or a feature for a plan until it's approved.
const PLANS = [
  {
    "name": "Free",
    "for": "For exploring ELT Suite and using essential teaching and collaboration tools."
  },
  {
    "name": "Teacher",
    "for": "For regular lesson planning, teaching, assessment and everyday AI support."
  },
  {
    "name": "Teacher Plus",
    "for": "For teachers who create more resources or regularly use advanced media tools."
  },
  {
    "name": "Organisation",
    "for": "For schools and teaching teams that need shared resources and account management."
  }
];

const FIT: [string, string][] = [
  ['Free', 'You’d like to explore, or you use the essential tools now and then.'],
  ['Teacher', 'You plan, teach and assess with ELT Suite most weeks.'],
  ['Teacher Plus', 'You make a lot of materials, or you use media tools that cost more to run.'],
  ['Organisation', 'You’re a school, a training centre or a team of teachers.'],
];

const FAQ: [string, string][] = [
  ['Can I use ELT Suite for free?', 'A Free plan is proposed. Essential tools and final entitlements will be confirmed before public registration opens. For now, teachers join by invitation.'],
  ['Why do some features use credits?', 'AI services, media processing, storage and infrastructure have real operating costs. Credits are meant to make what you use, and what it costs, easy to understand.'],
  ['Do I receive credits when I first join?', 'Welcome credits are planned. Who receives them, how many and whether they expire will be published when the policy starts. This isn’t a confirmed allowance for every current account.'],
  ['What happens when I run out of credits?', 'The plan is that you keep using the free features, with optional top-ups for services that use credits. The final policy and the way to buy credits aren’t available yet.'],
  ['Do purchased credits expire?', 'Expiry and carry-over aren’t decided. We’ll show them before any credit purchase is available.'],
  ['Can I change my plan?', 'Subscriptions and checkout aren’t open. How to upgrade, downgrade or cancel will be published before paid plans start.'],
  ['Will I lose my work if I stop paying?', 'What happens to your work on a paid plan still needs approval. We’ll publish it before we offer subscriptions, and we won’t promise anything we haven’t confirmed.'],
  ['Can schools buy plans for several teachers?', 'An Organisation plan is proposed for schools, training centres and teams. It isn’t available to buy yet.'],
];

export function PricingPage() {
  return (
    <PublicLayout>
      <main id="public-main" className="pub-pricing">
        <header className="pub-page-hero">
          <span className="pub-kicker">PLANS & PRICING</span>
          <h1>Find the right space<br /><em>for your teaching.</em></h1>
          <p>Different teachers use different tools, at different stages of their work.</p><p>We're developing plans that reflect those needs, from essential teaching and collaboration to advanced media creation and organisational use.</p><p>We believe pricing should be straightforward, with clear information about what is included and what costs extra.</p><div className="pub-launch-notice">Public subscriptions are not available yet. ELT Suite is currently invitation-only.</div>
        </header>

        <div className="pub-plan-grid">
          {PLANS.map((p) => (
            <section key={p.name} className="pub-plan" aria-labelledby={`plan-${p.name}`}>
              <span className="pub-kicker">PROPOSED PLAN</span>
              <h2 id={`plan-${p.name}`}>{p.name}</h2>
              <p>{p.for}</p>
            </section>
          ))}
        </div>
        <p className="pub-plan-disclaimer">These are proposals, not confirmed entitlements. Prices, allowances and eligibility aren’t approved yet, and nothing can be bought.</p>

        <section aria-labelledby="pub-fit-h">
          <div className="pub-section-head">
            <span className="pub-kicker">WHICH PLAN FITS</span>
            <h2 id="pub-fit-h">Which plan fits your teaching?</h2>
            <p>Not sure where to start? Free is the proposed starting point. You can decide whether you need more as your teaching grows, once public plans are available.</p>
          </div>
          <div className="pub-guidance">{FIT.map(([n, t]) => <div key={n}><strong>{n}</strong><span>{t}</span></div>)}</div>
        </section>



        <section className="pub-credits" aria-labelledby="pub-credits-h">
          <div>
            <span className="pub-kicker">CREDITS</span>
            <h2 id="pub-credits-h">Use what you need. Know what it costs.</h2>
<p>Some ELT Suite services, including AI-generated audio, video and other media, have a cost each time they're used.</p><p>Our planned credit system is designed to make these costs clear before you choose to use a feature.</p><p>You'll be able to see what an action costs, understand your available balance and decide whether to continue.</p><p>Final credit prices, allowances and purchasing terms will be published before subscriptions open.</p>          </div>

        </section>

        <section className="pub-band-tint" aria-labelledby="pub-access-h">
          <div className="pub-prose">
            <span className="pub-kicker">OUR APPROACH</span>
            <h2 id="pub-access-h">Keeping ELT Suite accessible to everyone.</h2>
<p>We want useful teaching tools and opportunities for professional growth to be accessible to as many teachers as possible.</p><p>That's why our aim is to keep essential teaching and collaboration tools free.</p><p>Some services have real operating costs, including AI processing, storage and infrastructure. Charging fairly for these resources allows us to maintain the platform, improve it and continue developing new tools.</p><p>Our approach is to make those costs understandable and keep ELT Suite sustainable for the long term.</p>          </div>
        </section>

        <section aria-labelledby="pub-faq-h">
          <div className="pub-section-head">
            <span className="pub-kicker">QUESTIONS</span>
            <h2 id="pub-faq-h">A few practical questions.</h2>
          </div>
          <div className="pub-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
          <div className="pub-actions">
            <Link className="pub-button" to="/#invite">Ask for an invitation</Link>
            <Link className="pub-secondary" to="/contact">Ask us a question</Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

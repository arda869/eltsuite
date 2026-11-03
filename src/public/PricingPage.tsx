import { Link } from 'react-router-dom';
import { PublicLayout } from './PublicSite';

// Plans, prices, allowances and welcome credits are proposals, not current entitlements.
// Nothing here may promise a price, an amount or a feature for a plan until it's approved.
const PLANS: { name: string; for: string; includes: string[]; status: string }[] = [
  { name: 'Free', for: 'For teachers who want to explore ELT Suite and use essential teaching and collaboration tools.', includes: ['Essential teaching tools.', 'Core collaboration features.', 'Future community participation.', 'Limited basic AI access.', 'Complimentary welcome AI credits for new teachers.'], status: 'Coming soon.' },
  { name: 'Teacher', for: 'For teachers who use ELT Suite regularly for lesson planning, teaching, activities and assessment.', includes: ['Standard AI capabilities.', 'Monthly AI credit allowance.', 'Everyday teaching and planning workflows.', 'Option to purchase additional credits.'], status: 'Coming soon.' },
  { name: 'Teacher Plus', for: 'For teachers who create more resources, use advanced tools regularly or need resource-intensive features such as AI video creation.', includes: ['Higher monthly AI credit allowance.', 'Access to eligible high-cost AI services.', 'Standard teaching and collaboration tools.', 'Option to purchase additional credits.'], status: 'Coming soon.' },
  { name: 'Organisation', for: 'For language schools, teacher training centres and educational organisations working with multiple teachers.', includes: ['Team administration.', 'Shared resource management.', 'Organisation-level usage controls.', 'Configurable credit allowances.', 'Relevant institutional capabilities.'], status: 'Details coming soon.' },
];

const FIT: [string, string][] = [
  ['Free', 'You’d like to explore, or you use the essential tools now and then.'],
  ['Teacher', 'You plan, teach and assess with ELT Suite most weeks.'],
  ['Teacher Plus', 'You make a lot of materials, or you use media tools that cost more to run.'],
  ['Organisation', 'You’re a school, a training centre or a team of teachers.'],
];

const NONE = 'Not expected to use credits';
const USES = 'Uses credits · amounts to be confirmed';
const ROWS: [string, [string, string][]][] = [
  ['Teaching and collaboration', [['Lesson planning', NONE], ['Classes and lesson delivery', NONE], ['Activities and assessments', NONE], ['Rooms: class video rooms and calls', 'Call minutes may be limited'], ['Collab documents and slides', NONE], ['Development Studio', NONE], ['Communities (planned)', 'Planned feature']]],
  ['Services with running costs', [['AI lesson writing', USES], ['AI speech and songs', USES], ['AI video', USES], ['Teaching coach', USES], ['Storage', 'Allowance to be confirmed']]],
  ['Accounts', [['Monthly credit allowance', 'To be confirmed'], ['Buying more credits', 'Not available yet'], ['Organisation administration', NONE]]],
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
          <p className="pub-lede">Whether you’re exploring new ideas, teaching regularly or working with colleagues, we want ELT Suite to offer a plan that fits the way you teach.</p>
          <p>Our approach is simple: keep essential tools accessible and be open about the resources that cost money to run.</p>
          <div className="pub-launch-notice">We’re welcoming teachers by invitation for now. Our public plans are taking shape, and we’ll share more before anything is for sale.</div>
        </header>

        <div className="pub-plan-grid">
          {PLANS.map((p) => (
            <section key={p.name} className="pub-plan" aria-labelledby={`plan-${p.name}`}>
              <span className="pub-kicker">PROPOSED PLAN</span>
              <h2 id={`plan-${p.name}`}>{p.name}</h2>
              <p>{p.for}</p>
              <ul>{p.includes.map((t) => <li key={t}>{t}</li>)}</ul>
              <span className="pub-plan-status">{p.status}</span>
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

        <section aria-labelledby="pub-compare-h">
          <div className="pub-section-head">
            <span className="pub-kicker">COMPARE</span>
            <h2 id="pub-compare-h">What each plan includes, and what uses credits.</h2>
            <p>Having a feature and the credits it uses are separate things. A feature can be in your plan and still use credits each time, because the service behind it costs money to run.</p>
          </div>
          <div className="pub-table-scroll" tabIndex={0} role="region" aria-label="Proposed plan comparison">
            <table>
              <caption>A dash means which plans include the feature is still to be confirmed. The last column says whether a feature is expected to use credits.</caption>
              <thead>
                <tr><th scope="col">Feature</th>{PLANS.map((p) => <th scope="col" key={p.name}>{p.name}</th>)}<th scope="col">Credit use</th></tr>
              </thead>
              <tbody>
                {ROWS.flatMap(([group, rows]) => [
                  <tr key={group} className="pub-table-group"><th scope="colgroup" colSpan={PLANS.length + 2}>{group}</th></tr>,
                  ...rows.map(([n, credit]) => <tr key={n}><th scope="row">{n}</th>{PLANS.map((p) => <td key={p.name} className="pub-tbc"><span aria-hidden="true">–</span><span className="sr-only">To be confirmed</span></td>)}<td>{credit}</td></tr>),
                ])}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pub-credits" aria-labelledby="pub-credits-h">
          <div>
            <span className="pub-kicker">CREDITS</span>
            <h2 id="pub-credits-h">Use what you need. Know what it costs.</h2>
            <p>Some things in ELT Suite, such as AI lesson writing, voices, songs and video, run on services that cost money each time they’re used. Credits are how we plan to share that cost fairly.</p>
            <p>We plan to give eligible new teachers some welcome credits to try these tools, with no card needed and nothing to upgrade. The amount, who receives them and any expiry will be explained before this starts.</p>
            <p className="pub-note">No amounts or rates are promised here.</p>
          </div>
          <ol className="pub-credit-steps" aria-label="How credits are planned to work">
            <li><div><strong>You see the cost first.</strong><span>Before anything uses credits, you see how many it needs and how many you have.</span></div></li>
            <li><div><strong>You choose.</strong><span>Nothing is used until you confirm.</span></div></li>
            <li><div><strong>The free tools stay free.</strong><span>When your credits run out, everything that doesn’t use them keeps working.</span></div></li>
            <li><div><strong>Top up if you want to.</strong><span>Buying more credits is planned. Rates and conditions will be published before it opens.</span></div></li>
          </ol>
        </section>

        <section className="pub-band-tint" aria-labelledby="pub-access-h">
          <div className="pub-prose">
            <span className="pub-kicker">OUR APPROACH</span>
            <h2 id="pub-access-h">Keeping ELT Suite accessible to everyone.</h2>
            <p className="pub-lede">We created ELT Suite out of a love for English language teaching. We believe useful teaching tools and chances to grow professionally should be open to as many teachers as possible.</p>
            <p>That’s why we want to keep as much of ELT Suite free as we can.</p>
            <p>Some features have real operating costs, including AI services, storage and other infrastructure. Our proposed pricing covers what these features use, with a reasonable margin so the platform can last.</p>
            <p>Our goal is simple: keep teaching and collaboration accessible, make pricing fair and clear, and make sure ELT Suite can keep supporting teachers for years to come.</p>
          </div>
        </section>

        <section aria-labelledby="pub-faq-h">
          <div className="pub-section-head">
            <span className="pub-kicker">QUESTIONS</span>
            <h2 id="pub-faq-h">A few practical questions.</h2>
          </div>
          <div className="pub-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
          <div className="pub-actions">
            <Link className="pub-button" to="/">Explore ELT Suite</Link>
            <Link className="pub-secondary" to="/contact">Ask us a question</Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

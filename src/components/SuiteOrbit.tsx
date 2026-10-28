import { SUITE_APPS } from './AppGrid';
import { Mark } from './Wordmark';
import '../lib/extras.css';

// The sign-in page's picture of the suite: the apps turning slowly around the ELT Suite mark, on
// two rings, some bigger than others. Hover over one (or tab to it) and everything stops while it
// says what it is.

type Orb = { k: string; name: string; about: string; color: string; d: string };
const MONEY: Orb = { k: 'money', name: 'Money · coming soon', about: 'For freelance teachers: rates, invoices and who has paid', color: '#2f7a5a', d: 'M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' };
const pick = (k: string) => SUITE_APPS.find((a) => a.k === k) as Orb;
// [app, size in px]
const OUTER: [Orb, number][] = [
  [pick('classes'), 62],
  [pick('timetable'), 44],
  [pick('collab'), 56],
  [pick('recordings'), 46],
  [pick('pdf'), 52],
  [pick('messages'), 40],
  [pick('reading'), 50],
  [MONEY, 42],
];
const INNER: [Orb, number][] = [
  [pick('rooms'), 46],
  [pick('files'), 40],
  [pick('colleagues'), 36],
  [pick('library'), 34],
];

function Ring({ items, r, cls }: { items: [Orb, number][]; r: number; cls: string }) {
  return (
    <div className={'so-ring ' + cls}>
      {items.map(([a, s], i) => (
        <span key={a.k} className="so-item" style={{ ['--a' as string]: `${(360 / items.length) * i}deg`, ['--r' as string]: `${r}px` }}>
          <span className="so-up">
            <button type="button" className="so-btn" style={{ ['--c' as string]: a.color, ['--s' as string]: `${s}px` }} aria-label={`${a.name}: ${a.about}`}>
              <svg width={s * 0.48} height={s * 0.48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={a.d} />
              </svg>
            </button>
            <span className="so-tip" role="tooltip" style={{ ['--s' as string]: `${s}px` }}>
              <b>{a.name}</b>
              <span>{a.about}</span>
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

export function SuiteOrbit() {
  return (
    <div className="so" aria-label="The apps in ELT Suite" role="group">
      <span className="so-track out" aria-hidden="true" />
      <span className="so-track in" aria-hidden="true" />
      <span className="so-core" aria-hidden="true">
        <Mark size={66} />
      </span>
      <Ring items={OUTER} r={150} cls="out" />
      <Ring items={INNER} r={86} cls="in" />
    </div>
  );
}

// "Your whole job in one account.", marked up the way a teacher would on the board: a substitution
// slot for "whole", "n." over "job", linking from "one" into "account",
// the weak "in" (a schwa) and its stressed syllable. Hover (or tab) to read what it means.
const Link = () => (
  <span className="pr-pl" data-k="link" data-s="under" role="img" aria-label="linking">
    <span className="pr-pl-arc">
      <svg viewBox="0 0 20 10" preserveAspectRatio="none" aria-hidden="true">
        <path d="M1 2.5C4 9 16 9 19 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  </span>
);

export function Tagline() {
  return (
    <p className="si-tag" tabIndex={0} aria-describedby="si-tag-tip">
      <span className="si-tag-line">
        Your{' '}
        <span className="subs subs-both si-subs" role="group" aria-label="One of: whole, entire, teaching">
          <span className="subs-o">whole</span>
          <span className="subs-o">entire</span>
          <span className="subs-o">teaching</span>
        </span>{' '}
        <span className="pr-gl" data-text="n." data-shape="pill" data-tone="ink" data-at="above">
          job
        </span>{' '}
        <span className="pr-sd" data-k="schwa">in</span> one
        <Link />
        ac<span className="si-st">count</span>.
      </span>
      <span className="si-tag-tip" id="si-tag-tip" role="tooltip">
        <b>Made by English teachers, for English teachers.</b> The board, the coursebook, the worksheets and your marking pen: everything you reach for in the classroom, now online and together in one place.
      </span>
    </p>
  );
}

import { SUITE_APPS } from './AppGrid';
import { Mark } from './Wordmark';

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

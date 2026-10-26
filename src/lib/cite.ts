// Sources and citations, in the styles used in English teaching: APA 7 (the most common),
// Harvard, MLA 9 and Chicago author-date. A formatted reference is a list of pieces, some in
// italics, so it can be shown on screen, printed and written to Word the same way.

export type SourceType = 'book' | 'chapter' | 'article' | 'web' | 'report';
export type Person = { first: string; last: string };
export type Source = {
  id: string;
  type: SourceType;
  authors: Person[];
  org?: string; // an organisation as author (for example Cambridge Assessment English)
  year: string;
  title: string;
  edition?: string;
  publisher?: string;
  place?: string;
  editors?: Person[];
  bookTitle?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  site?: string;
  accessed?: string;
  date?: string; // web: day and month, for example 14 March
};
export type CiteStyle = 'apa' | 'harvard' | 'mla' | 'chicago';
export const CITE_STYLES: { k: CiteStyle; label: string; about: string }[] = [
  { k: 'apa', label: 'APA 7', about: 'The most used in English language teaching and on Delta and MA courses' },
  { k: 'harvard', label: 'Harvard', about: 'Cite Them Right, used by many UK universities' },
  { k: 'mla', label: 'MLA 9', about: 'Author and page in the text' },
  { k: 'chicago', label: 'Chicago', about: 'Author-date' },
];
export const SOURCE_TYPES: { k: SourceType; label: string }[] = [
  { k: 'book', label: 'Book' },
  { k: 'chapter', label: 'Chapter in an edited book' },
  { k: 'article', label: 'Journal article' },
  { k: 'web', label: 'Web page' },
  { k: 'report', label: 'Report' },
];

export type Piece = { t: string; i?: boolean };
const ini = (first: string) =>
  first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + '.')
    .join(' ');
const clean = (s?: string) => (s ?? '').trim();
const end = (s: string) => (/[.?!]$/.test(s) ? s : s + '.');
const ed = (e?: string) => {
  const x = clean(e);
  if (!x) return '';
  return /^\d+$/.test(x) ? `${x}${['th', 'st', 'nd', 'rd'][(Number(x) % 100 > 10 && Number(x) % 100 < 14) || Number(x) % 10 > 3 ? 0 : Number(x) % 10]} ed.` : x;
};
const doiUrl = (s: Source) => (clean(s.doi) ? (s.doi!.startsWith('http') ? s.doi! : `https://doi.org/${clean(s.doi).replace(/^doi:\s*/i, '')}`) : clean(s.url));
const people = (s: Source) => s.authors.filter((a) => clean(a.last));

function apaNames(ps: Person[]) {
  const n = ps.map((p) => `${clean(p.last)}, ${ini(p.first)}`.replace(/, $/, ''));
  if (n.length <= 1) return n.join('');
  if (n.length <= 20) return n.slice(0, -1).join(', ') + ', & ' + n[n.length - 1];
  return n.slice(0, 19).join(', ') + ', … ' + n[n.length - 1];
}
function harvardNames(ps: Person[]) {
  const n = ps.map((p) => `${clean(p.last)}, ${ini(p.first)}`.replace(/, $/, ''));
  if (n.length <= 1) return n.join('');
  if (n.length > 3) return `${n[0]} et al.`;
  return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}
function mlaNames(ps: Person[]) {
  if (!ps.length) return '';
  const first = `${clean(ps[0].last)}, ${clean(ps[0].first)}`.replace(/, $/, '');
  if (ps.length === 1) return first;
  if (ps.length === 2) return `${first}, and ${clean(ps[1].first)} ${clean(ps[1].last)}`.trim();
  return `${first}, et al.`;
}
function chicagoNames(ps: Person[]) {
  if (!ps.length) return '';
  const first = `${clean(ps[0].last)}, ${clean(ps[0].first)}`.replace(/, $/, '');
  if (ps.length === 1) return first;
  const rest = ps.slice(1).map((p) => `${clean(p.first)} ${clean(p.last)}`.trim());
  return [first, ...rest.slice(0, -1)].join(', ') + ', and ' + rest[rest.length - 1];
}
const editorsApa = (ps?: Person[]) => {
  const e = (ps ?? []).filter((p) => clean(p.last)).map((p) => `${ini(p.first)} ${clean(p.last)}`.trim());
  if (!e.length) return '';
  return (e.length === 1 ? e[0] : e.slice(0, -1).join(', ') + ' & ' + e[e.length - 1]) + (e.length === 1 ? ' (Ed.)' : ' (Eds.)');
};
const editorsPlain = (ps?: Person[], and = 'and') => {
  const e = (ps ?? []).filter((p) => clean(p.last)).map((p) => `${clean(p.first)} ${clean(p.last)}`.trim());
  if (!e.length) return '';
  return e.length === 1 ? e[0] : e.slice(0, -1).join(', ') + ` ${and} ` + e[e.length - 1];
};

export function reference(s: Source, style: CiteStyle): Piece[] {
  const ps = people(s);
  const who = ps.length ? '' : clean(s.org);
  const yr = clean(s.year) || 'n.d.';
  const P: Piece[] = [];
  const t = (x: string) => x && P.push({ t: x });
  const it = (x: string) => x && P.push({ t: x, i: true });
  const link = doiUrl(s);
  if (style === 'apa') {
    t(`${ps.length ? apaNames(ps) : who} (${yr}${s.type === 'web' && clean(s.date) ? ', ' + clean(s.date) : ''}). `);
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`${clean(s.edition) ? ` (${ed(s.edition)})` : ''}. ${clean(s.publisher) ? end(clean(s.publisher)) : ''}`);
    } else if (s.type === 'chapter') {
      t(`${end(clean(s.title))} In ${editorsApa(s.editors)}${s.editors?.length ? ', ' : ''}`);
      it(clean(s.bookTitle));
      t(`${clean(s.pages) ? ` (pp. ${clean(s.pages)})` : ''}. ${clean(s.publisher) ? end(clean(s.publisher)) : ''}`);
    } else if (s.type === 'article') {
      t(`${end(clean(s.title))} `);
      it(clean(s.journal) + (clean(s.volume) ? ', ' + clean(s.volume) : ''));
      t(`${clean(s.issue) ? `(${clean(s.issue)})` : ''}${clean(s.pages) ? ', ' + clean(s.pages) : ''}.`);
    } else {
      it(clean(s.title));
      t(`. ${clean(s.site) ? end(clean(s.site)) : ''}`);
    }
    if (link) t(` ${link}`);
  } else if (style === 'harvard') {
    t(`${ps.length ? harvardNames(ps) : who} (${yr}) `);
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`. ${clean(s.edition) ? ed(s.edition) + ' ' : ''}${[clean(s.place), clean(s.publisher)].filter(Boolean).join(': ')}${clean(s.place) || clean(s.publisher) ? '.' : ''}`);
    } else if (s.type === 'chapter') {
      t(`‘${clean(s.title)}’, in ${harvardNames((s.editors ?? []).filter((p) => clean(p.last)))}${s.editors?.length ? ` (${s.editors.length > 1 ? 'eds' : 'ed.'}) ` : ''}`);
      it(clean(s.bookTitle));
      t(`. ${[clean(s.place), clean(s.publisher)].filter(Boolean).join(': ')}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}.`);
    } else if (s.type === 'article') {
      t(`‘${clean(s.title)}’, `);
      it(clean(s.journal));
      t(`${clean(s.volume) ? ', ' + clean(s.volume) : ''}${clean(s.issue) ? `(${clean(s.issue)})` : ''}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}.`);
    } else {
      it(clean(s.title));
      t('.');
    }
    if (link) t(` Available at: ${link}${clean(s.accessed) ? ` (Accessed: ${clean(s.accessed)})` : ''}.`);
  } else if (style === 'mla') {
    t(ps.length ? end(mlaNames(ps)) + ' ' : who ? end(who) + ' ' : '');
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`. ${clean(s.edition) ? ed(s.edition) + ', ' : ''}${clean(s.publisher) ? clean(s.publisher) + ', ' : ''}${yr}.`);
    } else if (s.type === 'chapter') {
      t(`“${end(clean(s.title))}” `);
      it(clean(s.bookTitle));
      t(`, ${s.editors?.length ? `edited by ${editorsPlain(s.editors)}, ` : ''}${clean(s.publisher) ? clean(s.publisher) + ', ' : ''}${yr}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}.`);
    } else if (s.type === 'article') {
      t(`“${end(clean(s.title))}” `);
      it(clean(s.journal));
      t(`${clean(s.volume) ? `, vol. ${clean(s.volume)}` : ''}${clean(s.issue) ? `, no. ${clean(s.issue)}` : ''}, ${yr}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}.`);
    } else {
      it(clean(s.title));
      t(`. ${clean(s.site) ? clean(s.site) + ', ' : ''}${clean(s.date) ? clean(s.date) + ' ' : ''}${yr}.`);
    }
    if (link) t(` ${link.replace(/^https?:\/\//, '')}.`);
  } else {
    t(`${ps.length ? end(chicagoNames(ps)) : who ? end(who) : ''} ${yr}. `);
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`. ${clean(s.edition) ? ed(s.edition) + ' ' : ''}${[clean(s.place), clean(s.publisher)].filter(Boolean).join(': ')}${clean(s.place) || clean(s.publisher) ? '.' : ''}`);
    } else if (s.type === 'chapter') {
      t(`“${end(clean(s.title))}” In `);
      it(clean(s.bookTitle));
      t(`, ${s.editors?.length ? `edited by ${editorsPlain(s.editors)}, ` : ''}${clean(s.pages) ? clean(s.pages) + '. ' : ''}${[clean(s.place), clean(s.publisher)].filter(Boolean).join(': ')}.`);
    } else if (s.type === 'article') {
      t(`“${end(clean(s.title))}” `);
      it(clean(s.journal));
      t(`${clean(s.volume) ? ' ' + clean(s.volume) : ''}${clean(s.issue) ? ` (${clean(s.issue)})` : ''}${clean(s.pages) ? ': ' + clean(s.pages) : ''}.`);
    } else {
      t(`“${end(clean(s.title))}” ${clean(s.site) ? end(clean(s.site)) : ''}`);
    }
    if (link) t(` ${link}.`);
  }
  return P.map((p) => ({ ...p, t: p.t.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').replace(/\.\./g, '.') })).filter((p) => p.t);
}

// The citation in the text: (Thornbury, 2006, p. 12), (Thornbury 12) and so on.
export function inText(s: Source, style: CiteStyle, page = '', narrative = false): string {
  const ps = people(s);
  const yr = clean(s.year) || 'n.d.';
  const names = (amp: string) => (ps.length === 0 ? clean(s.org) || clean(s.title) : ps.length === 1 ? clean(ps[0].last) : ps.length === 2 ? `${clean(ps[0].last)} ${amp} ${clean(ps[1].last)}` : `${clean(ps[0].last)} et al.`);
  const pg = clean(page);
  const many = /[-–,]/.test(pg);
  if (style === 'apa') {
    const p = pg ? `, ${many ? 'pp.' : 'p.'} ${pg}` : '';
    return narrative ? `${names('and')} (${yr}${p})` : `(${names('&')}, ${yr}${p})`;
  }
  if (style === 'harvard') {
    const p = pg ? `, ${many ? 'pp.' : 'p.'} ${pg}` : '';
    return narrative ? `${names('and')} (${yr}${p})` : `(${names('and')}, ${yr}${p})`;
  }
  if (style === 'mla') return narrative ? `${names('and')}${pg ? ` (${pg})` : ''}` : `(${names('and')}${pg ? ' ' + pg : ''})`;
  return narrative ? `${names('and')} (${yr}${pg ? ', ' + pg : ''})` : `(${names('and')} ${yr}${pg ? ', ' + pg : ''})`;
}
export const shortName = (s: Source) => `${people(s).length ? (people(s).length > 2 ? clean(people(s)[0].last) + ' et al.' : people(s).map((p) => clean(p.last)).join(' & ')) : clean(s.org) || 'Untitled'} (${clean(s.year) || 'n.d.'})`;
export const sortKey = (s: Source) => `${(people(s)[0]?.last || s.org || s.title || '').toLowerCase()} ${s.year}`;
export const refsTitle = (style: CiteStyle) => (style === 'mla' ? 'Works Cited' : style === 'harvard' ? 'Reference list' : 'References');
export const piecesText = (ps: Piece[]) => ps.map((p) => p.t).join('');
export const piecesHtml = (ps: Piece[], esc: (s: string) => string) => ps.map((p) => (p.i ? `<i>${esc(p.t)}</i>` : esc(p.t))).join('');

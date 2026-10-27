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
export type CiteStyle = 'apa' | 'apa6' | 'harvard' | 'mla' | 'mla8' | 'chicago' | 'turabian' | 'asa' | 'cse' | 'unified' | 'ieee' | 'vancouver' | 'ama';
export const CITE_STYLES: { k: CiteStyle; label: string; about: string; group: string }[] = [
  { k: 'apa', label: 'APA 7', about: 'The most used in English language teaching and on Delta and MA courses', group: 'Author and date' },
  { k: 'apa6', label: 'APA 6', about: 'The older edition, still asked for on some courses', group: 'Author and date' },
  { k: 'harvard', label: 'Harvard', about: 'Cite Them Right, used by many UK universities', group: 'Author and date' },
  { k: 'chicago', label: 'Chicago author-date', about: 'Chicago Manual of Style, 17th edition', group: 'Author and date' },
  { k: 'turabian', label: 'Turabian author-date', about: 'The student version of Chicago', group: 'Author and date' },
  { k: 'unified', label: 'Linguistics (Unified Style Sheet)', about: 'Used by most linguistics journals', group: 'Author and date' },
  { k: 'asa', label: 'ASA', about: 'American Sociological Association', group: 'Author and date' },
  { k: 'cse', label: 'CSE name-year', about: 'Council of Science Editors', group: 'Author and date' },
  { k: 'mla', label: 'MLA 9', about: 'Author and page in the text', group: 'Author and page' },
  { k: 'mla8', label: 'MLA 8', about: 'Author and page in the text, the older edition', group: 'Author and page' },
  { k: 'ieee', label: 'IEEE', about: 'Numbers in square brackets, in the order you cite', group: 'Numbered' },
  { k: 'vancouver', label: 'Vancouver', about: 'Numbers in brackets, in the order you cite', group: 'Numbered' },
  { k: 'ama', label: 'AMA 11', about: 'Raised numbers, in the order you cite', group: 'Numbered' },
];
// Numbered styles list sources in the order they are first cited.
export const isNumbered = (st: CiteStyle) => st === 'ieee' || st === 'vancouver' || st === 'ama';
const base = (st: CiteStyle): CiteStyle => (st === 'mla8' ? 'mla' : st === 'turabian' ? 'chicago' : st);
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

function classic(s: Source, style: CiteStyle): Piece[] {
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
function classicInText(s: Source, style: CiteStyle, page = '', narrative = false): string {
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
export const shortName = (s: Source) => `${people(s).length ? (people(s).length > 2 ? clean(people(s)[0].last) + ' et al.' : people(s).map((p) => clean(p.last)).join(' & ')) : clean(s.org) || clean(s.title) || 'Untitled'} (${clean(s.year) || 'n.d.'})`;
export const sortKey = (s: Source) => `${(people(s)[0]?.last || s.org || s.title || '').toLowerCase()} ${s.year}`;
export const refsTitle = (style: CiteStyle) => (base(style) === 'mla' ? 'Works Cited' : style === 'harvard' ? 'Reference list' : style === 'asa' || style === 'cse' ? 'References' : 'References');
export const piecesText = (ps: Piece[]) => ps.map((p) => p.t).join('');
export const piecesHtml = (ps: Piece[], esc: (s: string) => string) => ps.map((p) => (p.i ? `<i>${esc(p.t)}</i>` : esc(p.t))).join('');

// The other styles, built from the same pieces.
const sup = (n: number) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
const initialsTight = (first: string) => first.split(/[\s-]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('');
const vanNames = (ps: Person[], max = 6) => {
  const n = ps.map((p) => `${clean(p.last)} ${initialsTight(p.first)}`.trim());
  return n.length > max ? n.slice(0, max === 6 ? 6 : 3).join(', ') + ', et al' : n.join(', ');
};
const ieeeNames = (ps: Person[]) => {
  const n = ps.map((p) => `${ini(p.first)} ${clean(p.last)}`.trim());
  if (n.length > 6) return `${n[0]} et al.`;
  return n.length <= 2 ? n.join(' and ') : n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
};
const asaNames = (ps: Person[]) => {
  if (!ps.length) return '';
  const first = `${clean(ps[0].last)}, ${clean(ps[0].first)}`.replace(/, $/, '');
  const rest = ps.slice(1).map((p) => `${clean(p.first)} ${clean(p.last)}`.trim());
  return rest.length ? [first, ...rest.slice(0, -1)].join(', ') + (rest.length > 1 ? ',' : '') + ' and ' + rest[rest.length - 1] : first;
};
const unifiedNames = (ps: Person[]) => {
  if (!ps.length) return '';
  const first = `${clean(ps[0].last)}, ${clean(ps[0].first)}`.replace(/, $/, '');
  const rest = ps.slice(1).map((p) => `${clean(p.first)} ${clean(p.last)}`.trim());
  return rest.length ? [first, ...rest.slice(0, -1)].join(', ') + ' & ' + rest[rest.length - 1] : first;
};
const pubOf = (s: Source, sep = ': ') => [clean(s.place), clean(s.publisher)].filter(Boolean).join(sep);
const vip = (s: Source, a = '', b = '') => `${clean(s.volume)}${clean(s.issue) ? `(${clean(s.issue)})` : ''}${clean(s.pages) ? a + clean(s.pages) : ''}${b}`;

function other(s: Source, style: CiteStyle): Piece[] {
  const ps = people(s);
  const yr = clean(s.year) || 'n.d.';
  const link = doiUrl(s);
  const P: Piece[] = [];
  const t = (x: string) => x && P.push({ t: x });
  const it = (x: string) => x && P.push({ t: x, i: true });
  const edn = clean(s.edition) ? ed(s.edition) + ' ' : '';
  if (style === 'apa6') {
    t(`${ps.length ? apaNames(ps) : clean(s.org)} (${yr}). `);
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`${clean(s.edition) ? ` (${ed(s.edition)})` : ''}. ${pubOf(s) ? end(pubOf(s)) : ''}`);
    } else if (s.type === 'chapter') {
      t(`${end(clean(s.title))} In ${editorsApa(s.editors)}${s.editors?.length ? ', ' : ''}`);
      it(clean(s.bookTitle));
      t(`${clean(s.pages) ? ` (pp. ${clean(s.pages)})` : ''}. ${pubOf(s) ? end(pubOf(s)) : ''}`);
    } else if (s.type === 'article') {
      t(`${end(clean(s.title))} `);
      it(clean(s.journal) + (clean(s.volume) ? ', ' + clean(s.volume) : ''));
      t(`${clean(s.issue) ? `(${clean(s.issue)})` : ''}${clean(s.pages) ? ', ' + clean(s.pages) : ''}.`);
    } else {
      it(clean(s.title));
      t('.');
    }
    if (clean(s.doi)) t(` doi:${clean(s.doi).replace(/^https?:\/\/doi\.org\//, '')}`);
    else if (link) t(` Retrieved from ${link}`);
  } else if (style === 'ieee') {
    t(`${ps.length ? ieeeNames(ps) : clean(s.org)}, `);
    if (s.type === 'book' || s.type === 'report') {
      it(clean(s.title));
      t(`, ${edn ? edn.trim() + ' ' : ''}${pubOf(s)}${pubOf(s) ? ', ' : ''}${yr}.`);
    } else if (s.type === 'chapter') {
      t(`“${clean(s.title)},” in `);
      it(clean(s.bookTitle));
      t(`${s.editors?.length ? `, ${ieeeNames(s.editors.filter((p) => clean(p.last)))}, ${s.editors.length > 1 ? 'Eds' : 'Ed'}.` : ''} ${pubOf(s)}${pubOf(s) ? ', ' : ''}${yr}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}.`);
    } else if (s.type === 'article') {
      t(`“${clean(s.title)},” `);
      it(clean(s.journal));
      t(`${clean(s.volume) ? `, vol. ${clean(s.volume)}` : ''}${clean(s.issue) ? `, no. ${clean(s.issue)}` : ''}${clean(s.pages) ? `, pp. ${clean(s.pages)}` : ''}, ${yr}${clean(s.doi) ? `, doi: ${clean(s.doi)}` : ''}.`);
    } else {
      t(`“${clean(s.title)},” ${clean(s.site) ? clean(s.site) + '. ' : ''}${clean(s.accessed) ? `Accessed: ${clean(s.accessed)}. ` : ''}`);
    }
    if (link && !(s.type === 'article' && clean(s.doi))) t(` [Online]. Available: ${link}`);
  } else if (style === 'vancouver' || style === 'ama') {
    const ama = style === 'ama';
    t(`${ps.length ? vanNames(ps, ama ? 6 : 6) : clean(s.org)}. `);
    if (s.type === 'book' || s.type === 'report') {
      ama ? it(clean(s.title)) : t(clean(s.title));
      t(`. ${edn}${ama ? clean(s.publisher) : pubOf(s)}; ${yr}.`);
    } else if (s.type === 'chapter') {
      t(`${end(clean(s.title))} In: ${vanNames((s.editors ?? []).filter((p) => clean(p.last)))}${s.editors?.length ? `, ${s.editors.length > 1 ? 'editors' : 'editor'}. ` : ''}`);
      ama ? it(clean(s.bookTitle)) : t(clean(s.bookTitle));
      t(`. ${ama ? clean(s.publisher) : pubOf(s)}; ${yr}${clean(s.pages) ? `${ama ? ':' : '. p. '}${clean(s.pages)}` : ''}.`);
    } else if (s.type === 'article') {
      t(`${end(clean(s.title))} `);
      ama ? it(clean(s.journal)) : t(clean(s.journal));
      t(`. ${yr};${vip(s, ':')}.${ama && clean(s.doi) ? ` doi:${clean(s.doi)}` : ''}`);
    } else {
      t(`${clean(s.title)}${ama ? '' : ' [Internet]'}. ${clean(s.site) ? clean(s.site) + (ama ? '. ' : '; ') : ''}${ama ? (clean(s.date) ? `Published ${clean(s.date)} ${yr}. ` : '') : yr + ' '}${clean(s.accessed) ? (ama ? `Accessed ${clean(s.accessed)}.` : `[cited ${clean(s.accessed)}].`) : ''}`);
    }
    if (link && !(ama && s.type === 'article' && clean(s.doi))) t(ama ? ` ${link}` : ` Available from: ${link}`);
  } else if (style === 'asa' || style === 'unified' || style === 'cse') {
    const names = style === 'asa' ? asaNames(ps) : style === 'unified' ? unifiedNames(ps) : vanNames(ps, 10);
    t(`${ps.length ? end(names) : clean(s.org) ? end(clean(s.org)) : ''} ${yr}. `);
    const italic = style !== 'cse';
    if (s.type === 'book' || s.type === 'report') {
      italic ? it(clean(s.title)) : t(clean(s.title));
      t(`. ${edn}${pubOf(s) ? end(pubOf(s)) : ''}`);
    } else if (s.type === 'chapter') {
      t(`${style === 'asa' ? `“${end(clean(s.title))}”` : end(clean(s.title))} ${style === 'cse' ? 'In: ' : 'In '}${s.editors?.length ? `${editorsPlain(s.editors, style === 'unified' ? '&' : 'and')} (${s.editors.length > 1 ? 'eds.' : 'ed.'}), ` : ''}`);
      italic ? it(clean(s.bookTitle)) : t(clean(s.bookTitle));
      t(`${clean(s.pages) ? `, ${style === 'cse' ? 'p. ' : ''}${clean(s.pages)}` : ''}. ${pubOf(s) ? end(pubOf(s)) : ''}`);
    } else if (s.type === 'article') {
      t(`${style === 'asa' ? `“${end(clean(s.title))}”` : end(clean(s.title))} `);
      italic ? it(clean(s.journal)) : t(clean(s.journal) + '.');
      t(style === 'unified' ? ` ${clean(s.volume)}${clean(s.issue) ? `(${clean(s.issue)})` : ''}.${clean(s.pages) ? ' ' + clean(s.pages) + '.' : ''}` : ` ${vip(s, ':')}.`);
    } else {
      style === 'asa' ? t(`“${end(clean(s.title))}” `) : t(`${end(clean(s.title))} `);
      t(clean(s.site) ? end(clean(s.site)) : '');
      if (clean(s.accessed)) t(style === 'cse' ? ` [accessed ${clean(s.accessed)}].` : ` Retrieved ${clean(s.accessed)}.`);
    }
    if (link) t(style === 'asa' && !clean(s.doi) ? ` (${link})` : ` ${link}`);
  }
  return P;
}

const tidy = (P: Piece[]) => P.map((p) => ({ ...p, t: p.t.replace(/\s+/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/\.\./g, '.').replace(/,\./g, '.') })).filter((p) => p.t.trim());

// The full reference. n: its number in a numbered style's list.
export function reference(s: Source, style: CiteStyle, n?: number): Piece[] {
  const b = base(style);
  const P = b === 'apa' || b === 'harvard' || b === 'mla' || b === 'chicago' ? classic(s, b) : tidy(other(s, b));
  if (isNumbered(style) && n) P.unshift({ t: style === 'ieee' ? `[${n}] ` : `${n}. ` });
  return P;
}

// The citation in the text. n: the source's number, for numbered styles.
export function inText(s: Source, style: CiteStyle, page = '', narrative = false, n = 1): string {
  const b = base(style);
  if (b === 'apa' || b === 'harvard' || b === 'mla' || b === 'chicago') return classicInText(s, b, page, narrative);
  const ps = people(s);
  const yr = clean(s.year) || (b === 'apa6' ? 'n.d.' : 'n.d.');
  const names = (amp: string) => (ps.length === 0 ? clean(s.org) || clean(s.title) : ps.length === 1 ? clean(ps[0].last) : ps.length === 2 ? `${clean(ps[0].last)} ${amp} ${clean(ps[1].last)}` : `${clean(ps[0].last)} et al.`);
  const pg = clean(page);
  const many = /[-–,]/.test(pg);
  if (b === 'apa6') {
    const p = pg ? `, ${many ? 'pp.' : 'p.'} ${pg}` : '';
    return narrative ? `${names('and')} (${yr}${p})` : `(${names('&')}, ${yr}${p})`;
  }
  if (b === 'ieee') return (narrative ? `${names('and')} ` : '') + `[${n}${pg ? `, ${many ? 'pp.' : 'p.'} ${pg}` : ''}]`;
  if (b === 'vancouver') return (narrative ? `${names('and')} ` : '') + `(${n}${pg ? `, p. ${pg}` : ''})`;
  if (b === 'ama') return (narrative ? `${names('and')}` : '') + sup(n) + (pg ? `(p${pg})` : '');
  if (b === 'asa') return narrative ? `${names('and')} (${yr}${pg ? ':' + pg : ''})` : `(${names('and')} ${yr}${pg ? ':' + pg : ''})`;
  if (b === 'unified') return narrative ? `${names('&')} (${yr}${pg ? ': ' + pg : ''})` : `(${names('&')} ${yr}${pg ? ': ' + pg : ''})`;
  return narrative ? `${names('and')} (${yr}${pg ? ', p. ' + pg : ''})` : `(${names('and')} ${yr}${pg ? ', p. ' + pg : ''})`;
}

// The sources in a list, in the order the style wants: by author, or as first cited.
export const orderFor = (list: Source[], style: CiteStyle) => (isNumbered(style) ? list : [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b))));

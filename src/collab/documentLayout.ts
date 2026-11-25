export type PageSize = 'a4' | 'letter' | 'a5';
export type Margins = 'narrow' | 'normal' | 'wide';
export type PageMargins = { top: number; bottom: number; left: number; right: number }; // px at 96 per inch
export type TextStyle = { family?: string | null; pt?: number | null; color?: string | null; bold?: boolean };
export type DocStyles = Partial<Record<'p' | 'h1' | 'h2' | 'h3', TextStyle>>;
export type NumberStyle = 'n' | 'page' | 'of';
export type Align = 'left' | 'center' | 'right';
export type Layout = { headerAlign?: Align; footerAlign?: Align; runBold?: boolean; runItalic?: boolean; runLogo?: boolean; firstDifferent?: boolean; headerFirst?: string; footerFirst?: string; numberStyle?: NumberStyle; numberAlign?: 'left' | 'center' | 'right'; styles?: DocStyles; paged: boolean; size: PageSize; margins: Margins; margin?: PageMargins | null; pageColour?: string; font: string; pt: number; orientation: 'portrait' | 'landscape'; lineSpacing: number; columns: number; header: string; footer: string; pageNumbers: boolean; pageNumberStart: number };
export const LAYOUT_DEFAULT: Layout = { paged: false, size: 'a4', margins: 'normal', font: 'Georgia', pt: 12, orientation: 'portrait', lineSpacing: 1.5, columns: 1, header: '', footer: '', pageNumbers: false, pageNumberStart: 1 };
export const SIZES: Record<PageSize, { label: string; w: number; h: number; css: string }> = {
  a4: { label: 'A4 (21 × 29.7 cm)', w: 794, h: 1123, css: 'A4' },
  letter: { label: 'Letter (8.5 × 11 in)', w: 816, h: 1056, css: 'letter' },
  a5: { label: 'A5 (14.8 × 21 cm)', w: 559, h: 794, css: 'A5' },
};
export const MARGINS: Record<Margins, { label: string; px: number }> = {
  narrow: { label: 'Narrow (1.27 cm)', px: 48 }, normal: { label: 'Normal (2.54 cm)', px: 96 }, wide: { label: 'Wide (3.8 cm)', px: 144 },
};
export function pageMetrics(layout: Layout) {
  const base = SIZES[layout.size] ?? SIZES.a4;
  const m = marginsOf(layout);
  return { ...base, w: layout.orientation === 'landscape' ? base.h : base.w, h: layout.orientation === 'landscape' ? base.w : base.h, margin: m.top, m };
}

// Each side's margin in px: exact margins when set (Page setup), else the preset.
export function marginsOf(layout: Pick<Layout, 'margins' | 'margin'>): PageMargins {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 400;
  const x = layout.margin;
  if (x && ok(x.top) && ok(x.bottom) && ok(x.left) && ok(x.right)) return { top: x.top, bottom: x.bottom, left: x.left, right: x.right };
  const p = (MARGINS[layout.margins] ?? MARGINS.normal).px;
  return { top: p, bottom: p, left: p, right: p };
}
export const PX_PER_CM = 96 / 2.54;
// Page colours that print well and keep text readable.
export const PAGE_COLOURS: { v: string; label: string }[] = [
  { v: '', label: 'White' }, { v: '#fbf7ee', label: 'Cream' }, { v: '#f3f2ef', label: 'Light grey' }, { v: '#eef4fb', label: 'Light blue' },
  { v: '#eef6ef', label: 'Light green' }, { v: '#fdf8e3', label: 'Light yellow' }, { v: '#fbeff1', label: 'Light pink' }, { v: '#f4effa', label: 'Light lilac' },
];

// The document's own paragraph styles (Format > Update Heading 1 to match) as CSS for the text.
const STYLE_TAG: Record<string, string> = { p: 'p', h1: 'h1', h2: 'h2', h3: 'h3' };
export function stylesCss(styles: DocStyles | undefined, scope: string, colour: (c: string) => string = (c) => c, strong = false): string {
  if (!styles) return '';
  return Object.entries(styles).map(([k, st]) => {
    if (!st || !STYLE_TAG[k]) return '';
    const rules = [st.family ? `font-family:'${st.family.replace(/['"\\]/g, '')}',Georgia,serif` : '', st.pt ? `font-size:${Math.max(6, Math.min(96, st.pt))}pt` : '', st.color ? `color:${colour(st.color)}` : '', st.bold === true ? 'font-weight:700' : st.bold === false ? 'font-weight:400' : ''].filter(Boolean).join(';');
    // On screen the document's styles win over the app's own heading sizes.
    return rules ? `${scope} ${STYLE_TAG[k]}{${strong ? rules.split(';').map((r) => r + ' !important').join(';') : rules}}` : '';
  }).join('');
}

// Fields a header or footer can hold: filled in on every page.
export const RUN_FIELDS = [{ k: '{title}', label: 'Title' }, { k: '{date}', label: 'Date' }, { k: '{page}', label: 'Page number' }, { k: '{pages}', label: 'Number of pages' }] as const;
export type RunCtx = { title?: string; date?: string };
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const fillFields = (t: string, ctx: RunCtx, n: number | string, total: number | string) =>
  t.replace(/\{title\}/g, ctx.title ?? '').replace(/\{date\}/g, ctx.date ?? today()).replace(/\{pages\}/g, String(total)).replace(/\{page\}/g, String(n));

// What a page's header and footer say: the first page can have its own; fields filled in; the page
// number in its style; each in its place (left, centre or right).
export function runningOf(layout: Layout, i: number, total: number, ctx: RunCtx = {}) {
  const first = i === 0 && !!layout.firstDifferent;
  const n = i + (layout.pageNumberStart || 1);
  const last = total - 1 + (layout.pageNumberStart || 1);
  const number = !layout.pageNumbers ? '' : layout.numberStyle === 'page' ? `Page ${n}` : layout.numberStyle === 'of' ? `${n} of ${last}` : String(n);
  const header = fillFields(((first ? layout.headerFirst : layout.header) ?? ''), ctx, n, last);
  const footer = fillFields(((first ? layout.footerFirst : layout.footer) ?? ''), ctx, n, last);
  return { header, footer, number, align: layout.numberAlign ?? 'center', headerAlign: layout.headerAlign ?? 'center', footerAlign: layout.footerAlign ?? 'center' };
}
// The footer row's three places: the footer text and the page number, side by side when they share one.
export function footerSlots(r: ReturnType<typeof runningOf>): Record<Align, string> {
  const out: Record<Align, string> = { left: '', center: '', right: '' };
  if (r.footer) out[r.footerAlign] = r.footer;
  if (r.number) out[r.align] = [out[r.align], r.number].filter(Boolean).join(' · ');
  return out;
}
// The page number as print CSS content, for @page margin boxes.
export const numberCss = (layout: Layout) => (layout.numberStyle === 'page' ? '"Page " counter(page)' : layout.numberStyle === 'of' ? 'counter(page) " of " counter(pages)' : 'counter(page)');

// Print CSS for headers, footers and page numbers in the page margins (Chrome and Edge print these).
// Fields become the browser's page counters, so every printed page has the right number.
const cssStr = (t: string) => JSON.stringify(t);
function cssContent(t: string, ctx: RunCtx): string {
  const parts = t.replace(/\{title\}/g, ctx.title ?? '').replace(/\{date\}/g, ctx.date ?? today()).split(/(\{page\}|\{pages\})/).filter(Boolean);
  return parts.map((p) => (p === '{page}' ? 'counter(page)' : p === '{pages}' ? 'counter(pages)' : cssStr(p))).join(' ');
}
export function marginBoxesCss(layout: Layout, ctx: RunCtx = {}): string {
  const font = `font: ${layout.runItalic ? 'italic ' : ''}${layout.runBold ? '700' : '400'} 9pt ${cssStr(layout.font || 'Georgia')}; color: #66615b;`;
  const box = (header: string, footer: string) => {
    const top = (where: Align) => `@top-${where} { content: ${header && (layout.headerAlign ?? 'center') === where ? cssContent(header, ctx) : 'none'}; ${font} }`;
    const side = (where: Align) => {
      const parts = [footer && (layout.footerAlign ?? 'center') === where ? cssContent(footer, ctx) : '', layout.pageNumbers && (layout.numberAlign ?? 'center') === where ? numberCss(layout) : ''].filter(Boolean);
      return `@bottom-${where} { content: ${parts.length ? parts.join(' " · " ') : 'none'}; ${font} }`;
    };
    return `${top('left')} ${top('center')} ${top('right')} ${side('left')} ${side('center')} ${side('right')}`;
  };
  const first = layout.firstDifferent ? `@page:first { ${box(layout.headerFirst ?? '', layout.footerFirst ?? '')} }` : '';
  return `@page { ${box(layout.header ?? '', layout.footer ?? '')} } ${first}`;
}

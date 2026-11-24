export type PageSize = 'a4' | 'letter' | 'a5';
export type Margins = 'narrow' | 'normal' | 'wide';
export type PageMargins = { top: number; bottom: number; left: number; right: number }; // px at 96 per inch
export type TextStyle = { family?: string | null; pt?: number | null; color?: string | null; bold?: boolean };
export type DocStyles = Partial<Record<'p' | 'h1' | 'h2' | 'h3', TextStyle>>;
export type NumberStyle = 'n' | 'page' | 'of';
export type Layout = { firstDifferent?: boolean; headerFirst?: string; footerFirst?: string; numberStyle?: NumberStyle; numberAlign?: 'left' | 'center' | 'right'; styles?: DocStyles; paged: boolean; size: PageSize; margins: Margins; margin?: PageMargins | null; pageColour?: string; font: string; pt: number; orientation: 'portrait' | 'landscape'; lineSpacing: number; columns: number; header: string; footer: string; pageNumbers: boolean; pageNumberStart: number };
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

// What a page's header and footer say: the first page can have its own; the page number in its style.
export function runningOf(layout: Layout, i: number, total: number) {
  const first = i === 0 && !!layout.firstDifferent;
  const n = i + (layout.pageNumberStart || 1);
  const last = total - 1 + (layout.pageNumberStart || 1);
  const number = !layout.pageNumbers ? '' : layout.numberStyle === 'page' ? `Page ${n}` : layout.numberStyle === 'of' ? `${n} of ${last}` : String(n);
  return { header: (first ? layout.headerFirst : layout.header) ?? '', footer: (first ? layout.footerFirst : layout.footer) ?? '', number, align: layout.numberAlign ?? 'center' };
}
// The page number as print CSS content, for @page margin boxes.
export const numberCss = (layout: Layout) => (layout.numberStyle === 'page' ? '"Page " counter(page)' : layout.numberStyle === 'of' ? 'counter(page) " of " counter(pages)' : 'counter(page)');

// Print CSS for headers, footers and page numbers in the page margins (Chrome and Edge print these).
const cssStr = (t: string) => JSON.stringify(t);
export function marginBoxesCss(layout: Layout): string {
  const box = (header: string, footer: string) => {
    const side = (where: 'left' | 'center' | 'right') => {
      const parts = [where === 'center' && footer ? cssStr(footer) : '', layout.pageNumbers && (layout.numberAlign ?? 'center') === where ? numberCss(layout) : ''].filter(Boolean);
      return parts.length ? `@bottom-${where} { content: ${parts.join(' " · " ')}; }` : `@bottom-${where} { content: none; }`;
    };
    return `@top-center { content: ${header ? cssStr(header) : 'none'}; } ${side('left')} ${side('center')} ${side('right')}`;
  };
  const first = layout.firstDifferent ? `@page:first { ${box(layout.headerFirst ?? '', layout.footerFirst ?? '')} }` : '';
  return `@page { ${box(layout.header ?? '', layout.footer ?? '')} } ${first}`;
}

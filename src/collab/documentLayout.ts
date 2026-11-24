export type PageSize = 'a4' | 'letter' | 'a5';
export type Margins = 'narrow' | 'normal' | 'wide';
export type PageMargins = { top: number; bottom: number; left: number; right: number }; // px at 96 per inch
export type Layout = { paged: boolean; size: PageSize; margins: Margins; margin?: PageMargins | null; pageColour?: string; font: string; pt: number; orientation: 'portrait' | 'landscape'; lineSpacing: number; columns: number; header: string; footer: string; pageNumbers: boolean; pageNumberStart: number };
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

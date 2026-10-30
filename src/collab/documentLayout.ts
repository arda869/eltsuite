export type PageSize = 'a4' | 'letter' | 'a5';
export type Margins = 'narrow' | 'normal' | 'wide';
export type Layout = { paged: boolean; size: PageSize; margins: Margins; font: string; pt: number; orientation: 'portrait' | 'landscape'; lineSpacing: number; columns: number; header: string; footer: string; pageNumbers: boolean; pageNumberStart: number };
export const LAYOUT_DEFAULT: Layout = { paged: true, size: 'a4', margins: 'normal', font: 'Georgia', pt: 12, orientation: 'portrait', lineSpacing: 1.5, columns: 1, header: '', footer: '', pageNumbers: false, pageNumberStart: 1 };
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
  return { ...base, w: layout.orientation === 'landscape' ? base.h : base.w, h: layout.orientation === 'landscape' ? base.w : base.h, margin: (MARGINS[layout.margins] ?? MARGINS.normal).px };
}

// The colours every drawn picture uses: ink, five greys and one accent. Inside a Sketch the greys
// become hatching patterns (see art.tsx); outside, the plain colour. Keeping them in one place means
// a new person, thing or backdrop cannot drift from the house style.
export const INK = '#262420';
export const G0 = '#ffffff';
export const G1 = '#ffffff';
export const G2 = 'var(--sb-g2, #e4e1dc)';
export const G3 = 'var(--sb-g3, #c9c5be)';
export const G4 = 'var(--sb-g4, #9a958e)';
export const G5 = 'var(--sb-g5, #4a4641)';
export const A = 'color-mix(in srgb, var(--sb-accent, #d98f63) 52%, white)';
export const A_LIGHT = 'color-mix(in srgb, var(--sb-accent, #d98f63) 26%, white)';
export const A_DARK = 'var(--sb-ad, color-mix(in srgb, var(--sb-accent, #d98f63) 72%, black))';
export const C = { G0, G1, G2, G3, G4, G5, A, A_LIGHT, A_DARK };
export type Col = keyof typeof C;
// The pen every picture is drawn with.
export const S = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

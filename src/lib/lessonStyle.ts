// Presentation only. Missing or unrecognised values keep the existing Adult view.
export type LessonStyle = 'adult' | 'young';
export const lessonStyleOf = (c?: { lessonStyle?: unknown } | null): LessonStyle => c?.lessonStyle === 'young' ? 'young' : 'adult';

// Local files also work inside print windows and the PDF capture frame.
export function lessonFonts(origin = '') {
  return `@font-face { font-family: 'Lesson IPA'; src: url('${origin}/fonts/noto/noto-sans-latin-ext-400-normal.woff2') format('woff2'); unicode-range: U+0100-02FF,U+1D00-1DBF,U+1E00-1EFF; font-display: block; }
@font-face { font-family: 'Lesson IPA'; src: url('${origin}/fonts/noto/noto-sans-latin-400-normal.woff2') format('woff2'); unicode-range: U+0000-00FF; font-display: block; }
@font-face { font-family: 'Atkinson Hyperlegible'; src: url('${origin}/fonts/atkinson/Regular.ttf') format('truetype'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Atkinson Hyperlegible'; src: url('${origin}/fonts/atkinson/Bold.ttf') format('truetype'); font-weight: 700; font-display: block; }
@font-face { font-family: 'Atkinson Hyperlegible'; src: url('${origin}/fonts/atkinson/Italic.ttf') format('truetype'); font-weight: 400; font-style: italic; font-display: block; }
@font-face { font-family: Kalam; src: url('${origin}/fonts/kalam/kalam-latin-400-normal.woff2') format('woff2'); font-weight: 400; font-display: block; }`;
}

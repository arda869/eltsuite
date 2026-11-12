import type { LessonStyle } from './lessonStyle';

// These rules are shared by the on-screen worksheet preview and the print window.
// The print engine isolates each preview piece in a shadow root, so selectors here
// deliberately target the worksheet markup directly.
export function themeWorksheetCss(style: LessonStyle | undefined) {
  if (style === 'exam') return `
    .unit { font-family: Arial, sans-serif; }
    .ex-head .ex-text { font: 400 10.2pt/1.45 Arial, sans-serif; }
    .qn, .ex-n, .ml { color: #111 !important; }
    .blank { border-bottom: .8pt dotted #111 !important; min-width: 22mm; }
    .ex-body p { line-height: 2; }
    .m-ans { display: inline-block; flex: none; width: 9mm; height: 6.5mm; border: .7pt solid #111; border-bottom-width: .7pt; vertical-align: middle; margin-left: 2.4mm; }
    .ws-box .tbox:is(.s-info, .s-box, .s-email, .s-browser, .s-paper, .s-sticky), .callout, .sortcol, .dgw-c, .wordbox { background: #fff !important; border: .7pt solid #111 !important; border-radius: 0 !important; box-shadow: none !important; transform: none !important; }
    .wordbox span { border: 0 !important; background: none !important; }
    .kw.stem { font: 700 9.6pt Arial, sans-serif; letter-spacing: .04em; }
    .lgp-w i, .lgp-w b { display: inline-flex !important; align-items: center; justify-content: center; font: 700 9pt Arial, sans-serif; text-transform: uppercase; border: .7pt solid #111 !important; border-radius: 0 !important; margin-left: -.7pt !important; width: 5.4mm !important; height: 6.4mm !important; }
  `;
  if (style === 'teen') return `
    .unit, .unit * { font-family: Karla, sans-serif !important; }
    .ex-n { background: #1d1b19; color: #fff; border-radius: 1.2mm; padding: 0 1.4mm; }
    .ex-text, .qn { font-weight: 800; }
    .qn { color: #1d1b19; }
    .blank { border-bottom: 1.2pt solid #1d1b19; }
    .ws-box .tbox:is(.s-info, .s-box, .s-email, .s-browser, .s-paper, .s-sticky), .callout, .sortcol, .dgw-c { border: 1.2pt solid #1d1b19 !important; border-radius: 2.4mm !important; box-shadow: .9mm .9mm 0 #1d1b19 !important; background: #fff !important; transform: none !important; }
    .wordbox span { border: 1pt solid #1d1b19; border-radius: 1.4mm; }
    .tbox-title { display: inline-block; width: fit-content; background: #ffe26a; padding: 0 1.6mm; border-radius: .8mm; }
  `;
  return '';
}

// Question numbering, the same for every question type, printed and in the worksheet view. It comes
// last, after the theme, so nothing else changes it. Three levels, each quieter than the one above:
// the exercise number, then the question number (bold, before its gap, sentence or row), then the
// letters of options (a, b, c), lighter and in grey.
export function numberingCss(style: LessonStyle | undefined) {
  const exam = style === 'exam';
  const teen = style === 'teen';
  const face = exam ? 'Arial, sans-serif' : 'Karla, sans-serif';
  const ink = exam || teen ? '#111' : 'var(--accent-ink)';
  return `
    .qn { display: inline-block; min-width: 0; margin: 0 1.3mm 0 .3mm; padding: 0; background: none; border: 0; font: ${exam || teen ? 800 : 700} ${exam ? '1em' : '.88em'} ${face}; color: ${ink}; vertical-align: baseline; }
    .qn::before, .qn::after { content: none; }
    .ml { display: inline-block; min-width: 3.6mm; margin-right: 1mm; font: ${exam ? 400 : 600} ${exam ? '1em' : '.86em'} ${face}; color: var(--muted); }
    .li { align-items: baseline; }
    .li.label .mk { min-width: 4.6mm; font: ${exam || teen ? 800 : 700} ${exam ? '1em' : '.88em'} ${face}; color: ${ink}; }
    .stack { margin-left: 5.2mm; }
    .kw.stem { float: none; margin: 0 0 0 1.4mm; }
    .match { grid-template-columns: fit-content(56%) 1fr; column-gap: 10mm; }
    .m-l { gap: 0; }
    .m-l .qn { min-width: 4.2mm; }
    .m-l { align-items: ${exam ? 'center' : 'baseline'}; }
    .m-ans { flex: none; width: 9mm; max-width: none; margin-left: auto; }
    .m-l .m-t { padding-right: 2.6mm; }
  `;
}

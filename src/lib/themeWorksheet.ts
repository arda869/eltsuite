import type { LessonStyle } from './lessonStyle';

// These rules are shared by the on-screen worksheet preview and the print window.
// The print engine isolates each preview piece in a shadow root, so selectors here
// deliberately target the worksheet markup directly.
export function themeWorksheetCss(style: LessonStyle | undefined) {
  if (style === 'exam') return `
    .unit { font-family: Arial, sans-serif; }
    .ex-head .ex-text { font: 400 10.2pt/1.45 Arial, sans-serif; }
    .qn, .ex-n, .ml { color: #111 !important; }
    .qn::before { content: '('; font-weight: 700; }
    .qn::after { content: ')'; font-weight: 700; }
    .match .m-l .qn::before, .match .m-l .qn::after { content: none; }
    .match .m-l .qn { display: inline-flex; justify-content: center; align-items: center; min-width: 6.5mm; height: 6.5mm; background: #d4d4d4; }
    .blank { border-bottom: .8pt dotted #111 !important; min-width: 22mm; }
    .ex-body p { line-height: 2; }
    .m-ans { display: inline-block; width: 9mm; height: 6.5mm; border: .7pt solid #111; vertical-align: middle; margin-left: 2mm; }
    .ws-box .tbox:is(.s-info, .s-box, .s-email, .s-browser, .s-paper, .s-sticky), .callout, .sortcol, .dgw-c, .wordbox { background: #fff !important; border: .7pt solid #111 !important; border-radius: 0 !important; box-shadow: none !important; transform: none !important; }
    .wordbox span { border: 0 !important; background: none !important; }
    .kw.stem { float: right; font: 700 9.6pt Arial, sans-serif; letter-spacing: .04em; }
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

import { lessonFonts } from './lessonStyle';

// Added after the Adult stylesheet only for Young learner exports and worksheet preview.
// Diagram, picture, pronunciation and authored run styles retain their existing rules.
export function youngSheetCss(origin = '') {
  return `${lessonFonts(origin)}
.ipa, .cols .ipa { font-family: 'Lesson IPA', 'Noto Sans', sans-serif !important; }
.unit { --serif: 'Atkinson Hyperlegible', Verdana, sans-serif; font-family: var(--serif); }
.page { --serif: 'Atkinson Hyperlegible', Verdana, sans-serif; --sans: Karla, sans-serif; font-family: var(--serif); }
.band { background: color-mix(in srgb, var(--accent) 12%, #fff); --band: color-mix(in srgb, var(--accent) 12%, #fff); }
.ex-head { font-family: Karla, sans-serif; font-weight: 800; gap: 3mm; margin-bottom: 2.6mm; align-items: center; }
.ex-n { display: inline-grid; place-items: center; flex: none; width: 8mm; height: 8mm; min-width: 8mm; border-radius: 50%; background: var(--accent-ink); color: #fff; font: 800 11pt/1 Karla, sans-serif; }
.ex-text { min-width: 0; }
.ex-task-icon { --yl-sky: #8ccbef; --yl-sky-ink: #2f7fb5; --yl-leaf: #9fd6ab; --yl-leaf-ink: #2f8a55; --yl-sun: #f6c34f; --yl-rose: #f4aab0; --yl-lilac: #c3b2ef; --yl-art-paper: #fff; display: inline-grid; place-items: center; width: 8mm; height: 8mm; margin: 0 2mm 0 0; vertical-align: middle; border: .6pt solid var(--accent); border-radius: 2.5mm; background: var(--tint); color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ex-task-icon svg { display: block; width: 7mm; height: 7mm; }
.ex-cont { font: 600 8pt/1.3 Karla, sans-serif; color: #6f6a64; white-space: nowrap; }
.ex-body { padding-left: 11mm; }
.col { display: flow-root; }
.callout, .tbox.s-info, .tbox.s-box, .tbox.s-email, .tbox.s-browser { background: var(--tint); border-color: var(--accent); }
.tbox.s-email .tbox-body, .tbox.s-browser .tbox-body { background: #fff; }
.tbox.s-sticky { position: relative; transform: none; border: 1pt solid var(--accent); background: var(--tint); border-radius: 4mm; box-shadow: none; }
.tbox.s-sticky .tbox-body { font-family: Kalam, 'Atkinson Hyperlegible', sans-serif; }
.tbox.s-sticky .tbox-title { color: var(--accent-ink); }
.tbox.s-sticky::after { content: none; }
.tbox.s-speech { padding-bottom: 3mm; }
.tbox.s-speech .bubble { position: relative; background: var(--tint); border: .8pt solid var(--accent); border-radius: 4mm; overflow-wrap: anywhere; }
.tbox.s-speech .bubble::after { content: ''; position: absolute; left: 6mm; bottom: -1.6mm; width: 3mm; height: 3mm; border: 0; border-right: .8pt solid var(--accent); border-bottom: .8pt solid var(--accent); background: var(--tint); transform: rotate(45deg); }
.tbox.s-speech.side-right .bubble::after { left: auto; right: 6mm; }
.wordbox { border-radius: 1mm; background: var(--tint); border-color: var(--accent); }
.wordbox span { border-radius: .5mm; }
.pn { border-radius: 2mm 0 0 0; }
.kicker { border-bottom: 1pt solid var(--accent); padding-bottom: 1mm; }
`;
}

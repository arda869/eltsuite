import { lessonFonts } from './lessonStyle';

// Added after the Adult stylesheet only for Young learner exports and worksheet preview.
// Diagram, picture, pronunciation and authored run styles retain their existing rules.
export function youngSheetCss(origin = '') {
  return `${lessonFonts(origin)}
.ipa, .cols .ipa { font-family: 'Lesson IPA', 'Noto Sans', sans-serif !important; }
.unit { --serif: 'Atkinson Hyperlegible', Verdana, sans-serif; font-family: var(--serif); }
.page { --serif: 'Atkinson Hyperlegible', Verdana, sans-serif; --sans: Karla, sans-serif; font-family: var(--serif); }
.band { background: color-mix(in srgb, var(--accent) 12%, #fff); --band: color-mix(in srgb, var(--accent) 12%, #fff); }
.ex-head { font-family: Karla, sans-serif; font-weight: 800; gap: 3mm; margin-bottom: 2.6mm; }
.ex-n { font: 800 1.3em/1 Karla, sans-serif; color: var(--accent-ink); }
.ex-text { min-width: 0; }
.col { display: flow-root; }
.callout, .tbox.s-info, .tbox.s-box, .tbox.s-email, .tbox.s-browser { background: var(--tint); border-color: var(--accent); }
.tbox.s-email .tbox-body, .tbox.s-browser .tbox-body { background: #fff; }
.tbox.s-sticky { position: relative; transform: none; border: 1pt solid var(--accent); background: var(--tint); border-radius: 2mm 2mm 7mm 2mm; box-shadow: none; }
.tbox.s-sticky .tbox-body { font-family: Kalam, 'Atkinson Hyperlegible', sans-serif; }
.tbox.s-sticky .tbox-title { color: var(--accent-ink); }
.tbox.s-sticky::after { content: ''; position: absolute; right: 1mm; bottom: 1mm; width: 6mm; height: 4mm; border-radius: 0 0 6mm 0; border-right: .6pt solid var(--accent); background: #fff; }
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

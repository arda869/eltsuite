// Shared by the paged editor, print window and PDF capture.
// A clean exam-paper look inspired by the references, without changing authored questions.
export function examSheetCss() {
  return `
:root { --accent: #0755a4; --accent-ink: #073f7e; --accent-text: #073f7e; --tint: #eef5fe; --tint-line: #9ebbdc; --ink: #17202b; --muted: #4b5563; --band: #fff; }
body, .page, .unit, .unit .mail, .unit .mail *, .unit .bubble, .unit .bubble *, .unit .tbox, .unit .tbox *, .unit .rich, .unit .rich * { font-family: Karla, Arial, sans-serif; }
.unit .ipa, .unit .ipa * { font-family: 'Lesson IPA', Karla, Arial, sans-serif; }
.page { color: var(--ink); }
.band { background: #fff; border-bottom: 1.2pt solid var(--accent); }
.band-cover { display: none; }
.band-cover::after { content: none; }
.namebox { border: .7pt solid #9ebbdc; color: var(--accent-ink); }
.namebox.empty { border: 0; }
h1 { color: var(--accent-ink); font-family: Karla, Arial, sans-serif; font-weight: 800; }
.brand { background: #fff; }
.kicker { color: var(--accent-ink); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.section h2 { color: var(--accent-ink); letter-spacing: .12em; }
.section h2::after { background: var(--accent); opacity: .42; }
.ex-head { align-items: baseline; gap: 3mm; margin-bottom: 2.3mm; font-family: Karla, Arial, sans-serif; font-weight: 700; }
.ex-n { min-width: 6mm; color: var(--accent-ink); font: 800 1.08em Karla, Arial, sans-serif; }
.ex-text { font-style: italic; }
.ex-body { padding-left: 9mm; }
.ex-body :is(p, .li, .subex-b) { line-height: 1.48; }
.qn { min-width: 4.2mm; color: var(--accent-ink); font: 800 1em Karla, Arial, sans-serif; }
.ml, .subex-l, .subex-n, .sortcol-h { color: var(--accent-ink); font-weight: 800; }
.blank { border-bottom: .8pt dotted var(--accent-ink); }
.opts { font-style: normal; }
.callout, .sortcol, .dgw-c, .k-cline .dgw-c { background: #eef5fe; border: .7pt solid #9ebbdc; border-radius: 0; }
.callout { border-left: 2pt solid var(--accent); }
.unit .tbox.s-sticky { background: #eef5fe; border-left: 2pt solid var(--accent); box-shadow: none; }
.callout .c-label, .dgw-t, .dgw-l { color: var(--accent-ink); }
.wordbox span, .kw { border-color: var(--accent-ink); border-radius: 0; }
.markbox, .total > span:first-child { border-color: var(--accent-ink); }
.mb-max, .total .mb-max { background: var(--accent-ink); }
.pn { background: var(--accent-ink); border-radius: 0; }
`;
}

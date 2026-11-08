// Shared by the paged editor, print window and PDF capture.
// A clean exam-paper look inspired by the references, without changing authored questions.
export function examSheetCss() {
  return `
:root { --ink: #17202b; --muted: #4b5563; }
.unit, .unit * { font-family: Arial, sans-serif !important; }
.page { color: var(--ink); }
.section h2 { color: var(--accent-ink); letter-spacing: .12em; }
.section h2::after { background: var(--accent); opacity: .42; }
.ex-head { align-items: baseline; gap: 3mm; margin-bottom: 2.3mm; font-family: Arial, sans-serif; font-weight: 700; }
.ex-n { min-width: 6mm; color: var(--accent-ink); font: 800 1.08em Arial, sans-serif; }
.ex-text { font-style: normal; }
.ex-body { padding-left: 9mm; }
.ex-body :is(p, .li, .subex-b) { line-height: 1.48; }
.qn { min-width: 4.2mm; color: var(--accent-ink); font: 800 1em Arial, sans-serif; }
.ml, .subex-l, .subex-n, .sortcol-h { color: var(--accent-ink); font-weight: 800; }
.blank { border-bottom: .8pt dotted var(--accent-ink); }
.opts { font-style: normal; }
.callout, .sortcol, .dgw-c, .k-cline .dgw-c { background: var(--tint); border: .7pt solid var(--tint-line); border-radius: 0; }
.callout { border-left: 2pt solid var(--accent); }
.unit .ws-box .tbox.s-paper { background: var(--tint); border: .8pt solid var(--tint-line); border-left: 2pt solid var(--accent); border-radius: 0; box-shadow: none; clip-path: none; transform: none; color: var(--ink); }
.unit .ws-box .paper-wrap { filter: none; }
.unit .tbox.s-sticky { background: var(--tint); border-left: 2pt solid var(--accent); box-shadow: none; }
.callout .c-label, .dgw-t, .dgw-l { color: var(--accent-ink); }
.wordbox span, .kw { border-color: var(--accent-ink); border-radius: 0; }
.markbox, .total > span:first-child { border-color: var(--accent-ink); }
.mb-max, .total .mb-max { background: var(--accent-ink); }
.pn { background: var(--accent-ink); border-radius: 0; }
`;
}

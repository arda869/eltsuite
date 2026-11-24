import { useEffect, useRef, useState } from 'react';
import { MARGINS, PAGE_COLOURS, PX_PER_CM, SIZES, marginsOf, type Layout, type PageMargins, type PageSize } from './documentLayout';
import { NSelect } from '../components/Select';

const FONTS = ['Georgia', 'Times New Roman', 'Arial', 'Calibri', 'Verdana', 'Trebuchet MS', 'Garamond', 'Courier New', 'Comic Sans MS', 'Helvetica', 'Palatino', 'Book Antiqua', 'Tahoma', 'Cambria', 'Candara', 'Consolas', 'system-ui'];
const DEFAULT_KEY = 'cd.pageDefault';
type Unit = 'cm' | 'in';
const SIDES: (keyof PageMargins)[] = ['top', 'bottom', 'left', 'right'];
const SIDE_LABEL: Record<keyof PageMargins, string> = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };

// Your default page setup on this device, used for documents that have none yet.
export function savedPageDefault(): Partial<Layout> | null {
  try { const v = JSON.parse(localStorage.getItem(DEFAULT_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

// Page setup, as in Google Docs: Pages or Pageless; orientation, paper size and page colour;
// exact margins on each side, in centimetres or inches; and the text and header defaults.
// Nothing changes until OK.
export function PageSetupDialog({ layout, onApply, onClose }: { layout: Layout; onApply: (p: Partial<Layout>) => void; onClose: () => void }) {
  const [d, setD] = useState<Layout>(() => ({ ...layout, margin: marginsOf(layout) }));
  const [unit, setUnit] = useState<Unit>(() => { try { return localStorage.getItem('cd.marginUnit') === 'in' ? 'in' : 'cm'; } catch { return 'cm'; } });
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const set = (p: Partial<Layout>) => (setD((x) => ({ ...x, ...p })), setSaved(false));
  const per = unit === 'cm' ? PX_PER_CM : 96;
  const show = (px: number) => String(Math.round((px / per) * 100) / 100);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(SIDES.map((k) => [k, show(marginsOf(layout)[k])])));
  useEffect(() => { setTexts(Object.fromEntries(SIDES.map((k) => [k, show(d.margin![k])]))); }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = SIZES[d.size] ?? SIZES.a4;
  const width = d.orientation === 'landscape' ? page.h : page.w, height = d.orientation === 'landscape' ? page.w : page.h;
  const setSide = (k: keyof PageMargins, v: string) => {
    setTexts((t) => ({ ...t, [k]: v }));
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    set({ margin: { ...d.margin!, [k]: Math.min(n * per, (k === 'top' || k === 'bottom' ? height : width) / 2 - 24) } });
  };
  const preset = (k: keyof typeof MARGINS) => { const px = MARGINS[k].px; set({ margins: k, margin: { top: px, bottom: px, left: px, right: px } }); setTexts(Object.fromEntries(SIDES.map((s) => [s, show(px)]))); };
  const tooBig = d.margin!.left + d.margin!.right > width - 96 || d.margin!.top + d.margin!.bottom > height - 96;
  const ok = () => {
    if (tooBig) return;
    try { localStorage.setItem('cd.marginUnit', unit); } catch { /* fine */ }
    const changes = Object.fromEntries(Object.entries(d).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((layout as Record<string, unknown>)[k]))) as Partial<Layout>;
    if (Object.keys(changes).length) onApply(changes);
    onClose();
  };
  const saveDefault = () => {
    const { header: _h, footer: _f, ...rest } = d;
    void _h; void _f;
    try { localStorage.setItem(DEFAULT_KEY, JSON.stringify(rest)); setSaved(true); } catch { /* fine */ }
  };
  // The little page in the corner shows the margins and colour as you change them.
  const scale = 84 / Math.max(width, height);
  return (
    <dialog ref={ref} className="ps-dialog" aria-labelledby="ps-title" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <form className="ps-form" onSubmit={(e) => (e.preventDefault(), ok())}>
        <h2 id="ps-title">Page setup</h2>
        <div className="ps-tabs" role="tablist" aria-label="Layout">
          <button type="button" role="tab" aria-selected={d.paged} className={d.paged ? 'on' : ''} onClick={() => set({ paged: true })}>Pages</button>
          <button type="button" role="tab" aria-selected={!d.paged} className={!d.paged ? 'on' : ''} onClick={() => set({ paged: false })}>Pageless</button>
        </div>
        {d.paged ? (
          <div className="ps-body">
            <div className="ps-row ps-top">
              <fieldset className="ps-field">
                <legend>Orientation</legend>
                <label className="ps-radio"><input type="radio" name="ps-orient" checked={d.orientation === 'portrait'} onChange={() => set({ orientation: 'portrait' })} />Portrait</label>
                <label className="ps-radio"><input type="radio" name="ps-orient" checked={d.orientation === 'landscape'} onChange={() => set({ orientation: 'landscape' })} />Landscape</label>
              </fieldset>
              <div className="ps-mini" aria-hidden="true" style={{ width: width * scale, height: height * scale, background: d.pageColour || '#fff' }}>
                <i style={{ top: d.margin!.top * scale, bottom: d.margin!.bottom * scale, left: d.margin!.left * scale, right: d.margin!.right * scale }} />
              </div>
            </div>
            <div className="ps-row">
              <label className="ps-field ps-grow"><span>Paper size</span>
                <NSelect className="ps-sel" aria-label="Paper size" value={d.size} onChange={(e) => set({ size: e.target.value as PageSize })}>
                  {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NSelect>
              </label>
              <div className="ps-field"><span id="ps-colour">Page colour</span>
                <div className="ps-colours" role="radiogroup" aria-labelledby="ps-colour">
                  {PAGE_COLOURS.map((c) => <button key={c.label} type="button" role="radio" aria-checked={(d.pageColour || '') === c.v} aria-label={c.label} title={c.label} className={'ps-swatch' + ((d.pageColour || '') === c.v ? ' on' : '')} style={{ background: c.v || '#fff' }} onClick={() => set({ pageColour: c.v })} />)}
                </div>
              </div>
            </div>
            <fieldset className="ps-field ps-margins">
              <legend>Margins <span className="ps-units" role="radiogroup" aria-label="Units">{(['cm', 'in'] as Unit[]).map((u) => <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>{u === 'cm' ? 'Centimetres' : 'Inches'}</button>)}</span></legend>
              <div className="ps-sides">
                {SIDES.map((k) => (
                  <label key={k} className="ps-side"><span>{SIDE_LABEL[k]}</span><input className="ps-num" inputMode="decimal" value={texts[k] ?? ''} aria-label={`${SIDE_LABEL[k]} margin in ${unit === 'cm' ? 'centimetres' : 'inches'}`} onChange={(e) => setSide(k, e.target.value)} /></label>
                ))}
              </div>
              <div className="ps-presets">{(Object.keys(MARGINS) as (keyof typeof MARGINS)[]).map((k) => <button key={k} type="button" className="ps-chip" onClick={() => preset(k)}>{MARGINS[k].label}</button>)}</div>
              {tooBig && <p className="ps-error" role="alert">These margins leave too little room for text. Make them smaller.</p>}
            </fieldset>
            <details className="ps-more">
              <summary>Text, header and footer</summary>
              <div className="ps-grid">
                <label className="ps-field"><span>Font</span><NSelect className="ps-sel" aria-label="Default font" value={d.font} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</NSelect></label>
                <label className="ps-field"><span>Size</span><NSelect className="ps-sel" aria-label="Default font size" value={d.pt} onChange={(e) => set({ pt: Number(e.target.value) })}>{[9, 10, 11, 12, 14, 16, 18].map((n) => <option key={n} value={n}>{n} pt</option>)}</NSelect></label>
                <label className="ps-field"><span>Line spacing</span><NSelect className="ps-sel" aria-label="Line spacing" value={d.lineSpacing} onChange={(e) => set({ lineSpacing: Number(e.target.value) })}>{[1, 1.15, 1.5, 2, 2.5, 3].map((n) => <option key={n} value={n}>{n === 1 ? 'Single' : n === 2 ? 'Double' : String(n)}</option>)}</NSelect></label>
                <label className="ps-field"><span>Columns</span><NSelect className="ps-sel" aria-label="Document columns" value={d.columns} onChange={(e) => set({ columns: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</NSelect></label>
                <label className="ps-field ps-wide"><span>Header</span><input className="ps-text" maxLength={160} value={d.header} onChange={(e) => set({ header: e.target.value })} placeholder="For example: Unit 4 · B1" /></label>
                <label className="ps-field ps-wide"><span>Footer</span><input className="ps-text" maxLength={160} value={d.footer} onChange={(e) => set({ footer: e.target.value })} /></label>
                <label className="ps-check"><input type="checkbox" checked={d.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} />Page numbers</label>
                {d.pageNumbers && <label className="ps-field"><span>Start at</span><input className="ps-num" type="number" min={1} max={9999} value={d.pageNumberStart} onChange={(e) => set({ pageNumberStart: Math.max(1, Math.min(9999, Number(e.target.value) || 1)) })} /></label>}
              </div>
            </details>
          </div>
        ) : (
          <div className="ps-body ps-pageless">
            <p>One long page that fits your screen, with no page breaks. Pictures and tables can be as wide as the window.</p>
            <p className="ps-note">Switch to Pages to set the paper size, margins, a page colour, headers and footers. Printing and PDFs always use pages.</p>
          </div>
        )}
        <footer className="ps-foot">
          <button type="button" className="btn ps-default" onClick={saveDefault} disabled={tooBig}>{saved ? 'Saved as default' : 'Set as default'}</button>
          <span className="ps-foot-r">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={tooBig}>OK</button>
          </span>
        </footer>
      </form>
    </dialog>
  );
}

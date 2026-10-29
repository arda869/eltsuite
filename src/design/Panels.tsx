import { useEffect, useRef, useState, type ReactNode } from 'react';
import { openMenuAt } from '../components/ContextMenu';
import type { Ctx } from './Editor';
import { FONTS, MM, SIZES, SWATCHES, ensureFont, type El, type Fx } from './model';
import { isLine, textHeight } from './render';
import { nameOf } from './Drawers';

// The settings for what's selected, or for the page when nothing is.

function Sec({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [o, setO] = useState(open);
  return (
    <section className={'dz-sec' + (o ? '' : ' shut')}>
      <button type="button" className="dz-sec-h" onClick={() => setO(!o)} aria-expanded={o}>
        {title}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {o && <div className="dz-sec-b">{children}</div>}
    </section>
  );
}

function Num({ label, value, onChange, step = 1, min, max, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  const [v, setV] = useState(String(Math.round(value * 10) / 10));
  useEffect(() => setV(String(Math.round(value * 10) / 10)), [value]);
  const start = useRef<{ x: number; v: number } | null>(null);
  const done = (s: string) => {
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n)) return setV(String(value));
    onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)));
  };
  return (
    <label className="dz-num">
      <span
        className="dz-num-l"
        onPointerDown={(e) => ((start.current = { x: e.clientX, v: value }), (e.target as HTMLElement).setPointerCapture(e.pointerId))}
        onPointerMove={(e) => start.current && onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Math.round((start.current.v + (e.clientX - start.current.x) * step) * 10) / 10)))}
        onPointerUp={() => (start.current = null)}
        title="Drag to change"
      >
        {label}
      </span>
      <input value={v} inputMode="decimal" onChange={(e) => setV(e.target.value)} onBlur={(e) => done(e.target.value)} onKeyDown={(e) => {
        if (e.key === 'Enter') done((e.target as HTMLInputElement).value);
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))));
        }
      }} aria-label={label} />
      {unit && <em>{unit}</em>}
    </label>
  );
}

function Slider({ label, value, min, max, onChange, fmt }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="dz-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(min < 0 ? 0 : min)} />
      <output>{fmt ? fmt(value) : Math.round(value)}</output>
    </label>
  );
}

export function Colour({ label, value, onChange, accent, none }: { label: string; value?: string; onChange: (c: string) => void; accent: string; none?: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try {
      onChange((await new ED().open()).sRGBHex);
    } catch {
      /* closed */
    }
  };
  const v = value ?? 'none';
  return (
    <div className="dz-col">
      <button type="button" className="dz-col-b" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={'dz-col-sw' + (v === 'none' ? ' none' : '')} style={{ background: v === 'none' ? undefined : v }} />
        <span>{label}</span>
      </button>
      {open && (
        <div className="dz-col-pop">
          <div className="dz-sw">
            {none && <button type="button" className={'none' + (v === 'none' ? ' on' : '')} onClick={() => onChange('none')} aria-label="No colour" />}
            <button type="button" className={v === accent ? 'on acc' : 'acc'} style={{ background: accent }} onClick={() => onChange(accent)} aria-label="The accent colour" data-tip="The accent colour" />
            {SWATCHES.map((c) => (
              <button key={c} type="button" className={v.toLowerCase() === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
            ))}
          </div>
          <div className="dz-col-row">
            <input type="color" value={v.startsWith('#') && v.length === 7 ? v : '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label="Any colour" />
            <input className="dz-hex" value={v} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value)} aria-label="Colour code" />
            {'EyeDropper' in window && (
              <button type="button" className="dz-ib sm" onClick={() => void pick()} aria-label="Pick a colour from the screen" data-tip="Pick from the screen">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 7 3 3M4 20l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L8 19z" /></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="dz-seg wide" role="radiogroup" aria-label={label}>
      {options.map(([k, n, tip]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)} aria-label={tip} data-tip={tip}>
          {n}
        </button>
      ))}
    </div>
  );
}

const AlIcon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d={d} /></svg>
);

export function Props({ cx }: { cx: Ctx }) {
  const { sel } = cx;
  if (!sel.length) return <PageProps cx={cx} />;
  const one = sel.length === 1 ? sel[0] : null;
  const set = (p: Partial<El>, key = 'props') => {
    const ps: Record<string, Partial<El>> = {};
    for (const e of sel) ps[e.id] = p;
    cx.patch(ps, key);
  };
  const live = (p: Partial<El>, key = 'slider') => {
    const ps: Record<string, Partial<El>> = {};
    for (const e of sel) ps[e.id] = p;
    cx.setLive(ps, 400, key);
  };
  const textual = one && (one.t === 'text' || (one.t === 'shape' && !isLine(one.shape)) || one.t === 'label');
  return (
    <div className="dz-props-in">
      <div className="dz-props-title">
        <strong>{one ? nameOf(one) : `${sel.length} things`}</strong>
        {one?.locked && <em>Locked</em>}
      </div>
      <Sec title="Arrange">
        <div className="dz-align">
          {(
            [
              ['left', 'M4 4v16M8 8h10M8 16h6'],
              ['center', 'M12 4v16M6 8h12M8 16h8'],
              ['right', 'M20 4v16M6 8h10M10 16h6'],
              ['top', 'M4 4h16M8 8v10M16 8v6'],
              ['middle', 'M4 12h16M8 6v12M16 8v8'],
              ['bottom', 'M4 20h16M8 6v10M16 10v6'],
            ] as const
          ).map(([k, d]) => (
            <button key={k} type="button" className="dz-ib" onClick={() => cx.align(k)} aria-label={`Line up ${k}`} data-tip={sel.length === 1 ? `To the page: ${k}` : `Line up: ${k}`}>
              <AlIcon d={d} />
            </button>
          ))}
          {sel.length > 2 && (
            <>
              <button type="button" className="dz-ib" onClick={() => cx.align('hdist')} aria-label="Space evenly across" data-tip="Space evenly across"><AlIcon d="M4 4v16M20 4v16M10 8v8M14 8v8" /></button>
              <button type="button" className="dz-ib" onClick={() => cx.align('vdist')} aria-label="Space evenly down" data-tip="Space evenly down"><AlIcon d="M4 4h16M4 20h16M8 10h8M8 14h8" /></button>
            </>
          )}
        </div>
        {one && one.t !== 'label' && (
          <div className="dz-nums">
            <Num label="X" value={one.x} onChange={(v) => set({ x: v }, 'pos')} />
            <Num label="Y" value={one.y} onChange={(v) => set({ y: v }, 'pos')} />
            <Num label="W" value={one.w} min={4} onChange={(v) => set(one.t === 'text' ? { w: v, h: textHeight(one, v) } : keepR(one) ? { w: v, h: Math.round((v * one.h) / one.w) } : { w: v }, 'size')} />
            <Num label="H" value={one.h} min={4} onChange={(v) => one.t !== 'text' && set(keepR(one) ? { h: v, w: Math.round((v * one.w) / one.h) } : { h: v }, 'size')} />
            <Num label="↻" value={one.rot ?? 0} unit="°" onChange={(v) => set({ rot: ((v % 360) + 360) % 360 }, 'rot')} />
            <div className="dz-flips">
              <button type="button" className={'dz-ib' + (one.flipX ? ' on' : '')} onClick={() => set({ flipX: !one.flipX })} aria-label="Flip across" data-tip="Flip across"><AlIcon d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z" /></button>
              <button type="button" className={'dz-ib' + (one.flipY ? ' on' : '')} onClick={() => set({ flipY: !one.flipY })} aria-label="Flip upside down" data-tip="Flip upside down"><AlIcon d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z" /></button>
            </div>
          </div>
        )}
        <Slider label="See-through" value={Math.round((1 - (one?.opacity ?? 1)) * 100)} min={0} max={95} onChange={(v) => live({ opacity: 1 - v / 100 }, 'opacity')} fmt={(v) => v + '%'} />
        <div className="dz-row">
          <span className="dz-lbl">Who sees it</span>
          <Seg label="Who sees it" value={(one?.ver ?? (sel.every((e) => e.ver === sel[0].ver) ? sel[0].ver : '') ?? '') as '' | 'A' | 'B'} options={[['', 'Both', 'Both learners'], ['A', 'A', 'Only learner A'], ['B', 'B', 'Only learner B']]} onChange={(v) => set({ ver: v || undefined })} />
        </div>
      </Sec>
      {one?.t === 'image' && <PictureProps cx={cx} e={one} set={set} live={live} />}
      {textual && <TextProps cx={cx} e={one!} set={set} live={live} />}
      {one?.t === 'shape' && <ShapeProps cx={cx} e={one} set={set} live={live} />}
      {one?.t === 'path' && (
        <Sec title="Drawing">
          <Colour label="Colour" value={one.color} onChange={(c) => set({ color: c })} accent={cx.accent} />
          <Slider label="Thickness" value={one.sw ?? 6} min={1} max={60} onChange={(v) => live({ sw: v })} />
          <Seg label="Pen" value={one.pen ?? 'pen'} options={[['pen', 'Pen', 'Pen'], ['marker', 'Marker', 'Marker'], ['highlighter', 'Highlighter', 'Highlighter']]} onChange={(v) => set({ pen: v })} />
        </Sec>
      )}
      {one?.t === 'art' && <ArtProps cx={cx} e={one} set={set} />}
      {one?.t === 'label' && (
        <Sec title="Label">
          <Seg label="Point" value={one.pin ?? 'number'} options={[['number', 'Number', 'A numbered point'], ['dot', 'Dot', 'A dot'], ['none', 'Line', 'Just the line']]} onChange={(v) => set({ pin: v })} />
          <Colour label="Line and point" value={one.color && one.color !== '#262420' ? one.color : cx.accent} onChange={(c) => set({ color: c })} accent={cx.accent} />
          <div className="dz-nums">
            <Num label="W" value={one.w} min={40} onChange={(v) => set({ w: v })} />
            <Num label="H" value={one.h} min={24} onChange={(v) => set({ h: v })} />
          </div>
          <p className="hint">Drag the round point onto the thing it names. In the learners’ copy the word becomes a line to write on.</p>
        </Sec>
      )}
      {one?.t === 'cover' && (
        <Sec title="Cover">
          <Seg label="Kind" value={one.mode ?? 'blur'} options={[['blur', 'Blur', 'Blur'], ['pixel', 'Pixels', 'Pixels'], ['solid', 'Cover', 'A plain cover'], ['mystery', '?', 'A mystery card']]} onChange={(v) => set({ mode: v })} />
          {(one.mode ?? 'blur') !== 'solid' && one.mode !== 'mystery' ? <Slider label="Strength" value={one.amount ?? (one.mode === 'pixel' ? 16 : 14)} min={2} max={60} onChange={(v) => live({ amount: v })} /> : <Colour label="Colour" value={one.fill ?? (one.mode === 'mystery' ? cx.accent : '#ecebe7')} onChange={(c) => set({ fill: c })} accent={cx.accent} />}
          <Slider label="Corners" value={one.radius ?? 8} min={0} max={200} onChange={(v) => live({ radius: v })} />
        </Sec>
      )}
      {one?.t === 'wordbank' && (
        <Sec title="Word bank">
          <label className="dz-field">
            <span>Title</span>
            <input value={one.title ?? 'Word bank'} onChange={(e) => live({ title: e.target.value }, 'title')} />
          </label>
          <label className="dz-field">
            <span>More words, with commas</span>
            <textarea rows={2} value={one.text ?? ''} onChange={(e) => live({ text: e.target.value }, 'words')} placeholder="Words to add, like distractors" />
          </label>
          <p className="hint">The words of every label on this page are in the word bank, shuffled.</p>
          <Slider label="Text size" value={one.size ?? 18} min={10} max={40} onChange={(v) => live({ size: v })} />
          <FontPick value={one.font ?? 'Fraunces'} onChange={(f) => set({ font: f })} />
        </Sec>
      )}
      {one?.t === 'qr' && (
        <Sec title="QR code">
          <label className="dz-field">
            <span>The link</span>
            <input value={one.url ?? ''} onChange={(e) => live({ url: e.target.value.trim() }, 'url')} placeholder="https://…" />
          </label>
          <label className="dz-field">
            <span>Under it</span>
            <input value={one.text ?? ''} onChange={(e) => live({ text: e.target.value }, 'cap')} placeholder="Listen" />
          </label>
          <p className="hint">Copy a recording’s link from Recordings, or a video’s from Files.</p>
        </Sec>
      )}
      {one?.t === 'lines' && (
        <Sec title="Writing lines">
          <Slider label="Space between" value={Math.round((one.gap ?? 28) / MM * 10) / 10} min={5} max={20} onChange={(v) => live({ gap: Math.round(v * MM * 10) / 10 })} fmt={(v) => v + ' mm'} />
          <Colour label="Colour" value={one.stroke ?? '#a9a49d'} onChange={(c) => set({ stroke: c })} accent={cx.accent} />
          <Seg label="Line" value={one.dash ?? 'solid'} options={[['solid', 'Line', 'Solid'], ['dash', 'Dashes', 'Dashed'], ['dot', 'Dots', 'Dotted']]} onChange={(v) => set({ dash: v })} />
        </Sec>
      )}
      <div className="dz-props-foot">
        <button type="button" className="btn" onClick={cx.duplicate}>Duplicate</button>
        <button type="button" className="btn danger" onClick={() => cx.remove(sel.map((e) => e.id))}>Delete</button>
      </div>
    </div>
  );
}
const keepR = (e: El) => e.t === 'image' || e.t === 'art' || e.t === 'qr';

function FontPick({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  return (
    <button
      type="button"
      className="dz-font"
      style={{ fontFamily: `"${value}"` }}
      onClick={(e) => {
        FONTS.forEach((f) => void ensureFont(f.f));
        openMenuAt(e.currentTarget, FONTS.map((f) => ({ label: f.f, hint: f.about ?? f.group, icon: value === f.f ? 'check' : '', onClick: () => void ensureFont(f.f).then(() => onChange(f.f)) })));
      }}
    >
      {value}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
  );
}

type SetFn = (p: Partial<El>, key?: string) => void;

function TextProps({ cx, e, set, live }: { cx: Ctx; e: El; set: SetFn; live: SetFn }) {
  const reH = (p: Partial<El>) => (e.t === 'text' ? { ...p, h: textHeight({ ...e, ...p }, e.w) } : p);
  return (
    <Sec title="Text">
      <FontPick value={e.font ?? 'Fraunces'} onChange={(f) => set(reH({ font: f }))} />
      <div className="dz-row">
        <Num label="Size" value={e.size ?? 22} min={4} max={400} onChange={(v) => set(reH({ size: v }), 'fsize')} />
        <div className="dz-btns">
          <button type="button" className={'dz-ib' + (e.bold ? ' on' : '')} onClick={() => set(reH({ bold: !e.bold }))} aria-label="Bold" data-tip="Bold"><b>B</b></button>
          <button type="button" className={'dz-ib' + (e.italic ? ' on' : '')} onClick={() => set(reH({ italic: !e.italic }))} aria-label="Italic" data-tip="Italic"><i>I</i></button>
          <button type="button" className={'dz-ib' + (e.underline ? ' on' : '')} onClick={() => set({ underline: !e.underline })} aria-label="Underline" data-tip="Underline"><u>U</u></button>
          <button type="button" className={'dz-ib' + (e.upper ? ' on' : '')} onClick={() => set(reH({ upper: !e.upper }))} aria-label="Capitals" data-tip="Capitals">Aa</button>
        </div>
      </div>
      <div className="dz-row">
        <Seg label="Line up" value={e.align ?? 'left'} options={[['left', <AlIcon key="l" d="M4 6h16M4 12h10M4 18h14" />, 'Left'], ['center', <AlIcon key="c" d="M4 6h16M7 12h10M5 18h14" />, 'Centre'], ['right', <AlIcon key="r" d="M4 6h16M10 12h10M6 18h14" />, 'Right']]} onChange={(v) => set({ align: v })} />
        {e.t === 'shape' && <Seg label="Up and down" value={e.valign ?? 'top'} options={[['top', '↑', 'Top'], ['middle', '↕', 'Middle'], ['bottom', '↓', 'Bottom']]} onChange={(v) => set({ valign: v })} />}
      </div>
      <Colour label="Text colour" value={e.color ?? '#262420'} onChange={(c) => set({ color: c })} accent={cx.accent} />
      <Colour label="Highlight" value={e.hl ?? 'none'} onChange={(c) => set({ hl: c === 'none' ? undefined : c })} accent={cx.accent} none />
      <Slider label="Line height" value={Math.round((e.lh ?? 1.4) * 100)} min={80} max={250} onChange={(v) => live(reH({ lh: v / 100 }))} fmt={(v) => (v / 100).toFixed(2)} />
      <Slider label="Letter spacing" value={e.ls ?? 0} min={-3} max={20} onChange={(v) => live(reH({ ls: v }))} />
      <Slider label="Outline" value={e.outline ?? 0} min={0} max={12} onChange={(v) => live({ outline: v || undefined })} />
      {!!e.outline && <Colour label="Outline colour" value={e.outlineC ?? '#ffffff'} onChange={(c) => set({ outlineC: c })} accent={cx.accent} />}
    </Sec>
  );
}

function ShapeProps({ cx, e, set, live }: { cx: Ctx; e: El; set: SetFn; live: SetFn }) {
  const line = isLine(e.shape) || e.shape === 'tick' || e.shape === 'cross';
  return (
    <Sec title={line ? 'Line' : 'Shape'}>
      {!line && <Colour label="Fill" value={e.fill ?? 'none'} onChange={(c) => set({ fill: c })} accent={cx.accent} none />}
      <Colour label={line ? 'Colour' : 'Border'} value={e.stroke ?? '#262420'} onChange={(c) => set({ stroke: c, ...(!line && !e.sw ? { sw: 2 } : {}) })} accent={cx.accent} />
      <Slider label={line ? 'Thickness' : 'Border'} value={e.sw ?? 0} min={0} max={40} onChange={(v) => live({ sw: v })} />
      <Seg label="Line" value={e.dash ?? 'solid'} options={[['solid', 'Line', 'Solid'], ['dash', 'Dashes', 'Dashed'], ['dot', 'Dots', 'Dotted']]} onChange={(v) => set({ dash: v })} />
      {(e.shape === 'rect' || e.shape === 'speech') && <Slider label="Corners" value={e.radius ?? 0} min={0} max={200} onChange={(v) => live({ radius: v })} />}
      {!line && (
        <label className="dz-checkrow">
          <input type="checkbox" checked={!!e.shadow} onChange={(ev) => set({ shadow: ev.target.checked })} /> Shadow
        </label>
      )}
    </Sec>
  );
}

const PRESETS: [string, Fx][] = [
  ['None', {}],
  ['Print well', { gray: 100, contrast: 25, bright: 8 }],
  ['Black and white', { gray: 100 }],
  ['Old photo', { sepia: 80, contrast: -5 }],
  ['Bright', { bright: 15, sat: 25 }],
  ['Soft', { contrast: -15, bright: 8, sat: -15 }],
  ['Strong', { contrast: 35, sat: 30 }],
  ['Faded', { contrast: -30, bright: 20, sat: -40 }],
];

function PictureProps({ cx, e, set, live }: { cx: Ctx; e: El; set: SetFn; live: SetFn }) {
  const fx = e.fx ?? {};
  const f = (p: Fx) => live({ fx: { ...fx, ...p } }, 'fx');
  const replace = useRef<HTMLInputElement>(null);
  return (
    <>
      <Sec title="Picture">
        <div className="dz-row">
          <button type="button" className="btn" onClick={() => replace.current?.click()}>{e.img ? 'Change the picture' : 'Add a picture'}</button>
          <input ref={replace} type="file" accept="image/*" hidden onChange={(ev) => (ev.target.files?.[0] && void cx.addPicture(ev.target.files[0], { into: e.id }), (ev.target.value = ''))} />
        </div>
        <Slider label="Corners" value={Math.min(e.radius ?? 0, 300)} min={0} max={300} onChange={(v) => live({ radius: v })} />
        <Slider label="Border" value={e.border ?? 0} min={0} max={40} onChange={(v) => live({ border: v })} />
        {!!e.border && <Colour label="Border colour" value={e.borderC ?? '#ffffff'} onChange={(c) => set({ borderC: c })} accent={cx.accent} />}
        <label className="dz-checkrow">
          <input type="checkbox" checked={!!e.shadow} onChange={(ev) => set({ shadow: ev.target.checked })} /> Shadow
        </label>
        {e.credit && <p className="hint">{e.credit}</p>}
      </Sec>
      {e.img && (
        <Sec title="Adjust">
          <div className="dz-presets">
            {PRESETS.map(([n, p]) => (
              <button key={n} type="button" className={JSON.stringify(p) === JSON.stringify(fx) ? 'on' : ''} onClick={() => set({ fx: p })}>
                <span style={{ filter: Object.keys(p).length ? `${p.gray ? `grayscale(${p.gray}%)` : ''} ${p.sepia ? `sepia(${p.sepia}%)` : ''} ${p.contrast ? `contrast(${100 + p.contrast}%)` : ''} ${p.bright ? `brightness(${100 + p.bright}%)` : ''} ${p.sat ? `saturate(${100 + p.sat}%)` : ''}` : undefined }} />
                {n}
              </button>
            ))}
          </div>
          <Slider label="Brightness" value={fx.bright ?? 0} min={-100} max={100} onChange={(v) => f({ bright: v })} />
          <Slider label="Contrast" value={fx.contrast ?? 0} min={-100} max={100} onChange={(v) => f({ contrast: v })} />
          <Slider label="Colour" value={fx.sat ?? 0} min={-100} max={100} onChange={(v) => f({ sat: v })} />
          <Slider label="Warmth" value={fx.sepia ?? 0} min={0} max={100} onChange={(v) => f({ sepia: v })} />
          <Slider label="Tint" value={fx.hue ?? 0} min={-180} max={180} onChange={(v) => f({ hue: v })} fmt={(v) => v + '°'} />
          <Slider label="Black and white" value={fx.gray ?? 0} min={0} max={100} onChange={(v) => f({ gray: v })} />
          <Slider label="Blur" value={fx.blur ?? 0} min={0} max={30} onChange={(v) => f({ blur: v })} />
          <Slider label="Negative" value={fx.invert ?? 0} min={0} max={100} onChange={(v) => f({ invert: v })} />
          <div className="dz-row">
            <button type="button" className={'btn' + (cx.tool === 'magic' ? ' primary' : '')} onClick={() => cx.setTool(cx.tool === 'magic' ? 'select' : 'magic')}>
              {cx.tool === 'magic' ? 'Done' : 'Take away the background'}
            </button>
          </div>
        </Sec>
      )}
    </>
  );
}

function ArtProps({ cx, e, set }: { cx: Ctx; e: El; set: SetFn }) {
  const [poses, setPoses] = useState<Record<string, { name: string }> | null>(null);
  const [faces, setFaces] = useState<Record<string, { name: string }> | null>(null);
  const [people, setPeople] = useState<Record<string, { name: string }> | null>(null);
  useEffect(() => void import('../storyboard/art').then((m) => (setPoses(m.POSES), setFaces(m.FACES), setPeople(m.PEOPLE))), []);
  return (
    <Sec title={e.art === 'person' ? 'Person' : 'Thing'}>
      {e.art === 'person' && poses && faces && people && (
        <>
          <label className="dz-field">
            <span>Who</span>
            <select value={e.ref} onChange={(ev) => set({ ref: ev.target.value, name: people[ev.target.value]?.name })}>
              {Object.entries(people).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
          </label>
          <label className="dz-field">
            <span>Pose</span>
            <select value={e.pose ?? 'stand'} onChange={(ev) => set({ pose: ev.target.value })}>
              {Object.entries(poses).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            </select>
          </label>
          <label className="dz-field">
            <span>Face</span>
            <select value={e.face ?? 'happy'} onChange={(ev) => set({ face: ev.target.value })}>
              {Object.entries(faces).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
            </select>
          </label>
        </>
      )}
      <Colour label="Colour" value={e.accent ?? cx.accent} onChange={(c) => set({ accent: c })} accent={cx.accent} />
    </Sec>
  );
}

// ------------------------------------------------------------------ the page

function PageProps({ cx }: { cx: Ctx }) {
  const p = cx.page;
  const size = SIZES.find((s) => s.w === p.w && s.h === p.h);
  return (
    <div className="dz-props-in">
      <div className="dz-props-title">
        <strong>Page {cx.pages.indexOf(p) + 1}</strong>
        <em>{size?.name ?? `${Math.round(p.w / MM)} × ${Math.round(p.h / MM)} mm`}</em>
      </div>
      <Sec title="Page">
        <label className="dz-field">
          <span>Name</span>
          <input value={p.name ?? ''} placeholder={`Page ${cx.pages.indexOf(p) + 1}`} onChange={(e) => cx.setPage({ name: e.target.value })} disabled={!cx.canEdit} />
        </label>
        <label className="dz-field">
          <span>Size</span>
          <select value={size?.k ?? ''} onChange={(e) => { const s = SIZES.find((x) => x.k === e.target.value); if (s) cx.setPage({ w: s.w, h: s.h }); }} disabled={!cx.canEdit}>
            {!size && <option value="">Your own size</option>}
            {SIZES.map((s) => <option key={s.k} value={s.k}>{s.name} · {s.about}</option>)}
          </select>
        </label>
        <div className="dz-nums">
          <Num label="W" value={Math.round(p.w / MM)} unit="mm" min={20} max={1200} onChange={(v) => cx.setPage({ w: Math.round(v * MM) })} />
          <Num label="H" value={Math.round(p.h / MM)} unit="mm" min={20} max={1200} onChange={(v) => cx.setPage({ h: Math.round(v * MM) })} />
        </div>
        <Colour label="Background" value={p.bg || '#ffffff'} onChange={(c) => cx.setPage({ bg: c })} accent={cx.accent} />
      </Sec>
      <Sec title="Accent colour">
        <p className="hint">Labels, word banks, mystery cards and people use it. Change it and they all change.</p>
        <Colour label="Accent" value={cx.accent} onChange={cx.setAccent} accent={cx.accent} />
      </Sec>
      <Sec title="Shortcuts" open={false}>
        <dl className="dz-keys">
          {[
            ['V', 'Select'], ['T', 'Add text'], ['P', 'Pen'], ['M', 'Marker'], ['E', 'Rubber'], ['L', 'Labels'], ['H or Space', 'Move around'],
            ['Ctrl+D', 'Duplicate'], ['Alt + drag', 'Copy while moving'], ['Shift + drag', 'Keep the shape'], ['[ and ]', 'Back and forward'], ['Arrows', 'Nudge, with Shift for 10'], ['Ctrl + wheel', 'Zoom'], ['Double-click', 'Type, or crop a picture'],
          ].map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Sec>
    </div>
  );
}

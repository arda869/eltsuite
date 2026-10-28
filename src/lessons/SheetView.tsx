import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Worksheet view of a lesson: the same tasks, on A4 pages, one column, in the printed house style
// (see "How printed worksheets look" in CLAUDE.md). Every task you are not editing is drawn by the
// print engine itself, so the page is what prints. The task you are editing is edited right there on
// the page. A task never splits across two pages: when it would, it moves to the top of the next one,
// and a section heading goes with it. Nothing here is a copy, so the digital lesson is always the same.

const MM = 96 / 25.4;
export const PAGE = { w: 210 * MM, h: 297 * MM, band: 30 * MM, pad: 7 * MM, foot: 14 * MM, side: 13 * MM, gap: 28 };
const P = PAGE.h + PAGE.gap;
const areaTop = (k: number) => k * P + PAGE.band + PAGE.pad;
const areaBottom = (k: number) => k * P + PAGE.h - PAGE.foot;

export type SheetParts = { css: string; band: string; foot: string };
export type SheetBlock = { measure?: string; note?: string; id: string; html?: string; node?: ReactNode; on?: boolean; onClick?: () => void; heading?: boolean; label?: string };

// The print styles, for a shadow root: our own copies of the two typefaces under their own names, so
// the app's own fonts stay as they are.
let fontsIn = false;
function useShadowCss(css: string) {
  return useMemo(() => {
    const faces = css.match(/@font-face[^}]*}/g) ?? [];
    if (!fontsIn && faces.length) {
      const st = document.createElement('style');
      st.textContent = faces.map((f) => f.replace(/Fraunces/, 'WsFraunces').replace(/Karla/, 'WsKarla')).join('\n');
      document.head.appendChild(st);
      fontsIn = true;
    }
    return (
      css
        .replace(/@font-face[^}]*}/g, '')
        .replace(/:root/g, ':host')
        .replace(/@page[^}]*}/g, '')
        .replace(/\bFraunces\b/g, 'WsFraunces')
        .replace(/\bKarla\b/g, 'WsKarla') + '\n:host { display: block; color: var(--ink); font: 10.2pt/1.5 WsFraunces, Georgia, serif; } .unit:last-child { padding-bottom: 0; }'
    );
  }, [css]);
}

// A piece of the printed page, drawn by the print engine in its own shadow root.
function Piece({ css, html, className }: { css: string; html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${html}`;
  }, [css, html]);
  return <div ref={ref} className={className} />;
}

export type Zoom = 'width' | 'page';
export function SheetView({ parts, blocks, after, zoom = 'width', focus }: { parts: SheetParts; blocks: SheetBlock[]; after?: ReactNode; zoom?: Zoom; focus?: string }) {
  const css = useShadowCss(parts.css);
  const host = useRef<HTMLDivElement>(null);
  const [pushes, setPushes] = useState<number[]>([]);
  const [pages, setPages] = useState(1);
  // While a task is edited, the page it is on stretches to fit the editor; the rest keep their size.
  const [stretch, setStretch] = useState<{ page: number; extra: number }>({ page: -1, extra: 0 });
  // On a narrower screen the page is shown smaller, never cut off. (A transform, so the layout,
  // which is measured in the page's own size, stays the same.)
  const desk = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    // Fit the width of the panel, or a whole page in its height.
    const fit = () => {
      const w = (el.clientWidth - 32) / PAGE.w;
      const h = (el.clientHeight - 32) / PAGE.h;
      setScale(Math.max(0.25, Math.min(1.6, zoom === 'page' ? Math.min(w, h) : w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);
  // A task chosen somewhere else (the task list) is brought into view on the page.
  useEffect(() => {
    if (!focus || anchor.current) return;
    const t = window.setTimeout(() => {
      const el = host.current?.querySelector<HTMLElement>(`[data-b="${CSS.escape(focus)}"]`);
      const d = desk.current;
      if (!el || !d) return;
      const r = el.getBoundingClientRect();
      const dr = d.getBoundingClientRect();
      if (r.top < dr.top + 8 || r.top > dr.bottom - 80) d.scrollTo({ top: d.scrollTop + r.top - dr.top - 24, behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focus]);
  const inner = areaBottom(0) - areaTop(0);
  // The task you click stays where it was on screen while the page around it settles: the one you
  // leave shrinks back to its printed size, which would otherwise move everything below it.
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const keep = (id: string) => {
    const el = host.current?.querySelector<HTMLElement>(`[data-b="${CSS.escape(id)}"]`);
    if (el) anchor.current = { id, top: el.getBoundingClientRect().top };
  };
  const settle = () => {
    const a = anchor.current;
    const el = a && host.current?.querySelector<HTMLElement>(`[data-b="${CSS.escape(a.id)}"]`);
    if (!a || !el) return;
    const d = el.getBoundingClientRect().top - a.top;
    if (Math.abs(d) < 2) return;
    let sc: HTMLElement | null = host.current!.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc) sc.scrollTop += d;
    else window.scrollBy(0, d);
  };
  // Lay the blocks out page by page from their own heights.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const lay = () => {
      const kids = [...el.querySelectorAll<HTMLElement>(':scope > .sh-block')];
      const next: number[] = [];
      let page = 0;
      let y = 0; // where the last block ended
      let st = { page: -1, extra: 0 };
      kids.forEach((k, i) => {
        // The task being edited is laid out at its printed height, so the pages break as they print.
        const m = k.querySelector<HTMLElement>(':scope > .sh-measure');
        const h = m ? m.offsetHeight : k.offsetHeight;
        let at = y;
        // A section heading goes with the task after it.
        const withNext = k.classList.contains('is-heading') && kids[i + 1] ? Math.min(kids[i + 1].offsetHeight, inner) : 0;
        const needs = Math.min(h, inner) + withNext;
        if (at < areaTop(page)) at = areaTop(page);
        if (at > areaTop(page) && at + needs > areaBottom(page)) {
          page++;
          at = areaTop(page);
        }
        next.push(at - y);
        if (m) st = { page, extra: Math.max(0, k.offsetHeight - h) };
        y = at + h;
        while (y > areaBottom(page)) page++; // only a task taller than a page runs on
      });
      setPages((n) => (n === page + 1 ? n : page + 1));
      setStretch((o) => (o.page === st.page && Math.abs(o.extra - st.extra) < 1 ? o : st));
      setPushes((old) => (old.length === next.length && old.every((v, i) => Math.abs(v - next[i]) < 1) ? old : next));
      requestAnimationFrame(settle);
    };
    lay();
    const ro = new ResizeObserver(lay);
    [...el.children].forEach((c) => ro.observe(c));
    el.querySelectorAll('.sh-measure').forEach((c) => ro.observe(c));
    // Stop holding the clicked task in place once the page has settled.
    const done = window.setTimeout(() => (anchor.current = null), 1500);
    return () => (ro.disconnect(), window.clearTimeout(done));
  }, [inner, blocks.map((b) => b.id + (b.html?.length ?? 0)).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sh-desk" ref={desk}>
      <div className="sh-fit" style={{ width: PAGE.w * scale, height: (pages * P - PAGE.gap + stretch.extra) * scale }}>
      <div className="sh-paper" style={{ width: PAGE.w, height: pages * P - PAGE.gap + stretch.extra, transform: scale !== 1 ? `scale(${scale})` : undefined }}>
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} className={'sh-sheet' + (i === stretch.page && stretch.extra > 0 ? ' stretched' : '')} style={{ top: i * P + (i > stretch.page ? stretch.extra : 0), height: PAGE.h + (i === stretch.page ? stretch.extra : 0) }} aria-hidden="true">
            <Piece css={css} html={parts.band} />
            <Piece css={css} className="sh-pagefoot" html={parts.foot.replace('<span class="pn"></span>', `<span class="pn">${i + 1}</span>`)} />
          </div>
        ))}
        <div className="sh-flow" ref={host} style={{ left: PAGE.side, right: PAGE.side }}>
          {blocks.map((b, i) => (
            <div
              key={b.id}
              data-b={b.id}
              className={'sh-block' + (b.on ? ' on' : '') + (b.heading ? ' is-heading' : '') + (b.onClick ? ' pick' : '')}
              style={{ marginTop: pushes[i] ?? (i === 0 ? areaTop(0) : 0) }}
              onClick={b.onClick ? () => (keep(b.id), b.onClick?.()) : undefined}
              onKeyDown={b.onClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && (keep(b.id), b.onClick?.()) : undefined}
              role={b.onClick ? 'button' : undefined}
              tabIndex={b.onClick ? 0 : undefined}
              aria-label={b.onClick ? b.label ?? 'Edit this task' : undefined}
            >
              {b.html !== undefined ? <Piece css={css} html={b.html} /> : b.node}
              {b.measure !== undefined && <Piece css={css} className="sh-measure" html={b.measure} />}
              {b.note && <span className="sh-note">{b.note}</span>}
            </div>
          ))}
          {after && <div className="sh-after">{after}</div>}
        </div>
      </div>
      </div>
    </div>
  );
}

// How the task being edited looks on paper: its gaps, its writing space and an instruction for paper.
export type Paper = { gap?: 'fit' | 'short' | 'medium' | 'long'; lines?: number | null; instr?: string };
export function PaperBar({ look, onChange, gaps, writing, online }: { look: Paper; onChange: (p: Paper) => void; gaps: boolean; writing: boolean; online: string[] }) {
  const [instrOn, setInstrOn] = useState(!!look.instr);
  const set = (p: Partial<Paper>) => onChange({ ...look, ...p });
  return (
    <div className="sh-paperbar" aria-label="On paper">
      <b className="sh-pb-k">On paper</b>
      {gaps && (
        <label className="sh-pb-f">
          <span>Gaps</span>
          <select value={look.gap ?? 'fit'} onChange={(e) => set({ gap: e.target.value as Paper['gap'] })}>
            <option value="fit">Fit the answer</option>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
      )}
      {writing && (
        <label className="sh-pb-f">
          <span>Writing space</span>
          <select value={look.lines === undefined || look.lines === null ? 'auto' : String(look.lines)} onChange={(e) => set({ lines: e.target.value === 'auto' ? null : Number(e.target.value) })}>
            <option value="auto">Lines for the word count</option>
            <option value="0">No lines</option>
            {[4, 6, 8, 10, 12, 16, 20].map((n) => (
              <option key={n} value={n}>
                {n} lines
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="sh-pb-c">
        <input
          type="checkbox"
          checked={instrOn}
          onChange={(e) => {
            setInstrOn(e.target.checked);
            if (!e.target.checked) set({ instr: '' });
          }}
        />
        A different instruction on paper
      </label>
      {instrOn && <input className="sh-pb-instr" defaultValue={look.instr ?? ''} placeholder="For example: Write the answers in the gaps." onBlur={(e) => set({ instr: e.target.value })} aria-label="Instruction on paper" />}
      {online.length > 0 && <span className="sh-pb-online">Online only, not printed: {online.join(', ')}</span>}
    </div>
  );
}

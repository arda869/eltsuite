import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Occurrence } from '../../lib/sessions';
import { UiIcon } from '../../components/UiIcon';
import type { Anchor } from './Pop';
import { addDays, atMinutes, clock, clockRange, DAY, hourLabel, isToday, lengthText, minutesOf, snap, snapDown, SNAP, startOfDay } from './dates';

// The Day and Week views: hours down the side, a column a day. Drag across empty time to add a
// session over it; drag a session to move it, or its lower edge to make it longer or shorter.
// Everything snaps to 15 minutes and shows where it will land while you drag.

export const HOUR = 48;
const PX = HOUR / 60;
const LEAN = 4; // px a pointer moves before a press becomes a drag

export type GridEv = { o: Occurrence; color: string; sub: string; edit: boolean; key: string };
type Drag =
  | { kind: 'create'; day: number; a: number; b: number; moved: boolean }
  | { kind: 'move'; ev: GridEv; dd: number; dm: number; moved: boolean }
  | { kind: 'resize'; ev: GridEv; mins: number; moved: boolean };

export function TimeGrid({
  days,
  evs,
  pending,
  hold,
  picked,
  dir,
  onCreate,
  onPick,
  onChange,
  onDay,
  reveal,
}: {
  days: number[];
  evs: GridEv[];
  pending: { start: number; end: number; title?: string } | null;
  hold: { key: string; start: number; mins: number } | null;
  picked: string | null;
  dir: number;
  onCreate: (start: number, end: number, at: Anchor) => void;
  onPick: (ev: GridEv, at: Anchor) => void;
  onChange: (ev: GridEv, start: number, mins: number) => void;
  onDay: (day: number) => void;
  reveal?: number | null;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const eat = useRef(false); // the click after a drag is not a click
  const [sbw, setSbw] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  // The header lines up with the columns under it, whatever the scrollbar.
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSbw(el.offsetWidth - el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Open at the morning, or near now if it is later, or at the first session if it is earlier.
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const first = Math.min(...evs.map((e) => minutesOf(e.o.start) / 60), 8);
    const now = days.some(isToday) ? new Date().getHours() : 0;
    const view = el.clientHeight / HOUR;
    const h = now && now > first + view - 2 ? now - 2 : first - 0.5;
    el.scrollTop = Math.max(0, h * HOUR);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A session just added out of sight: the hours scroll to it.
  useEffect(() => {
    const el = scroll.current;
    if (!el || !reveal) return;
    const y = minutesOf(reveal) * PX;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - HOUR) el.scrollTo({ top: Math.max(0, y - HOUR), behavior: 'smooth' });
  }, [reveal]);
  const set = (d: Drag | null) => ((dragRef.current = d), setDrag(d));
  const colAt = (x: number) => {
    let best = 0;
    cols.current.forEach((c, i) => {
      if (c && x >= c.getBoundingClientRect().left) best = i;
    });
    return best;
  };
  const minsAt = (col: number, y: number) => {
    const c = cols.current[col];
    return c ? Math.max(0, Math.min(1440, (y - c.getBoundingClientRect().top) / PX)) : 0;
  };
  const anchorFor = (col: number, a: number, b: number): Anchor => {
    const r = cols.current[col]!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top + a * PX, bottom: r.top + b * PX };
  };
  // Near the top or bottom while dragging, the hours scroll along.
  const edge = useRef<{ y: number; raf: number } | null>(null);
  const roll = () => {
    const el = scroll.current;
    const e = edge.current;
    if (!el || !e) return;
    const r = el.getBoundingClientRect();
    const v = e.y < r.top + 36 ? -10 : e.y > r.bottom - 36 ? 10 : 0;
    if (v) el.scrollTop += v;
    e.raf = requestAnimationFrame(roll);
  };

  const begin = (e: React.PointerEvent, d: Drag, col: number) => {
    if (e.button !== 0) return;
    const touch = e.pointerType === 'touch';
    const x0 = e.clientX;
    const y0 = e.clientY;
    const m0 = minsAt(col, y0);
    set(touch ? null : d);
    if (!touch) edge.current = { y: y0, raf: requestAnimationFrame(roll) };
    let last = d;
    const move = (ev: PointerEvent) => {
      if (touch) return;
      if (edge.current) edge.current.y = ev.clientY;
      const far = Math.abs(ev.clientX - x0) > LEAN || Math.abs(ev.clientY - y0) > LEAN;
      if (!last.moved && !far) return;
      const c = last.kind === 'create' || last.kind === 'resize' ? col : colAt(ev.clientX);
      const m = minsAt(c, ev.clientY);
      if (last.kind === 'create') last = { ...last, b: m, moved: true };
      else if (last.kind === 'move') last = { ...last, dd: c - col, dm: snap(m - m0), moved: true };
      else {
        const st = minutesOf(last.ev.o.start);
        last = { ...last, mins: Math.max(SNAP, Math.min(1440 - st, snap(m) - st)), moved: true };
      }
      set(last);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (edge.current) cancelAnimationFrame(edge.current.raf), (edge.current = null);
      set(null);
      if (touch && (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8)) return;
      if (last.kind === 'create') {
        const a = snapDown(Math.min(last.a, last.moved ? last.b : last.a));
        const b = last.moved ? Math.max(a + SNAP, snapDown(Math.max(last.a, last.b)) + SNAP) : Math.min(1440, a + 60);
        onCreate(atMinutes(days[col], a), atMinutes(days[col], b), anchorFor(col, a, b));
        return;
      }
      if (!last.moved) return;
      eat.current = true;
      window.setTimeout(() => (eat.current = false), 0);
      const o = last.ev.o;
      if (last.kind === 'move') {
        const st = Math.max(0, Math.min(1440 - SNAP, minutesOf(o.start) + last.dm));
        const start = atMinutes(addDays(startOfDay(o.start), last.dd), st);
        if (start !== o.start) onChange(last.ev, start, Math.round((o.end - o.start) / 60000));
      } else if (last.mins !== Math.round((o.end - o.start) / 60000)) onChange(last.ev, o.start, last.mins);
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (edge.current) cancelAnimationFrame(edge.current.raf), (edge.current = null);
      set(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // While "This one, or every week?" is asked, the session waits where it was dropped.
  const placed = hold ? evs.map((e) => (e.key === hold.key ? { ...e, o: { ...e.o, start: hold.start, end: hold.start + hold.mins * 60000 } } : e)) : evs;
  const cs = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const now = Date.now();
  const ghost = drag?.kind === 'create' ? { day: drag.day, a: snapDown(Math.min(drag.a, drag.moved ? drag.b : drag.a)), b: drag.moved ? Math.max(snapDown(Math.min(drag.a, drag.b)) + SNAP, snapDown(Math.max(drag.a, drag.b)) + SNAP) : snapDown(drag.a) + 60 } : null;
  const wait = !ghost && pending ? { day: startOfDay(pending.start), a: minutesOf(pending.start), b: minutesOf(pending.start) + (pending.end - pending.start) / 60000 } : null;
  const block = (g: { day: number; a: number; b: number } | null) => (g ? { top: g.a * PX, height: Math.max(SNAP * PX, (g.b - g.a) * PX) - 2 } : null);
  return (
    <div className={'ttb-grid' + (drag?.moved ? ' dragging' : '')} data-cols={days.length}>
      <div className="ttb-heads" style={{ ...cs, paddingRight: sbw }}>
        <span className="ttb-tz" />
        {days.map((d) => (
          <button key={d} type="button" data-dir={dir} className={'ttb-head-day ttb-slide' + (isToday(d) ? ' today' : '') + (d < startOfDay(now) ? ' past' : '')} onClick={() => onDay(d)} aria-label={new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', open the day'}>
            <b>{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</b>
            <i>{new Date(d).getDate()}</i>
          </button>
        ))}
      </div>
      <div className="ttb-scroll" ref={scroll}>
        <div className="ttb-body" style={{ ...cs, height: 24 * HOUR }}>
          <div className="ttb-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} style={{ top: (i + 1) * HOUR }}>
                {hourLabel(i + 1)}
              </span>
            ))}
          </div>
          {days.map((d, col) => {
            const mine = placed.filter((e) => startOfDay(e.o.start) === d);
            const today = isToday(d);
            const moving = drag?.kind === 'move' && drag.moved ? drag : null;
            const landing = moving && dayIndex(days, moving.ev.o.start) + moving.dd === col ? moving : null;
            const g = ghost && ghost.day === d ? block(ghost) : wait && wait.day === d ? block(wait) : null;
            return (
              <div
                key={d}
                ref={(el) => (cols.current[col] = el)}
                data-dir={dir}
                className={'ttb-col ttb-slide' + (today ? ' today' : '')}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('.ttb-ev')) return;
                  if (e.pointerType !== 'touch') e.preventDefault();
                  const m = minsAt(col, e.clientY);
                  begin(e, { kind: 'create', day: d, a: m, b: m, moved: false }, col);
                }}
              >
                {lanes(mine).map(({ ev, lane, of }) => {
                  const o = ev.o;
                  const resizing = drag?.kind === 'resize' && drag.moved && drag.ev.key === ev.key ? drag : null;
                  const mins = resizing ? resizing.mins : (Math.min(o.end, d + DAY) - o.start) / 60000;
                  const st = minutesOf(o.start);
                  const style = { top: st * PX, height: Math.max(SNAP * PX, mins * PX) - 2, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - ${of > 1 ? 3 : 8}px)`, ['--ev' as string]: ev.color } as CSSProperties;
                  const lifted = moving?.ev.key === ev.key;
                  return <Block key={ev.key} ev={ev} style={style} mins={mins} start={o.start} cls={(lifted ? ' lifted' : '') + (resizing ? ' sizing' : '') + (picked === ev.key ? ' picked' : '') + (o.end < now ? ' past' : '')} onDown={(e, kind) => ev.edit && begin(e, kind === 'resize' ? { kind, ev, mins: Math.round((o.end - o.start) / 60000), moved: false } : { kind: 'move', ev, dd: 0, dm: 0, moved: false }, col)} onClick={(el) => !eat.current && onPick(ev, el)} />;
                })}
                {landing && (() => {
                  const o = landing.ev.o;
                  const mins = (o.end - o.start) / 60000;
                  const st = Math.max(0, Math.min(1440 - SNAP, minutesOf(o.start) + landing.dm));
                  const start = atMinutes(d, st);
                  return <Block ev={landing.ev} preview style={{ top: st * PX, height: Math.max(SNAP * PX, Math.min(mins, 1440 - st) * PX) - 2, left: '2px', width: 'calc(100% - 8px)', ['--ev' as string]: landing.ev.color } as CSSProperties} mins={mins} start={start} cls=" landing" />;
                })()}
                {g && (
                  <div className="ttb-ghost" style={g}>
                    <b>{(!ghost && pending?.title) || '(No title)'}</b>
                    <span>{clockRange(atMinutes(d, (ghost ?? wait)!.a), atMinutes(d, (ghost ?? wait)!.b))}</span>
                  </div>
                )}
                {today && <span className="ttb-now" style={{ top: minutesOf(now) * PX }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
const dayIndex = (days: number[], t: number) => days.indexOf(startOfDay(t));

function Block({ ev, style, mins, start, cls, preview, onDown, onClick }: { ev: GridEv; style: CSSProperties; mins: number; start: number; cls: string; preview?: boolean; onDown?: (e: React.PointerEvent, kind: 'move' | 'resize') => void; onClick?: (at: Anchor) => void }) {
  const o = ev.o;
  const short = mins <= 35;
  const end = start + mins * 60000;
  const when = clockRange(start, end);
  const label = `${o.s.title || 'Untitled'}, ${new Date(start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${when}${ev.sub ? ', ' + ev.sub : ''}`;
  const body = (
    <>
      {short ? (
        <span className="ttb-ev-line">
          <b>{o.s.title || 'Untitled'}</b>, {clock(start)}
        </span>
      ) : (
        <>
          <b>{o.s.title || 'Untitled'}</b>
          <span>{preview ? `${when} · ${lengthText(Math.round(mins))}` : when}</span>
          {mins >= 75 && ev.sub && <span>{ev.sub}</span>}
        </>
      )}
      {o.s.online && !short && <UiIcon name="video" size={12} />}
    </>
  );
  if (preview) {
    return (
      <div className={'ttb-ev' + cls + (o.s.online && !short ? ' ic' : '')} style={style} aria-hidden="true">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={'ttb-ev' + cls + (o.s.id.startsWith('i:') ? ' lone' : '') + (ev.edit ? ' can' : '') + (o.s.online && !short ? ' ic' : '')}
      style={style}
      data-occ={ev.key}
      aria-label={label}
      onPointerDown={(e) => onDown?.(e, 'move')}
      onClick={(e) => onClick?.(e.currentTarget.getBoundingClientRect())}
    >
      {body}
      {cls.includes('sizing') && <span className="ttb-ev-len">{lengthText(Math.round(mins))}</span>}
      {ev.edit && !o.s.id.startsWith('i:') && (
        <span
          className="ttb-ev-grip"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDown?.(e, 'resize');
          }}
        />
      )}
    </button>
  );
}

// Sessions at the same time sit side by side.
function lanes(list: GridEv[]) {
  const sorted = [...list].sort((a, b) => a.o.start - b.o.start || b.o.end - a.o.end);
  const out: { ev: GridEv; lane: number; of: number }[] = [];
  let cluster: { ev: GridEv; lane: number; of: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const n = Math.max(1, ends.length);
    cluster.forEach((x) => (x.of = n));
    out.push(...cluster);
    cluster = [];
    ends = [];
  };
  for (const ev of sorted) {
    if (ev.o.start >= clusterEnd && cluster.length) flush();
    let lane = ends.findIndex((e) => e <= ev.o.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = ev.o.end;
    cluster.push({ ev, lane, of: 1 });
    clusterEnd = Math.max(clusterEnd, ev.o.end);
  }
  flush();
  return out;
}

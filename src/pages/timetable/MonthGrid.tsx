import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Anchor } from './Pop';
import type { GridEv } from './TimeGrid';
import { addDays, atMinutes, clock, isToday, minutesOf, startOfDay } from './dates';

// The Month view: six weeks at most, each day with its sessions as short lines. A session can
// be dragged to another day and keeps its time; a click on empty space adds one that day.

const ROW = 22;

export function MonthGrid({ days, month, evs: raw, hold, picked, dir, onDay, onCreate, onPick, onMore, onMove }: { days: number[]; month: number; evs: GridEv[]; hold: { key: string; start: number; mins: number } | null; picked: string | null; dir: number; onDay: (d: number) => void; onCreate: (day: number, at: Anchor) => void; onPick: (ev: GridEv, at: Anchor) => void; onMore: (day: number, list: GridEv[], at: Anchor) => void; onMove: (ev: GridEv, start: number) => void }) {
  const evs = hold ? raw.map((e) => (e.key === hold.key ? { ...e, o: { ...e.o, start: hold.start, end: hold.start + hold.mins * 60000 } } : e)) : raw;
  const first = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3);
  const [drag, setDrag] = useState<{ ev: GridEv; day: number | null } | null>(null);
  const eat = useRef(false);
  useLayoutEffect(() => {
    const el = first.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(1, Math.floor((el.clientHeight - 30) / ROW))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = new Date(month).getMonth();
  const begin = (e: React.PointerEvent, ev: GridEv) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !ev.edit) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let cur: { ev: GridEv; day: number | null } | null = null;
    const move = (p: PointerEvent) => {
      if (!cur && Math.abs(p.clientX - x0) < 5 && Math.abs(p.clientY - y0) < 5) return;
      const cell = document.elementFromPoint(p.clientX, p.clientY)?.closest<HTMLElement>('[data-day]');
      cur = { ev, day: cell ? Number(cell.dataset.day) : null };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!cur) return;
      eat.current = true;
      window.setTimeout(() => (eat.current = false), 0);
      if (cur.day != null && cur.day !== startOfDay(ev.o.start)) onMove(ev, atMinutes(cur.day, minutesOf(ev.o.start)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={'ttb-month' + (drag ? ' dragging' : '')}>
      <div className="ttb-month-wk" aria-hidden="true">
        {days.slice(0, 7).map((d) => (
          <span key={d}>{new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}</span>
        ))}
      </div>
      <div className="ttb-month-days ttb-slide" key={month} data-dir={dir} style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {days.map((d, i) => {
          const list = evs.filter((e) => startOfDay(e.o.start) === d).sort((a, b) => a.o.start - b.o.start);
          const shown = list.length > fit ? list.slice(0, fit - 1) : list;
          const out = new Date(d).getMonth() !== m;
          return (
            <div
              key={d}
              ref={i === 0 ? first : undefined}
              data-day={d}
              className={'ttb-mday' + (out ? ' out' : '') + (isToday(d) ? ' today' : '') + (drag?.day === d ? ' drop' : '')}
              onClick={(e) => {
                if (eat.current || (e.target as HTMLElement).closest('button')) return;
                const r = e.currentTarget.getBoundingClientRect();
                onCreate(d, r);
              }}
            >
              <button type="button" className="ttb-mnum" onClick={() => onDay(d)} aria-label={new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', open the day'}>
                {new Date(d).getDate() === 1 ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : new Date(d).getDate()}
              </button>
              {shown.map((ev) => (
                <button
                  key={ev.key}
                  type="button"
                  data-occ={ev.key}
                  className={'ttb-chip' + (picked === ev.key ? ' picked' : '') + (drag?.ev.key === ev.key ? ' lifted' : '') + (ev.o.end < Date.now() ? ' past' : '') + (ev.edit ? ' can' : '')}
                  style={{ ['--ev' as string]: ev.color } as CSSProperties}
                  onPointerDown={(e) => begin(e, ev)}
                  onClick={(e) => !eat.current && onPick(ev, e.currentTarget.getBoundingClientRect())}
                  aria-label={`${ev.o.s.title || 'Untitled'}, ${clock(ev.o.start)}${ev.sub ? ', ' + ev.sub : ''}`}
                >
                  <i aria-hidden="true" />
                  <span className="ttb-chip-t">{clock(ev.o.start)}</span>
                  <b>{ev.o.s.title || 'Untitled'}</b>
                </button>
              ))}
              {list.length > shown.length && (
                <button type="button" className="ttb-more" onClick={(e) => onMore(d, list, e.currentTarget.getBoundingClientRect())}>
                  {list.length - shown.length} more
                </button>
              )}
              {drag?.day === d && startOfDay(drag.ev.o.start) !== d && (
                <span className="ttb-chip landing" style={{ ['--ev' as string]: drag.ev.color } as CSSProperties} aria-hidden="true">
                  <i />
                  <span className="ttb-chip-t">{clock(atMinutes(addDays(d, 0), minutesOf(drag.ev.o.start)))}</span>
                  <b>{drag.ev.o.s.title || 'Untitled'}</b>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

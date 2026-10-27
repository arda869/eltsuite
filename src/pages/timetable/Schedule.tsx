import { useState, type CSSProperties } from 'react';
import { UiIcon } from '../../components/UiIcon';
import type { Anchor } from './Pop';
import type { GridEv } from './TimeGrid';
import { addDays, addMonths, clockRange, isToday, monthStart, sameDay, startOfDay } from './dates';

// The Schedule view: the coming weeks as a list, a day at a time, today marked.
export function Schedule({ from, to, evs, picked, dir, onPick, onDay }: { from: number; to: number; evs: GridEv[]; picked: string | null; dir: number; onPick: (ev: GridEv, at: Anchor) => void; onDay: (d: number) => void }) {
  const byDay = new Map<number, GridEv[]>();
  [...evs].sort((a, b) => a.o.start - b.o.start).forEach((e) => byDay.set(startOfDay(e.o.start), [...(byDay.get(startOfDay(e.o.start)) ?? []), e]));
  const today = startOfDay(Date.now());
  if (today >= from && today < to && !byDay.has(today)) byDay.set(today, []);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  return (
    <div className="ttb-sched">
      <div className="ttb-sched-in ttb-slide" key={from} data-dir={dir}>
        {!evs.length && (
          <div className="ttb-empty">
            <UiIcon name="calendar" size={28} />
            <b>Nothing in these four weeks</b>
            <span className="hint">Drag across the hours in the Day or Week view to add a class.</span>
          </div>
        )}
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const newMonth = i === 0 || new Date(days[i - 1]).getMonth() !== new Date(d).getMonth();
          return (
            <div key={d}>
              {newMonth && <h2 className="ttb-sched-m">{new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>}
              <section className={'ttb-sday' + (isToday(d) ? ' today' : '')}>
                <button type="button" className="ttb-sday-d" onClick={() => onDay(d)} aria-label={new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', open the day'}>
                  <i>{new Date(d).getDate()}</i>
                  <span>
                    {new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}
                    <br />
                    {new Date(d).toLocaleDateString(undefined, { month: 'short' })}
                  </span>
                </button>
                <div className="ttb-sday-l">
                  {!list.length && <span className="ttb-sday-none">Nothing today</span>}
                  {list.map((ev) => (
                    <button key={ev.key} type="button" data-occ={ev.key} className={'ttb-srow' + (picked === ev.key ? ' picked' : '') + (ev.o.end < Date.now() ? ' past' : '')} style={{ ['--ev' as string]: ev.color } as CSSProperties} onClick={(e) => onPick(ev, e.currentTarget.getBoundingClientRect())}>
                      <i aria-hidden="true" />
                      <span className="ttb-srow-t">{clockRange(ev.o.start, ev.o.end)}</span>
                      <span className="ttb-srow-n">
                        <b>{ev.o.s.title || 'Untitled'}</b>
                        {ev.sub && <span className="hint">{ev.sub}</span>}
                      </span>
                      {ev.o.s.online && <UiIcon name="video" size={14} />}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The small month on the left, to jump to any day. Days with something on have a dot.
export function MiniMonth({ anchor, from, to, busy, onPick }: { anchor: number; from: number; to: number; busy: (d: number) => boolean; onPick: (d: number) => void }) {
  const [shown, setShown] = useState(() => monthStart(anchor));
  const [seen, setSeen] = useState(anchor);
  if (seen !== anchor) {
    setSeen(anchor);
    if (monthStart(anchor) !== shown && !(anchor >= shown && anchor < addMonths(shown, 1))) setShown(monthStart(anchor));
  }
  const start = (() => {
    const d = new Date(shown);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  })();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const m = new Date(shown).getMonth();
  return (
    <div className="ttb-mini">
      <div className="ttb-mini-h">
        <b>{new Date(shown).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <span>
          <button type="button" className="ttb-mini-a" aria-label="The month before" onClick={() => setShown(addMonths(shown, -1))}>
            <UiIcon name="prev" size={14} />
          </button>
          <button type="button" className="ttb-mini-a" aria-label="The month after" onClick={() => setShown(addMonths(shown, 1))}>
            <UiIcon name="next" size={14} />
          </button>
        </span>
      </div>
      <div className="ttb-mini-g" role="group" aria-label="Choose a day">
        {cells.slice(0, 7).map((d) => (
          <span key={'h' + d} className="ttb-mini-w" aria-hidden="true">
            {new Date(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        ))}
        {cells.map((d) => {
          const band = !!to && d >= from && d < to;
          const dow = (new Date(d).getDay() + 6) % 7;
          return (
            <button key={d} type="button" className={'ttb-mini-d' + (new Date(d).getMonth() !== m ? ' out' : '') + (isToday(d) ? ' today' : '') + (band ? ' in' : '') + (band && (d === from || dow === 0) ? ' in-a' : '') + (band && (addDays(d, 1) >= to || dow === 6) ? ' in-b' : '') + (sameDay(d, anchor) ? ' sel' : '') + (busy(d) ? ' busy' : '')} onClick={() => onPick(d)} aria-label={new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} aria-current={isToday(d) ? 'date' : undefined}>
              <span>{new Date(d).getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

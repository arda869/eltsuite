import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A drop-down in the app's own style, in place of the browser's: the choice with a chevron, and
// a list under it with a tick by the current one. Arrow keys, Enter and Escape work.

export type Option<T extends string> = { v: T; label: string; hint?: string };

export function Select<T extends string>({ value, options, onChange, label, placeholder = 'Choose…', className = '', disabled }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; placeholder?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0, width: 0, up: false });
  const cur = options.find((o) => o.v === value);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 200;
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 14;
    const width = Math.max(r.width, 200);
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 - h : r.bottom + 6, width, up });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex((o) => o.v === value)));
    const down = (e: MouseEvent) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const away = () => setOpen(false);
    document.addEventListener('mousedown', down);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => (document.removeEventListener('mousedown', down), window.removeEventListener('scroll', away, true), window.removeEventListener('resize', away));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: T) => (onChange(v), setOpen(false), btn.current?.focus());
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && options[hi]) pick(options[hi].v);
      else setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <>
      <button ref={btn} type="button" className={'sel ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled} onClick={() => setOpen((o) => !o)} onKeyDown={key}>
        <span className={'sel-v' + (cur ? '' : ' empty')}>{cur?.label ?? placeholder}</span>
        <svg className="sel-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={list} className={'sel-list' + (at.up ? ' up' : '')} role="listbox" aria-label={label} style={{ left: at.left, top: at.top, minWidth: at.width }}>
            {options.map((o, i) => (
              <button key={o.v} type="button" role="option" aria-selected={o.v === value} className={'sel-o' + (i === hi ? ' hi' : '') + (o.v === value ? ' on' : '')} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.v)}>
                <span className="sel-tick" aria-hidden="true">
                  {o.v === value && (
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2.5 6.3 5 8.7 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="sel-t">
                  {o.label}
                  {o.hint && <span className="hint">{o.hint}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

// Several choices at once: ticks beside each, the list stays open while you choose.
export function MultiSelect<T extends string>({ value, options, onChange, label, all = 'Any', className = '' }: { value: T[]; options: Option<T>[]; onChange: (v: T[]) => void; label: string; all?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0, width: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 200;
    const width = Math.max(r.width, 220);
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 14;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 - h : r.bottom + 6, width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const away = () => setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', away, true);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', esc), window.removeEventListener('scroll', away, true));
  }, [open]);
  const shown = value.length === 0 || value.length === options.length ? all : options.filter((o) => value.includes(o.v)).map((o) => o.label).join(', ');
  const flip = (v: T) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : options.map((o) => o.v).filter((x) => x === v || value.includes(x));
    if (next.length) onChange(next); // at least one stays chosen
  };
  return (
    <>
      <button ref={btn} type="button" className={'sel ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <span className="sel-v">{shown}</span>
        <svg className="sel-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={list} className="sel-list" role="listbox" aria-multiselectable="true" aria-label={label} style={{ left: at.left, top: at.top, minWidth: at.width }}>
            {options.map((o) => {
              const on = value.length === 0 || value.includes(o.v);
              return (
                <button key={o.v} type="button" role="option" aria-selected={on} className={'sel-o multi' + (on ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => flip(o.v)}>
                  <span className={'sel-box' + (on ? ' on' : '')} aria-hidden="true">
                    {on && (
                      <svg width="10" height="10" viewBox="0 0 12 12">
                        <path d="M2.5 6.3 5 8.7 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="sel-t">
                    {o.label}
                    {o.hint && <span className="hint">{o.hint}</span>}
                  </span>
                </button>
              );
            })}
            <span className="sel-foot hint">Teachers choose from the ticked ones.</span>
          </div>,
          document.body,
        )}
    </>
  );
}

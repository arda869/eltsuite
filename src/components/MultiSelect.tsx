import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

// A drop-down in the app's own style (the same look as Select) where you can tick more than one choice.
// The value is a list; callers that store text can join it with ", ".

export function MultiSelect({ value, options, onChange, label, placeholder = 'Choose…', className = '', disabled }: { value: string[]; options: string[]; onChange: (v: string[]) => void; label: string; placeholder?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0, width: 0 });
  const uid = useId().replace(/:/g, '');
  // Keep choices that are no longer on the list, so older activities don't lose them.
  const all = [...options, ...value.filter(v => !options.includes(v))];
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 240;
    const width = Math.min(Math.max(r.width, 210), window.innerWidth - 16);
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 14;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 - h : r.bottom + 6, width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : all.filter(x => x === v || value.includes(x)));
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) setOpen(true); else setHi(n => (n + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length); }
    if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); toggle(all[hi]); }
  };
  return <>
    <button ref={btn} type="button" className={'sel sel-multi ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid + '-list' : undefined} aria-label={`${label}: ${value.join(', ') || 'none chosen'}`} disabled={disabled} onClick={() => setOpen(o => !o)} onKeyDown={key}>
      <span className={'sel-v' + (value.length ? '' : ' empty')}>{value.length ? value.join(', ') : placeholder}</span>
      <svg className="sel-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && createPortal(<div ref={list} className="sel-list" onKeyDown={key} style={{ left: at.left, top: at.top, width: at.width }}>
      <div id={uid + '-list'} role="listbox" aria-multiselectable="true" aria-label={label}>
        {all.map((o, i) => <button key={o} type="button" tabIndex={-1} role="option" aria-selected={value.includes(o)} className={'sel-o' + (i === hi ? ' hi' : '') + (value.includes(o) ? ' on' : '')} onMouseMove={() => i !== hi && setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => toggle(o)}>
          <span className="sel-tick sel-box" aria-hidden="true">{value.includes(o) && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.3 5 8.7 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
          <span className="sel-t">{o}</span>
        </button>)}
      </div>
    </div>, btn.current?.closest('dialog, [role="dialog"]') ?? document.body)}
  </>;
}

/** Interaction patterns for activities. One activity can use more than one. */
export const INTERACTION_PATTERNS = ['Individual', 'Pairs', 'Small groups', 'Teams', 'Whole class', 'Mingle'];
export const interactionList = (text: string) => text.split(/\s*[,/]\s*|\s+(?:and|or)\s+/i).map(v => v.trim()).filter(Boolean).map(v => INTERACTION_PATTERNS.find(p => p.toLowerCase() === v.toLowerCase()) ?? v.charAt(0).toUpperCase() + v.slice(1));
export const interactionText = (list: string[]) => list.join(', ');

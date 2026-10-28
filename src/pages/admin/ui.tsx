import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../../components/avatars';
import { UiIcon } from '../../components/UiIcon';

// The building blocks of both admin areas: page heads, panels, empty states, the side panel for one
// teacher or class, meters for space, filter pills and the bar for working on many rows at once.

export const GB = 1024 ** 3;
// Where side panels and dialogs open: the page, or a window they belong to (the floating Support
// window gives its own element, so a ticket opens inside it rather than over the whole page).
export const PortalHost = createContext<HTMLElement | null>(null);
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function fmtBytes(n: number) {
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < GB) return `${Math.round(n / 1024 / 1024)} MB`;
  const g = n / GB;
  return `${g < 10 ? g.toFixed(1) : Math.round(g)} GB`;
}
export const fmtGb = (gb: number) => `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
const DAY = 864e5;
export const daysSince = (ms?: number) => (ms ? Math.floor((Date.now() - ms) / DAY) : 0);
export function ago(ms?: number) {
  if (!ms) return '';
  const d = daysSince(ms);
  if (d <= 0) {
    const h = Math.floor((Date.now() - ms) / 36e5);
    return h < 1 ? 'just now' : plural(h, 'hour') + ' ago';
  }
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return dateStr(ms);
}
export const dateStr = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const millis = (t?: { toMillis?: () => number } | number | null) => (typeof t === 'number' ? t : t?.toMillis?.() ?? 0);

export function PageHead({ title, lede, actions, crumb }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <header className="hq-head">
      <div className="hq-head-t">
        {crumb && <div className="hq-crumb">{crumb}</div>}
        <h1 className="hq-title">{title}</h1>
        {lede && <p className="hq-lede">{lede}</p>}
      </div>
      {actions && <div className="hq-head-acts">{actions}</div>}
    </header>
  );
}

export function Panel({ title, action, children, className = '', id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const hid = useId();
  return (
    <section className={'hq-panel ' + className} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || action) && (
        <header className="hq-panel-h">
          {title && <h2 id={hid}>{title}</h2>}
          {action && <span className="hq-panel-a">{action}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="hq-empty">
      <b>{title}</b>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}

export const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'set-toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
);

export function GbInput({ value, onSave, max = 1000, label = 'Space in GB' }: { value: number; onSave: (gb: number) => void; max?: number; label?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const save = () => {
    const n = Number(v);
    if (v.trim() === '' || !Number.isFinite(n) || n < 0) return setV(String(value));
    if (n !== value) onSave(Math.min(max, n));
  };
  return (
    <span className="hq-gb">
      <input type="number" inputMode="decimal" aria-label={label} min={0} max={max} step={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <span>GB</span>
    </span>
  );
}

export function TextInput({ value, onSave, placeholder, label, max = 60, className = '' }: { value: string; onSave: (v: string) => void; placeholder?: string; label: string; max?: number; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className={'hq-in ' + className} value={v} placeholder={placeholder} aria-label={label} maxLength={max} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

export function Who({ name, sub, pic, size = 34 }: { name: string; sub?: ReactNode; pic?: string; size?: number }) {
  return (
    <span className="hq-who">
      <Avatar k={pic} name={name} size={size} />
      <span className="hq-who-t">
        <b>{name}</b>
        {sub && <span>{sub}</span>}
      </span>
    </span>
  );
}

// Space: what is used, against what there is. Past the limit the bar is hatched, not coloured.
export function Meter({ used, of, small }: { used: number; of: number; small?: boolean }) {
  const pct = of > 0 ? (used / of) * 100 : 0;
  return (
    <span className={'hq-meter' + (small ? ' small' : '') + (pct >= 100 ? ' over' : pct >= 90 ? ' near' : '')} role="img" aria-label={`${Math.round(pct)}% used`}>
      <i style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  );
}

export type Pill = { v: string; label: string; n?: number };
export function Pills({ value, options, onChange, label }: { value: string; options: Pill[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="hq-pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={'hq-pill' + (value === o.v ? ' on' : '')} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
          {o.n !== undefined && <span className="hq-pill-n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <label className="hq-search">
      <UiIcon name="search" size={16} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
    </label>
  );
}

export function Check({ checked, onChange, label, mixed }: { checked: boolean; onChange: (v: boolean) => void; label: string; mixed?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!mixed;
  }, [mixed]);
  return <input ref={ref} type="checkbox" className="hq-check" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()} />;
}

export function useSelection(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const key = ids.join();
  // Rows that are no longer shown drop out of the selection.
  useEffect(() => setSel((s) => new Set([...s].filter((x) => ids.includes(x)))), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    sel,
    has: (id: string) => sel.has(id),
    toggle: (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }),
    all: (on: boolean) => setSel(on ? new Set(ids) : new Set()),
    clear: () => setSel(new Set()),
    every: ids.length > 0 && ids.every((x) => sel.has(x)),
    some: ids.some((x) => sel.has(x)),
  };
}

export function BulkBar({ n, what, onClear, children }: { n: number; what: [string, string]; onClear: () => void; children: ReactNode }) {
  if (!n) return null;
  return (
    <div className="hq-bulk" role="region" aria-label="Selected">
      <b>{plural(n, what[0], what[1])} selected</b>
      <span className="hq-bulk-acts">{children}</span>
      <button type="button" className="btn link small" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

// A settings row: what it is on the left, the control on the right.
export function Setting({ title, about, children, sub }: { title: string; about?: ReactNode; children?: ReactNode; sub?: boolean }) {
  return (
    <div className={'hq-set' + (sub ? ' sub' : '')}>
      <span className="hq-set-t">
        <b>{title}</b>
        {about && <span>{about}</span>}
      </span>
      {children && <span className="hq-set-c">{children}</span>}
    </div>
  );
}

// The side panel for one teacher or class: from the right on a computer, the whole screen on a phone.
export function Drawer({ title, sub, pic, onClose, children, foot }: { title: string; sub?: ReactNode; pic?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  const host = useContext(PortalHost);
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.hq-drawer-x')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.sel-list, .dialog.ask')) onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (e.preventDefault(), f[0].focus());
    };
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('keydown', key), before?.focus?.());
  }, [onClose]);
  return createPortal(
    <div className="hq-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="hq-drawer" role="dialog" aria-modal="true" aria-labelledby={hid}>
        <header className="hq-drawer-h">
          {pic}
          <span className="hq-drawer-t">
            <h2 id={hid}>{title}</h2>
            {sub && <span>{sub}</span>}
          </span>
          <button type="button" className="hq-drawer-x" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="hq-drawer-b">{children}</div>
        {foot && <footer className="hq-drawer-f">{foot}</footer>}
      </div>
    </div>,
    host ?? document.body,
  );
}

export function DrawerPart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hq-dpart">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// A small dialog for one form, in the app's own look.
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const host = useContext(PortalHost);
  const hid = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.sel-list') && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="hq-scrim center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'hq-sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={hid}>
        <header className="hq-sheet-h">
          <h2 id={hid}>{title}</h2>
          <button type="button" className="hq-drawer-x" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>,
    host ?? document.body,
  );
}

// A short note that says what just happened, and goes by itself.
export function useNote() {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 5000);
    return () => clearTimeout(t);
  }, [note]);
  const el = note ? (
    <div className="hq-toast" role="status">
      {note}
    </div>
  ) : (
    <div className="hq-toast-slot" role="status" />
  );
  return [el, setNote] as const;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';
import { NSelect } from './Select';
import { copyText } from '../lib/copyText';
import './share.css';

// One share window for everything in ELT Suite, laid out the way people know from other apps:
// “Share ‘name’”, a field to add people (suggestions as soon as it is clicked), the people with
// access and what each can do, general access, then Copy link and Done.

export function ShareShell({ name, onClose, link, linkNote, children, help }: {
  name: string;
  onClose: () => void;
  // The link to copy: a string, or a function that makes it (sharing first if it has to).
  link?: string | (() => Promise<string>);
  linkNote?: string;
  children: ReactNode;
  help?: string;
}) {
  const [copied, setCopied] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const copy = async () => {
    try {
      const url = typeof link === 'function' ? await link() : link;
      if (!url) return;
      await copyText(url);
      setCopied(linkNote || 'Link copied');
      window.setTimeout(() => setCopied(''), 2400);
    } catch {
      setCopied('We couldn’t copy the link. Try again.');
    }
  };
  return createPortal(
    <div className="s2-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="s2" role="dialog" aria-modal="true" aria-label={`Share “${name}”`}>
        <header className="s2-head">
          <h2>Share <span>“{name}”</span></h2>
          {help && <a className="s2-ic" href={help} target="_blank" rel="noopener noreferrer" aria-label="Help with sharing" data-tip="Help"><UiIcon name="help" size={20} /></a>}
        </header>
        <div className="s2-body">{children}</div>
        <footer className="s2-foot">
          {link ? (
            <button type="button" className="s2-copy" onClick={() => void copy()}>
              <UiIcon name="link" size={17} /> Copy link
            </button>
          ) : <span />}
          {copied && <span className="s2-toast" role="status">{copied}</span>}
          <button type="button" className="s2-done" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export type Pick = { key: string; name: string; sub?: string; face?: ReactNode };

// The “Add people” field: chips for the people chosen, suggestions under it.
export function AddPeople({ placeholder, options, picked, onPick, onUnpick, roleSelect, loading }: {
  placeholder: string;
  options: Pick[];
  picked: Pick[];
  onPick: (p: Pick) => void;
  onUnpick: (key: string) => void;
  roleSelect?: ReactNode;
  loading?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const s = q.trim().toLowerCase();
  const found = options.filter((p) => !picked.some((x) => x.key === p.key) && (!s || `${p.name} ${p.sub ?? ''}`.toLowerCase().includes(s))).slice(0, 7);
  useEffect(() => setHi(0), [q]);
  const pick = (p: Pick) => { onPick(p); setQ(''); input.current?.focus(); };
  return (
    <div className={'s2-add' + (open ? ' on' : '') + (picked.length ? ' has' : '')}>
      <div className="s2-field" onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}>
        <span className="s2-float">{placeholder}</span>
        <span className="s2-chips">
          {picked.map((p) => (
            <span key={p.key} className="s2-chip">
              {p.face}
              {p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onUnpick(p.key)}>×</button>
            </span>
          ))}
          <input
            ref={input}
            value={q}
            onChange={(e) => (setQ(e.target.value), setOpen(true))}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(found.length - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter' && found[hi]) { e.preventDefault(); pick(found[hi]); }
              else if (e.key === 'Backspace' && !q && picked.length) onUnpick(picked[picked.length - 1].key);
            }}
            aria-label={placeholder}
            role="combobox"
            aria-expanded={open && found.length > 0}
            autoComplete="off"
          />
        </span>
        {roleSelect && picked.length > 0 && <span className="s2-role">{roleSelect}</span>}
      </div>
      {open && (found.length > 0 || loading || s) && (
        <div className="s2-sugg" role="listbox">
          {loading && !found.length ? <span className="s2-empty">One moment…</span> : !found.length ? <span className="s2-empty">No one found for “{q.trim()}”.</span> : found.map((p, i) => (
            <button key={p.key} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => pick(p)}>
              <span className="s2-face">{p.face ?? <span className="s2-ini">{p.name.trim().slice(0, 1).toUpperCase()}</span>}</span>
              <span className="s2-who"><b>{p.name}</b>{p.sub && <span>{p.sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One person (or class) with access, and what they can do.
export function AccessRow({ face, name, sub, right }: { face: ReactNode; name: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="s2-row">
      <span className="s2-face">{face}</span>
      <span className="s2-who"><b>{name}</b>{sub && <span>{sub}</span>}</span>
      <span className="s2-right">{right}</span>
    </div>
  );
}

// A role menu that also removes the person, as in the familiar share windows.
export function RoleMenu<K extends string>({ value, roles, onChange, onRemove, label }: { value: K; roles: { k: K; label: string }[]; onChange?: (k: K) => void; onRemove?: () => void; label: string }) {
  if (!onChange && !onRemove) return <span className="s2-fixed">{roles.find((r) => r.k === value)?.label}</span>;
  return (
    <NSelect className="s2-sel" aria-label={label} value={value} onChange={(e) => (e.target.value === '__remove' ? onRemove?.() : onChange?.(e.target.value as K))}>
      {roles.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
      {onRemove && <option value="__remove">Remove access</option>}
    </NSelect>
  );
}

// General access: who can open it with the link.
export function GeneralAccess({ open, children, about }: { open: boolean; children: ReactNode; about: string }) {
  return (
    <section className="s2-gen">
      <h3>General access</h3>
      <div className={'s2-gen-row' + (open ? ' open' : '')}>
        <span className="s2-gen-ic"><UiIcon name={open ? 'link' : 'lock'} size={18} /></span>
        <span className="s2-gen-c">
          <span className="s2-gen-sel">{children}</span>
          <span className="s2-gen-about">{about}</span>
        </span>
      </div>
    </section>
  );
}

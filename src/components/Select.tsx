import { UiIcon } from './UiIcon';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A drop-down in the app's own style, in place of the browser's: the choice with a chevron, and
// a list under it with a tick by the current one. Arrow keys, Enter and Escape work.

export type Option<T extends string> = { v: T; label: string; hint?: string; icon?: string };

// search: type to narrow the list (a combobox); on by default for long lists.
export function Select<T extends string>({ value, options: all, onChange, label, placeholder = 'Choose…', className = '', disabled, search, id }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; placeholder?: string; className?: string; disabled?: boolean; search?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const typing = search ?? all.length > 7;
  const options = typing && q.trim() ? all.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) : all;
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0, width: 0, up: false, bottom: 0 });
  const cur = all.find((o) => o.v === value);
  const uid = useId().replace(/:/g, '');
  // Touch screens: the list opens without the keyboard; tap the find box to type.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const typed = useRef({ s: '', at: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 200;
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 14;
    const width = Math.max(r.width, 200);
    // Opening upwards, the list keeps its bottom by the button, so typing to find does not leave it floating.
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 - h : r.bottom + 6, width, up, bottom: window.innerHeight - r.top + 6 });
  }, [open]);
  useEffect(() => {
    if (!open) return setQ('');
    setHi(Math.max(0, options.findIndex((o) => o.v === value)));
    const down = (e: MouseEvent) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const away = (e?: Event) => {
      if(e&&list.current?.contains(e.target as Node))return;
      const r=btn.current?.getBoundingClientRect();if(!r)return;
      if(r.bottom<0||r.top>window.innerHeight)return setOpen(false);
      const h=list.current?.offsetHeight??200,width=Math.max(r.width,200);
      const up=r.bottom+6+h>window.innerHeight-8&&r.top>h+14;
      setAt({left:Math.max(8,Math.min(r.left,window.innerWidth-width-8)),top:up?r.top-6-h:r.bottom+6,width,up,bottom:window.innerHeight-r.top+6});
    };
    // The on-screen keyboard changes the height only: that keeps the list open.
    const w0 = window.innerWidth;
    const resized = () => window.innerWidth !== w0 && setOpen(false);
    document.addEventListener('mousedown', down);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', resized);
    return () => (document.removeEventListener('mousedown', down), window.removeEventListener('scroll', away, true), window.removeEventListener('resize', resized));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: T) => (onChange(v), setOpen(false), btn.current?.focus());
  // The highlighted choice stays in sight as the arrow keys move.
  useEffect(() => {
    const menu = list.current, option = menu?.querySelector<HTMLElement>('.sel-o.hi');
    if (!open || !menu || !option) return;
    // Scroll only the options, not the surrounding lesson editor.
    const row = option.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
    if (row.top < bounds.top) menu.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) menu.scrollTop += row.bottom - bounds.bottom;
  }, [open, hi]);
  const mouse = useRef(false);
  const key = (e: React.KeyboardEvent) => {
    const n = options.length;
    const move = (to: number) => (e.preventDefault(), (mouse.current = false), open ? setHi(Math.max(0, Math.min(n - 1, to))) : setOpen(true));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      mouse.current = false;
      setHi((h) => (h + 1) % Math.max(1, n));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      mouse.current = false;
      setHi((h) => (h - 1 + n) % Math.max(1, n));
    } else if (open && (e.key === 'Home' || e.key === 'PageUp') && !(e.target instanceof HTMLInputElement && e.key === 'Home')) move(e.key === 'Home' ? 0 : hi - 6);
    else if (open && (e.key === 'End' || e.key === 'PageDown') && !(e.target instanceof HTMLInputElement && e.key === 'End')) move(e.key === 'End' ? n - 1 : hi + 6);
    else if (e.key === 'Enter' || (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !typed.current.s)) {
      e.preventDefault();
      if (open && options[hi]) pick(options[hi].v);
      else setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === 'Tab' && open) setOpen(false);
    else if (!typing && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Short lists: type the first letters to jump, as in the browser's own drop-down.
      const now = Date.now();
      typed.current = { s: (now - typed.current.at < 700 ? typed.current.s : '') + e.key.toLowerCase(), at: now };
      const q2 = typed.current.s;
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(q2));
      if (i < 0) return;
      e.preventDefault();
      if (open) setHi(i);
      else onChange(options[i].v);
    }
  };
  return (
    <>
      <button ref={btn} id={id} type="button" className={'sel ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid + '-list' : undefined} aria-activedescendant={open && !typing && options[hi] ? `${uid}-o${hi}` : undefined} aria-label={label} disabled={disabled} onClick={() => setOpen((o) => !o)} onKeyDown={key}>
        {cur?.icon && <UiIcon name={cur.icon} size={16} />}<span className={'sel-v' + (cur ? '' : ' empty')}>{cur?.label ?? placeholder}</span>
        <svg className="sel-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={list} id={uid + '-list'} className={'sel-list' + (at.up ? ' up' : '')} role="listbox" aria-label={label} onMouseMove={() => (mouse.current = true)} style={at.up ? { left: at.left, bottom: at.bottom, top: 'auto', minWidth: at.width } : { left: at.left, top: at.top, minWidth: at.width }}>
            {typing && (
              <input className="sel-q" type="search" role="combobox" aria-expanded="true" aria-controls={uid + '-list'} aria-autocomplete="list" aria-activedescendant={options[hi] ? `${uid}-o${hi}` : undefined} autoFocus={!touch} autoComplete="off" enterKeyHint="done" value={q} placeholder="Type to find…" aria-label={`Find in ${label}`} onChange={(e) => (setQ(e.target.value), setHi(0))} onKeyDown={key} />
            )}
            {typing && !options.length && <span className="sel-none">Nothing matches.</span>}
            {options.map((o, i) => (
              <button key={o.v} id={`${uid}-o${i}`} type="button" tabIndex={-1} role="option" aria-selected={o.v === value} className={'sel-o' + (i === hi ? ' hi' : '') + (o.v === value ? ' on' : '')} onMouseMove={() => mouse.current && i !== hi && setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.v)}>
                <span className="sel-tick" aria-hidden="true">
                  {o.icon ? <UiIcon name={o.icon} size={16} /> : o.v === value && (
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2.5 6.3 5 8.7 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="sel-t">
                  {o.label}
                  {o.hint && <span className="hint">{o.hint}</span>}
                </span>
              {o.icon && o.v === value && <span className="sel-choice-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>,
          btn.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}

// Several choices at once: ticks beside each, the list stays open while you choose.
// none: when set, nothing ticked is allowed and shows this; otherwise nothing ticked means all.
// onCreate: a box at the end of the list adds a new choice, ticked at once.
export function MultiSelect<T extends string>({ value, options, onChange, label, all = 'Any', none, foot = 'Teachers choose from the ticked ones.', className = '', onCreate, createLabel = 'New…' }: { value: T[]; options: Option<T>[]; onChange: (v: T[]) => void; label: string; all?: string; none?: string; foot?: string; className?: string; onCreate?: (name: string) => Promise<T>; createLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState('');
  const make = async () => {
    const n = fresh.trim();
    if (!n || !onCreate) return;
    const found = options.find((o) => o.label.toLowerCase() === n.toLowerCase());
    const id = found ? found.v : await onCreate(n);
    setFresh('');
    if (!value.includes(id)) onChange([...value, id]);
  };
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0, width: 0, up: false, bottom: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 200;
    const width = Math.max(r.width, 220);
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 14;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 6 - h : r.bottom + 6, width, up, bottom: window.innerHeight - r.top + 6 });
  }, [open]);
  // Keys: ↑ ↓ Home End move between the choices, Space or Enter ticks, Escape or Tab closes.
  const opts = () => Array.from(list.current?.querySelectorAll<HTMLElement>('.sel-o') ?? []);
  const openWith = (i: number) => (setOpen(true), window.setTimeout(() => opts().at(i)?.focus(), 0));
  const btnKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') (e.preventDefault(), openWith(e.key === 'ArrowDown' ? 0 : -1));
  };
  const listKey = (e: React.KeyboardEvent) => {
    const l = opts();
    const i = l.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => (e.preventDefault(), l[(j + l.length) % l.length]?.focus());
    if (e.target instanceof HTMLInputElement) {
      if (e.key === 'ArrowUp') go(-1);
      else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false), btn.current?.focus());
      return;
    }
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false), btn.current?.focus());
    else if (e.key === 'Tab') (e.preventDefault(), setOpen(false), btn.current?.focus());
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    // Escape anywhere closes the list only, not the window it is in.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), setOpen(false), btn.current?.focus());
    const away = (e?: Event) => !(e && list.current?.contains(e.target as Node)) && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', away, true);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', esc, true), window.removeEventListener('scroll', away, true));
  }, [open]);
  const shown = none !== undefined && value.length === 0 ? none : none === undefined && (value.length === 0 || value.length === options.length) ? all : options.filter((o) => value.includes(o.v)).map((o) => o.label).join(', ');
  const flip = (v: T) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : options.map((o) => o.v).filter((x) => x === v || value.includes(x));
    if (next.length || none !== undefined) onChange(next); // without none, at least one stays chosen
  };
  return (
    <>
      <button ref={btn} type="button" className={'sel ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={(e) => (open ? setOpen(false) : e.detail === 0 ? openWith(0) : setOpen(true))} onKeyDown={btnKey}>
        <span className="sel-v">{shown}</span>
        <svg className="sel-chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={list} className={'sel-list' + (at.up ? ' up' : '')} role="listbox" aria-multiselectable="true" aria-label={label} onKeyDown={listKey} style={at.up ? { left: at.left, bottom: at.bottom, top: 'auto', minWidth: at.width } : { left: at.left, top: at.top, minWidth: at.width }}>
            {options.map((o) => {
              const on = (none === undefined && value.length === 0) || value.includes(o.v);
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
            {onCreate && (
              <input className="sel-q sel-new" value={fresh} placeholder={createLabel} aria-label={createLabel} maxLength={40} onChange={(e) => setFresh(e.target.value)} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.stopPropagation(), void make())} />
            )}
            {foot && <span className="sel-foot hint">{foot}</span>}
          </div>,
          btn.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}

// The browser's <select>, drawn as our own drop-down: the same props and <option> children,
// so any select in the app can use it as it is. onChange gets { target: { value } } as before.
type NOpt = { v: string; label: string; disabled?: boolean };
const textOf = (n: React.ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : n && typeof n === 'object' && 'props' in (n as object) ? textOf((n as React.ReactElement<{ children?: React.ReactNode }>).props.children) : '';
function optionsOf(children: React.ReactNode, out: NOpt[] = []): NOpt[] {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const el = c as React.ReactElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>;
    if (el.type === 'option') out.push({ v: String(el.props.value ?? textOf(el.props.children)), label: textOf(el.props.children), disabled: el.props.disabled });
    else optionsOf(el.props.children, out);
  });
  return out;
}
export function NSelect({ value, defaultValue, onChange, children, disabled, className, title, id, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { 'aria-label'?: string }) {
  const all = optionsOf(children);
  const [own, setOwn] = useState(String(defaultValue ?? all[0]?.v ?? ''));
  const v = value !== undefined ? String(value) : own;
  // A disabled option with no value is the prompt shown before anything is chosen.
  const prompt = all.find((o) => o.disabled && (o.v === '' || o.v === v));
  const options = all.filter((o) => !o.disabled).map((o) => ({ v: o.v, label: o.label }));
  const label = rest['aria-label'] || title || prompt?.label || 'Choose';
  return (
    <span className="nsel" title={title}>
      <Select
        id={id}
        value={v}
        options={options}
        label={label}
        placeholder={prompt?.label ?? 'Choose…'}
        className={className}
        disabled={disabled}
        onChange={(nv) => {
          setOwn(nv);
          onChange?.({ target: { value: nv }, currentTarget: { value: nv } } as unknown as React.ChangeEvent<HTMLSelectElement>);
        }}
      />
    </span>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keyLabel } from '../lib/keys';
import { tell } from '../lib/ask';
import { useMenuKeys } from './menuKeys';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';

// Right-click menus, the same everywhere: openMenu(event, items) from any onContextMenu.
// <MenuHost/> is mounted once, next to the dialogs.

export type MenuItem = { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | 'sep';
type Open = { x: number; y: number; items: MenuItem[]; kbd?: boolean } | null;

let setter: ((o: Open) => void) | null = null;

export function openMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[]) {
  const list = items.filter((it, i, a) => it !== 'sep' || (i > 0 && i < a.length - 1 && a[i - 1] !== 'sep'));
  if (!list.length || !setter) return;
  e.preventDefault();
  e.stopPropagation();
  setter({ x: e.clientX, y: e.clientY, items: list });
}

// For a button that opens the same menu (the "…" on a card): opens under the button.
export function openMenuAt(el: HTMLElement, items: MenuItem[]) {
  const r = el.getBoundingClientRect();
  // Opened from the keyboard (the button has focus): the first item gets it.
  setter?.({ x: r.left, y: r.bottom + 4, items, kbd: document.activeElement === el });
}

export function MenuHost() {
  const [open, setOpen] = useState<Open>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref, open, () => setOpen(null), !!open?.kbd);
  useEffect(() => {
    setter = setOpen;
    // Never the browser's menu: anywhere the app has no menu of its own, this one.
    const fallback = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      const field = t.closest('input, textarea, [contenteditable=true], .ProseMirror') as HTMLElement | null;
      const link = t.closest('a[href]') as HTMLAnchorElement | null;
      const text = window.getSelection()?.toString() ?? '';
      const items: MenuItem[] = [];
      const copy = (v: string) => void navigator.clipboard?.writeText(v).catch(() => {});
      if (field) {
        items.push(
          { label: 'Cut', icon: '', hint: keyLabel('Mod+X'), disabled: !text, onClick: () => document.execCommand('cut') },
          { label: 'Copy', icon: 'copyall', hint: keyLabel('Mod+C'), disabled: !text, onClick: () => document.execCommand('copy') },
          { label: 'Paste', icon: '', hint: keyLabel('Mod+V'), onClick: () => void (navigator.clipboard?.readText ? navigator.clipboard.readText() : Promise.reject()).then((v) => (field.focus(), document.execCommand('insertText', false, v))).catch(() => (field.focus(), void tell(`Your browser doesn’t let menus paste. Press ${keyLabel('Mod+V')} to paste.`))) },
          'sep',
          { label: 'Select all', icon: '', hint: keyLabel('Mod+A'), onClick: () => (field.focus(), document.execCommand('selectAll')) },
        );
      } else if (text) items.push({ label: 'Copy', icon: 'copyall', hint: keyLabel('Mod+C'), onClick: () => copy(text) });
      if (link) items.push(...(items.length ? (['sep'] as MenuItem[]) : []), { label: 'Open in a new tab', icon: 'fullscreen', onClick: () => window.open(link.href, '_blank', 'noopener') }, { label: 'Copy the link', icon: 'link', onClick: () => copy(link.href) });
      if (!items.length)
        items.push({ label: 'Back', icon: 'prev', disabled: window.history.length < 2, onClick: () => window.history.back() }, { label: 'Reload', icon: 'sync', onClick: () => window.location.reload() }, 'sep', { label: 'Copy the link to this page', icon: 'link', onClick: () => copy(window.location.href) });
      e.preventDefault();
      setOpen({ x: e.clientX, y: e.clientY, items });
    };
    document.addEventListener('contextmenu', fallback);
    return () => (document.removeEventListener('contextmenu', fallback), void (setter = null));
  }, []);
  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(open.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(open.y, window.innerHeight - r.height - 8)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if ((e.type === 'mousedown' || e.type === 'pointerdown') && ref.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    window.addEventListener('mousedown', close, true);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div ref={ref} className="ctx-menu" role="menu" style={pos ?? { left: open.x, top: open.y, visibility: 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
      {open.items.map((it, i) =>
        it === 'sep' ? (
          <span key={i} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={'ctx-item' + (it.danger ? ' danger' : '')}
            disabled={it.disabled}
            onClick={() => {
              setOpen(null);
              it.onClick();
            }}
          >
            <span className="ctx-ic">{it.icon ? <UiIcon name={it.icon} size={15} /> : null}</span>
            <span className="ctx-l">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

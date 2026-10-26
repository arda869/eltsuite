import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';

// Right-click menus, the same everywhere: openMenu(event, items) from any onContextMenu.
// <MenuHost/> is mounted once, next to the dialogs.

export type MenuItem = { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | 'sep';
type Open = { x: number; y: number; items: MenuItem[] } | null;

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
  setter?.({ x: r.left, y: r.bottom + 4, items });
}

export function MenuHost() {
  const [open, setOpen] = useState<Open>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setter = setOpen;
    return () => void (setter = null);
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
      if (e.type === 'mousedown' && ref.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    window.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close, true);
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

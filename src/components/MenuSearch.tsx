import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DocumentMenuItem } from './DocumentMenuBar';

type Menu = { label: string; items: DocumentMenuItem[] };
type Hit = { path: string; item: Exclude<DocumentMenuItem, 'sep'> };

// Every command in the menus, by name: type a few letters, then Enter. Opened from Help or Alt+/.
export function MenuSearch({ menus, onClose }: { menus: Menu[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const all = useMemo<Hit[]>(() => menus.flatMap((m) => m.items.filter((i): i is Exclude<DocumentMenuItem, 'sep'> => i !== 'sep').map((item) => ({ path: m.label, item }))), [menus]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? all.filter(({ path, item }) => words.every((w) => `${item.label} ${path}`.toLowerCase().includes(w))).sort((a, b) => Number(!!a.item.disabled) - Number(!!b.item.disabled)).slice(0, 12) : [];
  useEffect(() => { ref.current?.showModal?.(); }, []);
  useEffect(() => setAt(0), [q]);
  const run = (h?: Hit) => {
    if (!h || h.item.disabled) return;
    onClose();
    window.setTimeout(() => h.item.run(), 0);
  };
  return (
    <dialog ref={ref} className="ms-dialog" aria-label="Search the menus" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="ms-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></svg>
        <input
          autoFocus
          className="ms-input"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits[at] ? `${listId}-${at}` : undefined}
          placeholder="Search the menus, for example margins or bold"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => Math.min(hits.length - 1, n + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => Math.max(0, n - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(hits[at]); }
          }}
        />
        <kbd className="ms-kbd">Alt+/</kbd>
      </div>
      <ul id={listId} className="ms-list" role="listbox" aria-label="Menu commands">
        {hits.map((h, i) => (
          <li key={h.path + h.item.label} id={`${listId}-${i}`} role="option" aria-selected={i === at} aria-disabled={h.item.disabled || undefined} className={'ms-hit' + (i === at ? ' on' : '') + (h.item.disabled ? ' off' : '')} onMouseEnter={() => setAt(i)} onMouseDown={(e) => (e.preventDefault(), run(h))}>
            <span className="ms-label">{h.item.label}</span>
            <span className="ms-path">{h.path}</span>
            {h.item.hint && <kbd className="ms-kbd">{h.item.hint}</kbd>}
          </li>
        ))}
      </ul>
      {words.length > 0 && !hits.length && <p className="ms-empty">Nothing in the menus matches “{q}”. Try another word.</p>}
      {!words.length && <p className="ms-empty">Type what you want to do. Enter runs the first match.</p>}
    </dialog>
  );
}

// Every command with a keyboard shortcut, by menu.
export function ShortcutList({ menus, onClose }: { menus: Menu[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const groups = menus.map((m) => ({ label: m.label, items: m.items.filter((i): i is Exclude<DocumentMenuItem, 'sep'> => i !== 'sep' && !!i.hint) })).filter((g) => g.items.length);
  return (
    <dialog ref={ref} className="ms-dialog ms-keys" aria-labelledby="ms-keys-h" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="ms-keys-head"><h2 id="ms-keys-h">Keyboard shortcuts</h2><button type="button" className="btn small-btn" onClick={onClose}>Close</button></div>
      <div className="ms-keys-grid">
        <section><h3>Help</h3><p className="ms-row"><span>Search the menus</span><kbd className="ms-kbd">Alt+/</kbd></p></section>
        {groups.map((g) => (
          <section key={g.label}>
            <h3>{g.label}</h3>
            {g.items.map((i) => <p key={i.label} className="ms-row"><span>{i.label}</span><kbd className="ms-kbd">{i.hint}</kbd></p>)}
          </section>
        ))}
      </div>
    </dialog>
  );
}

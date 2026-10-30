import { UiIcon } from './UiIcon';
import { useId, useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import { useMenuKeys } from './menuKeys';
export type DocumentMenuItem = { label: string; run: () => void; disabled?: boolean; checked?: boolean; hint?: string; icon?: string } | 'sep';
const commandIcon = (label: string) => {
  const icons: Record<string, string> = { 'Page setup…': 'settings', 'Download Word': 'export', 'Download PDF': 'export', Print: 'script', Undo: 'prev', Redo: 'next', 'Select all': 'copyall', Pages: 'task', Pageless: 'script', 'Comments and suggestions': 'discuss', 'Show paragraph marks': 'script', 'Browse all elements…': 'plus', 'Picture…': 'picture', Table: 'board', 'Link…': 'link', 'Cite a source…': 'classes', Bold: 'textSize', Italic: 'textSize', Underline: 'textSize', Checklist: 'check', 'Clear text formatting': 'eraser', 'Word count': 'textSize', Contributions: 'groups' };
  return icons[label] ?? (label.startsWith('Page colour') ? 'design' : label.startsWith('Align ') ? 'script' : 'settings');
};
export function DocumentMenuBar({ menus }: { menus: { label: string; items: DocumentMenuItem[] }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const root = useDismiss<HTMLDivElement>(active !== null, () => setActive(null));
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useMenuKeys(menu, active === null ? null : active + 1, () => setActive(null), true);
  const next = (i: number) => (i + menus.length) % menus.length;
  return <div className="document-menubar" role="menubar" aria-label="Document menus" ref={root} onKeyDown={(e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('.document-menu-trigger')];
      const from = active ?? buttons.indexOf(document.activeElement as HTMLButtonElement);
      const i = next(from + (e.key === 'ArrowRight' ? 1 : -1));
      buttons[i]?.focus();
      if (active !== null) setActive(i);
    }
  }}>
    {menus.map((m, i) => <span className="document-menu" key={m.label}>
      <button type="button" className={'document-menu-trigger' + (active === i ? ' on' : '')} role="menuitem" aria-haspopup="menu" aria-expanded={active === i} aria-controls={active === i ? id : undefined} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => active !== null && setActive(i)} onClick={() => setActive(active === i ? null : i)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i); } }}>{m.label}</button>
      {active === i && <div className="ctx-menu document-menu-popup" role="menu" aria-label={m.label} id={id} ref={menu}>
        {m.items.map((item, j) => item === 'sep' ? <span key={j} className="ctx-sep" role="separator" /> : <button key={j} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} className="ctx-item" disabled={item.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { setActive(null); item.run(); }}><span className="ctx-ic"><UiIcon name={item.icon ?? commandIcon(item.label)} size={16} /></span><span className="ctx-l">{item.label}</span>{item.checked && <span className="document-menu-check" aria-hidden="true">✓</span>}{item.hint && <span className="ctx-hint">{item.hint}</span>}</button>)}
      </div>}
    </span>)}
  </div>;
}

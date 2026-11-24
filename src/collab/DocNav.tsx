import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { addTab, duplicateTab, moveTab, removeTab, renameTab, type DocTab } from './tabs';
import { openMenuAt } from '../components/ContextMenu';
import { ask } from '../lib/ask';

export type NavHeading = { text: string; level: number };

// The left sidebar of a document page, as in Google Docs: the document's tabs, and under the open
// tab its headings. Click a heading to go to it. Editors add, rename, move, copy and remove tabs.
export function DocNav({ doc, tabs, current, onTab, heads, onHeading, canEdit, collapsed, onCollapse }: {
  doc: Y.Doc;
  tabs: DocTab[];
  current: string;
  onTab: (id: string) => void;
  heads: NavHeading[];
  onHeading: (i: number) => void;
  canEdit: boolean;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
}) {
  const [renaming, setRenaming] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming) input.current?.select(); }, [renaming]);
  if (collapsed) {
    return (
      <nav className="dn dn-collapsed" aria-label="Tabs and outline">
        <button type="button" className="dn-open" onClick={() => onCollapse(false)} aria-label="Show tabs and outline" data-tip="Show tabs and outline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h11M4 18h13" /></svg>
        </button>
      </nav>
    );
  }
  const menu = (t: DocTab, el: HTMLElement) => {
    const i = tabs.findIndex((x) => x.id === t.id);
    openMenuAt(el, [
      { label: 'Rename', icon: 'edit', onClick: () => setRenaming(t.id) },
      { label: 'Duplicate', icon: 'copyall', onClick: () => onTab(duplicateTab(doc, t.id)) },
      ...(i > 0 ? [{ label: 'Move up', icon: 'prev', onClick: () => moveTab(doc, t.id, -1) }] : []),
      ...(i < tabs.length - 1 ? [{ label: 'Move down', icon: 'next', onClick: () => moveTab(doc, t.id, 1) }] : []),
      ...(tabs.length > 1 ? [{ label: 'Delete', icon: 'trash', onClick: () => void ask(`Delete the tab “${t.title}”? Its text goes too. You can’t undo this.`, { ok: 'Delete tab' }).then((ok) => { if (!ok) return; if (t.id === current) onTab(tabs[i === 0 ? 1 : i - 1].id); removeTab(doc, t.id); }) }] : []),
    ]);
  };
  return (
    <nav className="dn" aria-label="Tabs and outline">
      <div className="dn-top">
        <button type="button" className="dn-close" onClick={() => onCollapse(true)} aria-label="Hide tabs and outline" data-tip="Hide tabs and outline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      </div>
      <div className="dn-head">
        <span>Document tabs</span>
        {canEdit && (
          <button type="button" className="dn-add" aria-label="Add a tab" data-tip="Add a tab" onClick={() => onTab(addTab(doc, undefined, current))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      </div>
      <ul className="dn-tabs">
        {tabs.map((t) => (
          <li key={t.id} className={'dn-tab' + (t.id === current ? ' on' : '')}>
            {renaming === t.id ? (
              <input
                ref={input}
                className="dn-rename"
                defaultValue={t.title}
                aria-label="Tab name"
                maxLength={80}
                onBlur={(e) => (renameTab(doc, t.id, e.target.value), setRenaming(''))}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(''); }}
              />
            ) : (
              <button type="button" className="dn-tab-btn" aria-current={t.id === current ? 'page' : undefined} onClick={() => onTab(t.id)} onDoubleClick={() => canEdit && setRenaming(t.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
                <span>{t.title}</span>
              </button>
            )}
            {canEdit && renaming !== t.id && (
              <button type="button" className="dn-more" aria-label={`More for ${t.title}`} onClick={(e) => menu(t, e.currentTarget)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="18.5" r="1.6" /></svg>
              </button>
            )}
            {t.id === current && (
              heads.length ? (
                <ul className="dn-outline" aria-label={`Headings in ${t.title}`}>
                  {heads.map((h, i) => (
                    <li key={i}>
                      <button type="button" className={'dn-h l' + Math.min(3, h.level)} onClick={() => onHeading(i)}>{h.text || 'Untitled heading'}</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dn-empty">Headings you add to this tab appear here.</p>
              )
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

// In a document inside a lesson (and for learners): the tabs as a row above the text, only when
// there is more than one.
export function DocTabStrip({ tabs, current, onTab }: { tabs: DocTab[]; current: string; onTab: (id: string) => void }) {
  if (tabs.length < 2) return null;
  return (
    <div className="dn-strip" role="tablist" aria-label="Document tabs">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === current} className={t.id === current ? 'on' : ''} onClick={() => onTab(t.id)}>
          {t.title}
        </button>
      ))}
    </div>
  );
}

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { UiIcon } from '../components/UiIcon';
import { AppLogo } from '../components/AppGrid';
import { search, tokens, type Group, type Hit } from './engine';
import { useSearchIndex } from './sources';
import './search.css';

// Search everything: one box for files, messages, chats, classes, lessons, learners, the Resource
// Hub, apps and help. Ctrl+K (⌘K on a Mac) opens it anywhere.

const ORDER: Group[] = ['Apps', 'Files', 'Lessons', 'Classes', 'Learners', 'Chats', 'Messages', 'Resource Hub', 'Help'];
const FILTERS: { k: Group | 'all'; label: string }[] = [{ k: 'all', label: 'Everything' }, { k: 'Files', label: 'Files' }, { k: 'Messages', label: 'Messages' }, { k: 'Lessons', label: 'Lessons' }, { k: 'Classes', label: 'Classes' }, { k: 'Learners', label: 'Learners' }, { k: 'Resource Hub', label: 'Resource Hub' }, { k: 'Help', label: 'Help' }];
const ICON: Record<string, string> = { collab: 'edit', slides: 'present', cards: 'board', reading: 'notebook', pdf: 'annotate', games: 'quiz', recordings: 'mic', lesson: 'task', person: 'person', folder: 'folder', help: 'help', settings: 'settings', message: 'message', classes: 'classes', design: 'design', archive: 'archive' };
const APP_KEYS = new Set(['games', 'home', 'classes', 'files', 'resourcehub', 'collab', 'development', 'pdf', 'design', 'video', 'recordings', 'messages', 'colleagues', 'superadmin', 'orgadmin', 'timetable', 'guide', 'rooms']);
const PER_GROUP = 5;
const when = (t?: number) => {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

function Mark({ text, q }: { text: string; q: string[] }) {
  if (!q.length || !text) return <>{text}</>;
  const re = new RegExp(`(${q.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

export function SearchPalette({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const [filter, setFilter] = useState<Group | 'all'>('all');
  const [more, setMore] = useState<Group | null>(null);
  const [sel, setSel] = useState(0);
  const { entries, status } = useSearchIndex(true);
  const dq = useDeferredValue(q);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setSel(0); setMore(null); }, [dq, filter]);

  const hits = useMemo(() => search(filter === 'all' ? entries : entries.filter((e) => e.group === filter || (filter === 'Messages' && e.group === 'Chats')), dq), [entries, dq, filter]);
  const groups = useMemo(() => {
    const by = new Map<Group, Hit[]>();
    for (const h of hits) { const g = by.get(h.e.group) ?? []; g.push(h); by.set(h.e.group, g); }
    // The group with the best match goes first; then the usual order.
    return ORDER.filter((g) => by.has(g)).map((g) => ({ g, all: by.get(g)! })).sort((a, b) => b.all[0].score - a.all[0].score || ORDER.indexOf(a.g) - ORDER.indexOf(b.g)).map(({ g, all }) => ({ g, all, shown: filter !== 'all' || more === g ? all.slice(0, 60) : all.slice(0, PER_GROUP) }));
  }, [hits, filter, more]);
  const flat = groups.flatMap((x) => x.shown);
  const words = tokens(dq);

  const go = (h: Hit) => {
    onClose();
    if (h.e.external) window.open(h.e.to, '_blank', 'noopener');
    else navigate(h.e.to);
  };
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); go(flat[sel]); }
  };

  let n = -1;
  return createPortal(
    <div className="sp-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp" role="dialog" aria-modal="true" aria-label="Search everything">
        <div className="sp-top">
          <UiIcon name="search" size={20} />
          <input
            ref={input}
            className="sp-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={key}
            placeholder="Search files, messages, lessons, learners…"
            aria-label="Search everything"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="sp-results"
            aria-activedescendant={flat[sel] ? `sp-${sel}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="sp-esc">Esc</kbd>
        </div>
        <div className="sp-filters" role="group" aria-label="Look in">
          {FILTERS.map((f) => <button key={f.k} type="button" aria-pressed={filter === f.k} onClick={() => { setFilter(f.k); input.current?.focus(); }}>{f.label}</button>)}
        </div>
        <div className="sp-results" id="sp-results" role="listbox" aria-label="Results" ref={list}>
          {!dq.trim() ? (
            <div className="sp-hint">
              <p>Type a word or two. You’ll see your files and the words inside them, messages, lessons, classes, learners, Resource Hub activities and help.</p>
              <p className="sp-tips"><kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to open. Choose where to look with the buttons above.</p>
            </div>
          ) : !flat.length ? (
            <div className="sp-hint"><p>{status ? 'One moment… Nothing yet for “' + dq.trim() + '”.' : `Nothing found for “${dq.trim()}”. Check the spelling, or try fewer words.`}</p></div>
          ) : groups.map(({ g, all, shown }) => (
            <section key={g} className="sp-group" aria-label={g}>
              <h3>{g}<span>{all.length > 999 ? '999+' : all.length}</span></h3>
              {shown.map((h) => {
                n += 1;
                const i = n;
                return (
                  <div key={h.e.key} id={`sp-${i}`} role="option" aria-selected={sel === i} className="sp-row" onMouseMove={() => sel !== i && setSel(i)} onClick={() => go(h)}>
                    <span className="sp-ico" aria-hidden="true">{APP_KEYS.has(h.e.icon) && (h.e.group === 'Apps' || h.e.group === 'Resource Hub') ? <AppLogo k={h.e.icon} size={26} /> : <UiIcon name={ICON[h.e.icon] ?? 'archive'} size={16} />}</span>
                    <span className="sp-main">
                      <span className="sp-title"><Mark text={h.e.title} q={words} /></span>
                      {h.snippet ? <span className="sp-snip">{h.snippet.before}<mark>{h.snippet.match}</mark>{h.snippet.after}</span> : h.e.sub ? <span className="sp-sub">{h.e.sub}</span> : null}
                      {h.snippet && h.e.sub && <span className="sp-sub">{h.e.sub}</span>}
                    </span>
                    {h.e.at ? <span className="sp-when">{when(h.e.at)}</span> : null}
                  </div>
                );
              })}
              {filter === 'all' && all.length > PER_GROUP && more !== g && <button type="button" className="sp-more" onClick={() => setMore(g)}>Show all {all.length > 60 ? 'the first 60' : all.length} in {g}</button>}
            </section>
          ))}
        </div>
        <div className="sp-foot" aria-live="polite">{status || (dq.trim() ? `${hits.length} found` : '')}</div>
      </div>
    </div>,
    document.body,
  );
}

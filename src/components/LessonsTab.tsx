import { NSelect } from './Select';
import { ask } from '../lib/ask';
import { ShareDialog } from './ShareDialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CopyDialog } from './CopyDialog';
import { RecapDialog } from './Recap';
import { copyLesson } from '../lib/copy';
import { addItem, addTopic, deleteItem, deleteTopic, renameTopic, updateItem, updateTopic, type ClassDoc, type Item, type Topic } from '../lib/classes';

const EYE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EYE_OFF = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M17.9 17.9A10.5 10.5 0 0 1 12 19C5 19 1 12 1 12a19 19 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c7 0 11 7 11 7a19 19 0 0 1-2.2 3.2M1 1l22 22" />
  </svg>
);

const ic = (d: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const LOCK = ic(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
const UNLOCK = ic(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>);

function InlineAdd({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (v: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.trim()) return;
    setBusy(true);
    try {
      await onAdd(v.trim());
      setV('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" className="btn link small add-link" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form className="inline-add" onSubmit={submit}>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        maxLength={120}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <button className="btn primary small-btn" disabled={busy || !v.trim()}>
        Add
      </button>
      <button type="button" className="btn small-btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

const KINDS: { type: Item['type']; label: string; about: string }[] = [
  { type: 'lesson', label: 'Lesson', about: 'Taught live; learners follow you' },
  { type: 'homework', label: 'Homework', about: 'Self-paced, with a due date' },
  { type: 'exam', label: 'Exam', about: 'Start button, timer, results you release' },
  { type: 'practice', label: 'Practice', about: 'Always open, try again as often as they like' },
];

// "+ Add": choose what to add, give it a title (and a due date for homework and exams).
function AddItem({ onAdd }: { onAdd: (title: string, type: Item['type'], due: number | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Item['type']>('lesson');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const label = KINDS.find((k) => k.type === type)!.label;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onAdd(title.trim(), type, due && (type === 'homework' || type === 'exam') ? new Date(due).getTime() : null);
      setTitle('');
      setDue('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" className="btn link small add-link" onClick={() => setOpen(true)}>
        + Add lesson, homework, exam or practice
      </button>
    );
  return (
    <form className="add-item" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <div className="add-kinds" role="radiogroup" aria-label="What to add">
        {KINDS.map((k) => (
          <button key={k.type} type="button" role="radio" aria-checked={type === k.type} className={'add-kind' + (type === k.type ? ' on' : '')} onClick={() => setType(k.type)}>
            <span className="add-kind-name">{k.label}</span>
            <span className="hint">{k.about}</span>
          </button>
        ))}
      </div>
      <span className="add-row">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${label} title`} maxLength={120} aria-label="Title" />
        {(type === 'homework' || type === 'exam') && (
          <label className="item-due">
            <span className="hint">Due</span>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        )}
        <button className="btn primary small-btn" disabled={busy || !title.trim()}>
          Add {label.toLowerCase()}
        </button>
        <button type="button" className="btn small-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    </form>
  );
}

function TopicTitle({ c, t }: { c: ClassDoc; t: Topic }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(t.name);
  if (!editing)
    return (
      <button type="button" className="topic-name" onClick={() => setEditing(true)} title="Rename topic">
        {t.name}
      </button>
    );
  const save = async () => {
    setEditing(false);
    if (v.trim() && v.trim() !== t.name) await renameTopic(c.id, t.id, v.trim());
    else setV(t.name);
  };
  return (
    <input
      className="topic-input"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') {
          setV(t.name);
          setEditing(false);
        }
      }}
      aria-label="Topic name"
    />
  );
}

const MORE = ic(<><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>);
const CAL = ic(<><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>);

// When a lesson happens, or when homework or an exam is due: a small chip, or a calendar icon when not set.
function WhenChip({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  if (item.type === 'practice') return null;
  const at = item.type === 'lesson' ? item.schedule?.at : item.due;
  const label = item.type === 'lesson' ? 'When' : 'Due';
  if (!at)
    return (
      <button type="button" className={'icon-btn' + (open ? ' on' : '')} aria-label={item.type === 'lesson' ? 'Set when it happens' : 'Set a due date'} data-tip={item.type === 'lesson' ? 'Set when it happens' : 'Set a due date'} onClick={onToggle}>
        {CAL}
      </button>
    );
  const d = new Date(at);
  const late = item.type !== 'lesson' && at < Date.now();
  return (
    <button type="button" className={'when-chip' + (open ? ' on' : '') + (late ? ' past' : '')} onClick={onToggle} data-tip="Change the date">
      {CAL}
      <span>
        {label} {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  );
}

function ItemRow({ c, item, list, topics, onResults }: { c: ClassDoc; item: Item; list: Item[]; topics: Topic[]; onResults?: (item: Item) => void }) {
  const [copying, setCopying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [recap, setRecap] = useState(false);
  const i = list.findIndex((x) => x.id === item.id);
  // Move up or down within its topic by swapping order with the neighbour.
  const move = async (d: number) => {
    const other = list[i + d];
    if (!other) return;
    await Promise.all([updateItem(c.id, item.id, { order: other.order }), updateItem(c.id, other.id, { order: item.order === other.order ? item.order + d : item.order })]);
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [menu]);
  const copyAs = async (type: Item['type'], title: string, done: string) => {
    setBusy(true);
    try {
      await copyLesson(c.id, item.id, c.id, { title, type });
      setMsg(`${done}. The copy is hidden until you show it.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={'item' + (item.hidden ? ' is-hidden' : '')}>
      {sharing && <ShareDialog what={{ kind: 'lesson', title: item.title, src: { classId: c.id, itemId: item.id }, item: Object.fromEntries(Object.entries(item).filter(([k, v]) => v !== undefined && !['id', 'createdAt', 'updatedAt', 'teachingAt'].includes(k))) }} onClose={() => setSharing(false)} />}
      {copying && <CopyDialog kind="lesson" fromClass={c.id} itemId={item.id} title={item.title} onClose={() => setCopying(false)} onDone={setMsg} />}
      <NSelect className="type type-pick" data-type={item.type} value={item.type} aria-label="Type" title="Lesson, homework, exam or practice" onChange={(e) => updateItem(c.id, item.id, { type: e.target.value as Item['type'] })}>
        <option value="lesson">Lesson</option>
        <option value="homework">Homework</option>
        <option value="exam">Exam</option>
        <option value="practice">Practice</option>
      </NSelect>
      <Link to={`/class/${c.id}/lesson/${item.id}`} className="title">
        {item.title}
        {(item.taskCount ?? 0) > 0 && <span className="item-meta">{item.taskCount} {item.taskCount === 1 ? 'task' : 'tasks'}</span>}
      </Link>
      <span className="item-move">
        <button type="button" className="icon-btn" aria-label="Move up" title="Move up" disabled={i <= 0} onClick={() => move(-1)}>
          ↑
        </button>
        <button type="button" className="icon-btn" aria-label="Move down" title="Move down" disabled={i < 0 || i >= list.length - 1} onClick={() => move(1)}>
          ↓
        </button>
        <NSelect className="move-topic" value={item.topicId ?? ''} aria-label="Move to topic" title="Move to topic" onChange={(e) => updateItem(c.id, item.id, { topicId: e.target.value || null, order: Date.now() % 100000 })}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="">Not in a topic</option>
        </NSelect>
      </span>
      <span className="status">{msg || [item.hidden ? 'Hidden from learners' : '', item.locked ? 'Locked' : ''].filter(Boolean).join(' · ')}</span>
      <WhenChip item={item} open={scheduling} onToggle={() => setScheduling((v) => !v)} />
      <button
        type="button"
        className={'icon-btn' + (item.locked ? ' on' : '')}
        aria-label={item.locked ? 'Unlock' : 'Lock'}
        data-tip={item.locked ? 'Unlock' : 'Lock · learners see it but can’t open it'}
        onClick={() => updateItem(c.id, item.id, { locked: !item.locked })}
      >
        {item.locked ? LOCK : UNLOCK}
      </button>
      <button
        type="button"
        className={'icon-btn' + (item.hidden ? ' on' : '')}
        aria-label={item.hidden ? 'Show to learners' : 'Hide from learners'}
        data-tip={item.hidden ? 'Show to learners' : 'Hide from learners'}
        onClick={() => updateItem(c.id, item.id, { hidden: !item.hidden })}
      >
        {item.hidden ? EYE_OFF : EYE}
      </button>
      <span className="menu-anchor" ref={menuRef}>
        <button type="button" className={'icon-btn' + (menu ? ' on' : '')} aria-label="More" data-tip="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          {MORE}
        </button>
        {menu && (
          <div className="menu item-menu" role="menu">
            {item.type === 'lesson' ? (
              <button role="menuitem" onClick={() => (setMenu(false), setRecap(true))}>
                Lesson recap…
              </button>
            ) : (
              <button role="menuitem" onClick={() => (setMenu(false), onResults?.(item))}>
                Results
              </button>
            )}
            <span className="menu-sep" aria-hidden="true" />
            <button role="menuitem" disabled={busy} onClick={() => (setMenu(false), copyAs(item.type, `${item.title} (copy)`, 'Duplicated'))}>
              Duplicate
            </button>
            {(['lesson', 'homework', 'exam', 'practice'] as const)
              .filter((t) => t !== item.type)
              .map((t) => (
                <button key={t} role="menuitem" disabled={busy} onClick={() => (setMenu(false), copyAs(t, item.title, `Copied as ${t}`))}>
                  Copy as {t}
                </button>
              ))}
            <button role="menuitem" onClick={() => (setMenu(false), setCopying(true))}>
              Copy to another class…
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setSharing(true))}>
              Share with colleagues…
            </button>
            <span className="menu-sep" aria-hidden="true" />
            <button role="menuitem" className="danger-item" onClick={() => (setMenu(false), void ask(`Delete “${item.title}”?`).then((ok) => { if (ok) deleteItem(c.id, item.id); }))}>
              Delete
            </button>
          </div>
        )}
      </span>
      {scheduling && item.type !== 'practice' && (
        <span className="item-extra">
          <label className="item-due">
            <span className="hint">{item.type === 'lesson' ? 'When' : 'Due'}</span>
            <input
              type="datetime-local"
              autoFocus
              value={item.type === 'lesson' ? (item.schedule?.at ? toLocal(item.schedule.at) : '') : item.due ? toLocal(item.due) : ''}
              onChange={(e) => {
                const at = e.target.value ? new Date(e.target.value).getTime() : null;
                if (item.type === 'lesson') updateItem(c.id, item.id, { schedule: at ? { at, ...(item.schedule?.url ? { url: item.schedule.url } : {}) } : null });
                else updateItem(c.id, item.id, { due: at });
              }}
            />
          </label>
          {item.type === 'lesson' && item.schedule?.at && (
            <input
              className="item-link"
              type="url"
              placeholder={c.meeting?.url ? 'Video link (uses the class link if empty)' : 'Video link, for example Zoom or Meet'}
              aria-label="Video link for this lesson"
              defaultValue={item.schedule.url ?? ''}
              onBlur={(e) => {
                const url = e.target.value.trim();
                if (url && !/^https:\/\//i.test(url)) return;
                if ((item.schedule?.url ?? '') !== url) updateItem(c.id, item.id, { schedule: { at: item.schedule!.at, ...(url ? { url } : {}) } });
              }}
            />
          )}
          <button type="button" className="btn small" onClick={() => setScheduling(false)}>
            Done
          </button>
        </span>
      )}
      {recap && <RecapDialog c={c} item={item} items={list} onClose={() => setRecap(false)} />}
    </li>
  );
}

const toLocal = (ms: number) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export function LessonsTab({ c, topics, items, onResults }: { c: ClassDoc; topics: Topic[]; items: Item[]; onResults?: (item: Item) => void }) {
  const sortedTopics = [...topics].sort((a, b) => a.order - b.order);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('ll.folded.' + c.id) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggleFold = (id: string) =>
    setCollapsed((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem('ll.folded.' + c.id, JSON.stringify([...n]));
      } catch {
        /* ignore */
      }
      return n;
    });
  const moveTopic = async (t: Topic, d: number) => {
    const j = sortedTopics.findIndex((x) => x.id === t.id) + d;
    const other = sortedTopics[j];
    if (!other) return;
    await Promise.all([updateTopic(c.id, t.id, { order: other.order }), updateTopic(c.id, other.id, { order: t.order === other.order ? t.order + d : t.order })]);
  };
  const byTopic = (id: string | null) => items.filter((i) => (i.topicId ?? null) === id).sort((a, b) => a.order - b.order);
  const unsorted = items.filter((i) => !i.topicId || !topics.some((t) => t.id === i.topicId));
  const nextOrder = (list: { order: number }[]) => (list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0);

  return (
    <div className="lessons">
      {/* Lessons move between teachers by sharing in the app, so there is no text import or export. */}
      {sortedTopics.length === 0 && unsorted.length === 0 && (
        <div className="empty">
          <h2>Start with a topic</h2>
          <p>Topics group your lessons, for example “Unit 4 · Present perfect”. Add a topic, then add lessons inside it.</p>
        </div>
      )}

      {sortedTopics.map((t) => {
        const list = byTopic(t.id);
        return (
          <section key={t.id} className={'topic' + (collapsed.has(t.id) ? ' collapsed' : '')} aria-label={t.name}>
            <div className="topic-head">
              <button type="button" className="icon-btn topic-fold" aria-expanded={!collapsed.has(t.id)} aria-label={collapsed.has(t.id) ? 'Expand topic' : 'Collapse topic'} onClick={() => toggleFold(t.id)}>
                {collapsed.has(t.id) ? '▸' : '▾'}
              </button>
              <TopicTitle c={c} t={t} />
              <span className="hint">
                {list.length} {list.length === 1 ? 'item' : 'items'}
                {t.hidden ? ' · hidden from learners' : ''}
                {t.locked ? ' · locked' : ''}
              </span>
              <span className="topic-acts">
                <button type="button" className="icon-btn" aria-label="Move topic up" title="Move topic up" onClick={() => moveTopic(t, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label="Move topic down" title="Move topic down" onClick={() => moveTopic(t, 1)}>
                  ↓
                </button>
                <button type="button" className={'icon-btn' + (t.hidden ? ' on' : '')} title={t.hidden ? 'Show this topic to learners' : 'Hide this whole topic from learners'} aria-label={t.hidden ? 'Show topic' : 'Hide topic'} onClick={() => updateTopic(c.id, t.id, { hidden: !t.hidden })}>
                  {t.hidden ? EYE_OFF : EYE}
                </button>
                <button type="button" className={'icon-btn' + (t.locked ? ' on' : '')} title={t.locked ? 'Unlock this topic' : 'Lock everything in this topic'} aria-label={t.locked ? 'Unlock topic' : 'Lock topic'} onClick={() => updateTopic(c.id, t.id, { locked: !t.locked })}>
                  {t.locked ? LOCK : UNLOCK}
                </button>
              </span>
              {list.length === 0 && (
                <button
                  type="button"
                  className="btn link small"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => void ask(`Delete the topic “${t.name}”?`).then((ok) => { if (ok) deleteTopic(c.id, t.id); })}
                >
                  Delete topic
                </button>
              )}
            </div>
            <ul className="items">
              {list.map((i) => (
                <ItemRow key={i.id} c={c} item={i} list={list} topics={sortedTopics} onResults={onResults} />
              ))}
            </ul>
            <div className="indent">
              <AddItem onAdd={async (title, type, due) => void (await addItem(c.id, t.id, title, nextOrder(list), type, due))} />
            </div>
          </section>
        );
      })}

      {unsorted.length > 0 && (
        <section className="topic" aria-label="Not in a topic">
          <div className="topic-head">
            <span className="topic-name static">Not in a topic</span>
          </div>
          <ul className="items">
            {unsorted.map((i) => (
              <ItemRow key={i.id} c={c} item={i} list={unsorted} topics={sortedTopics} onResults={onResults} />
            ))}
          </ul>
          <div className="indent">
            <AddItem onAdd={async (title, type, due) => void (await addItem(c.id, null, title, nextOrder(unsorted), type, due))} />
          </div>
        </section>
      )}

      <InlineAdd label="+ New topic" placeholder="For example: Unit 4 · Present perfect" onAdd={async (name) => void (await addTopic(c.id, name, nextOrder(topics)))} />
    </div>
  );
}

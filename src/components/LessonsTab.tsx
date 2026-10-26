import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CopyDialog } from './CopyDialog';
import { ImportDialog } from './ImportDialog';
import { classText, download } from '../lib/transfer';
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
const DUP = ic(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
const COPY_TO = ic(<><path d="M4 12h12M12 6l6 6-6 6" /><path d="M20 4v16" /></>);

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

function ItemRow({ c, item, list, topics }: { c: ClassDoc; item: Item; list: Item[]; topics: Topic[] }) {
  const [copying, setCopying] = useState(false);
  const i = list.findIndex((x) => x.id === item.id);
  // Move up or down within its topic by swapping order with the neighbour.
  const move = async (d: number) => {
    const other = list[i + d];
    if (!other) return;
    await Promise.all([updateItem(c.id, item.id, { order: other.order }), updateItem(c.id, other.id, { order: item.order === other.order ? item.order + d : item.order })]);
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <li className={'item' + (item.hidden ? ' is-hidden' : '')}>
      {copying && <CopyDialog kind="lesson" fromClass={c.id} itemId={item.id} title={item.title} onClose={() => setCopying(false)} onDone={setMsg} />}
      <select className="type type-pick" value={item.type} aria-label="Type" title="Lesson, homework, exam or practice" onChange={(e) => updateItem(c.id, item.id, { type: e.target.value as Item['type'] })}>
        <option value="lesson">Lesson</option>
        <option value="homework">Homework</option>
        <option value="exam">Exam</option>
        <option value="practice">Practice</option>
      </select>
      <Link to={`/class/${c.id}/lesson/${item.id}`} className="title">
        {item.title}
      </Link>
      <span className="item-move">
        <button type="button" className="icon-btn" aria-label="Move up" title="Move up" disabled={i <= 0} onClick={() => move(-1)}>
          ↑
        </button>
        <button type="button" className="icon-btn" aria-label="Move down" title="Move down" disabled={i < 0 || i >= list.length - 1} onClick={() => move(1)}>
          ↓
        </button>
        <select className="move-topic" value={item.topicId ?? ''} aria-label="Move to topic" title="Move to topic" onChange={(e) => updateItem(c.id, item.id, { topicId: e.target.value || null, order: Date.now() % 100000 })}>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="">Unsorted</option>
        </select>
      </span>
      <span className="status">{msg || [item.hidden ? 'Hidden from learners' : '', item.locked ? 'Locked' : ''].filter(Boolean).join(' · ')}</span>
      <button
        type="button"
        className={'icon-btn' + (item.locked ? ' on' : '')}
        aria-label={item.locked ? 'Unlock' : 'Lock'}
        title={item.locked ? 'Unlock' : 'Lock · learners see it but can’t open it'}
        onClick={() => updateItem(c.id, item.id, { locked: !item.locked })}
      >
        {item.locked ? LOCK : UNLOCK}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Duplicate"
        title="Duplicate"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await copyLesson(c.id, item.id, c.id, { title: `${item.title} (copy)` });
            setMsg('Duplicated. The copy is hidden until you show it.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {DUP}
      </button>
      <button type="button" className="icon-btn" aria-label="Copy to another class" title="Copy to another class" onClick={() => setCopying(true)}>
        {COPY_TO}
      </button>
      <button
        type="button"
        className={'icon-btn' + (item.hidden ? ' on' : '')}
        aria-label={item.hidden ? 'Show to learners' : 'Hide from learners'}
        title={item.hidden ? 'Show to learners' : 'Hide from learners'}
        onClick={() => updateItem(c.id, item.id, { hidden: !item.hidden })}
      >
        {item.hidden ? EYE_OFF : EYE}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete"
        title="Delete"
        onClick={() => window.confirm(`Delete “${item.title}”?`) && deleteItem(c.id, item.id)}
      >
        ×
      </button>
    </li>
  );
}

export function LessonsTab({ c, topics, items }: { c: ClassDoc; topics: Topic[]; items: Item[] }) {
  const sortedTopics = [...topics].sort((a, b) => a.order - b.order);
  const [importing, setImporting] = useState(false);
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
  const [exporting, setExporting] = useState(false);
  const byTopic = (id: string | null) => items.filter((i) => (i.topicId ?? null) === id).sort((a, b) => a.order - b.order);
  const unsorted = items.filter((i) => !i.topicId || !topics.some((t) => t.id === i.topicId));
  const nextOrder = (list: { order: number }[]) => (list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0);

  return (
    <div className="lessons">
      <div className="lessons-tools">
        <button type="button" className="btn small-btn" onClick={() => setImporting(true)}>
          Import a lesson from text
        </button>
        <button
          type="button"
          className="btn small-btn"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              download(c.name, await classText(c.id, c.name, window.confirm('Include your teacher notes in the file? Choose Cancel to leave them out, for example when sharing.')));
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? 'Exporting…' : 'Export the class as text'}
        </button>
      </div>
      {importing && <ImportDialog classId={c.id} topics={sortedTopics} onClose={() => setImporting(false)} />}
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
                  onClick={() => window.confirm(`Delete the topic “${t.name}”?`) && deleteTopic(c.id, t.id)}
                >
                  Delete topic
                </button>
              )}
            </div>
            <ul className="items">
              {list.map((i) => (
                <ItemRow key={i.id} c={c} item={i} list={list} topics={sortedTopics} />
              ))}
            </ul>
            <div className="indent">
              <InlineAdd label="+ Add lesson" placeholder="Lesson title" onAdd={async (title) => void (await addItem(c.id, t.id, title, nextOrder(list)))} />
            </div>
          </section>
        );
      })}

      {unsorted.length > 0 && (
        <section className="topic" aria-label="Unsorted">
          <div className="topic-head">
            <span className="topic-name static">Unsorted</span>
          </div>
          <ul className="items">
            {unsorted.map((i) => (
              <ItemRow key={i.id} c={c} item={i} list={unsorted} topics={sortedTopics} />
            ))}
          </ul>
        </section>
      )}

      <InlineAdd label="+ New topic" placeholder="For example: Unit 4 · Present perfect" onAdd={async (name) => void (await addTopic(c.id, name, nextOrder(topics)))} />
    </div>
  );
}

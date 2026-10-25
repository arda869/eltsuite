import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addItem, addTopic, deleteItem, deleteTopic, renameTopic, updateItem, type ClassDoc, type Item, type Topic } from '../lib/classes';

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

function ItemRow({ c, item }: { c: ClassDoc; item: Item }) {
  return (
    <li className={'item' + (item.hidden ? ' is-hidden' : '')}>
      <span className="type">{item.type}</span>
      <Link to={`/class/${c.id}/lesson/${item.id}`} className="title">
        {item.title}
      </Link>
      <span className="status">{item.hidden ? 'Hidden from learners' : ''}</span>
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
  const byTopic = (id: string | null) => items.filter((i) => (i.topicId ?? null) === id).sort((a, b) => a.order - b.order);
  const unsorted = items.filter((i) => !i.topicId || !topics.some((t) => t.id === i.topicId));
  const nextOrder = (list: { order: number }[]) => (list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0);

  return (
    <div className="lessons">
      {sortedTopics.length === 0 && unsorted.length === 0 && (
        <div className="empty">
          <h2>Start with a topic</h2>
          <p>Topics group your lessons, for example “Unit 4 · Present perfect”. Add a topic, then add lessons inside it.</p>
        </div>
      )}

      {sortedTopics.map((t) => {
        const list = byTopic(t.id);
        return (
          <section key={t.id} className="topic" aria-label={t.name}>
            <div className="topic-head">
              <TopicTitle c={c} t={t} />
              <span className="hint">
                {list.length} {list.length === 1 ? 'item' : 'items'}
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
                <ItemRow key={i.id} c={c} item={i} />
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
              <ItemRow key={i.id} c={c} item={i} />
            ))}
          </ul>
        </section>
      )}

      <InlineAdd label="+ New topic" placeholder="For example: Unit 4 · Present perfect" onAdd={(name) => addTopic(c.id, name, nextOrder(topics))} />
    </div>
  );
}

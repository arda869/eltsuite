import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { LEVELS, SKILLS, matches, parseTags, removeFromBank, saveToBank, textOf, updateBankItem, useBank, type BankItem } from '../lib/bank';

// Save a question or a task to the teacher's personal bank.
export function SaveToBankDialog({ uid, kind, content, title: title0, instructions, onClose }: { uid: string; kind: 'question' | 'task'; content: JSONContent[]; title?: string; instructions?: string; onClose: (saved: boolean) => void }) {
  const preview = useMemo(() => textOf(content), [content]);
  const [title, setTitle] = useState(title0 || preview.slice(0, 60));
  const [tags, setTags] = useState('');
  const [level, setLevel] = useState('');
  const [skill, setSkill] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveToBank(uid, { kind, title: title.trim() || 'Untitled', ...(instructions ? { instructions } : {}), content, tags: parseTags(tags), level, skill });
      onClose(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <div className="dialog" role="dialog" aria-label="Save to my question bank" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Save {kind === 'task' ? 'this task' : 'to my question bank'}</h2>
        <span className="hint bank-preview">{preview.slice(0, 220) || '(no text)'}</span>
        <label className="field">
          Name
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
        </label>
        <label className="field">
          Tags <span className="hint">grammar point, topic… separated by commas</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="present perfect, travel" />
        </label>
        <div className="two">
          <label className="field">
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Any</option>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Skill
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">Any</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>
    </div>
  );
}

// Browse the bank and pick something to insert.
export function BankPicker({ uid, onPick, onClose }: { uid: string; onPick: (b: BankItem) => void; onClose: () => void }) {
  const list = useBank(uid);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [skill, setSkill] = useState('');
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [tagText, setTagText] = useState('');
  const tags = useMemo(() => [...new Set(list.flatMap((b) => b.tags))].sort(), [list]);
  const shown = list.filter((b) => matches(b, q, level, skill) && (!tag || b.tags.includes(tag)));
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog wide bank-dialog" role="dialog" aria-label="My question bank" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 style={{ margin: 0 }}>My question bank</h2>
          <span className="hint">{list.length} saved</span>
        </div>
        <div className="bank-filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" autoFocus />
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
            <option value="">Any level</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">
            <option value="">Any skill</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </div>
        {!list.length ? (
          <p className="hint">Nothing saved yet. Select a question in a task and right-click → “Save to my question bank”, or use “Save task to my bank” in the task settings.</p>
        ) : !shown.length ? (
          <p className="hint">Nothing matches.</p>
        ) : (
          <ul className="bank-list">
            {shown.map((b) => (
              <li key={b.id} className="bank-row">
                <button type="button" className="bank-main" onClick={() => onPick(b)} title="Insert here">
                  <span className="bank-title">
                    <span className={'tag-pill ' + b.kind}>{b.kind === 'task' ? 'Task' : 'Question'}</span>
                    {b.title}
                  </span>
                  <span className="hint bank-prev">{b.preview}</span>
                  <span className="hint">
                    {[b.level, b.skill, ...b.tags].filter(Boolean).join(' · ') || 'no tags'}
                  </span>
                </button>
                <span className="bank-acts">
                  {editing === b.id ? (
                    <input
                      value={tagText}
                      autoFocus
                      aria-label="Tags"
                      onChange={(e) => setTagText(e.target.value)}
                      onBlur={() => (updateBankItem(uid, b.id, { tags: parseTags(tagText) }), setEditing(null))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <button type="button" className="btn link small" onClick={() => (setEditing(b.id), setTagText(b.tags.join(', ')))}>
                      Tags
                    </button>
                  )}
                  <button type="button" className="btn link small" onClick={() => window.confirm(`Remove “${b.title}” from your bank?`) && removeFromBank(uid, b.id)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </span>
      </div>
    </div>
  );
}

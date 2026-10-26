import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import { CEFR, CORE, DefField, GROUPS, POS, TRANSLATION, type DefData } from '../editor/Definition';
import { speak } from '../lib/media';
import { updateClass, type ClassDoc, type Item, type Topic } from '../lib/classes';
import {
  addEntry,
  addMyNote,
  approve,
  canEdit,
  canLearnerAdd,
  entryTitle,
  listHistory,
  notebookSettings,
  reject,
  removeEntry,
  removeMyNote,
  restore,
  saveEntry,
  saveMyNote,
  saveTranslation,
  searchText,
  setHidden,
  updateTeacherFields,
  useMyNotes,
  useNotebook,
  type Bank,
  type Entry,
  type EntryData,
  type EntryType,
  type HistoryEntry,
  type MyNote,
  type NotebookLevel,
} from '../lib/notebook';
import { TaskRenderer } from './TaskRenderer';
import { NoteEditor } from './NoteEditor';
import { TaskEditor } from '../editor/TaskEditor';
import { mergeKey, questionIds, scoreTask, splitKey, type AnswerKey, type Responses } from '../lib/questions';

export type Me = { uid: string; name: string; learnerId?: string; teacher: boolean };
export type Prefill = { type: 'vocab' | 'note'; word?: string; example?: string; text?: string; itemId?: string | null; taskId?: string | null; mine?: boolean };
type Tab = 'class' | 'mine' | 'grammar' | 'vocab' | 'pending' | 'settings';

const SPEAK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);
const when = (t?: { toMillis: () => number }) => (t ? new Date(t.toMillis()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

// ---------------------------------------------------------------- forms

function VocabForm({ data, setData, withTranslation }: { data: EntryData; setData: (d: EntryData) => void; withTranslation?: boolean }) {
  const [more, setMore] = useState(false);
  const def = data.def ?? {};
  const setDef = (fn: (d: DefData) => DefData) => setData({ ...data, def: fn(def) });
  return (
    <div className="nb-form">
      <label className="def-field">
        <span>Word or phrase</span>
        <input className="nb-word" value={data.word ?? ''} autoFocus placeholder="reluctant" onChange={(e) => setData({ ...data, word: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      {CORE.map((f) => (
        <DefField key={f.k} f={f} data={def} setData={setDef} />
      ))}
      {withTranslation && <div className="def-two">{TRANSLATION.map((f) => <DefField key={f.k} f={f} data={def} setData={setDef} />)}</div>}
      <button type="button" className="btn link small def-more" onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer details' : 'More details: form, pronunciation, use, learner help'}
      </button>
      {more &&
        GROUPS.map((g) => (
          <div key={g.title} className="def-group">
            <span className="def-group-title">{g.title}</span>
            {g.fields.map((f) => (
              <DefField key={f.k} f={f} data={def} setData={setDef} />
            ))}
          </div>
        ))}
    </div>
  );
}

function NoteForm({ data, setData }: { data: EntryData; setData: (d: EntryData) => void }) {
  return (
    <div className="nb-form">
      <input className="nb-title" value={data.title ?? ''} placeholder="Title (optional)" onChange={(e) => setData({ ...data, title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      <NoteEditor value={data.text} onChange={(v) => setData({ ...data, text: v })} autoFocus />
      <input className="nb-tags" value={(data.tags ?? []).join(', ')} placeholder="Tags, separated by commas" onChange={(e) => setData({ ...data, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}

function EntryForm({ type, initial, onSave, onCancel, withTranslation, saveLabel = 'Save' }: { type: EntryType; initial: EntryData; onSave: (d: EntryData) => Promise<void> | void; onCancel: () => void; withTranslation?: boolean; saveLabel?: string }) {
  const [data, setData] = useState<EntryData>(initial);
  const [busy, setBusy] = useState(false);
  const ok = type === 'vocab' ? !!data.word?.trim() : !!(data.title?.trim() || (data.text && JSON.stringify(data.text).includes('"text"')));
  return (
    <div className="nb-editing">
      {type === 'vocab' ? <VocabForm data={data} setData={setData} withTranslation={withTranslation} /> : <NoteForm data={data} setData={setData} />}
      <span className="nb-form-foot">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(data);
            } finally {
              setBusy(false);
            }
          }}
        >
          {saveLabel}
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- cards

export function VocabBody({ data, translation }: { data: EntryData; translation?: ReactNode }) {
  const d = data.def ?? {};
  const [more, setMore] = useState(false);
  const row = (label: string, v?: string) =>
    v ? (
      <span className="dc-row">
        <span className="dc-k">{label}</span>
        <span className="dc-v">{v}</span>
      </span>
    ) : null;
  const extra = d.family || d.forms || d.countable || d.patterns || d.register || d.connotation || d.collocations || d.synonyms || d.antonyms || d.mistakes || d.image || d.tags;
  return (
    <div className="nb-vocab">
      <span className="nb-vocab-head">
        <strong className="nb-word-big">{data.word}</strong>
        <button type="button" className="dc-say" onClick={() => speak(data.word ?? '')} aria-label={`Hear “${data.word}”`} title="Listen">
          {SPEAK}
        </button>
        {d.pos && <em className="nb-pos">{d.pos}</em>}
        {d.ipa && <span className="dc-ipa">{d.ipa}</span>}
        {d.stress && <span className="dc-stress">{d.stress}</span>}
        {d.cefr && <span className="dc-cefr">{d.cefr}</span>}
      </span>
      {d.meaning && <span className="dc-meaning">{d.meaning}</span>}
      {d.example && <span className="dc-example">{d.example}</span>}
      {d.translation && row(d.lang || 'Translation', d.translation)}
      {translation}
      {extra && (
        <button type="button" className="btn link small" onClick={() => setMore((m) => !m)}>
          {more ? 'Fewer details' : 'More details'}
        </button>
      )}
      {more && (
        <span className="nb-more">
          {row('Word family', d.family)}
          {row('Irregular forms', d.forms)}
          {row('Countable', d.countable)}
          {row('Patterns', d.patterns)}
          {row('Register', d.register)}
          {row('Connotation', d.connotation)}
          {row('Collocations', d.collocations)}
          {row('Synonyms', d.synonyms)}
          {row('Antonyms', d.antonyms)}
          {row('Common mistakes', d.mistakes)}
          {row('Topics', d.tags)}
          {d.image && <img className="dc-img" src={d.image} alt="" />}
        </span>
      )}
    </div>
  );
}

function NoteBody({ data }: { data: EntryData }) {
  return (
    <div className="nb-note">
      {data.title && <strong className="nb-note-title">{data.title}</strong>}
      {data.text && <TaskRenderer content={data.text} responses={{}} disabled />}
      {(data.tags ?? []).length > 0 && (
        <span className="nb-tags-row">
          {(data.tags ?? []).map((t) => (
            <span key={t} className="nb-tag">
              {t}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function HistoryList({ classId, me, e, onClose }: { classId: string; me: Me; e: Entry; onClose: () => void }) {
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    listHistory(classId, e.id).then(setList).catch(() => setList([]));
  }, [classId, e.id]);
  return (
    <div className="nb-history">
      <span className="eyebrow">Earlier versions</span>
      {list === null ? <span className="hint">Loading…</span> : list.length === 0 ? <span className="hint">No earlier versions.</span> : null}
      {list?.map((h) => (
        <span key={h.id} className="nb-hist-row">
          <span>
            <strong>{entryTitle({ type: e.type, data: h.data })}</strong> <span className="hint">· {h.byName} · {when(h.at)}</span>
          </span>
          <button type="button" className="btn small-btn" onClick={() => restore(classId, me, e, h).then(onClose)}>
            Restore
          </button>
        </span>
      ))}
      <button type="button" className="btn link small" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function EntryCard({ classId, c, me, e, items, myTranslation, saved, onSaveToMine }: { classId: string; c: ClassDoc | null | undefined; me: Me; e: Entry; items: Item[]; myTranslation?: string; saved?: boolean; onSaveToMine?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [tr, setTr] = useState(myTranslation ?? '');
  const [trOpen, setTrOpen] = useState(false);
  useEffect(() => setTr(myTranslation ?? ''), [myTranslation]);
  const editable = canEdit(c, me, e);
  const lesson = items.find((i) => i.id === e.itemId);
  const pendingEdit = !!e.pending;
  const mineAnswer = me.learnerId && (e.addedBy === me.uid);
  return (
    <article className={'nb-card' + (e.status === 'pending' ? ' pending' : '') + (e.hidden ? ' hidden' : '')}>
      {editing ? (
        <EntryForm type={e.type} initial={e.data} onCancel={() => setEditing(false)} onSave={async (d) => (await saveEntry(classId, me, c, e, d), setEditing(false))} />
      ) : (
        <>
          {e.type === 'vocab' ? (
            <VocabBody
              data={e.data}
              translation={
                !me.teacher && me.learnerId ? (
                  <span className="nb-mytr">
                    {trOpen ? (
                      <input
                        value={tr}
                        autoFocus
                        placeholder="My translation (only I see it)"
                        onChange={(ev) => setTr(ev.target.value)}
                        onBlur={() => (saveTranslation(classId, me.uid, e.id, tr.trim()).catch(() => {}), setTrOpen(false))}
                        onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
                      />
                    ) : (
                      <button type="button" className="nb-mytr-btn" onClick={() => setTrOpen(true)}>
                        {tr ? (
                          <>
                            <span className="dc-k">My translation</span> <span className="nb-mytr-v">{tr}</span>
                          </>
                        ) : (
                          '+ My translation (private)'
                        )}
                      </button>
                    )}
                  </span>
                ) : null
              }
            />
          ) : (
            <NoteBody data={e.data} />
          )}
          <footer className="nb-meta">
            <span className="hint">
              {e.addedByName.split(' ')[0]}
              {e.editedByName && e.editedBy !== e.addedBy ? ` · edited by ${e.editedByName.split(' ')[0]}` : e.editedByName ? ' · edited' : ''}
              {lesson ? ` · ${lesson.title}` : ''}
              {e.createdAt ? ` · ${when(e.createdAt)}` : ''}
              {e.status === 'pending' ? ' · waiting for the teacher' : ''}
              {e.hidden ? ' · hidden' : ''}
            </span>
            <span className="nb-acts">
              {editable && (
                <button type="button" className="btn link small" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              {!me.teacher && onSaveToMine && !mineAnswer && (
                <button type="button" className="btn link small" disabled={saved} onClick={onSaveToMine}>
                  {saved ? 'In my notebook' : 'Save to my notebook'}
                </button>
              )}
              {me.teacher && (
                <>
                  <button type="button" className="btn link small" onClick={() => setHistory((h) => !h)}>
                    History
                  </button>
                  <button type="button" className="btn link small" onClick={() => setHidden(classId, e.id, !e.hidden)}>
                    {e.hidden ? 'Show' : 'Hide'}
                  </button>
                  <button type="button" className="btn link small" onClick={() => window.confirm('Delete this entry?') && removeEntry(classId, e.id)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </footer>
          {me.teacher && (e.status === 'pending' || pendingEdit) && (
            <div className="nb-review">
              <span className="eyebrow accent">{e.status === 'pending' ? `${e.addedByName.split(' ')[0]} added this` : `${e.pending!.byName.split(' ')[0]} wants to change this`}</span>
              {pendingEdit && e.status !== 'pending' && (e.type === 'vocab' ? <VocabBody data={e.pending!.data} /> : <NoteBody data={e.pending!.data} />)}
              <span className="nb-acts">
                <button type="button" className="btn small-btn primary" onClick={() => approve(classId, e)}>
                  Approve
                </button>
                <button type="button" className="btn small-btn" onClick={() => reject(classId, e)}>
                  Reject
                </button>
              </span>
            </div>
          )}
          {!me.teacher && pendingEdit && e.pending!.by === me.uid && <span className="hint">Your change is waiting for the teacher.</span>}
          {history && <HistoryList classId={classId} me={me} e={e} onClose={() => setHistory(false)} />}
        </>
      )}
    </article>
  );
}

function MyNoteCard({ classId, n }: { classId: string; n: MyNote }) {
  const [editing, setEditing] = useState(false);
  if (!n.data || !n.type) return null;
  return (
    <article className="nb-card mine">
      {editing ? (
        <EntryForm type={n.type} initial={n.data} withTranslation onCancel={() => setEditing(false)} onSave={async (d) => (await saveMyNote(classId, n.id, d), setEditing(false))} />
      ) : (
        <>
          {n.type === 'vocab' ? <VocabBody data={n.data} /> : <NoteBody data={n.data} />}
          <footer className="nb-meta">
            <span className="hint">
              {n.from ? 'Saved from the class notebook' : 'Mine'}
              {n.createdAt ? ` · ${when(n.createdAt)}` : ''}
            </span>
            <span className="nb-acts">
              <button type="button" className="btn link small" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className="btn link small" onClick={() => window.confirm('Remove this from your notebook?') && removeMyNote(classId, n.id)}>
                Remove
              </button>
            </span>
          </footer>
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- bank pages

function PageCard({ classId, c, me, e, topics, places }: { classId: string; c: ClassDoc | null | undefined; me: Me; e: Entry; topics: Topic[]; places: { id: string; title: string; n: number }[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<JSONContent | null>(null);
  const [title, setTitle] = useState(e.data.title ?? '');
  const [responses, setResponses] = useState<Responses>({});
  const [checked, setChecked] = useState(false);
  const key = (e.data.key ?? {}) as AnswerKey;
  const qs = useMemo(() => questionIds(e.data.text ?? null), [e.data.text]);
  const result = checked ? scoreTask(qs, key, responses) : null;
  const start = () => {
    setDraft(mergeKey(e.data.text ?? { type: 'doc', content: [{ type: 'paragraph' }] }, key));
    setTitle(e.data.title ?? '');
    setEditing(true);
  };
  const save = async () => {
    const { content, key: k } = splitKey(draft ?? { type: 'doc', content: [] });
    await saveEntry(classId, me, c, e, { ...e.data, title: title.trim() || 'Untitled page', text: content, key: k });
    setEditing(false);
  };
  return (
    <article className="nb-card page" id={'nb-' + e.id}>
      {editing ? (
        <div className="nb-editing">
          <input className="nb-title" value={title} placeholder="Page title, for example: Present perfect vs past simple" onChange={(ev) => setTitle(ev.target.value)} />
          <div className="nb-page-editor">
            <TaskEditor content={draft!} onChange={setDraft} classId={classId} places={places} />
          </div>
          <span className="nb-page-row">
            <label className="check-row">
              Topic
              <select value={e.topicId ?? ''} onChange={(ev) => updateTeacherFields(classId, e.id, { topicId: ev.target.value || null })}>
                <option value="">No topic</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row">
              Bank
              <select value={e.bank ?? 'grammar'} onChange={(ev) => updateTeacherFields(classId, e.id, { bank: ev.target.value as Bank })}>
                <option value="grammar">Grammar</option>
                <option value="vocab">Vocabulary</option>
              </select>
            </label>
          </span>
          <span className="hint">Write the rule, examples and, if you like, practice questions from the / menu. Learners can check them here.</span>
          <span className="nb-form-foot">
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={save}>
              Save
            </button>
          </span>
        </div>
      ) : (
        <>
          <h3 className="nb-page-title">{e.data.title || 'Untitled page'}</h3>
          <div className="nb-page-body">
            <TaskRenderer content={e.data.text ?? null} responses={responses} onChange={(id, v) => !checked && setResponses((r) => ({ ...r, [id]: v }))} results={checked ? key : null} disabled={me.teacher} classId={classId} />
          </div>
          {qs.length > 0 && !me.teacher && (
            <span className="nb-practice">
              {checked ? (
                <>
                  <span className="score">
                    <span className="big">{result?.score}</span> of {result?.total}
                  </span>
                  <button type="button" className="btn small-btn" onClick={() => (setChecked(false), setResponses({}))}>
                    Try again
                  </button>
                </>
              ) : (
                <button type="button" className="btn small-btn primary" onClick={() => setChecked(true)}>
                  Check my practice
                </button>
              )}
            </span>
          )}
          <footer className="nb-meta">
            <span className="hint">
              {topics.find((t) => t.id === e.topicId)?.name ?? 'No topic'}
              {e.hidden ? ' · hidden' : ''}
            </span>
            {me.teacher && (
              <span className="nb-acts">
                <button type="button" className="btn link small" onClick={start}>
                  Edit
                </button>
                <button type="button" className="btn link small" onClick={() => setHidden(classId, e.id, !e.hidden)}>
                  {e.hidden ? 'Show' : 'Hide'}
                </button>
                <button type="button" className="btn link small" onClick={() => window.confirm('Delete this page?') && removeEntry(classId, e.id)}>
                  Delete
                </button>
              </span>
            )}
          </footer>
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- settings

function Settings({ c, roster }: { c: ClassDoc; roster: { id: string; name: string }[] }) {
  const s = notebookSettings(c);
  const set = (patch: Partial<typeof s>) => updateClass(c, { notebook: { ...s, ...patch } });
  const levels: { k: NotebookLevel; label: string; hint: string }[] = [
    { k: 'view', label: 'View only', hint: 'Only you add and edit entries.' },
    { k: 'add', label: 'Learners can add', hint: 'Learners add entries and edit their own.' },
    { k: 'all', label: 'Learners can add and edit all', hint: 'Anyone in the class can edit any entry.' },
  ];
  return (
    <div className="nb-settings">
      <h3>Who can write in the class notebook</h3>
      <div className="gd-how">
        {levels.map((l) => (
          <label key={l.k} className={'gd-opt' + (s.level === l.k ? ' on' : '')}>
            <input type="radio" name="nb-level" checked={s.level === l.k} onChange={() => set({ level: l.k })} />
            <span>
              <strong>{l.label}</strong>
              <span className="hint gd-opt-hint">{l.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="switch-row">
        <span>
          Review before publishing
          <span className="hint">Learners’ additions and changes wait for you to approve them</span>
        </span>
        <input type="checkbox" checked={!!s.review} disabled={s.level === 'view'} onChange={() => set({ review: !s.review })} />
      </label>
      {s.level !== 'view' && roster.length > 0 && (
        <div className="field" style={{ gap: 6 }}>
          <span>Learners who can’t write</span>
          <div className="aud-pick">
            {roster.map((r) => (
              <label key={r.id} className="pop-check">
                <input type="checkbox" checked={(s.blocked ?? []).includes(r.id)} onChange={() => set({ blocked: (s.blocked ?? []).includes(r.id) ? (s.blocked ?? []).filter((x) => x !== r.id) : [...(s.blocked ?? []), r.id] })} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <span className="hint">Changes apply straight away, and the security rules check them too.</span>
    </div>
  );
}

// ---------------------------------------------------------------- the notebook

export function Notebook({
  classId,
  c,
  me,
  items,
  topics,
  roster = [],
  compact,
  prefill,
  onPrefillDone,
  focus,
  context,
}: {
  classId: string;
  c: ClassDoc | null | undefined;
  me: Me;
  items: Item[];
  topics: Topic[];
  roster?: { id: string; name: string }[];
  compact?: boolean;
  prefill?: Prefill | null;
  onPrefillDone?: () => void;
  focus?: string | null; // an entry id to show first
  context?: { itemId?: string | null; taskId?: string | null };
}) {
  const entries = useNotebook(classId, me);
  const mine = useMyNotes(classId, me.teacher ? undefined : me.uid);
  const [tab, setTab] = useState<Tab>(focus ? 'class' : 'class');
  const [q, setQ] = useState('');
  const [fLesson, setFLesson] = useState('');
  const [fTag, setFTag] = useState('');
  const [fCefr, setFCefr] = useState('');
  const [fPos, setFPos] = useState('');
  const [fType, setFType] = useState<'' | 'vocab' | 'note'>('');
  const [adding, setAdding] = useState<Prefill | null>(null);
  const s = notebookSettings(c);
  const mayAdd = me.teacher || canLearnerAdd(c, me.learnerId);
  const pending = entries.filter((e) => e.status === 'pending' || e.pending);
  useEffect(() => {
    if (prefill) {
      setAdding(prefill);
      setTab(prefill.mine ? 'mine' : 'class');
    }
  }, [prefill]);
  useEffect(() => {
    if (!focus) return;
    const e = entries.find((x) => x.id === focus);
    if (e?.type === 'page') setTab(e.bank === 'vocab' ? 'vocab' : 'grammar');
    const t = window.setTimeout(() => document.getElementById('nb-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
    return () => window.clearTimeout(t);
  }, [focus, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const translations = useMemo(() => Object.fromEntries(mine.filter((n) => n.kind === 'translation').map((n) => [n.entryId, n.translation ?? ''])), [mine]);
  const savedFrom = useMemo(() => new Set(mine.filter((n) => n.from).map((n) => n.from)), [mine]);
  const tags = useMemo(() => [...new Set(entries.flatMap((e) => [...(e.data.tags ?? []), ...(e.data.def?.tags ?? '').split(',').map((x) => x.trim()).filter(Boolean)]))].sort(), [entries]);
  const filter = (list: { type: EntryType; data: EntryData; itemId?: string | null }[]) =>
    list.filter((e) => {
      if (fType && e.type !== fType) return false;
      if (fLesson && e.itemId !== fLesson) return false;
      if (fCefr && e.data.def?.cefr !== fCefr) return false;
      if (fPos && e.data.def?.pos !== fPos) return false;
      if (fTag && !(e.data.tags ?? []).includes(fTag) && !(e.data.def?.tags ?? '').split(',').map((x) => x.trim()).includes(fTag)) return false;
      if (q.trim() && !searchText(e).includes(q.trim().toLowerCase())) return false;
      return true;
    });
  const classList = filter(entries.filter((e) => e.type !== 'page' && (me.teacher ? !e.hidden || tab === 'class' : true))) as Entry[];
  const myList = filter(mine.filter((n) => n.kind === 'entry' && n.data && n.type) as (MyNote & { type: EntryType; data: EntryData })[]) as MyNote[];
  const pages = (bank: Bank) => entries.filter((e) => e.type === 'page' && (e.bank ?? 'grammar') === bank && (me.teacher || !e.hidden));
  const places = items.map((i, n) => ({ id: i.id, title: i.title, n: n + 1 }));

  const tabs: { k: Tab; label: string; badge?: number }[] = [
    { k: 'class', label: 'Class notebook' },
    ...(!me.teacher ? [{ k: 'mine' as Tab, label: 'My notebook' }] : []),
    { k: 'grammar', label: 'Grammar bank' },
    { k: 'vocab', label: 'Vocabulary bank' },
    ...(me.teacher ? [{ k: 'pending' as Tab, label: 'Pending', badge: pending.length }, { k: 'settings' as Tab, label: 'Settings' }] : []),
  ];

  async function create(d: EntryData, type: EntryType, toMine: boolean) {
    if (toMine) await addMyNote(classId, me.uid, { type, data: d });
    else await addEntry(classId, me, c, { type, data: d, itemId: adding?.itemId ?? context?.itemId ?? null, taskId: adding?.taskId ?? context?.taskId ?? null });
    setAdding(null);
    onPrefillDone?.();
  }
  const newPage = (bank: Bank) => addEntry(classId, me, c, { type: 'page', bank, topicId: null, data: { title: bank === 'grammar' ? 'New grammar page' : 'New vocabulary page', text: { type: 'doc', content: [{ type: 'paragraph' }] }, key: {} } });

  const addBar = (toMine: boolean) =>
    adding ? (
      <div className="nb-add">
        <span className="eyebrow">{toMine ? 'Add to my notebook' : 'Add to the class notebook'}{!toMine && !me.teacher && s.review ? ' · your teacher will check it first' : ''}</span>
        <span className="seg small-seg" style={{ width: 220 }}>
          <button type="button" className={adding.type === 'vocab' ? 'on' : ''} onClick={() => setAdding({ ...adding, type: 'vocab' })}>
            Vocabulary
          </button>
          <button type="button" className={adding.type === 'note' ? 'on' : ''} onClick={() => setAdding({ ...adding, type: 'note' })}>
            Note
          </button>
        </span>
        <EntryForm
          key={adding.type + (adding.word ?? '')}
          type={adding.type}
          withTranslation={toMine}
          initial={adding.type === 'vocab' ? { word: adding.word ?? '', def: { example: adding.example ?? '' } } : { title: '', text: adding.text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: adding.text }] }] } : null }}
          onCancel={() => (setAdding(null), onPrefillDone?.())}
          onSave={(d) => create(d, adding.type, toMine)}
          saveLabel="Add"
        />
      </div>
    ) : (
      <span className="nb-addbtns">
        <button type="button" className="btn small-btn primary" onClick={() => setAdding({ type: 'vocab', mine: toMine })}>
          + Word
        </button>
        <button type="button" className="btn small-btn" onClick={() => setAdding({ type: 'note', mine: toMine })}>
          + Note
        </button>
      </span>
    );

  const filters = (
    <div className="nb-filters">
      <input className="nb-search" value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} aria-label="Search the notebook" />
      <select value={fType} onChange={(e) => setFType(e.target.value as typeof fType)} aria-label="Type">
        <option value="">Words and notes</option>
        <option value="vocab">Words</option>
        <option value="note">Notes</option>
      </select>
      <select value={fLesson} onChange={(e) => setFLesson(e.target.value)} aria-label="Lesson">
        <option value="">Any lesson</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </select>
      <select value={fPos} onChange={(e) => setFPos(e.target.value)} aria-label="Part of speech">
        <option value="">Any part of speech</option>
        {POS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <select value={fCefr} onChange={(e) => setFCefr(e.target.value)} aria-label="CEFR level">
        <option value="">Any level</option>
        {CEFR.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      {tags.length > 0 && (
        <select value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label="Tag">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
    </div>
  );

  const bankTab = (bank: Bank) => {
    const list = pages(bank);
    const groups = [...topics.map((t) => ({ t, list: list.filter((p) => p.topicId === t.id) })), { t: null as Topic | null, list: list.filter((p) => !p.topicId || !topics.some((t) => t.id === p.topicId)) }].filter((g) => g.list.length || g.t === null);
    return (
      <div className="nb-bank">
        {me.teacher && (
          <button type="button" className="btn small-btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => newPage(bank)}>
            + Page
          </button>
        )}
        {list.length === 0 && <p className="hint">{me.teacher ? `No pages yet. A page has a rule or a word group with examples, and can include practice questions.` : `Your teacher hasn’t added any ${bank === 'grammar' ? 'grammar' : 'vocabulary'} pages yet.`}</p>}
        {groups.map((g) =>
          g.list.length ? (
            <section key={g.t?.id ?? 'none'} className="nb-topic">
              <span className="topic-name static">{g.t?.name ?? (groups.length > 1 ? 'Other' : '')}</span>
              {g.list.map((e) => (
                <PageCard key={e.id} classId={classId} c={c} me={me} e={e} topics={topics} places={places} />
              ))}
            </section>
          ) : null,
        )}
      </div>
    );
  };

  return (
    <div className={'nb' + (compact ? ' compact' : '')}>
      <div className="nb-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>
            {t.label}
            {t.badge ? <span className="nb-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'class' && (
        <>
          {mayAdd ? addBar(false) : !me.teacher && <span className="hint">Only your teacher writes here. Save entries to your own notebook with “Save to my notebook”.</span>}
          {filters}
          {classList.length === 0 && <p className="hint">{entries.some((e) => e.type !== 'page') ? 'Nothing matches.' : 'Nothing here yet. Words and notes added in class appear here straight away.'}</p>}
          <div className="nb-list">
            {classList.map((e) => (
              <EntryCard key={e.id} classId={classId} c={c} me={me} e={e} items={items} myTranslation={translations[e.id]} saved={savedFrom.has(e.id)} onSaveToMine={() => addMyNote(classId, me.uid, { type: e.type, data: e.data, from: e.id })} />
            ))}
          </div>
        </>
      )}
      {tab === 'mine' && (
        <>
          {addBar(true)}
          {filters}
          {myList.length === 0 && <p className="hint">Your private notebook. Add your own words and notes, or save entries from the class notebook.</p>}
          <div className="nb-list">
            {myList.map((n) => (
              <MyNoteCard key={n.id} classId={classId} n={n} />
            ))}
          </div>
        </>
      )}
      {tab === 'grammar' && bankTab('grammar')}
      {tab === 'vocab' && bankTab('vocab')}
      {tab === 'pending' && (
        <div className="nb-list">
          {pending.length === 0 && <p className="hint">Nothing is waiting for review.</p>}
          {pending.map((e) => (
            <EntryCard key={e.id} classId={classId} c={c} me={me} e={e} items={items} />
          ))}
        </div>
      )}
      {tab === 'settings' && c && <Settings c={c} roster={roster} />}
    </div>
  );
}

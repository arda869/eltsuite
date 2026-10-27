import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId } from '../lib/tasks';
import { TaskEditor } from '../editor/TaskEditor';
import { CITE_STYLES, SOURCE_TYPES, inText, piecesText, reference, shortName, sortKey, type CiteStyle, type Person, type Source, type SourceType } from '../lib/cite';
import type { SharedDoc } from '../lib/sharedDocs';
import { ask } from '../lib/ask';
import { Select } from '../components/Select';

// PD reading: the sources a teacher reads for professional development, each with its full
// reference in the citation style they choose, and notes, page by page if they like.
// Documents can cite any of these sources; the reference list is made for them.

export type Section = { id: string; page: string; content: JSONContent | null };
export type ReadSource = Source & { order: number; paged?: boolean; notes?: JSONContent | null; sections?: Section[] };
const srcCol = (id: string) => collection(db, 'sharedDocs', id, 'sources');

export function useSources(fileId?: string) {
  const [list, setList] = useState<ReadSource[] | null>(null);
  useEffect(() => {
    if (!fileId) return;
    return onSnapshot(
      query(srcCol(fileId), orderBy('order')),
      (s) => setList(s.docs.map((d) => ({ ...(d.data() as ReadSource), id: d.id }))),
      () => setList([]),
    );
  }, [fileId]);
  return list;
}

// Every source in every PD reading file the teacher can open, for citing in documents.
export async function allSources(files: SharedDoc[]): Promise<{ file: SharedDoc; src: ReadSource }[]> {
  const out: { file: SharedDoc; src: ReadSource }[] = [];
  await Promise.all(
    files
      .filter((f) => f.kind === 'pd')
      .map(async (f) => {
        const s = await getDocs(srcCol(f.id)).catch(() => null);
        s?.docs.forEach((d) => out.push({ file: f, src: { ...(d.data() as ReadSource), id: d.id } }));
      }),
  );
  return out.sort((a, b) => sortKey(a.src).localeCompare(sortKey(b.src)));
}

export function Ref({ s, style, n }: { s: Source; style: CiteStyle; n?: number }) {
  return (
    <span className="pd-ref">
      {reference(s, style, n).map((p, i) => (p.i ? <i key={i}>{p.t}</i> : <span key={i}>{p.t}</span>))}
    </span>
  );
}

const blank = (): Omit<ReadSource, 'id'> => ({ order: Date.now(), type: 'book', authors: [{ first: '', last: '' }], year: '', title: '' });

function PeopleInput({ label, list, onChange }: { label: string; list: Person[]; onChange: (p: Person[]) => void }) {
  return (
    <div className="pd-people">
      <span className="pd-k">{label}</span>
      {list.map((p, i) => (
        <span key={i} className="pd-person">
          <input value={p.first} placeholder="First name" onChange={(e) => onChange(list.map((x, k) => (k === i ? { ...x, first: e.target.value } : x)))} aria-label={`${label} ${i + 1}, first name`} />
          <input value={p.last} placeholder="Surname" onChange={(e) => onChange(list.map((x, k) => (k === i ? { ...x, last: e.target.value } : x)))} aria-label={`${label} ${i + 1}, surname`} />
          {list.length > 1 && (
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => onChange(list.filter((_, k) => k !== i))}>
              ×
            </button>
          )}
        </span>
      ))}
      <button type="button" className="btn link small" onClick={() => onChange([...list, { first: '', last: '' }])}>
        + Add another
      </button>
    </div>
  );
}

function SourceForm({ init, style, onSave, onCancel }: { init: Omit<ReadSource, 'id'> & { id?: string }; style: CiteStyle; onSave: (s: Omit<ReadSource, 'id'> & { id?: string }) => void; onCancel: () => void }) {
  const [s, setS] = useState(init);
  const set = (p: Partial<ReadSource>) => setS((x) => ({ ...x, ...p }));
  // Only the title is needed; everything else makes the reference complete.
  const f = (k: keyof Source, label: string, ph = '', wide = false, need = false) => (
    <label className={'pd-f' + (wide ? ' wide' : '')}>
      <span className="pd-k">
        {label}
        {!need && <em className="pd-opt">optional</em>}
      </span>
      <input value={String(s[k] ?? '')} placeholder={ph} onChange={(e) => set({ [k]: e.target.value } as Partial<ReadSource>)} />
    </label>
  );
  const t = s.type;
  return (
    <div className="pd-form">
      <span className="seg small-seg pd-types" role="radiogroup" aria-label="Kind of source">
        {SOURCE_TYPES.map((x) => (
          <button key={x.k} type="button" role="radio" aria-checked={t === x.k} className={t === x.k ? 'on' : ''} onClick={() => set({ type: x.k as SourceType })}>
            {x.label}
          </button>
        ))}
      </span>
      <div className="pd-grid">
        {f('title', t === 'chapter' ? 'Chapter title' : t === 'article' ? 'Article title' : 'Title', '', true, true)}
        {f('year', 'Year', '2006')}
      </div>
      <PeopleInput label="Authors" list={s.authors.length ? s.authors : [{ first: '', last: '' }]} onChange={(authors) => set({ authors })} />
      <div className="pd-grid">
        {f('org', 'Or an organisation as author', 'Cambridge Assessment English', true)}
        {t === 'web' && f('date', 'Day and month', '14 March')}
        {t === 'chapter' && f('bookTitle', 'Book title', '', true)}
        {(t === 'book' || t === 'chapter' || t === 'report') && f('edition', 'Edition', '3')}
        {(t === 'book' || t === 'chapter' || t === 'report') && f('publisher', 'Publisher', 'Cambridge University Press')}
        {(t === 'book' || t === 'chapter' || t === 'report') && f('place', 'City', 'Cambridge')}
        {t === 'article' && f('journal', 'Journal', 'ELT Journal', true)}
        {t === 'article' && f('volume', 'Volume', '51')}
        {t === 'article' && f('issue', 'Issue', '2')}
        {(t === 'article' || t === 'chapter') && f('pages', 'Pages', '281–318')}
        {t === 'web' && f('site', 'Website', 'British Council TeachingEnglish', true)}
        {f('doi', 'DOI', '10.1093/elt/ccx001')}
        {f('url', 'Web address', 'https://…', true)}
        {t === 'web' && f('accessed', 'Accessed', '27 October 2026')}
      </div>
      {t === 'chapter' && <PeopleInput label="Editors" list={s.editors?.length ? s.editors : [{ first: '', last: '' }]} onChange={(editors) => set({ editors })} />}
      <div className="pd-preview">
        <span className="pd-k">{CITE_STYLES.find((x) => x.k === style)?.label}</span>
        <Ref s={{ ...s, id: '' } as Source} style={style} />
        <span className="hint">In the text: {inText({ ...s, id: '' } as Source, style, '12')}</span>
      </div>
      <span className="pd-form-acts">
        {!s.title.trim() && <span className="hint">Add a title to save</span>}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!s.title.trim()} onClick={() => onSave({ ...s, authors: s.authors.filter((a) => a.last.trim() || a.first.trim()), editors: s.editors?.filter((a) => a.last.trim()) })}>
          Save the source
        </button>
      </span>
    </div>
  );
}

function NoteBox({ value, onSave, placeholder }: { value: JSONContent | null | undefined; onSave: (v: JSONContent) => void; placeholder: string }) {
  const t = useRef(0);
  const [key] = useState(() => newId());
  return (
    <div className="pd-note">
      <TaskEditor key={key} content={value ?? { type: 'doc', content: [{ type: 'paragraph' }] }} onChange={(c) => (window.clearTimeout(t.current), (t.current = window.setTimeout(() => onSave(c), 700)))} handles={false} compact textOnly placeholder={placeholder} />
    </div>
  );
}

// The kind of source, as a small symbol.
const TYPE_D: Record<string, string> = {
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  chapter: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM9 8h6M9 11h6',
  article: 'M6 3h9l4 4v14H6zM9 10h7M9 13.5h7M9 17h5',
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9S9.5 5.6 12 3z',
  report: 'M6 3h12v18H6zM9 15v2M12 12v5M15 9v8',
};
function TypeIcon({ t, size = 16 }: { t: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TYPE_D[t] ?? TYPE_D.book} />
    </svg>
  );
}
const authorLine = (s: Source) => (s.org ? s.org : s.authors.map((a) => [a.first, a.last].filter(Boolean).join(' ')).filter(Boolean).join(', ')) || 'No author';

export function PdReading({ d, canEdit }: { d: SharedDoc & { pd?: { style?: CiteStyle } }; canEdit: boolean }) {
  const list = useSources(d.id);
  const style: CiteStyle = d.pd?.style ?? 'apa';
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState<(Omit<ReadSource, 'id'> & { id?: string }) | null>(null);
  const [fresh, setFresh] = useState('');
  useEffect(() => {
    if (list && !sel && list[0]) setSel(list[0].id);
  }, [list, sel]);
  const cur = list?.find((x) => x.id === sel);
  const save = async (s: Omit<ReadSource, 'id'> & { id?: string }) => {
    const id = s.id || newId();
    const { id: _, ...rest } = s;
    void _;
    await setDoc(doc(srcCol(d.id), id), JSON.parse(JSON.stringify(rest)), { merge: true });
    setSel(id);
    setEditing(null);
    setFresh('');
  };
  const patch = (p: Partial<ReadSource>) => cur && void updateDoc(doc(srcCol(d.id), cur.id), JSON.parse(JSON.stringify(p)));
  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied(''), 1400);
  };
  if (!list) return <div className="dp-msg">Opening your reading…</div>;
  const sections = cur?.sections?.length ? cur.sections : [{ id: 's1', page: '', content: null }];
  const words = q.trim().toLowerCase();
  const shown = [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).filter((s) => !words || `${shortName(s)} ${s.title} ${authorLine(s)} ${s.year}`.toLowerCase().includes(words));
  // A new source opens at once: the details at the top, the notes ready underneath.
  const startNew = async (t: SourceType = 'book') => {
    const id = newId();
    const { ...rest } = { ...blank(), type: t };
    await setDoc(doc(srcCol(d.id), id), JSON.parse(JSON.stringify(rest)));
    setEditing(null);
    setSel(id);
    setFresh(id);
  };
  return (
    <div className="pd">
      <aside className="pd-side" aria-label="Sources">
        <div className="pd-side-top">
          <span className="pd-side-h">
            <b>Sources</b>
            <span className="hint">{list.length}</span>
          </span>
          {canEdit && (
            <button type="button" className="btn small-btn primary" onClick={() => void startNew()}>
              + Add
            </button>
          )}
        </div>
        {list.length > 4 && <input className="pd-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your reading" aria-label="Search your reading" />}
        <nav className="pd-list">
          {shown.map((s) => (
            <button key={s.id} type="button" className={'pd-item' + (s.id === sel && !editing ? ' on' : '')} onClick={() => (setSel(s.id), setEditing(null), setFresh(''))}>
              <span className="pd-item-ic">
                <TypeIcon t={s.type} />
              </span>
              <span className="pd-item-t">
                <b>{shortName(s)}</b>
                <span>{s.title || 'Untitled'}</span>
              </span>
            </button>
          ))}
          {!list.length && <span className="hint pd-none">Your books, chapters, articles and web pages appear here.</span>}
        </nav>
        <div className="pd-style">
          <span className="pd-k">Citation style</span>
          <Select label="Citation style" value={style} disabled={!canEdit} search options={CITE_STYLES.map((c) => ({ v: c.k, label: c.label, hint: c.about }))} onChange={(v) => void updateDoc(doc(db, 'sharedDocs', d.id), { pd: { style: v } })} />
        </div>
      </aside>
      <main className="pd-main">
        {editing ? (
          <div className="pd-sheet">
            <span className="pd-sheet-h">
              <b>{editing.id ? 'Edit the details' : 'A new source'}</b>
              <span className="hint">Fill in what you have. The reference below is written as you type.</span>
            </span>
            <SourceForm init={editing} style={style} onSave={(s) => void save(s)} onCancel={() => setEditing(null)} />
          </div>
        ) : cur ? (
          <article className="pd-reading">
            {fresh === cur.id && canEdit ? (
              <div className="pd-sheet pd-newsheet">
                <SourceForm key={cur.id} init={cur} style={style} onSave={(x) => void save(x)} onCancel={() => setFresh('')} />
              </div>
            ) : (
            <header className="pd-cover">
              <span className="pd-type">
                <TypeIcon t={cur.type} size={14} /> {SOURCE_TYPES.find((x) => x.k === cur.type)?.label}
                {cur.year ? ` · ${cur.year}` : ''}
              </span>
              <h1 className="pd-title">{cur.title || 'Untitled'}</h1>
              <span className="pd-by">{authorLine(cur)}</span>
              <div className="pd-cite-box">
                <span className="pd-k">Reference · {CITE_STYLES.find((x) => x.k === style)?.label}</span>
                <Ref s={cur} style={style} />
                <span className="pd-cite-acts">
                  <button type="button" className="btn small-btn" onClick={() => copy('ref', piecesText(reference(cur, style)))}>
                    {copied === 'ref' ? 'Copied' : 'Copy the reference'}
                  </button>
                  <button type="button" className="btn small-btn pd-intext" onClick={() => copy('in', inText(cur, style))} data-tip="Copy the citation for the text">
                    {copied === 'in' ? 'Copied' : inText(cur, style)}
                  </button>
                  <span style={{ flex: 1 }} />
                  {canEdit && (
                    <>
                      <button type="button" className="btn small-btn" onClick={() => setEditing(cur)}>
                        Edit the details
                      </button>
                      <button type="button" className="btn link small" onClick={() => void ask(`Delete ${shortName(cur)} and its notes?`).then((ok) => ok && void deleteDoc(doc(srcCol(d.id), cur.id)).then(() => setSel('')))}>
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </div>
            </header>
            )}
            <section className="pd-notes">
              <span className="pd-notes-h">
                <b>Notes</b>
                <span className="seg small-seg" role="radiogroup" aria-label="How the notes are kept">
                  <button type="button" role="radio" aria-checked={!cur.paged} className={!cur.paged ? 'on' : ''} disabled={!canEdit} onClick={() => cur.paged && patch({ paged: false })}>
                    One page of notes
                  </button>
                  <button type="button" role="radio" aria-checked={!!cur.paged} className={cur.paged ? 'on' : ''} disabled={!canEdit} onClick={() => !cur.paged && patch({ paged: true })} data-tip="Each page you read gets its own notes, so you can quote it with the page">
                    Page by page
                  </button>
                </span>
              </span>
              {cur.paged ? (
                <div className="pd-sections">
                  {sections.map((sec, i) => (
                    <section key={cur.id + sec.id} className="pd-sec">
                      <label className="pd-page">
                        <span>p.</span>
                        <input value={sec.page} placeholder="12" disabled={!canEdit} onChange={(e) => patch({ sections: sections.map((x, k) => (k === i ? { ...x, page: e.target.value } : x)) })} aria-label="Page" />
                      </label>
                      <NoteBox value={sec.content} placeholder="Your notes on this page" onSave={(c) => patch({ sections: sections.map((x, k) => (k === i ? { ...x, content: c } : x)) })} />
                      {canEdit && sections.length > 1 && (
                        <button type="button" className="icon-btn pd-sec-x" aria-label="Remove this page" onClick={() => patch({ sections: sections.filter((_, k) => k !== i) })}>
                          ×
                        </button>
                      )}
                    </section>
                  ))}
                  {canEdit && (
                    <button type="button" className="btn small-btn pd-newpage" onClick={() => patch({ sections: [...sections, { id: newId(), page: String((parseInt(sections[sections.length - 1]?.page, 10) || 0) + 1 || ''), content: null }] })}>
                      + Next page
                    </button>
                  )}
                </div>
              ) : (
                <NoteBox key={cur.id} value={cur.notes} placeholder="Your notes on this source: key ideas, quotations with their pages, how it links to your teaching" onSave={(c) => patch({ notes: c })} />
              )}
            </section>
          </article>
        ) : (
          <div className="pd-empty">
            <span className="pd-empty-ic">
              <TypeIcon t="book" size={34} />
            </span>
            <strong>Start your reading list</strong>
            <span className="hint">Add what you read for your course or your own development. Each source gets its reference in the style you choose, and your collab documents can cite it.</span>
            {canEdit && (
              <span className="pd-empty-acts">
                {(['book', 'chapter', 'article', 'web'] as SourceType[]).map((t) => (
                  <button key={t} type="button" className="pd-start" onClick={() => void startNew(t)}>
                    <TypeIcon t={t} size={22} />
                    <span>{SOURCE_TYPES.find((x) => x.k === t)?.label}</span>
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

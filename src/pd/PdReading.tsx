import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId } from '../lib/tasks';
import { TaskEditor } from '../editor/TaskEditor';
import { CITE_STYLES, SOURCE_TYPES, inText, piecesText, reference, shortName, sortKey, type CiteStyle, type Person, type Source, type SourceType } from '../lib/cite';
import type { SharedDoc } from '../lib/sharedDocs';
import { ask } from '../lib/ask';

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

export function Ref({ s, style }: { s: Source; style: CiteStyle }) {
  return (
    <span className="pd-ref">
      {reference(s, style).map((p, i) => (p.i ? <i key={i}>{p.t}</i> : <span key={i}>{p.t}</span>))}
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
  const f = (k: keyof Source, label: string, ph = '', wide = false) => (
    <label className={'pd-f' + (wide ? ' wide' : '')}>
      <span className="pd-k">{label}</span>
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
      <PeopleInput label="Authors" list={s.authors.length ? s.authors : [{ first: '', last: '' }]} onChange={(authors) => set({ authors })} />
      <div className="pd-grid">
        {f('org', 'Or an organisation as author', 'Cambridge Assessment English', true)}
        {f('year', 'Year', '2006')}
        {t === 'web' && f('date', 'Day and month', '14 March')}
        {f('title', t === 'chapter' ? 'Chapter title' : t === 'article' ? 'Article title' : 'Title', '', true)}
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

export function PdReading({ d, canEdit }: { d: SharedDoc & { pd?: { style?: CiteStyle } }; canEdit: boolean }) {
  const list = useSources(d.id);
  const style: CiteStyle = d.pd?.style ?? 'apa';
  const [sel, setSel] = useState('');
  const [editing, setEditing] = useState<(Omit<ReadSource, 'id'> & { id?: string }) | null>(null);
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
  };
  const patch = (p: Partial<ReadSource>) => cur && void updateDoc(doc(srcCol(d.id), cur.id), JSON.parse(JSON.stringify(p)));
  if (!list) return <div className="dp-msg">Opening your reading…</div>;
  const sections = cur?.sections?.length ? cur.sections : [{ id: 's1', page: '', content: null }];
  return (
    <div className="pd">
      <aside className="pd-side">
        <label className="pd-style">
          <span className="pd-k">Citation style</span>
          <select value={style} disabled={!canEdit} onChange={(e) => void updateDoc(doc(db, 'sharedDocs', d.id), { pd: { style: e.target.value } })}>
            {CITE_STYLES.map((c) => (
              <option key={c.k} value={c.k}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="hint">{CITE_STYLES.find((c) => c.k === style)?.about}</span>
        </label>
        <span className="pd-k">Sources</span>
        <nav className="pd-list" aria-label="Sources">
          {[...list]
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
            .map((s) => (
              <button key={s.id} type="button" className={'pd-item' + (s.id === sel && !editing ? ' on' : '')} onClick={() => (setSel(s.id), setEditing(null))}>
                <b>{shortName(s)}</b>
                <span>{s.title}</span>
              </button>
            ))}
          {!list.length && <span className="hint">No sources yet.</span>}
        </nav>
        {canEdit && (
          <button type="button" className="btn primary" onClick={() => setEditing(blank())}>
            + Add a source
          </button>
        )}
      </aside>
      <main className="pd-main">
        {editing ? (
          <SourceForm init={editing} style={style} onSave={(s) => void save(s)} onCancel={() => setEditing(null)} />
        ) : cur ? (
          <>
            <div className="pd-head">
              <Ref s={cur} style={style} />
              <span className="pd-head-acts">
                <button type="button" className="btn small-btn" onClick={() => void navigator.clipboard?.writeText(piecesText(reference(cur, style)))}>
                  Copy the reference
                </button>
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
            <label className="switch-row pd-paged">
              <span>
                Notes with page numbers
                <span className="hint">Each page you read gets its own section, so you can quote it with the page</span>
              </span>
              <input type="checkbox" checked={!!cur.paged} disabled={!canEdit} onChange={() => patch({ paged: !cur.paged })} />
            </label>
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
                  <button type="button" className="btn pd-newpage" onClick={() => patch({ sections: [...sections, { id: newId(), page: String((parseInt(sections[sections.length - 1]?.page, 10) || 0) + 1 || ''), content: null }] })}>
                    + A new page
                  </button>
                )}
              </div>
            ) : (
              <NoteBox key={cur.id} value={cur.notes} placeholder="Your notes on this source" onSave={(c) => patch({ notes: c })} />
            )}
          </>
        ) : (
          <div className="ma-empty">
            <strong>Add the first source</strong>
            <span className="hint">A book, a chapter, an article or a web page. Its reference is written for you in the style you choose, and your documents can cite it.</span>
          </div>
        )}
      </main>
    </div>
  );
}

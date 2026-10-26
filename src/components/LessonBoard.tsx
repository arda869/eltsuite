import { useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newId } from '../lib/tasks';
import { updateItem, type BoardPage, type Item } from '../lib/classes';
import { Whiteboard } from './Whiteboard';

// One board for the whole lesson, with pages. The teacher can prepare pages before class, move
// between them while teaching (learners see the same page), and borrow a page from another
// lesson in the class; a borrowed page is the same board, so it keeps everything drawn on it.

export const firstPage = (item?: Item | null) => item?.boardPages?.[0]?.id ?? (item ? 'p-' + item.id : '');
export const pagesOf = (item?: Item | null): BoardPage[] => (item?.boardPages?.length ? item.boardPages : item ? [{ id: firstPage(item) }] : []);

export function LessonBoard({
  classId,
  item,
  uid,
  teacher,
  page,
  onPage,
  people,
}: {
  classId: string;
  item: Item;
  uid: string;
  teacher: boolean;
  page: string; // the page to show
  onPage?: (id: string) => void; // teacher: move to another page
  people?: { uid: string; name: string }[];
}) {
  const pages = pagesOf(item);
  const at = Math.max(0, pages.findIndex((p) => p.id === page));
  const cur = pages[at];
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLSpanElement>(menu, () => setMenu(false));
  const [borrow, setBorrow] = useState<{ item: Item; pages: BoardPage[] }[] | null>(null);
  const save = (next: BoardPage[]) => updateItem(classId, item.id, { boardPages: next });
  const add = async () => {
    const p = { id: 'p' + newId() };
    await save([...pages.slice(0, at + 1), p, ...pages.slice(at + 1)]);
    onPage?.(p.id);
  };
  async function openBorrow() {
    setMenu(false);
    const s = await getDocs(collection(db, 'classes', classId, 'items'));
    const list = s.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))
      .filter((x) => x.id !== item.id)
      .sort((a, b) => a.order - b.order)
      .map((x) => ({ item: x, pages: pagesOf(x) }));
    setBorrow(list);
  }
  const label = (p: BoardPage, i: number) => p.title || `Page ${i + 1}`;
  // Name a page in place: double-click its tab, or choose Rename this page.
  const [renaming, setRenaming] = useState<number | null>(null);
  const rename = (i: number, v: string) => {
    setRenaming(null);
    const t = v.trim();
    if ((pages[i]?.title ?? '') === t) return;
    save(pages.map((p, k) => (k === i ? { ...p, title: t || undefined } : p)).map((p) => JSON.parse(JSON.stringify(p))));
  };

  return (
    <div className="lboard">
      <div className="lboard-head">
        {teacher ? (
          <>
            <button type="button" className="lb-arrow" aria-label="Previous page" disabled={at === 0} onClick={() => onPage?.(pages[at - 1].id)}>
              ‹
            </button>
            <span className="lb-pages" role="tablist" aria-label="Board pages">
              {pages.map((p, i) =>
                renaming === i ? (
                  <input
                    key={p.id + i}
                    className="lb-page-input"
                    autoFocus
                    defaultValue={p.title ?? ''}
                    placeholder={`Page ${i + 1}`}
                    aria-label="Page name"
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => rename(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <button key={p.id + i} type="button" role="tab" aria-selected={i === at} className={'lb-page' + (i === at ? ' on' : '') + (p.from ? ' borrowed' : '')} onClick={() => onPage?.(p.id)} onDoubleClick={() => setRenaming(i)} data-tip={p.from ? 'Borrowed from another lesson · double-click to rename' : 'Double-click to name this page'}>
                    {label(p, i)}
                  </button>
                ),
              )}
            </span>
            <button type="button" className="lb-arrow" aria-label="Next page" disabled={at >= pages.length - 1} onClick={() => onPage?.(pages[at + 1].id)}>
              ›
            </button>
            <button type="button" className="btn small-btn" onClick={add} title="Add a page after this one">
              + Page
            </button>
            <span className="lb-menu-wrap" ref={menuRef}>
              <button type="button" className="btn small-btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                ⋯
              </button>
              {menu && (
                <span className="lb-menu" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      setRenaming(at);
                    }}
                  >
                    Rename this page
                  </button>
                  <button type="button" onClick={openBorrow}>
                    Add a page from another lesson
                  </button>
                  <button type="button" disabled={at === 0} onClick={() => (setMenu(false), save(swap(pages, at, at - 1)))}>
                    Move this page left
                  </button>
                  <button type="button" disabled={at >= pages.length - 1} onClick={() => (setMenu(false), save(swap(pages, at, at + 1)))}>
                    Move this page right
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={pages.length < 2}
                    onClick={() => {
                      setMenu(false);
                      if (!window.confirm(cur?.from ? 'Remove this borrowed page from this lesson? It stays in its own lesson.' : 'Delete this page and everything on it?')) return;
                      save(pages.filter((_, i) => i !== at));
                      onPage?.(pages[at === 0 ? 1 : at - 1].id);
                    }}
                  >
                    {cur?.from ? 'Remove this page' : 'Delete this page'}
                  </button>
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="lb-where">
            {label(cur ?? { id: '' }, at)}
            {pages.length > 1 && <span className="hint"> · {at + 1} of {pages.length}</span>}
          </span>
        )}
      </div>
      {cur && <Whiteboard key={cur.id} classId={classId} boardId={cur.id} uid={uid} teacher={teacher} people={people} />}
      {borrow && (
        <div className="scrim" onClick={() => setBorrow(null)}>
          <div className="dialog" role="dialog" aria-label="Add a page from another lesson" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0 }}>Add a page from another lesson</h2>
            <span className="hint">The page is shared: what you draw on it shows in both lessons.</span>
            <div className="lb-borrow">
              {borrow.length === 0 && <span className="hint">There are no other lessons in this class yet.</span>}
              {borrow.map(({ item: it, pages: ps }) => (
                <div key={it.id} className="lb-borrow-lesson">
                  <span className="lb-borrow-title">{it.title}</span>
                  <span className="lb-borrow-pages">
                    {ps.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        className="lb-page"
                        disabled={pages.some((x) => x.id === p.id)}
                        onClick={async () => {
                          await save([...pages.slice(0, at + 1), { id: p.id, from: it.id, ...(p.title ? { title: p.title } : { title: `${it.title.slice(0, 24)} · ${i + 1}` }) }, ...pages.slice(at + 1)]);
                          onPage?.(p.id);
                          setBorrow(null);
                        }}
                      >
                        {label(p, i)}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => setBorrow(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function swap<T>(a: T[], i: number, j: number) {
  const out = [...a];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

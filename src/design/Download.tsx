import { useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '../lib/firebase';
import { tell } from '../lib/ask';
import { uploadPicture } from '../editor/PackNode';
import type { Ctx } from './Editor';
import { downloadCards, downloadImage, downloadPdf, pageBlob, type Copy } from './tools';
import type { Env } from './render';

// Downloads: pictures and PDFs, each learner's copy, cut-out cards, and a picture in Resources to use in
// lessons.
export function DownloadMenu({ cx }: { cx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState(false);
  const [busy, setBusy] = useState('');
  const hasAB = cx.els.some((e) => e.ver);
  const hasLabels = cx.els.some((e) => e.t === 'label');
  const env: Env = { imgs: cx.imgs, view: cx.view, accent: cx.accent };
  const name = cx.d.title || 'Design';
  const run = async (what: string, f: () => Promise<void>) => {
    setOpen(false);
    setBusy(what);
    try {
      await f();
    } catch {
      void tell('We couldn’t make the download just now. Try again.');
    } finally {
      setBusy('');
    }
  };
  const copies = (k: 'all' | 'learner' | 'A' | 'B' | 'AB' | 'key'): Copy[] =>
    k === 'learner' ? [{ view: 'all', learner: true, label: 'Learners' }] : k === 'A' ? [{ view: 'A', learner: hasLabels, label: 'A' }] : k === 'B' ? [{ view: 'B', learner: hasLabels, label: 'B' }] : k === 'AB' ? [{ view: 'A', learner: hasLabels, label: 'A' }, { view: 'B', learner: hasLabels, label: 'B' }] : [{ view: 'all', learner: false, label: '' }];
  const toFiles = async () => {
    const u = auth.currentUser;
    if (!u) return;
    const blob = await pageBlob(cx.page, cx.els, env, 1.6);
    await uploadPicture('user:' + u.uid, blob, 'high', `${name}${cx.pages.length > 1 ? ' – page ' + (cx.pages.indexOf(cx.page) + 1) : ''}`);
    void tell('The page is in your Resources as a picture. You can add it to any lesson or task from there.');
  };
  return (
    <>
      {busy && <span className="dz-busy" role="status">{busy}</span>}
      <button type="button" className="btn primary dz-dl" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download
      </button>
      {open && (
        <>
          <div className="dz-dl-scrim" onClick={() => setOpen(false)} />
          <div className="dz-dl-pop" role="menu">
            <p className="dz-dl-h">This page</p>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'png', 2.5))}>
              <strong>Picture (PNG)</strong><span>Sharp, for screens and slides</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'jpg', 2))}>
              <strong>Picture (JPG)</strong><span>A smaller file, for messages</span>
            </button>
            {!cx.learnerUser && (
              <button type="button" role="menuitem" onClick={() => void run('Saving to Resources…', toFiles)}>
                <strong>Save as a picture in Resources</strong><span>To use in lessons and tasks</span>
              </button>
            )}
            <p className="dz-dl-h">All {cx.pages.length} {cx.pages.length === 1 ? 'page' : 'pages'}, to print</p>
            <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name, copies('all')))}>
              <strong>PDF</strong><span>Everything, as you see it</span>
            </button>
            {hasLabels && (
              <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name + ' – learners', copies('learner')))}>
                <strong>Learners’ copy (PDF)</strong><span>Label words as lines to write on</span>
              </button>
            )}
            {hasAB && (
              <>
                <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name + ' – learner A and B', copies('AB')))}>
                  <strong>Learner A and learner B (PDF)</strong><span>A’s pages, then B’s</span>
                </button>
                <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name + ' – learner A', copies('A')))}>
                  <strong>Only learner A</strong>
                </button>
                <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name + ' – learner B', copies('B')))}>
                  <strong>Only learner B</strong>
                </button>
              </>
            )}
            <button type="button" role="menuitem" onClick={() => (setOpen(false), setCards(true))}>
              <strong>Cut into cards…</strong><span>Equal pieces with lines to cut along, for jigsaws and sorting</span>
            </button>
          </div>
        </>
      )}
      {cards && createPortal(<CardsDialog onClose={() => setCards(false)} onMake={(r, c, s, all) => (setCards(false), void run('Making the cards…', () => downloadCards(all ? cx.pages : [cx.page], cx.els, env, name, r, c, s)))} pages={cx.pages.length} />, document.body)}
    </>
  );
}

function CardsDialog({ onClose, onMake, pages }: { onClose: () => void; onMake: (rows: number, cols: number, shuffle: boolean, all: boolean) => void; pages: number }) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [shuffle, setShuffle] = useState(true);
  const [all, setAll] = useState(false);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dz-cards" role="dialog" aria-label="Cut into cards">
        <h2>Cut into cards</h2>
        <p>Each page is cut into equal pieces and laid out on A4, with dashed lines to cut along.</p>
        <div className="dz-cards-row">
          <label>
            <span>Rows</span>
            <input type="number" min={1} max={8} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </label>
          <span className="dz-x">×</span>
          <label>
            <span>Columns</span>
            <input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </label>
          <div className="dz-cards-prev" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: rows * cols }, (_, i) => <span key={i} />)}
          </div>
        </div>
        <label className="dz-checkrow">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> Shuffle the pieces (for a jigsaw)
        </label>
        {pages > 1 && (
          <label className="dz-checkrow">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All {pages} pages, not only this one
          </label>
        )}
        <div className="row-between" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => onMake(rows, cols, shuffle, all)}>Download the cards</button>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import type { JSONContent } from '@tiptap/react';
import { useAuth } from '../lib/auth';
import { useMyDocs } from '../lib/sharedDocs';
import { RtdbProvider } from '../collab/provider';
import { MAX_PDF, filePdfInfo, loadPdf, openPdf, pageSizes, saveClassPdf } from './pdfData';
import { FileIcon } from '../components/FileIcon';

// Adding a PDF to a task: one from Files, with its text boxes and highlights, or a new upload.
// The lesson gets its own copy, so learners in the class can open it and the tasks in its boxes
// are part of the task.

type Unit = { name: string; from: number; to: number };
async function blockOf(docKey: string, uid: string): Promise<{ notes: JSONContent[]; units: Unit[] }> {
  const doc = new Y.Doc();
  const p = new RtdbProvider(docKey, doc, uid);
  try {
    await new Promise<void>((res) => {
      p.whenSynced(() => res());
      window.setTimeout(res, 8000);
    });
    const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default')) as JSONContent;
    const b = json.content?.[0];
    return { notes: (b?.content ?? []) as JSONContent[], units: ((b?.attrs?.units as Unit[]) ?? []) as Unit[] };
  } finally {
    p.destroy();
    doc.destroy();
  }
}

export function PdfPick({ classId, onPick, onClose }: { classId: string; onPick: (node: JSONContent) => void; onClose: () => void }) {
  const { user } = useAuth();
  const { mine, withMe } = useMyDocs(user?.uid);
  const files = [...(mine ?? []), ...(withMe ?? [])].filter((d) => d.kind === 'pdf');
  const [busy, setBusy] = useState('');
  const input = useRef<HTMLInputElement>(null);
  // A file is chosen first; then which pages: all of them, a unit, or from one page to another.
  const [chosen, setChosen] = useState<{ id: string; title: string; docKey: string; n: number; units: Unit[] } | null>(null);
  const [range, setRange] = useState<[number, number]>([1, 1]);
  const choose = async (id: string, title: string, docKey: string) => {
    if (!user || !classId) return setBusy('PDFs can be added inside a class.');
    setBusy('Opening the PDF…');
    try {
      const [info, b] = await Promise.all([filePdfInfo(id), blockOf(docKey, user.uid)]);
      const n = info?.pages.length ?? 1;
      setBusy('');
      if (n <= 1) return void fromFile(id, title, docKey, [1, 1]);
      setRange([1, n]);
      setChosen({ id, title, docKey, n, units: b.units });
    } catch {
      setBusy('We couldn’t open the PDF. Try again.');
    }
  };
  const fromFile = async (id: string, title: string, docKey: string, [a, z]: [number, number]) => {
    if (!user || !classId) return setBusy('PDFs can be added inside a class.');
    try {
      setBusy('Copying the PDF into the class…');
      const [bytes, info, b] = await Promise.all([loadPdf('file:' + id), filePdfInfo(id), blockOf(docKey, user.uid)]);
      const all = info?.pages ?? (await pageSizes(await openPdf(bytes)));
      const first = Math.max(0, a - 1);
      const last = Math.min(all.length - 1, z - 1);
      const pages = all.slice(first, last + 1);
      // Only the notes on those pages come, on the same pages.
      const notes = b.notes.filter((c) => (Number(c.attrs?.page) || 0) >= first && (Number(c.attrs?.page) || 0) <= last).map((c) => ({ ...c, attrs: { ...c.attrs, page: (Number(c.attrs?.page) || 0) - first } }));
      const mediaId = await saveClassPdf(classId, bytes, all, title);
      const part = first > 0 || last < all.length - 1 ? ` (pages ${first + 1}–${last + 1})` : '';
      onPick({ type: 'pdfBlock', attrs: { src: 'media:' + mediaId, pages, title: title + part, from: id, inLesson: true, first }, content: notes });
    } catch {
      setBusy('We couldn’t add the PDF. Try again.');
    }
  };
  const upload = async (f: File) => {
    if (!classId) return setBusy('PDFs can be added inside a class.');
    if (f.size > MAX_PDF) return setBusy('That PDF is over 15 MB. Make it smaller first, for example by saving it with smaller pictures.');
    try {
      setBusy('Uploading the PDF…');
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pages = await pageSizes(await openPdf(bytes));
      const title = f.name.replace(/\.pdf$/i, '');
      const mediaId = await saveClassPdf(classId, bytes, pages, title);
      onPick({ type: 'pdfBlock', attrs: { src: 'media:' + mediaId, pages, title, inLesson: true }, content: [] });
    } catch {
      setBusy('We couldn’t open that file as a PDF.');
    }
  };
  return createPortal(
    <div className="scrim" onClick={onClose}>
      <div className="dialog pdf-pick" role="dialog" aria-label="Add a PDF" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Add a PDF</h2>
        <span className="hint">The lesson gets its own copy with the text boxes and highlights, so you can change it here without changing the file.</span>
        <button type="button" className="pdf-pick-up" onClick={() => input.current?.click()} disabled={!!busy}>
          <strong>Upload a PDF</strong>
          <span className="hint">Up to 15 MB. Then add text boxes, gaps and highlights on its pages.</span>
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
        {files.length > 0 && <span className="pdf-pick-h">From your files</span>}
        <div className="pdf-pick-list">
          {files.map((d) => (
            <button key={d.id} type="button" className="pdf-pick-it" disabled={!!busy} onClick={() => void choose(d.id, d.title, d.docKey)}>
              <FileIcon kind="pdf" size={30} label={false} />
              <span>
                <b>{d.title}</b>
                <span className="hint">{d.owner === user?.uid ? 'Yours' : `From ${d.ownerName}`}</span>
              </span>
            </button>
          ))}
        </div>
        {chosen && (
          <div className="pdf-pick-pages">
            <b>Which pages of {chosen.title}?</b>
            <span className="pdf-pick-opts">
              <button type="button" className={'pdf-pick-opt' + (range[0] === 1 && range[1] === chosen.n ? ' on' : '')} onClick={() => setRange([1, chosen.n])}>
                All {chosen.n} pages
              </button>
              {chosen.units.map((u) => (
                <button key={u.name + u.from} type="button" className={'pdf-pick-opt' + (range[0] === u.from && range[1] === u.to ? ' on' : '')} onClick={() => setRange([u.from, u.to])}>
                  {u.name} · {u.from}–{u.to}
                </button>
              ))}
            </span>
            <span className="pdf-pick-range">
              Pages
              <input type="number" min={1} max={chosen.n} value={range[0]} onChange={(e) => setRange([Math.max(1, Math.min(chosen.n, Number(e.target.value) || 1)), Math.max(range[1], Number(e.target.value) || 1)])} aria-label="From page" />
              to
              <input type="number" min={range[0]} max={chosen.n} value={range[1]} onChange={(e) => setRange([range[0], Math.max(range[0], Math.min(chosen.n, Number(e.target.value) || range[0]))])} aria-label="To page" />
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => void fromFile(chosen.id, chosen.title, chosen.docKey, range)}>
                Add these pages
              </button>
            </span>
          </div>
        )}
        {busy && <span className="hint">{busy}</span>}
        <span className="pe-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
}

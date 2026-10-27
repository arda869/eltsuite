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

async function notesOf(docKey: string, uid: string): Promise<JSONContent[]> {
  const doc = new Y.Doc();
  const p = new RtdbProvider(docKey, doc, uid);
  try {
    await new Promise<void>((res) => {
      p.whenSynced(() => res());
      window.setTimeout(res, 8000);
    });
    const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default')) as JSONContent;
    return (json.content?.[0]?.content ?? []) as JSONContent[];
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
  const fromFile = async (id: string, title: string, docKey: string) => {
    if (!user || !classId) return setBusy('PDFs can be added inside a class.');
    try {
      setBusy('Copying the PDF into the class…');
      const [bytes, info, notes] = await Promise.all([loadPdf('file:' + id), filePdfInfo(id), notesOf(docKey, user.uid)]);
      const pages = info?.pages ?? (await pageSizes(await openPdf(bytes)));
      const mediaId = await saveClassPdf(classId, bytes, pages, title);
      onPick({ type: 'pdfBlock', attrs: { src: 'media:' + mediaId, pages, title, from: id, inLesson: true }, content: notes });
    } catch {
      setBusy('The PDF could not be added. Try again.');
    }
  };
  const upload = async (f: File) => {
    if (!classId) return setBusy('PDFs can be added inside a class.');
    if (f.size > MAX_PDF) return setBusy('That PDF is larger than 15 MB. Make it smaller first, for example by saving it with smaller pictures.');
    try {
      setBusy('Uploading the PDF…');
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pages = await pageSizes(await openPdf(bytes));
      const title = f.name.replace(/\.pdf$/i, '');
      const mediaId = await saveClassPdf(classId, bytes, pages, title);
      onPick({ type: 'pdfBlock', attrs: { src: 'media:' + mediaId, pages, title, inLesson: true }, content: [] });
    } catch {
      setBusy('That file could not be opened as a PDF.');
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
            <button key={d.id} type="button" className="pdf-pick-it" disabled={!!busy} onClick={() => void fromFile(d.id, d.title, d.docKey)}>
              <FileIcon kind="pdf" size={30} label={false} />
              <span>
                <b>{d.title}</b>
                <span className="hint">{d.owner === user?.uid ? 'Yours' : `From ${d.ownerName}`}</span>
              </span>
            </button>
          ))}
        </div>
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

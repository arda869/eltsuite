import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTeacherClasses } from '../lib/coteach';
import { addTask } from '../lib/tasks';
import { NSelect } from '../components/Select';
import { uploadPicture } from '../editor/PackNode';
import { fromStack, getPdf } from './PdfStack';
import { ocrWordsOf } from './ocr';
import type { PageSize } from './pdfData';

// Part of a page as a task: drag a box round it, then choose a class and a lesson. The part goes in
// as a sharp picture, and its words (the PDF's own, or OCR's on a scan) can go under it as text to
// edit or turn into gaps.

type Region = { page: number; x: number; y: number; w: number; h: number };

export function RegionPicker({ pages, active, onPick }: { pages: PageSize[]; active: boolean; onPick: (r: Region) => void }) {
  const [stack, setStack] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  useEffect(() => { setStack(document.querySelector<HTMLElement>('.pdff .pdf-stack')); }, [active, pages.length]);
  if (!active || !stack) return null;
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const x0 = (e.clientX - r.left) / r.width, y0 = (e.clientY - r.top) / r.height;
    let last = { x: x0, y: y0 };
    const move = (ev: PointerEvent) => {
      last = { x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)) };
      setBox({ l: Math.min(x0, last.x), t: Math.min(y0, last.y), w: Math.abs(last.x - x0), h: Math.abs(last.y - y0) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBox(null);
      if (Math.abs(last.x - x0) < 0.03 || Math.abs(last.y - y0) < 0.005) return;
      const a = fromStack(pages, Math.min(x0, last.x), Math.min(y0, last.y));
      const b = fromStack(pages, Math.max(x0, last.x), Math.max(y0, last.y));
      onPick({ page: a.page, x: a.x, y: a.y, w: b.x - a.x, h: (b.page === a.page ? b.y : 1) - a.y });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return createPortal(
    <span className="rtt-layer" contentEditable={false} suppressContentEditableWarning onMouseDown={(e) => e.stopPropagation()}>
      <div className="rtt-catch" onPointerDown={down} aria-label="Drag round the part of the page for the task" />
      {box && <span className="rtt-box" style={{ left: `${box.l * 100}%`, top: `${box.t * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />}
    </span>,
    stack,
  );
}

// The part of the page as a picture, about 1,600 pixels wide, and its words in reading order.
async function cut(src: string, rev: number, first: number, r: Region): Promise<{ blob: Blob; text: string[] }> {
  const pdf = await getPdf(src, '', rev);
  const pg = await pdf.getPage(first + r.page + 1);
  const base = pg.getViewport({ scale: 1 });
  const scale = Math.min(6, Math.max(1.5, 1600 / (base.width * r.w)));
  const vp = pg.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width * r.w);
  c.height = Math.round(vp.height * r.h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(-vp.width * r.x, -vp.height * r.y);
  await pg.render({ canvasContext: ctx, viewport: vp } as Parameters<typeof pg.render>[0]).promise;
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('No picture'))), 'image/png'));
  // Words: the page's own, else OCR's.
  type W = { t: string; x: number; y: number; h: number };
  let words: W[] = [];
  const tc = await pg.getTextContent();
  for (const it of tc.items as { str?: string; transform?: number[]; height?: number }[]) {
    if (!it.str?.trim() || !it.transform) continue;
    const [x, y] = base.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = (it.height || 10) / base.height;
    words.push({ t: it.str, x: x / base.width, y: y / base.height - h, h });
  }
  if (words.reduce((n, w) => n + w.t.length, 0) < 20) words = ocrWordsOf(src, first + r.page).map((w) => ({ t: w.t, x: w.x, y: w.y, h: w.h }));
  const inside = words.filter((w) => w.x >= r.x - 0.005 && w.x <= r.x + r.w && w.y + w.h / 2 >= r.y && w.y + w.h / 2 <= r.y + r.h).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: W[][] = [];
  for (const w of inside) {
    const line = lines.find((l) => Math.abs(l[0].y - w.y) < Math.max(w.h, l[0].h) * 0.6);
    if (line) line.push(w); else lines.push([w]);
  }
  return { blob, text: lines.map((l) => l.sort((a, b) => a.x - b.x).map((w) => w.t).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean) };
}

export function RegionToTaskDialog({ region, src, rev, first, title, onClose }: { region: Region; src: string; rev: number; first: number; title: string; onClose: () => void }) {
  const { user } = useAuth();
  const { classes } = useTeacherClasses(user?.uid);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [itemId, setItemId] = useState('');
  const [name, setName] = useState(`${title} · page ${region.page + 1}`);
  const [withText, setWithText] = useState(true);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; text: string[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ classId: string; itemId: string; taskId: string } | null>(null);
  useEffect(() => {
    let url = '';
    void cut(src, rev, first, region).then((p) => { url = URL.createObjectURL(p.blob); setPreview({ ...p, url }); if (!p.text.length) setWithText(false); }).catch(() => setError('We couldn’t cut out that part of the page. Try again.'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src, rev, first, region]);
  useEffect(() => {
    setItemId('');
    setLessons([]);
    if (!classId) return;
    void getDocs(collection(db, 'classes', classId, 'items')).then((s) => setLessons(s.docs.filter((d) => d.data().kind !== 'topic' && !d.data().deletedAt).map((d) => ({ id: d.id, title: d.data().title || 'Lesson' })))).catch(() => setError('We couldn’t load the lessons. Try again.'));
  }, [classId]);
  const make = async () => {
    if (!preview || !classId || !itemId) return;
    setBusy('Adding the task…');
    setError('');
    try {
      const pic = await uploadPicture(classId, preview.blob, 'high', name);
      const content: JSONContent = { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'picture', attrs: { src: pic, alt: preview.text.join(' ').slice(0, 300) || name, size: 'l' } }] },
        ...(withText ? preview.text.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) : [{ type: 'paragraph' }]),
      ] };
      const tasks = await getDocs(collection(db, 'classes', classId, 'items', itemId, 'tasks'));
      const order = tasks.docs.reduce((m, t) => Math.max(m, Number(t.data().order) || 0), -1) + 1;
      const taskId = await addTask(classId, itemId, order, 'task', { title: name.trim() || 'Task', instructions: '', content });
      setDone({ classId, itemId, taskId });
    } catch (e) {
      console.error(e);
      setError('We couldn’t add the task just now. Check your connection and try again. The PDF is unchanged.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="rtt-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rtt-dialog" role="dialog" aria-modal="true" aria-labelledby="rtt-h">
        <h2 id="rtt-h">Make a task from this part</h2>
        <div className="rtt-body">
          <div className="rtt-pic">{preview ? <img src={preview.url} alt="The part of the page" /> : <span className="hint">One moment…</span>}</div>
          {done ? (
            <div className="rtt-form">
              <p>The task is at the end of the lesson. Add questions to it there, for example gaps in the text.</p>
              <a className="btn primary" href={`/class/${done.classId}/lesson/${done.itemId}?task=${done.taskId}`} target="_blank" rel="noopener noreferrer">Open the task</a>
              <button type="button" className="btn" onClick={onClose}>Close</button>
            </div>
          ) : (
            <div className="rtt-form">
              <label className="rtt-field"><span>Task title</span><input className="rtt-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
              <label className="rtt-field"><span>Class</span><NSelect className="rtt-sel" aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose a class</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NSelect></label>
              <label className="rtt-field"><span>Lesson</span><NSelect className="rtt-sel" aria-label="Lesson" value={itemId} disabled={!classId} onChange={(e) => setItemId(e.target.value)}><option value="">{classId ? (lessons.length ? 'Choose a lesson' : 'No lessons yet') : 'Choose a class first'}</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</NSelect></label>
              {!!preview?.text.length && <label className="rtt-check"><input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} />Put its words under the picture, to edit or make into gaps ({preview.text.length} {preview.text.length === 1 ? 'line' : 'lines'})</label>}
              {error && <p className="rtt-error" role="alert">{error}</p>}
              <span className="rtt-acts">
                <button type="button" className="btn" onClick={onClose}>Cancel</button>
                <button type="button" className="btn primary" disabled={!preview || !classId || !itemId || !!busy} onClick={() => void make()}>{busy || 'Add the task'}</button>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

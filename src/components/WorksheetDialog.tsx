import { useEffect, useState } from 'react';
import { gatherLesson } from '../lib/transfer';
import type { ExportTask } from '../lib/textformat';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { collectPictures, flattenWithSections, lessonDocx, saveBlob, type MediaMap, type Paper, type WsItem } from '../lib/worksheet';
import { audioUrl } from '../lib/media';
import { worksheetHtml } from '../lib/worksheetHtml';
import { theme } from '../lib/themes';
import { coverMarkup } from './Covers';
import { Loader } from './Loader';
import type { ClassDoc, Item } from '../lib/classes';

const defaultPaper = (): Paper => {
  try {
    const saved = localStorage.getItem('ll.paper') as Paper | null;
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return /^en-(US|CA)|es-(US|MX)/.test(navigator.language) ? 'Letter' : 'A4';
};

// Print a lesson as a worksheet (PDF through the browser's print dialog) or download it as a Word file.
export function WorksheetDialog({ classId, itemId, onClose }: { classId: string; itemId: string; onClose: () => void }) {
  const [lesson, setLesson] = useState<{ title: string; tasks: ExportTask[] } | null>(null);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [header, setHeader] = useState(true);
  const [key, setKey] = useState(true);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState('');
  const [paper, setPaperState] = useState<Paper>(defaultPaper);
  const setPaper = (p: Paper) => {
    setPaperState(p);
    try {
      localStorage.setItem('ll.paper', p);
    } catch {
      /* ignore */
    }
  };
  const [cls, setCls] = useState<ClassDoc | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [columns, setColumnsState] = useState<1 | 2>(() => {
    try {
      return localStorage.getItem('ll.wsCols') === '1' ? 1 : 2;
    } catch {
      return 2;
    }
  });
  const setColumns = (c: 1 | 2) => {
    setColumnsState(c);
    try {
      localStorage.setItem('ll.wsCols', String(c));
    } catch {
      /* ignore */
    }
  };
  const [marks, setMarks] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoadError('');
    gatherLesson(classId, itemId)
      .then(setLesson)
      .catch((e) => {
        console.error(e);
        setLoadError(
          (e as { code?: string }).code === 'permission-denied'
            ? 'The tasks could not be read. If a “view as a learner” tab is open, close it, then try again.'
            : 'The tasks could not be loaded. Check your connection, then try again.',
        );
      });
  }, [classId, itemId, attempt]);
  useEffect(() => {
    getDoc(doc(db, 'classes', classId)).then((d) => d.exists() && setCls({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }), () => {});
    getDoc(doc(db, 'classes', classId, 'items', itemId)).then((d) => d.exists() && setItem({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }), () => {});
  }, [classId, itemId]);
  const isExam = item?.type === 'exam';
  const look = () => ({ header, key, notes, paper, columns, exam: isExam, marks: isExam && marks, accent: theme(cls?.themeColor).accent, className: cls?.name ?? '', level: cls?.level ?? '' });
  const visible = (lesson?.tasks ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'section' && !t.hidden);
  const ids = picked ?? new Set(visible.map((x) => x.i));
  const chosen = () => flattenWithSections(lesson!.tasks, ids);

  const [cover, setCover] = useState('');
  useEffect(() => {
    if (cls) coverMarkup(cls.cover, classId).then(setCover, () => setCover(''));
  }, [cls, classId]);
  // Uploaded pictures are read from the class first, with their sizes (the Word file needs them).
  const pictures = async (items: WsItem[]): Promise<MediaMap> => {
    const map: MediaMap = {};
    await Promise.all(
      collectPictures(items).map(async (src) => {
        const data = await audioUrl(classId, src.slice(6)).catch(() => '');
        if (!data) return;
        const dims = await new Promise<{ w: number; h: number }>((res) => {
          const im = new Image();
          im.onload = () => res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 });
          im.onerror = () => res({ w: 400, h: 300 });
          im.src = data;
        });
        map[src] = { data, ...dims };
      }),
    );
    return map;
  };
  const print = async () => {
    const tasks = chosen();
    // Open the window straight away (inside the click), then fill it once the pictures are read.
    const w = window.open('', '_blank');
    if (!w) return setBusy('Your browser blocked the print window. Allow pop-ups for this site.');
    const media = await pictures(tasks);
    (w as unknown as { __autoPrint: boolean }).__autoPrint = true; // the page prints itself once it is laid out
    w.document.write(worksheetHtml(lesson!.title, tasks, { ...look(), cover, origin: location.origin, media }));
    w.document.close();
    w.focus();
  };
  const docx = async () => {
    setBusy('Making the Word file…');
    try {
      const items = chosen();
      saveBlob(`${lesson!.title.replace(/[^\w\- ]+/g, '').trim() || 'Worksheet'}.docx`, await lessonDocx(lesson!.title, items, { ...look(), media: await pictures(items) }));
      setBusy('');
    } catch (e) {
      setBusy('The file could not be made: ' + (e as Error).message);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Worksheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Worksheet</h2>
        {loadError ? (
          <>
            <span className="load-error">{loadError}</span>
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn primary" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </span>
          </>
        ) : !lesson ? (
          <Loader label="Getting the tasks ready" />
        ) : (
          <>
            <span className="hint">Laid out like a coursebook page: your sections as headings, each task as a numbered exercise (its instruction is the heading), and no exercise split across columns or pages. Hidden tasks are left out.</span>
            {visible.length === 0 && <span className="load-error">{lesson.tasks.some((t) => t.kind !== 'section') ? 'Every task here is hidden from learners, so there is nothing to print. Show a task first.' : 'This lesson has no tasks yet.'}</span>}
            <div className="field" style={{ gap: 6 }}>
              <span>Tasks</span>
              <div className="aud-pick ws-tasks">
                {visible.map(({ t, i }) => (
                  <label key={i} className="pop-check">
                    <input type="checkbox" checked={ids.has(i)} onChange={() => setPicked((p) => { const n = new Set(p ?? ids); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                    {t.title}
                  </label>
                ))}
              </div>
            </div>
            <div className="field" style={{ gap: 6 }}>
              <span>Paper</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Paper size" style={{ width: 260 }}>
                {(['A4', 'Letter', 'A5'] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={paper === p} className={paper === p ? 'on' : ''} onClick={() => setPaper(p)}>
                    {p === 'Letter' ? 'US Letter' : p}
                  </button>
                ))}
              </span>
            </div>
            <div className="field" style={{ gap: 6 }}>
              <span>Layout</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Columns" style={{ width: 260 }}>
                {([1, 2] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={columns === c} className={columns === c ? 'on' : ''} onClick={() => setColumns(c)}>
                    {c === 1 ? 'One column' : 'Two columns'}
                  </button>
                ))}
              </span>
            </div>
            <label className="pop-check">
              <input type="checkbox" checked={header} onChange={() => setHeader((v) => !v)} />
              Name box in the header
            </label>
            {isExam && (
              <label className="pop-check">
                <input type="checkbox" checked={marks} onChange={() => setMarks((v) => !v)} />
                Mark boxes for each exercise, section totals and a total
              </label>
            )}
            <label className="pop-check">
              <input type="checkbox" checked={key} onChange={() => setKey((v) => !v)} />
              Answer key on a separate page
            </label>
            <label className="pop-check">
              <input type="checkbox" checked={notes} onChange={() => setNotes((v) => !v)} />
              Teacher’s notes with each exercise in the answer key (numbered separately, after the worksheet)
            </label>
            {busy && <span className="hint">{busy}</span>}
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn" disabled={!ids.size} onClick={docx}>
                Word file (.docx)
              </button>
              <button type="button" className="btn primary" disabled={!ids.size} onClick={print}>
                Print or save as PDF
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}


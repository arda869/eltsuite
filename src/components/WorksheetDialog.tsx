import { useEffect, useState } from 'react';
import { gatherLesson } from '../lib/transfer';
import type { ExportTask } from '../lib/textformat';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { flattenWithSections, lessonDocx, saveBlob, type Paper, type WsItem } from '../lib/worksheet';
import { sheetPictures, sheetSounds } from '../lib/sheetMedia';
import { lessonStyleOf } from '../lib/lessonStyle';
import { worksheetHtml } from '../lib/worksheetHtml';
import { theme } from '../lib/themes';
import { coverMarkup } from './Covers';
import { Loader } from './Loader';
import type { ClassDoc, Item } from '../lib/classes';
import { PdfPreview } from './PdfPreview';
import { pdfName, worksheetPdf } from '../lib/pdfMake';

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
  const [qr, setQrState] = useState(() => {
    try {
      return localStorage.getItem('ll.qr') !== 'off';
    } catch {
      return true;
    }
  });
  const setQr = (v: boolean) => {
    setQrState(v);
    try {
      localStorage.setItem('ll.qr', v ? 'on' : 'off');
    } catch {
      /* fine */
    }
  };
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
  // One column, like the worksheet view in the lesson editor.
  const columns = 1 as const;
  const [marks, setMarks] = useState(true);
  // Text size and a clearer (dyslexia-friendly) font for the print and Word file, remembered here.
  const keep = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  };
  const [size, setSizeState] = useState<'standard' | 'large' | 'xl'>(() => {
    try {
      const v = localStorage.getItem('ll.wsSize');
      return v === 'large' || v === 'xl' ? v : 'standard';
    } catch {
      return 'standard';
    }
  });
  const setSize = (v: 'standard' | 'large' | 'xl') => (setSizeState(v), keep('ll.wsSize', v));
  const [clear, setClearState] = useState(() => {
    try {
      return localStorage.getItem('ll.wsClear') === '1';
    } catch {
      return false;
    }
  });
  const setClear = (v: boolean) => (setClearState(v), keep('ll.wsClear', v ? '1' : '0'));
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
            ? 'We couldn’t read the tasks. If a “view as a learner” tab is open, close it and try again.'
            : 'We couldn’t load the tasks. Check your connection and try again.',
        );
      });
  }, [classId, itemId, attempt]);
  useEffect(() => {
    getDoc(doc(db, 'classes', classId)).then((d) => d.exists() && setCls({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }), () => {});
    getDoc(doc(db, 'classes', classId, 'items', itemId)).then((d) => d.exists() && setItem({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }), () => {});
  }, [classId, itemId]);
  const isExam = item?.type === 'exam';
  const look = () => ({ lessonStyle: lessonStyleOf(cls), header, key, notes, qr, paper, columns, size, clear, exam: isExam, marks: isExam && marks, accent: theme(cls?.themeColor).accent, className: cls?.name ?? '', level: cls?.level ?? '' });
  const visible = (lesson?.tasks ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'section' && !t.hidden && t.print?.show !== 'screen');
  const ids = picked ?? new Set(visible.map((x) => x.i));
  const chosen = () => flattenWithSections(lesson!.tasks, ids, lessonStyleOf(cls));

  const [cover, setCover] = useState('');
  useEffect(() => {
    if (cls) coverMarkup(cls.cover, classId).then(setCover, () => setCover(''));
  }, [cls, classId]);
  const pictures = (items: WsItem[]) => sheetPictures(classId, items);
  const sounds = (items: WsItem[]) => sheetSounds(classId, items, theme(cls?.themeColor).accent);
  const hasMedia = !!lesson && JSON.stringify(lesson.tasks).includes('"type":"media"');
  const print = async () => {
    const tasks = chosen();
    // Open the window straight away (inside the click), then fill it once the pictures are read.
    const w = window.open('', '_blank');
    if (!w) return setBusy('Your browser blocked the print window. Allow pop-ups for this site.');
    const [media, snd] = await Promise.all([pictures(tasks), sounds(tasks)]);
    (w as unknown as { __autoPrint: boolean }).__autoPrint = true; // the page prints itself once it is laid out
    w.document.write(worksheetHtml(lesson!.title, tasks, { ...look(), cover, origin: location.origin, media, sounds: snd }));
    w.document.close();
    w.focus();
  };
  // A real PDF, opened in the viewer, to save in Files or download.
  const [preview, setPreview] = useState<{ bytes: Uint8Array; name: string } | null>(null);
  const makePdf = async () => {
    setBusy('Making the PDF…');
    try {
      const tasks = chosen();
      const [media, snd] = await Promise.all([pictures(tasks), sounds(tasks)]);
      const bytes = await worksheetPdf(worksheetHtml(lesson!.title, tasks, { ...look(), cover, origin: location.origin, media, sounds: snd }), paper);
      setPreview({ bytes, name: pdfName(lesson!.title, cls?.name, isExam ? 'Exam' : 'Worksheet', key && 'with answers') });
      setBusy('');
    } catch (e) {
      console.error(e);
      setBusy('We couldn’t make the PDF: ' + (e as Error).message);
    }
  };
  const docx = async () => {
    setBusy('Making the Word file…');
    try {
      const items = chosen();
      saveBlob(`${lesson!.title.replace(/[^\w\- ]+/g, '').trim() || 'Worksheet'}.docx`, await lessonDocx(lesson!.title, items, { ...look(), media: await pictures(items), sounds: await sounds(items) }));
      setBusy('');
    } catch (e) {
      setBusy('We couldn’t make the file: ' + (e as Error).message);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog ws-dialog" role="dialog" aria-label="Worksheet" onClick={(e) => e.stopPropagation()}>
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
            <span className="hint">Laid out like a coursebook page: your sections as headings, each task as a numbered exercise (its instruction is the heading), and no exercise split across pages. Hidden tasks are left out.</span>
            {visible.length === 0 && <span className="load-error">{lesson.tasks.some((t) => t.kind !== 'section') ? 'Every task here is hidden from learners, so there’s nothing to print. Show a task first.' : 'This lesson has no tasks yet.'}</span>}
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
            <div className="ws-opts">
            <div className="field" style={{ gap: 6 }}>
              <span>Paper</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Paper size" style={{ width: '100%' }}>
                {(['A4', 'Letter', 'A5'] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={paper === p} className={paper === p ? 'on' : ''} onClick={() => setPaper(p)}>
                    {p === 'Letter' ? 'US Letter' : p}
                  </button>
                ))}
              </span>
            </div>
            <div className="field" style={{ gap: 6 }}>
              <span>Text size</span>
              <span className="seg small-seg" role="radiogroup" aria-label="Text size" style={{ width: '100%' }}>
                {(['standard', 'large', 'xl'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={size === v} className={size === v ? 'on' : ''} onClick={() => setSize(v)}>
                    {{ standard: 'Standard', large: 'Large', xl: 'Extra large' }[v]}
                  </button>
                ))}
              </span>
            </div>
            </div>
            <label className="pop-check">
              <input type="checkbox" checked={clear} onChange={() => setClear(!clear)} />
              Clearer font (dyslexia-friendly): a plain, open typeface with a little more space between letters and lines
            </label>
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
            {hasMedia && (
              <label className="pop-check">
                <input type="checkbox" checked={qr} onChange={() => setQr(!qr)} />
                QR codes for sounds and videos, so learners can play them on a phone
              </label>
            )}
            {busy && <span className="hint">{busy}</span>}
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn" disabled={!ids.size} onClick={docx}>
                Word file (.docx)
              </button>
              <button type="button" className="btn" disabled={!ids.size} onClick={print}>
                Print
              </button>
              <button type="button" className="btn primary" disabled={!ids.size || !!busy} onClick={() => void makePdf()}>
                PDF
              </button>
            </span>
          </>
        )}
      </div>
      {preview && <PdfPreview bytes={preview.bytes} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  );
}


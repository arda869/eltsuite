import { useEffect, useState } from 'react';
import { gatherLesson } from '../lib/transfer';
import type { ExportTask } from '../lib/textformat';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { flattenLesson, lessonDocx, saveBlob, type Paper } from '../lib/worksheet';
import { worksheetHtml } from '../lib/worksheetHtml';
import { theme } from '../lib/themes';
import type { ClassDoc } from '../lib/classes';

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
  useEffect(() => {
    gatherLesson(classId, itemId).then(setLesson).catch(() => setLesson({ title: 'Lesson', tasks: [] }));
    getDoc(doc(db, 'classes', classId)).then((d) => d.exists() && setCls({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }), () => {});
  }, [classId, itemId]);
  const look = () => ({ header, key, paper, accent: theme(cls?.themeColor).accent, className: cls?.name ?? '', level: cls?.level ?? '' });
  const visible = (lesson?.tasks ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.kind !== 'section' && !t.hidden);
  const ids = picked ?? new Set(visible.map((x) => x.i));
  const chosen = () => flattenLesson(lesson!.tasks, ids);

  const print = () => {
    const tasks = chosen();
    const w = window.open('', '_blank');
    if (!w) return setBusy('Your browser blocked the print window. Allow pop-ups for this site.');
    w.document.write(worksheetHtml(lesson!.title, tasks, look()));
    w.document.close();
    w.focus();
    const go = () => window.setTimeout(() => w.print(), 150);
    if (w.document.fonts?.ready) w.document.fonts.ready.then(go, go);
    else window.setTimeout(() => w.print(), 600);
  };
  const docx = async () => {
    setBusy('Making the Word file…');
    try {
      saveBlob(`${lesson!.title.replace(/[^\w\- ]+/g, '').trim() || 'Worksheet'}.docx`, await lessonDocx(lesson!.title, chosen(), look()));
      setBusy('');
    } catch (e) {
      setBusy('The file could not be made: ' + (e as Error).message);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Worksheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Worksheet</h2>
        {!lesson ? (
          <span className="hint">Loading…</span>
        ) : (
          <>
            <span className="hint">Gaps become lines, choices become (a / b / c), drag and drop becomes a word box, matching becomes two columns, long answers become ruled lines. Hidden tasks are left out.</span>
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
            <label className="pop-check">
              <input type="checkbox" checked={header} onChange={() => setHeader((v) => !v)} />
              Name, class and date boxes at the top
            </label>
            <label className="pop-check">
              <input type="checkbox" checked={key} onChange={() => setKey((v) => !v)} />
              Answer key on a separate page
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


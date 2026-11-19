import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Select } from '../components/Select';
import { PdfPreview } from '../components/PdfPreview';
import type { HubActivity, HubCollection, HubPage } from './catalog';
import { makeEditorResourcePdf } from './ResourceRichPdf';

type Paper = 'a4' | 'letter';
type Colour = 'colour' | 'mono';
type PackOptions = { learnerPages: HubPage[]; teacherPages: HubPage[]; copies: number; paper: Paper; colour: Colour; twoUp: boolean };

async function imageData(url: string, mono: boolean): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const blob = await response.blob();
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
  if (!mono) return original;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = original;
  });
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.');
  context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let at = 0; at < pixels.data.length; at += 4) {
    const shade = Math.round(.2126 * pixels.data[at] + .7152 * pixels.data[at + 1] + .0722 * pixels.data[at + 2]);
    pixels.data[at] = shade; pixels.data[at + 1] = shade; pixels.data[at + 2] = shade;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

function fitImage(pdf: import('jspdf').jsPDF, data: string, paperWidth: number, paperHeight: number, x = 0, y = 0) {
  const ratio = 1270 / 1798; // All four supplied pages are A4 at 150 dpi.
  const width = Math.min(paperWidth, paperHeight * ratio);
  const height = width / ratio;
  pdf.addImage(data, 'PNG', x + (paperWidth - width) / 2, y + (paperHeight - height) / 2, width, height, undefined, 'FAST');
}

/** Actual pages, with learner sheets repeated and private teacher sheets placed last. */
export async function makeResourcePdf({ learnerPages, teacherPages, copies, paper, colour, twoUp }: PackOptions): Promise<Uint8Array> {
  if (!learnerPages.length && !teacherPages.length) throw new Error('Choose at least one page.');
  const { jsPDF } = await import('jspdf');
  const firstLandscape = !!(twoUp && learnerPages.length > 1);
  const pdf = new jsPDF({ unit: 'mm', format: paper, orientation: firstLandscape ? 'landscape' : 'portrait', compress: true });
  const unique = [...new Map([...learnerPages, ...teacherPages].map(page => [page.image, page])).values()];
  const images = new Map(await Promise.all(unique.map(async page => [page.image, await imageData(page.image, colour === 'mono')] as const)));
  let pageIndex = 0;
  const addSheet = (landscape: boolean) => {
    if (pageIndex++) pdf.addPage(paper, landscape ? 'landscape' : 'portrait');
    const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
    return { width, height };
  };
  for (let copy = 0; copy < copies; copy++) {
    for (let at = 0; at < learnerPages.length; at += twoUp ? 2 : 1) {
      const pair = learnerPages.slice(at, at + (twoUp ? 2 : 1));
      const landscape = twoUp && pair.length === 2;
      const { width, height } = addSheet(landscape);
      if (landscape) {
        const half = width / 2;
        pair.forEach((page, index) => fitImage(pdf, images.get(page.image)!, half, height, index * half, 0));
      } else fitImage(pdf, images.get(pair[0].image)!, width, height);
    }
  }
  for (const page of teacherPages) {
    const { width, height } = addSheet(false);
    fitImage(pdf, images.get(page.image)!, width, height);
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}

function KitPrint({ activity, onClose }: { activity: HubActivity; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(activity.pages.filter(page => page.audience === 'learner').map(page => page.id)));
  const [copies, setCopies] = useState(1);
  const [paper, setPaper] = useState<Paper>('a4');
  const [colour, setColour] = useState<Colour>('colour');
  const [twoUp, setTwoUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const learnerPages = activity.pages.filter(page => page.audience === 'learner' && selected.has(page.id));
  const teacherPages = activity.pages.filter(page => page.audience === 'teacher' && selected.has(page.id));
  const sheets = (twoUp ? Math.ceil(learnerPages.length / 2) : learnerPages.length) * copies + teacherPages.length;
  const pdfName = `Off the Page ${activity.number} - ${activity.title}`;
  const chosenPages = useMemo(() => [...learnerPages, ...teacherPages], [activity.pages, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && !preview) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, preview, onClose]);

  const generate = async (printNow = false) => {
    if (!chosenPages.length || busy) return;
    // Open synchronously, before PDF work, so browser popup blockers do not swallow Print.
    const printWindow = printNow ? window.open('', '_blank') : null;
    if (printNow && !printWindow) { setError('Your browser blocked the print window. Allow pop-ups, or use Preview PDF and print from there.'); return; }
    setBusy(true); setError('');
    try {
      const bytes = await makeResourcePdf({ learnerPages, teacherPages, copies, paper, colour, twoUp });
      if (printWindow) {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        printWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      } else setPreview(bytes);
    } catch (cause) {
      console.error('Resource Hub print pack failed', cause);
      printWindow?.close();
      setError('We couldn’t build the PDF. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return <>{createPortal(
    <div className="rh-overlay" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
      <section className="rh-dialog rh-print" role="dialog" aria-modal="true" aria-labelledby="rh-print-title">
        <header className="rh-dialog-head"><div><span className="rh-eyebrow">Ready for class</span><h2 id="rh-print-title">Make a print pack</h2><p>Choose the pages you need. Learner copies come first; notes and answers are placed last.</p></div><button type="button" className="rh-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></header>
        <div className="rh-print-body">
          <div className="rh-print-options">
            <h3>Pages to include</h3>
            {activity.pages.map(page => <label className="rh-print-check" key={page.id}><input type="checkbox" checked={selected.has(page.id)} onChange={() => setSelected(current => { const next = new Set(current); next.has(page.id) ? next.delete(page.id) : next.add(page.id); return next; })} /><img src={page.image} alt="" /><span><b>{page.title}</b><small>{page.audience === 'teacher' ? 'Notes or answers · printed once when selected' : 'Learner sheet · repeated per copy'}</small></span></label>)}
            <div className="rh-print-controls">
              <label className="rh-field">Learner copies<input type="number" min={1} max={30} step={1} value={copies} onChange={event => setCopies(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
              <div className="rh-field"><span>Paper size</span><Select value={paper} options={[{ v: 'a4', label: 'A4' }, { v: 'letter', label: 'US Letter' }]} onChange={setPaper} label="Paper size" /></div>
              <div className="rh-field"><span>Colour</span><Select value={colour} options={[{ v: 'colour', label: 'Colour' }, { v: 'mono', label: 'Black and white' }]} onChange={setColour} label="Colour" /></div>
            </div>
            <label className="rh-toggle-line"><input type="checkbox" checked={twoUp} onChange={event => setTwoUp(event.target.checked)} /><span>Save paper: two learner pages on one sheet</span></label>
          </div>
          <aside className="rh-pack-summary"><span className="rh-eyebrow">Your pack</span><h3>{sheets} sheet{sheets === 1 ? '' : 's'} to print</h3><p>{learnerPages.length} learner page{learnerPages.length === 1 ? '' : 's'} × {copies} {copies === 1 ? 'copy' : 'copies'}<br />{teacherPages.length} teacher page{teacherPages.length === 1 ? '' : 's'} at the end</p><div className="rh-pack-thumbs" role="region" aria-label="Selected page previews" tabIndex={0}>{chosenPages.map(page => <div key={page.id}><img src={page.image} alt={`${page.title} page`} /><span>{page.title}</span></div>)}</div><p className="rh-muted">Notes and answers appear after learner copies when selected. The default pack contains learner pages only.</p></aside>
        </div>
        <footer className="rh-dialog-foot"><span className="rh-form-error" role="alert">{error || (!selected.size ? 'Choose at least one page.' : '')}</span><div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rh-secondary" onClick={() => void generate(false)} disabled={!selected.size || busy}>{busy ? 'Preparing…' : 'Preview PDF'}</button><button type="button" className="rh-primary" onClick={() => void generate(true)} disabled={!selected.size || busy}>Open PDF to print ↗</button></div></footer>
      </section>
    </div>, document.body,
  )}{preview && <PdfPreview bytes={preview} name={pdfName} onClose={() => setPreview(null)} />}</>;
}

function RichPrint({ activity, collection, onClose }: { activity: HubActivity; collection?: HubCollection; onClose: () => void }) {
  const sections = activity.editorSections ?? [];
  const teacherSections = sections.filter(section => section.audience === 'teacher');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sections.filter(section => section.audience === 'learner').map(section => section.id)));
  const [copies, setCopies] = useState(1);
  const [paper, setPaper] = useState<Paper>('a4');
  const [colour, setColour] = useState<Colour>('colour');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const learners = sections.filter(section => section.audience === 'learner' && selected.has(section.id));
  const includeTeacherGuide = teacherSections.some(section => selected.has(section.id));
  const teachers = includeTeacherGuide ? teacherSections : [];
  const toggleTeacherGuide = () => setSelected(current => {
    const next = new Set(current);
    teacherSections.forEach(section => includeTeacherGuide ? next.delete(section.id) : next.add(section.id));
    return next;
  });
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && !preview) onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [busy, preview, onClose]);
  const generate = async (printNow = false) => {
    if (!selected.size || busy) return;
    const printWindow = printNow ? window.open('', '_blank') : null;
    if (printNow && !printWindow) { setError('Your browser blocked the print window. Allow pop-ups, or use Preview PDF and print from there.'); return; }
    setBusy(true); setError('');
    try {
      const bytes = await makeEditorResourcePdf({ activity, collection, learnerIds: learners.map(section => section.id), teacherIds: teachers.map(section => section.id), copies, paper, colour });
      if (printWindow) { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); printWindow.location.href = url; window.setTimeout(() => URL.revokeObjectURL(url), 120_000); }
      else setPreview(bytes);
    } catch (cause) { console.error('Resource Hub editor print failed', cause); printWindow?.close(); setError(cause instanceof Error ? cause.message : 'We couldn’t build the PDF. Try again.'); }
    finally { setBusy(false); }
  };
  return <>{createPortal(<div className="rh-overlay" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="rh-dialog rh-print" role="dialog" aria-modal="true" aria-labelledby="rh-rich-print-title">
      <header className="rh-dialog-head"><div><span className="rh-eyebrow">Ready for class</span><h2 id="rh-rich-print-title">Make a print pack</h2><p>Learner copies come first. Add Teacher notes to print standalone guidance and each task’s answers together at the end.</p></div><button type="button" className="rh-icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></header>
      <div className="rh-print-body"><div className="rh-print-options"><h3>Sections to include</h3>{sections.filter(section => section.audience === 'learner').map(section => <label className="rh-print-check" key={section.id}><input type="checkbox" checked={selected.has(section.id)} onChange={() => setSelected(current => { const next = new Set(current); next.has(section.id) ? next.delete(section.id) : next.add(section.id); return next; })} /><span className="rh-text-part-icon" aria-hidden="true">≡</span><span><b>{section.title}{section.versionLabel ? ` · ${section.versionLabel}` : ''}</b><small>{section.versionGroup ? 'Named learner version · repeated per copy' : 'Learner section · repeated per copy'}</small></span></label>)}{teacherSections.length > 0 && <label className="rh-print-check"><input type="checkbox" checked={includeTeacherGuide} onChange={toggleTeacherGuide} /><span className="rh-text-part-icon teacher" aria-hidden="true">✳</span><span><b>Teacher notes and answer key</b><small>Standalone guidance, then answers after each task’s instruction · printed once</small></span></label>}<div className="rh-print-controls"><label className="rh-field">Learner copies<input type="number" min={1} max={30} step={1} value={copies} onChange={event => setCopies(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label><div className="rh-field"><span>Paper size</span><Select value={paper} options={[{ v: 'a4', label: 'A4' }, { v: 'letter', label: 'US Letter' }]} onChange={setPaper} label="Paper size" /></div><div className="rh-field"><span>Colour</span><Select value={colour} options={[{ v: 'colour', label: 'Colour' }, { v: 'mono', label: 'Black and white' }]} onChange={setColour} label="Colour" /></div></div></div><aside className="rh-pack-summary"><span className="rh-eyebrow">Your pack</span><h3>{learners.length} learner section{learners.length === 1 ? '' : 's'} × {copies}</h3><p>{includeTeacherGuide ? 'Teacher notes and answer key once at the end' : 'Learner pages only'}</p><div className="rh-text-pack-list" role="region" aria-label="Selected section summary" tabIndex={0}>{learners.map(section => <div key={section.id}><span>≡</span><b>{section.title}{section.versionLabel ? ` · ${section.versionLabel}` : ''}</b><small>{section.versionGroup ? 'Learner version' : 'Learner'}</small></div>)}{includeTeacherGuide && <div><span>✳</span><b>Teacher notes and answer key</b><small>Private teacher pages</small></div>}</div><p className="rh-muted">Named learner versions share a page with a cut line when they fit; longer versions get separate pages. The final page count appears in Preview PDF.</p></aside></div>
      <footer className="rh-dialog-foot"><span className="rh-form-error" role="alert">{error || (!selected.size ? 'Choose at least one section.' : '')}</span><div className="rh-dialog-actions"><button type="button" className="rh-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="rh-secondary" onClick={() => void generate(false)} disabled={!selected.size || busy}>{busy ? 'Preparing…' : 'Preview PDF'}</button><button type="button" className="rh-primary" onClick={() => void generate(true)} disabled={!selected.size || busy}>Open PDF to print ↗</button></div></footer>
    </section>
  </div>, document.body)}{preview && <PdfPreview bytes={preview} name={activity.title} onClose={() => setPreview(null)} />}</>;
}

export function ResourcePrint({ activity, collection, onClose }: { activity: HubActivity; collection?: HubCollection; onClose: () => void }) {
  return activity.editorSections?.length ? <RichPrint activity={activity} collection={collection} onClose={onClose} /> : <KitPrint activity={activity} onClose={onClose} />;
}

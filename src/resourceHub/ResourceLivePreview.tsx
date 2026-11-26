import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JSONContent } from '@tiptap/react';
import { TaskRenderer } from '../components/TaskRenderer';
import { IdentityMark } from '../components/Identity';
import { InstrView } from '../editor/InstrEditor';
import { LocalActivityMode, LocalLearnerPreviewMode } from '../communicative/LocalActivity';
import { splitKey, type Response, type Responses } from '../lib/questions';
import { openPdf } from '../pdf/pdfData';
import type { HubCollection } from './catalog';
import type { HubResourceDraft, HubResourceEdition } from './hubEditorData';
import { makeResourceLessonPdf } from './ResourceLessonPdf';
import { publishedResourceToActivity } from './usePublishedHubResources';
import './resource-live-preview.css';

type View = 'page' | 'learner';

function A4Pages({ bytes, zoom, onPages }: { bytes: Uint8Array; zoom: number; onPages: (count: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let pdf: Awaited<ReturnType<typeof openPdf>> | null = null;
    void (async () => {
      pdf = await openPdf(bytes);
      if (cancelled || !host.current) { void pdf.destroy(); return; }
      const scroll = host.current.parentElement;
      const previousTop = scroll?.scrollTop ?? 0;
      host.current.replaceChildren();
      onPages(pdf.numPages);
      for (let number = 1; number <= pdf.numPages && !cancelled; number++) {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.className = 'rhe-a4-page';
        canvas.dataset.page = String(number);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `A4 page ${number} of ${pdf.numPages}`);
        host.current?.append(canvas);
        const context = canvas.getContext('2d');
        if (context) await page.render({ canvasContext: context, viewport } as Parameters<typeof page.render>[0]).promise;
      }
      if (!cancelled && host.current) { host.current.dataset.pageCount = String(pdf.numPages); if (scroll) scroll.scrollTop = previousTop; }
    })().catch(() => { if (!cancelled && host.current) host.current.textContent = 'The A4 pages could not be drawn. Try Preview print PDF.'; });
    return () => { cancelled = true; void pdf?.destroy(); };
  }, [bytes, onPages]);
  return <div ref={host} className="rhe-a4-pages" style={{ width: `${zoom * 100}%`, maxWidth: `${zoom * 210}mm` }} aria-label="Complete A4 worksheet" />;
}

/** Uses the unsaved draft, so editing a question immediately changes both previews. */
export function ResourceLivePreview({ draft, activeSectionId, collection }: { draft: HubResourceDraft; activeSectionId: string; collection?: HubCollection }) {
  const [view, setView] = useState<View>('page');
  const [responses, setResponses] = useState<Responses>({});
  const [chosenVersions, setChosenVersions] = useState<Record<string, string>>({});
  const [previewSectionId, setPreviewSectionId] = useState(activeSectionId);
  const [expanded, setExpanded] = useState(false);
  const [a4Bytes, setA4Bytes] = useState<Uint8Array | null>(null);
  const [a4Busy, setA4Busy] = useState(false);
  const [a4Error, setA4Error] = useState('');
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfZoom, setPdfZoom] = useState(1);
  const pageScroll = useRef<HTMLDivElement>(null);
  useEffect(() => setPdfPage(page => Math.min(page, Math.max(1, pdfPages))), [pdfPages]);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key === 'Tab') {
        const focusable = [...document.querySelectorAll<HTMLElement>('.rhe-preview-overlay button:not(:disabled), .rhe-preview-overlay input:not(:disabled), .rhe-preview-overlay textarea:not(:disabled), .rhe-preview-overlay select:not(:disabled), .rhe-preview-overlay [tabindex]:not([tabindex="-1"])')].filter(item => item.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      requestAnimationFrame(() => expandButton.current?.focus());
    };
  }, [expanded]);
  useEffect(() => setPreviewSectionId(activeSectionId), [activeSectionId]);
  const learnerSections = draft.sections.filter(section => section.audience === 'learner');
  const selectedLearner = learnerSections.find(section => section.id === previewSectionId) ?? learnerSections[0];
  const versionGroups = [...new Set(learnerSections.map(section => section.versionGroup).filter((group): group is string => !!group))].map(group => ({
    group,
    versions: learnerSections.filter(section => section.versionGroup === group),
  }));
  const visibleLearnerSections = learnerSections.filter(section => !section.versionGroup || section.id === (chosenVersions[section.versionGroup] ?? (selectedLearner?.versionGroup === section.versionGroup ? selectedLearner.id : versionGroups.find(item => item.group === section.versionGroup)?.versions[0]?.id)));
  const navSections = visibleLearnerSections;
  const currentSection = navSections.find(section => section.id === previewSectionId) ?? navSections[0];
  const pageIndex = currentSection ? navSections.indexOf(currentSection) : -1;
  const visibleIds = visibleLearnerSections.map(section => section.id).join(',');
  useEffect(() => {
    if (!visibleIds) { setA4Busy(false); setA4Error(''); setA4Bytes(null); return; }
    let cancelled = false;
    setA4Busy(true);
    const timer = window.setTimeout(() => {
      const activity = publishedResourceToActivity({ ...draft, edition: draft.revision, publishedAt: Date.now(), publishedBy: '' } as HubResourceEdition);
      const makePdf = makeResourceLessonPdf;
      void makePdf({ activity, collection, learnerIds: visibleIds.split(','), teacherIds: [], copies: 1, paper: 'a4', colour: 'colour' })
        .then(bytes => { if (!cancelled) { setA4Bytes(bytes); setA4Error(''); } })
        .catch(() => { if (!cancelled) { setA4Bytes(null); setA4Error('The A4 preview could not be made. Try Preview print PDF.'); } })
        .finally(() => { if (!cancelled) setA4Busy(false); });
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [visibleIds, draft, collection?.accent, collection?.paperAccent, collection?.headerImage]);
  // Keep the authored activity locally, then project only the selected learner
  // seat in LocalActivity. The published Class path seals private cards.
  const learnerDocuments = useMemo(() => new Map(learnerSections.map(section => [section.id, splitKey(section.content, true).content])), [learnerSections]);
  const onAnswer = (id: string, value: Response) => setResponses(current => ({ ...current, [id]: value }));
  const goToPdfPage = (number: number) => {
    const scroll = pageScroll.current;
    const target = scroll?.querySelector<HTMLCanvasElement>(`[data-page="${number}"]`);
    if (scroll && target) scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top, behavior: 'smooth' });
    setPdfPage(number);
  };
  const trackPdfPage = () => {
    const scroll = pageScroll.current;
    if (!scroll) return;
    const top = scroll.getBoundingClientRect().top;
    const pages = [...scroll.querySelectorAll<HTMLCanvasElement>('[data-page]')];
    const active = pages.filter(page => page.getBoundingClientRect().top <= top + 40).at(-1) ?? pages[0];
    if (active) setPdfPage(Number(active.dataset.page));
  };

  const preview = <section id="resource-live-preview" className={`rhe-live-preview rhe-class-preview${expanded ? ' is-expanded' : ''}`} aria-label="Live activity preview">
    <div className="rhe-preview-head"><div><strong>Live preview</strong><span>Updates as you edit</span></div><div className="rhe-preview-controls"><div className="rhe-preview-switch" role="tablist" aria-label="Preview view"><button type="button" role="tab" aria-selected={view === 'page'} className={view === 'page' ? 'on' : ''} onClick={() => setView('page')}>Page</button><button type="button" role="tab" aria-selected={view === 'learner'} className={view === 'learner' ? 'on' : ''} onClick={() => setView('learner')}>Learner</button></div>{expanded ? <button ref={closeButton} type="button" className="rhe-preview-expand" onClick={() => setExpanded(false)} aria-label="Close large preview">Close preview <span aria-hidden="true">×</span></button> : <button ref={expandButton} type="button" className="rhe-preview-expand" onClick={() => setExpanded(true)}>Expand ↗</button>}</div>{!expanded && <button type="button" className="rhe-preview-back" onClick={() => document.getElementById('resource-editor-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Back to editor ↑</button>}</div>
    {versionGroups.map(({ group, versions }) => <div className="rhe-preview-versions" key={group}><span>View as</span>{versions.map(section => <button type="button" key={section.id} className={visibleLearnerSections.includes(section) ? 'on' : ''} aria-pressed={visibleLearnerSections.includes(section)} onClick={() => { setChosenVersions(current => ({ ...current, [group]: section.id })); setPreviewSectionId(section.id); }}>{section.versionLabel || section.title}</button>)}</div>)}
    {view === 'learner' && navSections.length > 1 && <div className="rhe-preview-task-nav" role="group" aria-label="Preview task navigation"><span>Task {pageIndex + 1} of {navSections.length}</span><div><button type="button" aria-label="Previous preview task" disabled={pageIndex <= 0} onClick={() => setPreviewSectionId(navSections[pageIndex - 1].id)}>←</button><button type="button" aria-label="Next preview task" disabled={pageIndex >= navSections.length - 1} onClick={() => setPreviewSectionId(navSections[pageIndex + 1].id)}>→</button></div></div>}
    {view === 'page' && pdfPages > 0 && <div className="rhe-a4-tools" role="group" aria-label="A4 preview controls"><button type="button" disabled={pdfPage <= 1} onClick={() => goToPdfPage(pdfPage - 1)} aria-label="Previous PDF page">←</button><span>Page {pdfPage} of {pdfPages}</span><button type="button" disabled={pdfPage >= pdfPages} onClick={() => goToPdfPage(pdfPage + 1)} aria-label="Next PDF page">→</button><button type="button" disabled={pdfZoom <= .6} onClick={() => setPdfZoom(value => Math.max(.6, Math.round((value - .1) * 10) / 10))} aria-label="Zoom out PDF">−</button><span>{Math.round(pdfZoom * 100)}%</span><button type="button" disabled={pdfZoom >= 2} onClick={() => setPdfZoom(value => Math.min(2, Math.round((value + .1) * 10) / 10))} aria-label="Zoom in PDF">+</button></div>}
    <div ref={pageScroll} className="rhe-preview-scroll" role="tabpanel" aria-label="Page preview" hidden={view !== 'page'} onScroll={trackPdfPage}>
      {visibleLearnerSections.length ? <><div className="rhe-a4-status" role="status">{a4Busy ? 'Updating the A4 worksheet…' : a4Bytes ? 'Complete worksheet · A4' : 'Preparing A4 pages…'}</div>{a4Error && <p className="rhe-preview-empty" role="alert">{a4Error}</p>}{a4Bytes && <A4Pages bytes={a4Bytes} zoom={pdfZoom} onPages={setPdfPages} />}</> : <p className="rhe-preview-empty">Add a learner task to see the A4 worksheet.</p>}
    </div>
    <div className="rhe-preview-scroll" role="tabpanel" aria-label="Learner view" hidden={view !== 'learner'}>
      {currentSection ? [currentSection].map(section => {
        // The learner view excludes teacher sections and splits the answer key before rendering.
        const safeContent = learnerDocuments.get(section.id) ?? splitKey(section.content, true).content;
        const safeInstruction = section.instrDoc ? splitKey(section.instrDoc).content : null;
        const versionPosition = section.versionGroup ? Math.max(0, versionGroups.find(group => group.group === section.versionGroup)?.versions.findIndex(version => version.id === section.id) ?? 0) : 0;
        const content: JSONContent = safeContent;
        return <article className="rhe-preview-task rhe-preview-learner" key={`learner-${section.id}`}><div className="rhe-preview-task-top"><span>{draft.title || 'Untitled activity'}</span><span>LEARNER VIEW</span></div><header className="rhe-preview-task-head"><div className="rhe-preview-task-heading">{section.identity && <IdentityMark identity={section.identity} />}{section.versionLabel && <small className="rhe-preview-version-name">{section.versionLabel}</small>}<h4>{section.title || 'Untitled section'}</h4></div><InstrView doc={safeInstruction} text={section.instructions} /></header><div className="rhe-preview-task-body"><LocalLearnerPreviewMode.Provider value={versionPosition}><LocalActivityMode.Provider value={true}><TaskRenderer content={content} responses={responses} onChange={onAnswer} classId="" hideAnswers /></LocalActivityMode.Provider></LocalLearnerPreviewMode.Provider></div></article>;
      }) : <p className="rhe-preview-empty">Add a learner task to see the learner view.</p>}
    </div>
    <p className="rhe-preview-note">{view === 'page' ? 'This is the complete A4 PDF layout. Choose Preview print PDF to download or inspect the file.' : 'Try the questions here. Your preview answers are not saved.'}</p>
  </section>;
  return expanded ? createPortal(<div className="rhe-preview-overlay" role="dialog" aria-modal="true" aria-label="Large activity preview">{preview}</div>, document.body) : preview;
}

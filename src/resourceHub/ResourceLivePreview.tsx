import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JSONContent } from '@tiptap/react';
import { TaskRenderer } from '../components/TaskRenderer';
import { InstrView } from '../editor/InstrEditor';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey, type Response, type Responses } from '../lib/questions';
import type { HubResourceDraft } from './hubEditorData';
import './resource-live-preview.css';

type View = 'page' | 'learner';

const withPaperInstructions = (node: JSONContent): JSONContent => ({
  ...node,
  ...(node.type === 'subTask' ? { attrs: { ...node.attrs, instr: node.attrs?.paperInstr?.trim() || node.attrs?.instr || '' } } : {}),
  ...(node.content ? { content: node.content.map(withPaperInstructions) } : {}),
});

/** Uses the unsaved draft, so editing a question immediately changes both previews. */
export function ResourceLivePreview({ draft, activeSectionId }: { draft: HubResourceDraft; activeSectionId: string }) {
  const [view, setView] = useState<View>('page');
  const [responses, setResponses] = useState<Responses>({});
  const [chosenVersions, setChosenVersions] = useState<Record<string, string>>({});
  const [previewSectionId, setPreviewSectionId] = useState(activeSectionId);
  const [expanded, setExpanded] = useState(false);
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
  const pages = view === 'page' ? visibleLearnerSections : currentSection ? [currentSection] : [];
  // This is an editor-only local preview. Keep communicative cards intact so
  // LocalActivity can render and play the authored board, bingo or story.
  // The published Class path still seals private cards in splitKey's default mode.
  const learnerDocuments = useMemo(() => new Map(learnerSections.map(section => [section.id, splitKey(section.content, true).content])), [learnerSections]);
  const onAnswer = (id: string, value: Response) => setResponses(current => ({ ...current, [id]: value }));

  const preview = <section id="resource-live-preview" className={`rhe-live-preview rhe-class-preview${expanded ? ' is-expanded' : ''}`} aria-label="Live activity preview">
    <div className="rhe-preview-head"><div><strong>Live preview</strong><span>Updates as you edit</span></div><div className="rhe-preview-controls"><div className="rhe-preview-switch" role="tablist" aria-label="Preview view"><button type="button" role="tab" aria-selected={view === 'page'} className={view === 'page' ? 'on' : ''} onClick={() => setView('page')}>Page</button><button type="button" role="tab" aria-selected={view === 'learner'} className={view === 'learner' ? 'on' : ''} onClick={() => setView('learner')}>Learner</button></div>{expanded ? <button ref={closeButton} type="button" className="rhe-preview-expand" onClick={() => setExpanded(false)} aria-label="Close large preview">Close preview <span aria-hidden="true">×</span></button> : <button ref={expandButton} type="button" className="rhe-preview-expand" onClick={() => setExpanded(true)}>Expand ↗</button>}</div>{!expanded && <button type="button" className="rhe-preview-back" onClick={() => document.getElementById('resource-editor-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Back to editor ↑</button>}</div>
    {versionGroups.map(({ group, versions }) => <div className="rhe-preview-versions" key={group}><span>View as</span>{versions.map(section => <button type="button" key={section.id} className={visibleLearnerSections.includes(section) ? 'on' : ''} aria-pressed={visibleLearnerSections.includes(section)} onClick={() => { setChosenVersions(current => ({ ...current, [group]: section.id })); setPreviewSectionId(section.id); }}>{section.versionLabel || section.title}</button>)}</div>)}
    {view === 'learner' && navSections.length > 1 && <div className="rhe-preview-task-nav" role="group" aria-label="Preview task navigation"><span>Task {pageIndex + 1} of {navSections.length}</span><div><button type="button" aria-label="Previous preview task" disabled={pageIndex <= 0} onClick={() => setPreviewSectionId(navSections[pageIndex - 1].id)}>←</button><button type="button" aria-label="Next preview task" disabled={pageIndex >= navSections.length - 1} onClick={() => setPreviewSectionId(navSections[pageIndex + 1].id)}>→</button></div></div>}
    <div className="rhe-preview-scroll" role="tabpanel" aria-label={view === 'page' ? 'Page preview' : 'Learner view'}>
      {pages.length ? pages.map(section => {
        // The learner view excludes teacher sections and splits the answer key before rendering.
        // Page preview also strips inline keys, like the printed learner page.
        const safeContent = learnerDocuments.get(section.id) ?? splitKey(section.content, true).content;
        const content: JSONContent = view === 'page' ? withPaperInstructions(safeContent) : safeContent;
        const paperOverride = !!section.printInstructions?.trim() || !!section.printInstrDoc;
        const instructions = view === 'page' && paperOverride ? section.printInstructions ?? '' : section.instructions;
        const instrDoc = view === 'page' && paperOverride ? section.printInstrDoc : section.instrDoc;
        return <article className={`rhe-preview-task ${view === 'page' ? 'rhe-preview-paper' : 'rhe-preview-learner'}`} key={`${view}-${section.id}`}><div className="rhe-preview-task-top"><span>{draft.title || 'Untitled activity'}</span><span>{view === 'page' ? 'PRINT PAGE' : 'LEARNER VIEW'}</span></div><header className="rhe-preview-task-head"><div className="rhe-preview-task-heading">{section.versionLabel && <small className="rhe-preview-version-name">{section.versionLabel}</small>}<h4>{section.title || 'Untitled section'}</h4></div><InstrView doc={instrDoc} text={instructions} /></header><div className="rhe-preview-task-body"><LocalActivityMode.Provider value={true}><TaskRenderer content={content} responses={responses} onChange={view === 'learner' ? onAnswer : undefined} disabled={view === 'page'} classId="" /></LocalActivityMode.Provider></div></article>;
      }) : <p className="rhe-preview-empty">Add a learner task to see the learner view.</p>}
    </div>
    <p className="rhe-preview-note">{view === 'page' ? 'The PDF button checks final pagination.' : 'Try the questions here. Your preview answers are not saved.'}</p>
  </section>;
  return expanded ? createPortal(<div className="rhe-preview-overlay" role="dialog" aria-modal="true" aria-label="Large activity preview">{preview}</div>, document.body) : preview;
}

import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Select } from '../components/Select';
import type { HubActivity, HubCollection } from './catalog';
import { collectionFor } from './catalog';
import { ResourceCopy } from './ResourceCopy';
import { ResourcePrint } from './ResourcePrint';
import { ResourceAdapt } from './ResourceAdapt';
import { useAiPilot } from '../ai/pilot';
import { RichContent } from './RichContent';
import type { JSONContent } from '@tiptap/react';
import './resourceDetail.css';

type Zoom = 'fit' | 'width' | '100';
type PreviewEntry = { id: string; title: string; audience: 'learner' | 'teacher'; image?: string; instructions?: string; content?: JSONContent; versionLabel?: string };
const paperContent = (node: JSONContent): JSONContent => ({ ...node,
  ...(node.type === 'subTask' ? { attrs: { ...node.attrs, instr: node.attrs?.paperInstr?.trim() || node.attrs?.instr || '' } } : {}),
  ...(node.content ? { content: node.content.map(paperContent) } : {}),
});

export function ResourceDetail({ activity, collection: collectionOverride, onBack, saved = false, onSaveChange, preferredClassId }: { activity: HubActivity; collection?: HubCollection; onBack: () => void; saved?: boolean; onSaveChange?: () => void; preferredClassId?: string }) {
  const previewPages: PreviewEntry[] = useMemo(() => activity.editorSections?.length ? activity.editorSections.map(section => ({ id: section.id, title: section.title, audience: section.audience, instructions: section.printInstructions?.trim() || section.instructions, content: section.content, versionLabel: section.versionLabel })) : activity.pages, [activity.editorSections, activity.pages]);
  const learnerIndices = useMemo(() => previewPages.flatMap((page, index) => page.audience === 'learner' ? [index] : []), [previewPages]);
  const firstLearnerIndex = learnerIndices[0] ?? 0;
  const [pageIndex, setPageIndex] = useState(firstLearnerIndex);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const changeZoom = (next: Zoom) => {
    if (next === zoom) return;
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => flushSync(() => setZoom(next)));
    } else setZoom(next);
  };
  const [dialog, setDialog] = useState<'print' | 'copy' | 'adapt' | null>(null);
  const aiEnabled = useAiPilot();
  const collection = collectionOverride ?? collectionFor(activity.collectionId);
  const previewCount = previewPages.length;
  const ready = activity.status === 'ready' && previewCount > 0;
  const page = previewPages[Math.min(pageIndex, previewPages.length - 1)];
  const selectedLearnerPosition = learnerIndices.indexOf(pageIndex);
  const teacherPagesBefore = previewPages.map((item, index) => ({ item, index })).filter(({ item, index }) => item.audience === 'teacher' && index < firstLearnerIndex);
  const learnerPages = previewPages.map((item, index) => ({ item, index })).filter(({ item }) => item.audience === 'learner');
  const teacherPagesAfter = previewPages.map((item, index) => ({ item, index })).filter(({ item, index }) => item.audience === 'teacher' && index > firstLearnerIndex);
  useEffect(() => { setPageIndex(firstLearnerIndex); setZoom('fit'); }, [activity.id, firstLearnerIndex]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (dialog || !ready || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight') setPageIndex(current => { const at = learnerIndices.indexOf(current); return at < 0 ? current : learnerIndices[Math.min(learnerIndices.length - 1, at + 1)]; });
      if (event.key === 'ArrowLeft') setPageIndex(current => { const at = learnerIndices.indexOf(current); return at < 0 ? current : learnerIndices[Math.max(0, at - 1)]; });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [learnerIndices, dialog, ready]);

  const pageChoice = ({ item, index }: { item: PreviewEntry; index: number }) => <button type="button" key={item.id} className={`rh-page-choice ${index === pageIndex ? 'selected' : ''} ${item.audience === 'teacher' ? 'teacher' : ''}`} onClick={() => setPageIndex(index)} aria-current={index === pageIndex ? 'page' : undefined}>
    {item.image ? <img src={item.image} alt="" /> : <span className="rh-section-icon" aria-hidden="true">≡</span>}<span><b>{item.title}</b><small>{item.versionLabel ? `${item.versionLabel} · ` : ''}Page {index + 1}</small></span>
  </button>;

  return <div className="rh-detail">
    <div className="rh-detail-breadcrumb"><button type="button" onClick={onBack}>← Back to {collection.title}</button><span aria-hidden="true">/</span><span>Activity {Number(activity.number)}</span></div>
    <header className="rh-detail-header">
      <div className="rh-detail-heading"><span className="rh-eyebrow">{collection.title} · Activity {Number(activity.number)}</span><h1>{activity.title}</h1>{activity.id !== 'otp-002' && <p>{activity.summary}</p>}<div className="rh-detail-pills"><span>{activity.level}</span><span>{activity.focus}</span><span>{activity.interaction}</span></div></div>
      <div className="rh-detail-header-actions"><span className="rh-ready-pill">{ready ? 'Ready to use' : 'Activity outline'}</span></div>
    </header>
    {!ready ? <section className="rh-outline-panel"><div className="rh-outline-icon" aria-hidden="true">✦</div><h2>Pages are being prepared</h2><p>This activity outline is available to explore. Printable pages and editable Class tasks will appear when the complete resource is ready.</p><button type="button" className="rh-secondary" onClick={onBack}>Explore activities</button></section> : <div className="rh-detail-grid">
      <aside className="rh-detail-pages" aria-label="Activity pages"><div className="rh-side-heading"><span>In this activity</span><small>{previewCount} pages</small></div>
        {teacherPagesBefore.length > 0 && <div className="rh-page-group"><h2>Guide</h2>{teacherPagesBefore.map(pageChoice)}</div>}
        <div className="rh-page-group"><h2>Learner sheets</h2>{learnerPages.map(pageChoice)}</div>
        {teacherPagesAfter.length > 0 && <div className="rh-page-group"><h2>Answer key</h2>{teacherPagesAfter.map(pageChoice)}</div>}
      </aside>
      <section className="rh-preview" aria-label="Activity preview"><div className="rh-preview-toolbar"><span><strong>{page.audience === 'teacher' ? `Page ${pageIndex + 1} of ${previewCount}` : `Learner page ${selectedLearnerPosition + 1} of ${learnerIndices.length}`}</strong><small>{page?.title}</small></span><div><Select value={zoom} options={[{ v: 'fit', label: 'Fit page' }, { v: 'width', label: 'Fit width' }, { v: '100', label: '100%' }]} onChange={changeZoom} label="Preview zoom" />{page.audience === 'teacher' ? <button type="button" className="rh-return-learners" onClick={() => setPageIndex(firstLearnerIndex)}>Show learner sheet</button> : <><button type="button" className="rh-icon-button" aria-label="Previous learner page" disabled={selectedLearnerPosition <= 0} onClick={() => setPageIndex(learnerIndices[selectedLearnerPosition - 1])}>←</button><button type="button" className="rh-icon-button" aria-label="Next learner page" disabled={selectedLearnerPosition >= learnerIndices.length - 1} onClick={() => setPageIndex(learnerIndices[selectedLearnerPosition + 1])}>→</button></>}</div></div>
        <div className={`rh-preview-stage zoom-${zoom}`}>
          {page.image ? <img src={page.image} alt={`${page.title}, page ${pageIndex + 1} of ${previewCount}`} /> : page.content ? <article className="rh-rich-sheet"><header><span>{activity.title}{page.versionLabel ? ` · ${page.versionLabel}` : ''}</span><h2>{page.title}</h2>{page.instructions && <p>{page.instructions}</p>}</header><RichContent content={paperContent(page.content)} /></article> : null}
        </div>
      </section>
      <aside className="rh-detail-aside"><div className="rh-detail-actions"><h2>Use this activity</h2><button type="button" className="rh-primary" onClick={() => setDialog('print')}>Print activity pages <span aria-hidden="true">↗</span></button><button type="button" className="rh-secondary" onClick={() => setDialog('copy')}>Copy editable tasks to a Class</button>{aiEnabled && activity.id === 'otp-002' && <button type="button" className="rh-secondary" onClick={() => setDialog('adapt')}>✦ Adapt with AI</button>}{onSaveChange && <button type="button" className="rh-secondary rh-detail-save" aria-pressed={saved} onClick={onSaveChange}>{saved ? '✓ Saved' : '♡ Save'}</button>}<p>Class copies include learner pages only.</p></div>
        <div className="rh-detail-card"><span className="rh-eyebrow">At a glance</span><dl><div><dt>Time</dt><dd>{activity.minutes} minutes</dd></div><div><dt>Level</dt><dd>{activity.level}</dd></div><div><dt>Interaction</dt><dd>{activity.interaction}</dd></div><div><dt>Preparation</dt><dd>{activity.prep}</dd></div><div><dt>Works for</dt><dd>{activity.mode}</dd></div></dl><div className="rh-detail-energy"><span>Energy</span><span role="img" aria-label={`${activity.energy} out of 3`}>{[1, 2, 3].map(value => <i key={value} className={value <= activity.energy ? 'on' : ''} />)}</span></div></div>
      </aside>
    </div>}
    {dialog === 'print' && <ResourcePrint activity={activity} collection={collection} onClose={() => setDialog(null)} />}
    {dialog === 'copy' && <ResourceCopy activity={activity} preferredClassId={preferredClassId} onClose={() => setDialog(null)} />}
    {dialog === 'adapt' && <ResourceAdapt activity={activity} preferredClassId={preferredClassId} onClose={() => setDialog(null)} />}
  </div>;
}

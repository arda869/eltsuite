import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { TaskRenderer } from '../components/TaskRenderer';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey, type Response, type Responses } from '../lib/questions';
import { withGeneratedAnswerKey } from './hubAnswerKey';
import type { HubResourceDraft } from './hubEditorData';

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
  const previewSections = useMemo(() => withGeneratedAnswerKey(draft.sections), [draft.sections]);
  const selected = previewSections.find(section => section.id === activeSectionId) ?? previewSections[0];
  const learnerSections = draft.sections.filter(section => section.audience === 'learner');
  const versionGroups = [...new Set(learnerSections.map(section => section.versionGroup).filter((group): group is string => !!group))].map(group => ({
    group,
    versions: learnerSections.filter(section => section.versionGroup === group),
  }));
  const pages = view === 'page' ? selected ? [selected] : [] : learnerSections.filter(section => !section.versionGroup || section.id === (chosenVersions[section.versionGroup] ?? (selected?.versionGroup === section.versionGroup ? selected.id : versionGroups.find(item => item.group === section.versionGroup)?.versions[0]?.id)));
  const learnerDocuments = useMemo(() => new Map(learnerSections.map(section => [section.id, splitKey(section.content).content])), [learnerSections]);
  const onAnswer = (id: string, value: Response) => setResponses(current => ({ ...current, [id]: value }));

  return <section id="resource-live-preview" className="rhe-live-preview" aria-label="Live activity preview">
    <div className="rhe-preview-head"><div><strong>Live preview</strong><span>Updates as you edit</span></div><div className="rhe-preview-switch" role="tablist" aria-label="Preview view"><button type="button" role="tab" aria-selected={view === 'page'} className={view === 'page' ? 'on' : ''} onClick={() => setView('page')}>Page</button><button type="button" role="tab" aria-selected={view === 'learner'} className={view === 'learner' ? 'on' : ''} onClick={() => setView('learner')}>Learner</button></div><button type="button" className="rhe-preview-back" onClick={() => document.getElementById('resource-editor-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Back to editor ↑</button></div>
    {view === 'learner' && versionGroups.map(({ group, versions }) => <div className="rhe-preview-versions" key={group}><span>View as</span>{versions.map(section => <button type="button" key={section.id} className={pages.includes(section) ? 'on' : ''} aria-pressed={pages.includes(section)} onClick={() => setChosenVersions(current => ({ ...current, [group]: section.id }))}>{section.versionLabel || section.title}</button>)}</div>)}
    <div className="rhe-preview-scroll" role="tabpanel" aria-label={view === 'page' ? 'Page preview' : 'Learner view'}>
      {pages.length ? pages.map(section => {
        // The learner view excludes teacher sections and splits the answer key before rendering.
        // Page preview also strips inline keys, like the printed learner page.
        const safeContent = learnerDocuments.get(section.id) ?? splitKey(section.content).content;
        const content: JSONContent = view === 'page' ? withPaperInstructions(safeContent) : safeContent;
        const instructions = view === 'page' ? section.printInstructions?.trim() || section.instructions : section.instructions;
        return <article className={view === 'page' ? 'rhe-preview-paper' : 'rhe-preview-learner'} key={`${view}-${section.id}`}><header><span>{draft.title || 'Untitled activity'}</span>{section.versionLabel && <small className="rhe-preview-version-name">{section.versionLabel}</small>}<h4>{section.title || 'Untitled section'}</h4>{instructions && <p>{instructions}</p>}</header><LocalActivityMode.Provider value={true}><TaskRenderer content={content} responses={responses} onChange={view === 'learner' ? onAnswer : undefined} disabled={view === 'page'} classId="" /></LocalActivityMode.Provider></article>;
      }) : <p className="rhe-preview-empty">Add a learner task to see the learner view.</p>}
    </div>
    <p className="rhe-preview-note">{view === 'page' ? 'Select a section on the left to preview its page. The PDF button checks final pagination.' : 'Only learner sections appear here. Answers and teacher guidance are hidden.'}</p>
  </section>;
}

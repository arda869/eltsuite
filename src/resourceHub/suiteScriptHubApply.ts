import type { JSONContent } from '@tiptap/react';
import { freshIds } from '../lib/clip';
import { resolveSuiteScriptContent } from '../lib/suiteScriptResolve';
import type { SuiteScriptBundle, SuiteScriptTaskDraft } from '../lib/suiteScriptBundle';
import { suiteScriptCopyNodes } from '../lib/suiteScriptCopy';
import { getResourceDraft, saveResourceDraft, type HubEditorSection, type HubResourceDraft } from './hubEditorData';

const docOf = (content: JSONContent[]): JSONContent => ({ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] });
const textOf = (node: JSONContent): string => node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(textOf).join(node.type === 'paragraph' ? '' : ' ');
const newId = (): string => crypto.randomUUID();

// A structural import is deliberately separate from rich-text field paste.
// This mapper never accepts or assigns a learner-version label or group.
export function suiteScriptHubSections(task: SuiteScriptTaskDraft, id = newId()): HubEditorSection[] {
  if (task.kind !== 'task') throw new Error('Resource Hub has no section-heading type. Use a learner task or apply this draft to a Class lesson.');
  const content = docOf(task.content.map(freshIds));
  const instrDoc = docOf(task.instructions.map(freshIds));
  const printInstrDoc = docOf(task.paperInstructions.map(freshIds));
  const learner: HubEditorSection = {
    id, title: task.title, audience: 'learner', kind: 'task',
    instructions: textOf(instrDoc), instrDoc,
    printInstructions: textOf(printInstrDoc), printInstrDoc,
    ...(task.identity ? { identity: task.identity } : {}),
    suiteScriptTaskMeta: Object.fromEntries((['layout', 'afterCheck', 'showScore', 'hidden', 'locked', 'colScroll', 'paper', 'anchor'] as const).filter(key => task[key] !== undefined).map(key => [key, task[key]])),
    content,
  };
  if (!task.teacherNotes.length) return [learner];
  const notes: HubEditorSection = {
    id: `${id}-notes`, title: `${task.title} · Teacher notes`, audience: 'teacher', kind: 'notes',
    instructions: '', content: docOf(task.teacherNotes.map(freshIds)),
  };
  return [learner, notes];
}

export function applySuiteScriptBundleToHubDraft(draft: HubResourceDraft, bundle: SuiteScriptBundle, selectedSectionId?: string): HubResourceDraft {
  if (bundle.kind === 'activity') {
    if (selectedSectionId) throw new Error('Open the whole resource to replace an activity. A selected task accepts only @task.');
    if (bundle.activity.tasks.length > 40) throw new Error('A Resource Hub activity can contain at most 40 sections.');
    const sections = bundle.activity.tasks.flatMap(task => suiteScriptHubSections(task));
    if (sections.length > 40) throw new Error('The activity has too many learner and teacher sections for Resource Hub.');
    return { ...draft, title: bundle.activity.title, level: bundle.activity.level ?? draft.level, aim: bundle.activity.aim ?? draft.aim, summary: bundle.activity.summary ?? draft.summary,
      focus: bundle.activity.focus ?? bundle.activity.aim ?? draft.focus, minutes: bundle.activity.minutes ?? draft.minutes, sections };
  }
  if (!selectedSectionId) throw new Error('Select one learner task to apply @task.');
  const index = draft.sections.findIndex(section => section.id === selectedSectionId);
  const original = draft.sections[index];
  if (!original || original.audience !== 'learner' || original.kind !== 'task') throw new Error('Select an existing learner task.');
  const next = suiteScriptHubSections(bundle.task, selectedSectionId);
  const learner = { ...next[0], identity: original.identity, versionGroup: original.versionGroup, versionLabel: original.versionLabel };
  const notesId = `${selectedSectionId}-notes`;
  const withoutOwnedNotes = draft.sections.filter(section => section.id !== notesId);
  const at = withoutOwnedNotes.findIndex(section => section.id === selectedSectionId);
  const sections = [...withoutOwnedNotes.slice(0, at), learner, ...next.slice(1), ...withoutOwnedNotes.slice(at + 1)];
  if (sections.length > 40) throw new Error('Resource Hub allows at most 40 sections.');
  return { ...draft, sections };
}

// Resolve references before the revision-checked, atomic draft save. A stale
// draft is rejected by saveResourceDraft; the caller keeps its SuiteScript text.
export async function saveSuiteScriptBundleToHubDraft(draft: HubResourceDraft, expectedRevision: number, bundle: SuiteScriptBundle, selectedSectionId?: string): Promise<HubResourceDraft> {
  const tasks = bundle.kind === 'activity' ? bundle.activity.tasks : [bundle.task];
  const resolved: SuiteScriptTaskDraft[] = [];
  for (const [index, task] of tasks.entries()) {
    const result = await Promise.all((['instructions', 'content', 'teacherNotes', 'paperInstructions'] as const).map(key => resolveSuiteScriptContent(task[key], { mode: 'resourceHub' })));
    for (const [section, value] of result.entries()) if (value.warnings.length) throw new Error(`Task ${index + 1}, ${['instructions', 'content', 'teacherNotes', 'paperInstructions'][section]}: ${value.warnings.join(' ')}`);
    resolved.push({ ...task, instructions: result[0].content, content: result[1].content, teacherNotes: result[2].content, paperInstructions: result[3].content });
  }
  const safeBundle: SuiteScriptBundle = bundle.kind === 'activity' ? { kind: 'activity', activity: { ...bundle.activity, tasks: resolved } } : { kind: 'task', task: resolved[0] };
  return saveResourceDraft(applySuiteScriptBundleToHubDraft(draft, safeBundle, selectedSectionId), expectedRevision);
}

export function hubSectionToSuiteScriptTask(section: HubEditorSection, sections: HubEditorSection[]): SuiteScriptTaskDraft {
  if (section.audience !== 'learner' || section.kind !== 'task') throw new Error('Choose a learner task.');
  const notes = sections.find(item => item.id === `${section.id}-notes`);
  return {
    title: section.title, kind: 'task', ...section.suiteScriptTaskMeta, ...(section.identity ? { identity: section.identity } : {}),
    instructions: section.instrDoc?.type === 'doc' ? section.instrDoc.content ?? [] : section.instructions ? [{ type: 'paragraph', content: [{ type: 'text', text: section.instructions }] }] : [],
    content: section.content.content ?? [],
    teacherNotes: notes?.content.content ?? [],
    paperInstructions: section.printInstrDoc?.type === 'doc' ? section.printInstrDoc.content ?? [] : section.printInstructions ? [{ type: 'paragraph', content: [{ type: 'text', text: section.printInstructions }] }] : [],
  };
}

export async function exportSuiteScriptHubDraft(resourceId: string, uid: string, selectedSectionId?: string): Promise<SuiteScriptBundle> {
  const draft = await getResourceDraft(resourceId);
  if (!draft) throw new Error('This Resource Hub draft is unavailable.');
  const learners = draft.sections.filter(section => section.audience === 'learner' && section.kind === 'task');
  const chosen = selectedSectionId ? learners.filter(section => section.id === selectedSectionId) : learners;
  if (!chosen.length) throw new Error('Choose a learner task.');
  const groups = new Set<string>();
  for (const section of chosen) {
    if (section.versionGroup && groups.has(section.versionGroup)) throw new Error('Export each learner version separately. Choose one version from each set.');
    if (section.versionGroup) groups.add(section.versionGroup);
  }
  const tasks = await Promise.all(chosen.map(async section => {
    const raw = hubSectionToSuiteScriptTask(section, draft.sections);
    const [instructions, content, teacherNotes, paperInstructions] = await Promise.all(
      [raw.instructions, raw.content, raw.teacherNotes, raw.paperInstructions].map(nodes => suiteScriptCopyNodes(nodes, uid, '')));
    return { ...raw, instructions, content, teacherNotes, paperInstructions };
  }));
  if (selectedSectionId) return { kind: 'task', task: tasks[0] };
  return { kind: 'activity', activity: { title: draft.title, level: draft.level, aim: draft.aim, minutes: draft.minutes, summary: draft.summary, focus: draft.focus, tasks } };
}

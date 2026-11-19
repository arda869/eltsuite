import type { JSONContent } from '@tiptap/react';
import { splitKey } from '../lib/questions';
import type { HubEditorSection } from './hubEditorData';

const join = (values: unknown): string => Array.isArray(values) ? values.map(String).filter(Boolean).join(', ') : '';

function expectedAnswer(node: JSONContent): string | null {
  const a = node.attrs ?? {};
  const key = a.id ? splitKey({ type: 'doc', content: [node] }).key[String(a.id)] : null;
  if (!key) return null;
  if (key.kind === 'gap') return join(key.answers) || null;
  if (key.kind === 'mcq') return key.correct >= 0 ? String((a.options ?? [])[key.correct] ?? `Option ${key.correct + 1}`) : null;
  if (key.kind === 'multi') return key.correct.length ? key.correct.map(index => (a.options ?? [])[index] ?? `Option ${index + 1}`).join(', ') : null;
  if (key.kind === 'match') return (a.pairs ?? []).some((pair: { right: string }) => pair.right?.trim()) ? (a.pairs ?? []).map((pair: { left: string; right: string }) => `${pair.left} → ${pair.right}`).join('; ') : null;
  if (key.kind === 'drop') return key.answer || null;
  if (key.kind === 'order') return key.answer || null;
  if (key.kind === 'writing') return key.model.trim() || null;
  if (key.kind !== 'pack') return null;
  const data = a.data ?? {};
  switch (key.t) {
    case 'fix': return join(data.fixes) || null;
    case 'categorise': return (data.cats ?? []).map((category: { name: string; items: string[] }) => `${category.name}: ${join(category.items)}`).join('; ') || null;
    case 'transform': return join(data.answers) || null;
    case 'highlight': return String(data.text ?? '').match(/\{\{([^}]+)\}\}/g)?.map((part: string) => part.slice(2, -2)).join(', ') || null;
    case 'sentences': return join(data.items) || null;
    case 'label': return (data.points ?? []).map((point: { label: string }) => point.label).filter(Boolean).join(', ') || null;
    case 'odd': return (data.words ?? [])[data.odd] || null;
    case 'gapped': return join(data.removed) || null;
    case 'matching': return (data.statements ?? []).map((statement: { text: string; answer: number }) => `${statement.text} → ${(data.options ?? [])[statement.answer] ?? statement.answer + 1}`).join('; ') || null;
    case 'dictation': return data.sentence?.trim() || null;
    case 'pairs': return (data.items ?? []).map((item: { say: string }) => item.say).filter(Boolean).join(', ') || null;
    case 'crossword': case 'wordsearch': return (data.words ?? []).map((word: { word: string }) => word.word).filter(Boolean).join(', ') || null;
    default: return null;
  }
}

/** Answers are derived locally from the fields teachers fill in while authoring questions. */
export function generatedAnswerLines(sections: HubEditorSection[]): string[] {
  const lines: string[] = [];
  for (const section of sections.filter(item => item.audience === 'learner')) {
    const answers: string[] = [];
    const visit = (node: JSONContent) => {
      const answer = expectedAnswer(node);
      if (answer) answers.push(`${answers.length + 1}. ${answer}`);
      node.content?.forEach(visit);
    };
    visit(section.content);
    if (answers.length) lines.push(section.title, ...answers);
  }
  return lines;
}

export function generatedAnswerDocument(sections: HubEditorSection[]): JSONContent {
  return { type: 'doc', content: generatedAnswerLines(sections).map(line => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })) };
}

export function withGeneratedAnswerKey(sections: HubEditorSection[]): HubEditorSection[] {
  const lines = generatedAnswerLines(sections);
  const auto = (generatedAnswerDocument(sections).content ?? []).map(node => ({ ...node, attrs: { hubGeneratedAnswer: true } }));
  const existing = sections.find(section => section.audience === 'teacher' && section.kind === 'answer-key');
  if (!existing) return lines.length ? [...sections, { id: 'generated-answer-key', title: 'Answer key', audience: 'teacher', kind: 'answer-key', instructions: '', content: { type: 'doc', content: auto } }] : sections;
  return sections.map(section => section.id === existing.id ? { ...section, content: { type: 'doc', content: [...auto, ...(section.content.content ?? []).filter(node => node.attrs?.hubGeneratedAnswer !== true)] } } : section);
}

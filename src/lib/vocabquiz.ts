import type { JSONContent } from '@tiptap/react';
import { newId } from './tasks';
import type { EntryData } from './notebook';
import { createLessonFromImport } from './transfer';
import { updateItem } from './classes';

// Makes a practice item from chosen vocabulary entries: matching, gap fill from the example
// sentences, and multiple choice meanings with distractors from the other words.

type V = { word: string; meaning: string; example: string; pos?: string };
const P = (content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const T = (text: string): JSONContent => ({ type: 'text', text });
const shuffle = <X>(a: X[]) => [...a].sort(() => Math.random() - 0.5);

export function vocabTasks(entries: EntryData[]) {
  const vs: V[] = entries.filter((e) => e.word?.trim() && e.def?.meaning?.trim()).map((e) => ({ word: e.word!.trim(), meaning: e.def!.meaning!.trim(), example: (e.def?.example ?? '').trim(), pos: e.def?.pos }));
  const tasks: { title: string; instructions: string; content: JSONContent }[] = [];
  if (vs.length >= 2) {
    tasks.push({
      title: 'Match the words and meanings',
      instructions: 'Tap a word, then tap its meaning.',
      content: { type: 'doc', content: [{ type: 'match', attrs: { id: newId(), pairs: vs.slice(0, 12).map((v) => ({ left: v.word, right: v.meaning })), extras: [] } }, { type: 'paragraph' }] },
    });
  }
  const withEx = vs.filter((v) => v.example && new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(v.example));
  if (withEx.length) {
    const lines = withEx.slice(0, 12).map((v) => {
      const re = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i');
      const m = re.exec(v.example)!;
      const found = m[0];
      const before = v.example.slice(0, m.index);
      const after = v.example.slice(m.index + found.length);
      const parts: JSONContent[] = [];
      if (before) parts.push(T(before));
      parts.push({ type: 'gap', attrs: { id: newId(), answers: [found, ...(found.toLowerCase() !== v.word.toLowerCase() ? [v.word] : [])], caseSensitive: false } });
      if (after) parts.push(T(after));
      return P(parts);
    });
    tasks.push({
      title: 'Complete the sentences',
      instructions: `Use these words: ${shuffle(withEx.slice(0, 12).map((v) => v.word)).join(', ')}.`,
      content: { type: 'doc', content: lines },
    });
  }
  if (vs.length >= 4) {
    const qs = shuffle(vs).slice(0, 10).map((v) => {
      const others = shuffle(vs.filter((x) => x !== v)).slice(0, 3).map((x) => x.meaning);
      const options = shuffle([v.meaning, ...others]);
      return P([T(`${v.word} `), { type: 'choice', attrs: { id: newId(), options, correct: options.indexOf(v.meaning), multi: false, display: 'radio' } }]);
    });
    tasks.push({ title: 'Choose the meaning', instructions: 'Choose the right meaning for each word.', content: { type: 'doc', content: qs } });
  }
  return tasks;
}

export async function createVocabQuiz(classId: string, title: string, entries: EntryData[]) {
  const tasks = vocabTasks(entries);
  if (!tasks.length) throw new Error('Choose at least two words with meanings.');
  const id = await createLessonFromImport(classId, null, title, tasks.map((t, i) => ({ ...t, line: i, kind: 'task' })));
  await updateItem(classId, id, { type: 'practice', hidden: false, taskCount: tasks.length });
  return id;
}

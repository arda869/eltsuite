import type { ScriptLine } from '../lib/archive';
import type { JSONContent } from '@tiptap/react';

// A downloadable lesson is one readable file. If the same recording has mixed
// settings in that file, use the most private placement everywhere in it.
const rank: Record<string, number> = { none: 0, after: 1, button: 2, karaoke: 2 };
export function offlineMediaModes(tasks: { content?: JSONContent | null; instrDoc?: JSONContent | null }[], space: string): Map<string, string> {
  const modes = new Map<string, string>();
  const visit = (node?: JSONContent | null) => {
    if (!node) return;
    if ((node.type === 'media' || node.type === 'inlineMedia') && node.attrs?.media) {
      const key = `${String(node.attrs.space || space)}/${String(node.attrs.media)}`;
      const requested = String(node.attrs.scriptMode || (node.type === 'inlineMedia' ? 'none' : 'karaoke'));
      const mode = Object.hasOwn(rank, requested) ? requested : 'none';
      const previous = modes.get(key);
      if (previous === undefined || rank[mode] < rank[previous]) modes.set(key, mode);
    }
    node.content?.forEach(visit);
  };
  tasks.forEach(task => { visit(task.content); visit(task.instrDoc); });
  return modes;
}

// The offline file contains its full JSON payload. Hidden and After listening
// scripts therefore cannot be packaged in a learner-facing standalone HTML file.
export function offlineLearnerScript(mode: string, script: ScriptLine[]): ScriptLine[] {
  return mode === 'karaoke' || mode === 'button' ? script : [];
}

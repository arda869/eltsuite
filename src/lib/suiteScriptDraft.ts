import type { Editor, JSONContent } from '@tiptap/react';
import { Fragment, Slice } from '@tiptap/pm/model';
import { parseSuiteScript, toSuiteScript, type SuiteScriptTypes } from './suiteScript';
import type { SuiteScriptDestination } from './suiteScriptReferences';

export type SuiteScriptScope = 'selection' | 'field';
export type SuiteScriptDraft = {
  scope: SuiteScriptScope;
  source: string;
  preview: (source: string) => { document: JSONContent | null; errors: string[] };
  apply: (source: string) => { applied: boolean; errors: string[] };
  previewResolved: (source: string, destination: SuiteScriptDestination) => Promise<{ document: JSONContent | null; errors: string[]; warnings: string[] }>;
  applyResolved: (source: string, destination: SuiteScriptDestination) => Promise<{ applied: boolean; errors: string[]; warnings: string[] }>;
};

// A field-scoped session never receives an activity, task settings, answer key or
// another learner version. The selection and editor version are captured up front.
export function createSuiteScriptDraft(editor: Editor, labels: SuiteScriptTypes = {}, scope: SuiteScriptScope = editor.state.selection.empty ? 'field' : 'selection', resolve?: (content: JSONContent[], destination: SuiteScriptDestination) => Promise<{ content: JSONContent[]; warnings: string[] }>): SuiteScriptDraft {
  const originalDoc = editor.state.doc.toJSON();
  const baseline = JSON.stringify(originalDoc);
  const { from, to } = editor.state.selection;
  const oldSlice = editor.state.selection.content();
  const original = scope === 'field' ? (originalDoc.content ?? []) : (oldSlice.content.toJSON() as JSONContent[]);
  const source = toSuiteScript(original, labels);

  function validateContent(content: JSONContent[]) {
    try {
      const doc = editor.schema.nodeFromJSON({ type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] });
      doc.check();
      return { nodes: content.map(value => editor.schema.nodeFromJSON(value)), document: doc.toJSON() as JSONContent, errors: [] as string[] };
    } catch (error) {
      return { nodes: [], document: null, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
  function validate(text: string) {
    const parsed = parseSuiteScript(text, labels);
    if (parsed.errors.length) return { nodes: [], document: null, errors: parsed.errors };
    if (JSON.stringify(parsed.content).includes('"suiteRef"')) return { nodes: [], document: null, errors: ['This SuiteScript contains file references. Resolve them before applying.'] };
    return validateContent(parsed.content);
  }
  function applyNodes(nodes: ReturnType<typeof validateContent>) {
    if (JSON.stringify(editor.state.doc.toJSON()) !== baseline) return { applied: false, errors: ['The content changed while SuiteScript was open. Copy your draft, reopen SuiteScript, and try again.'] };
    if (nodes.errors.length) return { applied: false, errors: nodes.errors };
    try {
      const fragment = Fragment.fromArray(nodes.nodes);
      const tr = scope === 'field'
        ? editor.state.tr.replaceWith(0, editor.state.doc.content.size, fragment)
        : editor.state.tr.replaceRange(from, to, new Slice(fragment, oldSlice.openStart, oldSlice.openEnd));
      editor.view.dispatch(tr);
      return { applied: true, errors: [] };
    } catch (error) { return { applied: false, errors: [error instanceof Error ? error.message : String(error)] }; }
  }

  return {
    scope, source,
    preview(text) { const result = validate(text); return { document: result.document, errors: result.errors }; },
    apply(text) { return applyNodes(validate(text)); },
    async previewResolved(text, destination) {
      const parsed = parseSuiteScript(text, labels);
      if (parsed.errors.length) return { document: null, errors: parsed.errors, warnings: [] };
      if (!resolve) return { document: null, errors: ['Reference resolver is unavailable.'], warnings: [] };
      const result = await resolve(parsed.content, destination);
      const valid = validateContent(result.content);
      return { document: valid.document, errors: valid.errors, warnings: result.warnings };
    },
    async applyResolved(text, destination) {
      const parsed = parseSuiteScript(text, labels);
      if (parsed.errors.length) return { applied: false, errors: parsed.errors, warnings: [] };
      if (!resolve) return { applied: false, errors: ['Reference resolver is unavailable.'], warnings: [] };
      const result = await resolve(parsed.content, destination);
      return { ...applyNodes(validateContent(result.content)), warnings: result.warnings };
    },
  };
}

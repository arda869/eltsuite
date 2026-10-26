import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { MarkType, Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey } from 'y-prosemirror';

// Suggesting and commenting, as in Google Docs.
// Suggesting: what you type is marked as your suggestion, and what you delete is crossed out
// instead of removed, until someone accepts or rejects it.
// Commenting: the text cannot be changed; you can only add comments to a selection.

export type Author = { by: string; name: string; color: string };
export type CollabMode = 'edit' | 'suggest' | 'comment' | 'view';

const authorAttrs = { by: { default: '' }, name: { default: '' }, color: { default: '' } };

export const SuggestIns = Mark.create({
  name: 'suggestIns',
  inclusive: false,
  excludes: 'suggestDel',
  addAttributes: () => authorAttrs,
  parseHTML: () => [{ tag: 'ins[data-s]' }],
  renderHTML: ({ HTMLAttributes }) => ['ins', { 'data-s': '', class: 'sg-ins', title: `Suggested by ${HTMLAttributes.name}`, style: `--sg:${HTMLAttributes.color}` }, 0],
});
export const SuggestDel = Mark.create({
  name: 'suggestDel',
  inclusive: false,
  excludes: 'suggestIns',
  addAttributes: () => authorAttrs,
  parseHTML: () => [{ tag: 'del[data-s]' }],
  renderHTML: ({ HTMLAttributes }) => ['del', { 'data-s': '', class: 'sg-del', title: `${HTMLAttributes.name} suggests deleting this`, style: `--sg:${HTMLAttributes.color}` }, 0],
});
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-comment]', getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-comment') }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-comment': HTMLAttributes.id, class: 'cm-mark' }, 0],
});

const fromSync = (tr: Transaction) => !!tr.getMeta(ySyncPluginKey)?.isChangeOrigin;

// Cross out [from, to): your own suggestions there are simply removed.
function strike(tr: Transaction, from: number, to: number, a: Author, ins: MarkType, del: MarkType) {
  const own: [number, number][] = [];
  const others: [number, number][] = [];
  tr.doc.nodesBetween(from, to, (n: PMNode, pos: number) => {
    if (!n.isInline) return true;
    const a0 = Math.max(from, pos);
    const b0 = Math.min(to, pos + n.nodeSize);
    if (b0 <= a0) return false;
    const mine = n.marks.find((m) => m.type === ins && m.attrs.by === a.by);
    if (mine) own.push([a0, b0]);
    else if (!n.marks.some((m) => m.type === del)) others.push([a0, b0]);
    return false;
  });
  others.forEach(([x, y]) => tr.addMark(x, y, del.create(a)));
  [...own].reverse().forEach(([x, y]) => tr.delete(x, y));
}

export function suggestionsPlugin(get: () => { mode: CollabMode; author: Author }) {
  const key = new PluginKey('suggest');
  return new Plugin({
    key,
    filterTransaction: (tr) => {
      const { mode } = get();
      if (!tr.docChanged || fromSync(tr) || tr.getMeta('collab-ok')) return true;
      return mode === 'edit' || mode === 'suggest';
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { mode, author } = get();
        if (mode !== 'suggest') return false;
        const { ins, del } = types(view.state);
        const tr = view.state.tr;
        if (from < to) strike(tr, from, to, author, ins, del);
        const at = tr.mapping.map(to);
        tr.insertText(text, at);
        tr.removeMark(at, at + text.length, del);
        tr.addMark(at, at + text.length, ins.create(author));
        tr.setSelection(TextSelection.create(tr.doc, at + text.length));
        tr.setMeta('collab-ok', true);
        view.dispatch(tr);
        return true;
      },
      handleKeyDown(view, e) {
        const { mode, author } = get();
        if (mode !== 'suggest' || (e.key !== 'Backspace' && e.key !== 'Delete')) return false;
        const { ins, del } = types(view.state);
        const { from, to, empty, $from } = view.state.selection;
        const tr = view.state.tr;
        if (empty) {
          const back = e.key === 'Backspace';
          if (back ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size) return false; // joining lines stays a plain change
          const a = back ? from - 1 : from;
          strike(tr, a, a + 1, author, ins, del);
          const pos = back ? tr.mapping.map(a, -1) : tr.mapping.map(a + 1);
          tr.setSelection(TextSelection.create(tr.doc, pos));
        } else {
          strike(tr, from, to, author, ins, del);
          tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from, -1)));
        }
        tr.setMeta('collab-ok', true);
        view.dispatch(tr);
        return true;
      },
      handlePaste(view, _e, slice) {
        const { mode, author } = get();
        if (mode !== 'suggest') return false;
        const text = slice.content.textBetween(0, slice.content.size, '\n');
        if (!text) return true;
        const { ins, del } = types(view.state);
        const { from, to } = view.state.selection;
        const tr = view.state.tr;
        if (from < to) strike(tr, from, to, author, ins, del);
        const at = tr.mapping.map(to);
        tr.insertText(text, at);
        tr.addMark(at, at + text.length, ins.create(author));
        tr.setMeta('collab-ok', true);
        view.dispatch(tr);
        return true;
      },
      handleDrop: () => get().mode === 'suggest' || get().mode === 'comment',
    },
    // Typing that does not come through the keys above (phone keyboards): still marked.
    appendTransaction(trs, _old, state) {
      const { mode, author } = get();
      if (mode !== 'suggest') return null;
      const { ins } = types(state);
      const tr = state.tr;
      let changed = false;
      trs.forEach((t) => {
        if (!t.docChanged || fromSync(t) || t.getMeta('collab-ok')) return;
        t.steps.forEach((step, i) => {
          step.getMap().forEach((_a, _b, nf, nt) => {
            if (nt <= nf) return;
            let from = nf;
            let to = nt;
            for (let k = i + 1; k < t.steps.length; k++) (from = t.steps[k].getMap().map(from)), (to = t.steps[k].getMap().map(to));
            tr.addMark(from, to, ins.create(author));
            changed = true;
          });
        });
      });
      return changed ? tr.setMeta('collab-ok', true) : null;
    },
  });
}

const types = (s: EditorState) => ({ ins: s.schema.marks.suggestIns, del: s.schema.marks.suggestDel, cm: s.schema.marks.comment });

export const Suggestions = Extension.create<{ get: () => { mode: CollabMode; author: Author } }>({
  name: 'suggestions',
  addOptions: () => ({ get: () => ({ mode: 'edit' as CollabMode, author: { by: '', name: '', color: '' } }) }),
  addProseMirrorPlugins() {
    return [suggestionsPlugin(this.options.get)];
  },
});

// ------------------------------------------------------------------ the list beside the text

export type Suggestion = { kind: 'ins' | 'del'; from: number; to: number; text: string } & Author;
export function listSuggestions(doc: PMNode): Suggestion[] {
  const out: Suggestion[] = [];
  doc.descendants((n, pos) => {
    if (!n.isInline) return true;
    for (const m of n.marks) {
      if (m.type.name !== 'suggestIns' && m.type.name !== 'suggestDel') continue;
      const kind = m.type.name === 'suggestIns' ? 'ins' : 'del';
      const last = out[out.length - 1];
      const text = n.isText ? n.text ?? '' : '•';
      if (last && last.kind === kind && last.by === m.attrs.by && last.to === pos) (last.to = pos + n.nodeSize), (last.text += text);
      else out.push({ kind, from: pos, to: pos + n.nodeSize, text, by: m.attrs.by, name: m.attrs.name, color: m.attrs.color });
    }
    return false;
  });
  return out;
}

export function resolveSuggestion(state: EditorState, s: Pick<Suggestion, 'kind' | 'from' | 'to'>, accept: boolean): Transaction {
  const { ins, del } = types(state);
  const tr = state.tr;
  const keep = (s.kind === 'ins') === accept;
  if (keep) tr.removeMark(s.from, s.to, s.kind === 'ins' ? ins : del);
  else tr.delete(s.from, s.to);
  return tr.setMeta('collab-ok', true);
}

export function resolveAll(state: EditorState, accept: boolean): Transaction {
  const list = listSuggestions(state.doc);
  const { ins, del } = types(state);
  const tr = state.tr;
  [...list].reverse().forEach((s) => {
    const keep = (s.kind === 'ins') === accept;
    if (keep) tr.removeMark(s.from, s.to, s.kind === 'ins' ? ins : del);
    else tr.delete(s.from, s.to);
  });
  return tr.setMeta('collab-ok', true);
}

// Where each comment is in the text, in reading order.
export function commentSpots(doc: PMNode): { id: string; from: number; to: number; text: string }[] {
  const out = new Map<string, { id: string; from: number; to: number; text: string }>();
  doc.descendants((n, pos) => {
    if (!n.isInline) return true;
    n.marks.forEach((m) => {
      if (m.type.name !== 'comment') return;
      const c = out.get(m.attrs.id);
      if (c) (c.to = pos + n.nodeSize), (c.text += n.text ?? '');
      else out.set(m.attrs.id, { id: m.attrs.id, from: pos, to: pos + n.nodeSize, text: n.text ?? '' });
    });
    return false;
  });
  return [...out.values()];
}

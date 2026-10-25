import { Extension, type Node } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { newId } from '../lib/tasks';

// Questions keep all their settings (answers, options, hints…) when copied and pasted:
// the attributes travel as one JSON blob instead of plain HTML attributes.
export function jsonClip<T extends Node>(ext: T, tag: 'span' | 'div', marker: string) {
  return ext.extend({
    addAttributes() {
      const parent = (this.parent?.() ?? {}) as Record<string, object>;
      return Object.fromEntries(Object.entries(parent).map(([k, v]) => [k, { ...v, parseHTML: () => null, renderHTML: () => ({}) }]));
    },
    parseHTML() {
      return [
        {
          tag: `${tag}[${marker}]`,
          getAttrs: (el: HTMLElement | string) => {
            if (typeof el === 'string') return {};
            try {
              return JSON.parse(el.getAttribute('data-attrs') || '{}');
            } catch {
              return {};
            }
          },
        },
      ];
    },
    renderHTML({ node }: { node: PMNode }) {
      return [tag, { [marker]: '', 'data-attrs': JSON.stringify(node.attrs) }];
    },
  }) as unknown as T;
}

// A pasted question gets a new id, so the copy is a separate question with its own answers.
// Moving a question by dragging keeps its id.
export const FreshIds = Extension.create({
  name: 'freshIds',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice, view) => {
            if (view.dragging?.move) return slice;
            const remap = (frag: Fragment): Fragment => {
              const out: PMNode[] = [];
              frag.forEach((n) => {
                let node = n.attrs?.id ? n.type.create({ ...n.attrs, id: newId() }, n.content, n.marks) : n;
                if (node.content.size) node = node.copy(remap(node.content));
                out.push(node);
              });
              return Fragment.fromArray(out);
            };
            return new Slice(remap(slice.content), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});

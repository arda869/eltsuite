import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Formatting marks, as in a word processor: a dot for each space and ¶ at the end of each
// paragraph. Only on this screen; nobody else sees them.
export const marksKey = new PluginKey<boolean>('showMarks');
export const ShowMarks = Extension.create({
  name: 'showMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: marksKey,
        state: {
          init: () => false,
          apply: (tr, on) => (tr.getMeta(marksKey) ?? on) as boolean,
        },
        props: {
          decorations(state) {
            if (!marksKey.getState(state)) return null;
            const out: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.isText) {
                const t = node.text ?? '';
                for (let i = 0; i < t.length; i++) if (t[i] === ' ' || t[i] === ' ') out.push(Decoration.inline(pos + i, pos + i + 1, { class: 'ws-sp' }));
                return false;
              }
              if (node.isTextblock) out.push(Decoration.widget(pos + node.nodeSize - 1, () => Object.assign(document.createElement('span'), { className: 'ws-pil', textContent: '¶' }), { side: 1, ignoreSelection: true }));
              if (node.type.name === 'hardBreak') out.push(Decoration.widget(pos, () => Object.assign(document.createElement('span'), { className: 'ws-pil', textContent: '↵' }), { side: -1 }));
              return true;
            });
            return DecorationSet.create(state.doc, out);
          },
        },
      }),
    ];
  },
});

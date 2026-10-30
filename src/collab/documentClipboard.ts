import { DOMSerializer } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { cleanPastedHTML } from '../editor/pasteClean';
import { tell } from '../lib/ask';

export async function documentClipboard(editor: Editor, action: 'copy' | 'cut' | 'paste' | 'plain') {
  try {
    if (action === 'copy' || action === 'cut') {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const text = editor.state.doc.textBetween(from, to, '\n', ' ');
      const div = document.createElement('div');
      div.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content));
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([div.innerHTML], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(text);
      if (action === 'cut') editor.chain().focus().deleteSelection().run();
    } else {
      let html = '', text = '';
      if (action === 'paste' && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) html += await (await item.getType('text/html')).text();
          if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
        }
      } else text = await navigator.clipboard.readText();
      if (html) editor.chain().focus().insertContent(cleanPastedHTML(html)).run();
      else if (text) editor.chain().focus().insertContent(text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run();
    }
  } catch {
    await tell('Your browser could not access the clipboard. Use the keyboard shortcut for copy, cut or paste. Paste without formatting uses Ctrl+Shift+V (⌘⇧V on Mac).');
  }
}

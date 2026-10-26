import type { JSONContent } from '@tiptap/react';
import { newId } from './tasks';

// Copying task elements between messages and lessons. The clipboard carries the elements as
// JSON (with their answers) and where their pictures and sounds live, so a paste anywhere in
// Lesson Lit brings everything along.

export type Clip = { v: 1; space: string; content: JSONContent[] };
const ATTR = 'data-lessonlit';
const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (s: string) => decodeURIComponent(escape(atob(s)));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function clipHtml(clip: Clip, html = '', text = '') {
  return `<div ${ATTR}="${enc(JSON.stringify(clip))}"></div>${html || `<p>${esc(text)}</p>`}`;
}
export function readClip(html?: string | null): Clip | null {
  const m = html?.match(new RegExp(`${ATTR}="([^"]+)"`));
  if (!m) return null;
  try {
    const c = JSON.parse(dec(m[1])) as Clip;
    return c?.v === 1 && Array.isArray(c.content) ? c : null;
  } catch {
    return null;
  }
}
// A pasted question is a new question: new ids.
export function freshIds(n: JSONContent): JSONContent {
  const attrs = n.attrs && 'id' in n.attrs && n.attrs.id ? { ...n.attrs, id: newId() } : n.attrs;
  return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(freshIds) } : {}) };
}
// Copy outside an editor (a message): on the copy event, or from a button.
export function setClip(e: ClipboardEvent | React.ClipboardEvent, clip: Clip, text: string) {
  e.clipboardData?.setData('text/html', clipHtml(clip, '', text));
  e.clipboardData?.setData('text/plain', text);
  e.preventDefault();
}
export async function writeClip(clip: Clip, text: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([clipHtml(clip, '', text)], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    return true;
  } catch {
    // Older browsers: a copy event of our own.
    const on = (e: ClipboardEvent) => setClip(e, clip, text);
    document.addEventListener('copy', on, { once: true });
    const ok = document.execCommand('copy');
    document.removeEventListener('copy', on);
    return ok;
  }
}

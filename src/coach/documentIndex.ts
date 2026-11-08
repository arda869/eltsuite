import type { JSONContent } from '@tiptap/react';

// A small search card for every Collab document. The complete document remains in Yjs;
// Teacher’s Companion uses this card to choose which originals to open.
export function documentSearchCard(root: JSONContent) {
  const lines: string[] = [];
  const formLines: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === 'studioForm') {
      const attrs = node.attrs ?? {};
      formLines.push(String(attrs.title || attrs.kind || 'Form').slice(0, 120));
      const fields = attrs.fields && typeof attrs.fields === 'object' ? Object.values(attrs.fields) : [];
      for (const value of fields) if (typeof value === 'string') formLines.push(value.slice(0, 240));
      if (attrs.reference?.title) formLines.push(String(attrs.reference.title).slice(0, 160));
    } else if (typeof node.text === 'string') lines.push(node.text);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return { version: 1, preview: lines.join(' ').replace(/\s+/g, ' ').slice(0, 1800), forms: formLines.join(' · ').replace(/\s+/g, ' ').slice(0, 4200) };
}

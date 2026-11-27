import type { JSONContent } from '@tiptap/react';

// Native elements can store pictures and recordings inside attributes, not only
// as child nodes. Never let a raw class ID, signed URL or data URL slip through
// an @element/@question payload without a permission-checked reference.
const ASSET_FIELDS = new Set(['media', 'src', 'image', 'images', 'bw', 'audioId', 'videoId', 'pdfId', 'fileDoc', 'docKey', 'archiveId']);
const assetValue = (value: string, field: string) =>
  /^(?:media:|file:|activity:|blob:|data:|ELTSUITE-)/i.test(value)
  || (ASSET_FIELDS.has(field) && !!value.trim());

export function suiteScriptRawAssetPath(node: JSONContent, nestedOnly = false): string | null {
  const walk = (value: unknown, path: string, field: string, depth: number): string | null => {
    if (typeof value === 'string') return (!nestedOnly || depth > 1) && assetValue(value, field) ? path : null;
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const found = walk(value[i], `${path}[${i}]`, field, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'suiteRef') continue;
      const found = walk(child, path ? `${path}.${key}` : key, key, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(node.attrs ?? {}, 'attrs', '', 0)
    ?? walk(node.marks ?? [], 'marks', '', 2);
}

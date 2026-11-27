import type { JSONContent } from '@tiptap/react';

// Presentation settings may travel with a checked file reference. Storage
// locations, document keys, sharing IDs and class IDs never enter source text.
const FIELDS: Record<string, readonly string[]> = {
  media: ['title', 'scriptMode', 'plays', 'mute', 'size', 'notes'],
  inlineMedia: ['title', 'scriptMode', 'plays', 'mute', 'size', 'notes'],
  picture: ['alt', 'credit', 'size', 'mark', 'crop', 'ar', 'filter', 'cover', 'grid', 'coverBy', 'w', 'tags'],
  pdfBlock: ['pages', 'title', 'inLesson', 'first', 'units', 'rev'],
  collab: ['title', 'scope', 'groupSet', 'modes', 'display', 'download', 'start'],
};

export function suiteScriptSafeMeta(node: JSONContent): Record<string, unknown> {
  const allowed = FIELDS[node.type ?? ''] ?? [];
  const attrs = node.attrs ?? {};
  return Object.fromEntries(allowed.filter(key => attrs[key] !== undefined).map(key => [key, attrs[key]]));
}

export function suiteScriptValidMeta(type: string, value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('File presentation settings must be an object.');
  const allowed = new Set(FIELDS[type] ?? []);
  const extra = Object.keys(value).find(key => !allowed.has(key));
  if (extra) throw new Error(`Unknown ${type} presentation setting: ${extra}.`);
  return value as Record<string, unknown>;
}

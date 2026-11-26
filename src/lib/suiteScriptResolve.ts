import type { JSONContent } from '@tiptap/react';
import { carryMedia } from './fullcopy';
import { resolveSuiteScriptReference, type SuiteScriptDestination } from './suiteScriptReferences';

export type SuiteScriptResolution = { content: JSONContent[]; warnings: string[] };

const unavailable = (type: string, inline: boolean): JSONContent => inline
  ? { type: 'text', text: `[${type} unavailable — choose a file]` }
  : { type: 'paragraph', content: [{ type: 'text', text: `[${type} unavailable — choose a file]` }] };
// Generic/native element commands may contain nested media. Fail closed instead
// of accepting an unverified URL, class media ID or private document key.
const rawAsset = (node: JSONContent) => {
  const attrs = node.attrs ?? {};
  return ['media', 'inlineMedia', 'picture', 'pdfBlock', 'collab'].includes(node.type ?? '')
    ? !!(attrs.media || attrs.src || attrs.fileDoc || attrs.docKey)
    : Object.keys(attrs).some(key => /^(media|src|fileDoc|docKey|audioId|videoId|pdfId)$/i.test(key) && !!attrs[key]);
};

// Resolve all typed IDs on the server before inserting anything. An inaccessible
// item never leaks its name, URL or old ID into learner-visible content.
export async function resolveSuiteScriptContent(content: JSONContent[], destination: SuiteScriptDestination): Promise<SuiteScriptResolution> {
  const warnings: string[] = [];
  async function visit(node: JSONContent, path: string): Promise<JSONContent> {
    const id = node.attrs?.suiteRef;
    if (typeof id === 'string') {
      const type = node.type === 'picture' ? 'Image' : node.type === 'pdfBlock' ? 'PDF' : node.type === 'collab' ? 'Shared document' : node.attrs?.kind === 'video' ? 'Video' : 'Audio';
      const inline = node.type === 'picture' || node.type === 'inlineMedia';
      try {
        const ref = await resolveSuiteScriptReference(id, destination);
        if (node.type === 'collab') {
          if (ref.kind !== 'sharedDoc' || ref.itemType !== 'doc' || !ref.docKey) throw new Error('wrong type');
          return { type: 'collab', attrs: { id: crypto.randomUUID(), docKey: ref.docKey, kind: 'doc', scope: 'class', modes: ['edit', 'suggest', 'comment'], fileDoc: ref.sourceId } };
        }
        if (node.type === 'pdfBlock') {
          if (ref.kind !== 'sharedDoc' || !(ref.itemType === 'pdf' || ref.mime === 'application/pdf')) throw new Error('wrong type');
          return { type: 'pdfBlock', attrs: { src: `file:${ref.sourceId}`, from: ref.sourceId } };
        }
        if (node.type === 'picture' && ref.kind === 'sharedDoc' && ref.mime?.startsWith('image/')) return { type: 'picture', attrs: { src: `file:${ref.sourceId}`, alt: node.attrs?.alt ?? '' } };
        if (ref.kind !== 'archive' || ref.itemType !== (node.type === 'picture' ? 'image' : node.attrs?.kind)) throw new Error('wrong type');
        const source = ref.home;
        if (!source?.classId || !source.mediaId) throw new Error('missing media');
        const destClass = destination.mode === 'class' ? destination.classId : source.classId;
        const same = ref.copies?.[destClass] ?? (source.classId === destClass ? source.mediaId : '');
        const media = same || (await carryMedia(source.classId, destClass, [{ media: source.mediaId }]))[source.mediaId];
        if (!media) throw new Error('missing media');
        if (node.type === 'picture') return { type: 'picture', attrs: { src: `media:${media}`, alt: node.attrs?.alt ?? '' } };
        return { type: node.type, attrs: { media, archiveId: ref.sourceId, kind: ref.itemType, title: '', scriptMode: 'none', plays: 0, space: destClass } };
      } catch {
        warnings.push(`${path}: ${type} unavailable here. Reselect the exact item from My Files.`);
        return unavailable(type, inline);
      }
    }
    if (rawAsset(node)) {
      warnings.push(`${path}: This item needs a verified SuiteScript reference. Reselect it from My Files.`);
      return unavailable('Item', node.type === 'inlineMedia' || node.type === 'picture');
    }
    if (!node.content?.length) return node;
    const children = await Promise.all(node.content.map((child, index) => visit(child, `${path}.${index + 1}`)));
    return { ...node, content: children };
  }
  const resolved = await Promise.all(content.map((node, index) => visit(node, `Block ${index + 1}`)));
  return { content: resolved, warnings };
}

import type { JSONContent } from '@tiptap/react';
import { carryMedia } from './fullcopy';
import { resolveSuiteScriptReference, type SuiteScriptDestination } from './suiteScriptReferences';
import { suiteScriptRawAssetPath } from './suiteScriptAssetScan';
import { suiteScriptSafeMeta } from './suiteScriptMeta';

export type SuiteScriptResolution = { content: JSONContent[]; warnings: string[] };

const unavailable = (type: string, inline: boolean): JSONContent => inline
  ? { type: 'text', text: `[${type} unavailable — choose a file]` }
  : { type: 'paragraph', content: [{ type: 'text', text: `[${type} unavailable — choose a file]` }] };
// Generic/native element commands may contain nested media. Fail closed instead
// of accepting an unverified URL, class media ID or private document key.

// Resolve all typed IDs on the server before inserting anything. An inaccessible
// item never leaks its name, URL or old ID into learner-visible content.
export async function resolveSuiteScriptContent(content: JSONContent[], destination: SuiteScriptDestination): Promise<SuiteScriptResolution> {
  const warnings: string[] = [];
  async function visit(node: JSONContent, path: string): Promise<JSONContent> {
    const id = node.attrs?.suiteRef;
    const withChildren = async (base: JSONContent): Promise<JSONContent> => !node.content?.length ? base : {
      ...base,
      content: await Promise.all(node.content.map((child, index) => visit(child, `${path}.${index + 1}`))),
    };
    if (typeof id === 'string') {
      const type = node.type === 'picture' ? 'Image' : node.type === 'pdfBlock' ? 'PDF' : node.type === 'collab' ? 'Shared document' : node.attrs?.kind === 'video' ? 'Video' : 'Audio';
      const inline = node.type === 'picture' || node.type === 'inlineMedia';
      try {
        const nested = suiteScriptRawAssetPath(node, true);
        if (nested) throw new Error(`unchecked nested asset at ${nested}`);
        const ref = await resolveSuiteScriptReference(id, destination);
        const meta = suiteScriptSafeMeta(node);
        if (node.type === 'collab') {
          if (ref.kind !== 'sharedDoc' || ref.itemType !== 'doc' || !ref.docKey) throw new Error('wrong type');
          const modes = ref.classRole === 'edit' ? ['edit', 'suggest', 'comment'] : ref.classRole === 'suggest' ? ['suggest', 'comment'] : ref.classRole === 'comment' ? ['comment'] : ['view'];
          return withChildren({ type: 'collab', attrs: { ...meta, id: crypto.randomUUID(), docKey: ref.docKey, kind: 'doc', scope: 'class', modes, fileDoc: ref.sourceId } });
        }
        if (node.type === 'pdfBlock') {
          if (ref.kind !== 'sharedDoc' || !(ref.itemType === 'pdf' || ref.mime === 'application/pdf')) throw new Error('wrong type');
          return withChildren({ type: 'pdfBlock', attrs: { ...meta, src: `file:${ref.sourceId}`, from: ref.sourceId } });
        }
        if (node.type === 'picture' && ref.kind === 'sharedDoc' && ref.mime?.startsWith('image/')) return withChildren({ type: 'picture', attrs: { ...meta, src: `file:${ref.sourceId}` } });
        if (ref.kind !== 'archive' || ref.itemType !== (node.type === 'picture' ? 'image' : node.attrs?.kind)) throw new Error('wrong type');
        const source = ref.home;
        if (!source?.classId || !source.mediaId) throw new Error('missing media');
        const destClass = destination.mode === 'class' ? destination.classId : source.classId;
        const same = ref.copies?.[destClass] ?? (source.classId === destClass ? source.mediaId : '');
        const media = same || (await carryMedia(source.classId, destClass, [{ media: source.mediaId }]))[source.mediaId];
        if (!media) throw new Error('missing media');
        if (node.type === 'picture') return withChildren({ type: 'picture', attrs: { ...meta, src: `media:${media}` } });
        return withChildren({ type: node.type, attrs: { ...meta, media, archiveId: ref.sourceId, kind: ref.itemType, title: meta.title ?? '', scriptMode: meta.scriptMode ?? 'none', plays: meta.plays ?? 0, space: destClass } });
      } catch {
        warnings.push(destination.mode === 'resourceHub'
          ? `${path}: This private ${type.toLowerCase()} cannot be published in Resource Hub. Upload an asset that teachers can access.`
          : `${path}: ${type} unavailable here. Reselect the exact item from My Files.`);
        return unavailable(type, inline);
      }
    }
    // A new shared document is a blank native element, not a reference to an
    // existing class document. Give it a new key here instead of trusting the
    // key typed into a starter. Existing documents require a checked suiteRef.
    if (node.type === 'collab' && !node.attrs?.fileDoc) {
      const remaining: JSONContent = { ...node, attrs: { ...node.attrs, docKey: '' } };
      if (!suiteScriptRawAssetPath(remaining)) return { ...node, attrs: { ...node.attrs, id: crypto.randomUUID(), docKey: crypto.randomUUID() } };
    }
    const rawPath = suiteScriptRawAssetPath(node);
    if (rawPath) {
      warnings.push(`${path}: ${rawPath} contains a file or media value that needs a verified SuiteScript reference. Choose that item from My Files.`);
      return unavailable('Item', node.type === 'inlineMedia' || node.type === 'picture');
    }
    if (!node.content?.length) return node;
    const children = await Promise.all(node.content.map((child, index) => visit(child, `${path}.${index + 1}`)));
    return { ...node, content: children };
  }
  const resolved = await Promise.all(content.map((node, index) => visit(node, `Block ${index + 1}`)));
  return { content: resolved, warnings };
}

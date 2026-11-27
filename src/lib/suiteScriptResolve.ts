import type { JSONContent } from '@tiptap/react';
import { carryMedia } from './fullcopy';
import { loadAnyFile } from './fileStore';
import { saveSound } from './archive';
import { resolveSuiteScriptReference, type SuiteScriptDestination } from './suiteScriptReferences';

export type SuiteScriptResolution = { content: JSONContent[]; warnings: string[] };

const unavailable = (type: string, inline: boolean): JSONContent => inline
  ? { type: 'text', text: `[${type} unavailable — choose a file]` }
  : { type: 'paragraph', content: [{ type: 'text', text: `[${type} unavailable — choose a file]` }] };
// Generic/native element commands may hide pictures and recordings inside
// configuration arrays (for example, communicative cards and A/B pictures).
// A typed reference is resolved only at the node root, so nested references
// and raw assets must fail closed instead of reaching a saved task unchanged.
const ASSET_FIELD = /^(media|src|fileDoc|docKey|audioId|videoId|pdfId|suiteRef)$/i;
const rawAsset = (node: JSONContent): boolean => {
  const inspect = (value: unknown, depth: number): boolean => {
    if (depth > 32) return true;
    if (Array.isArray(value)) return value.some(item => inspect(item, depth + 1));
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) =>
      (ASSET_FIELD.test(key) && child !== null && child !== undefined && child !== '')
      || inspect(child, depth + 1));
  };
  return inspect(node.attrs ?? {}, 0);
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
        // Private editors do not say which learners may open the eventual
        // lesson or document. Resource Hub needs a separately published asset.
        // A source read for the teacher cannot prove either audience's access.
        if (destination.mode === 'private' || destination.mode === 'resourceHub') throw new Error('destination audience unknown');
        const mediaCopy = ['media', 'inlineMedia'].includes(node.type ?? '') && destination.mode === 'class';
        const ref = await resolveSuiteScriptReference(id, mediaCopy ? { ...destination, mediaCopy: true } : destination);
        if (node.type === 'collab') {
          if (ref.kind !== 'sharedDoc' || ref.itemType !== 'doc' || !ref.docKey) throw new Error('wrong type');
          const modes = ref.classRole === 'edit' ? ['edit', 'suggest', 'comment'] : ref.classRole === 'suggest' ? ['suggest', 'comment'] : ref.classRole === 'comment' ? ['comment'] : ['view'];
          return { type: 'collab', attrs: { id: crypto.randomUUID(), docKey: ref.docKey, kind: 'doc', scope: 'class', modes, fileDoc: ref.sourceId } };
        }
        if (node.type === 'pdfBlock') {
          if (ref.kind !== 'sharedDoc' || !(ref.itemType === 'pdf' || ref.mime === 'application/pdf')) throw new Error('wrong type');
          return { type: 'pdfBlock', attrs: { src: `file:${ref.sourceId}`, from: ref.sourceId } };
        }
        if (node.type === 'picture' && ref.kind === 'sharedDoc' && ref.mime?.startsWith('image/')) return { type: 'picture', attrs: { src: `file:${ref.sourceId}`, alt: node.attrs?.alt ?? '' } };
        if (['media', 'inlineMedia'].includes(node.type ?? '') && ref.kind === 'sharedDoc') {
          const video = node.attrs?.kind === 'video';
          if (destination.mode !== 'class' || ref.itemType !== 'file'
            || !(/^(video\/(mp4|webm))$/.test(ref.mime ?? '') === video)
            || !/^(audio\/(mpeg|mp4|wav|x-wav|ogg)|video\/(mp4|webm))$/.test(ref.mime ?? '')) throw new Error('unsupported file');
          const file = await loadAnyFile(ref.sourceId);
          if (file.type !== ref.mime) throw new Error('file type changed');
          const title = video ? 'Video from Files' : 'Recording from Files';
          const copy = await saveSound(destination.classId, file, { title, video });
          return { type: node.type, attrs: { media: copy.mediaId, archiveId: '', kind: video ? 'video' : 'audio', title, scriptMode: 'none', plays: 0 } };
        }
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
        warnings.push(destination.mode === 'resourceHub'
          ? `${path}: This private ${type.toLowerCase()} cannot be published in Resource Hub. Upload an asset that teachers can access.`
          : `${path}: ${type} unavailable here. Reselect the exact item from My Files.`);
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

import type { JSONContent } from '@tiptap/react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { ensureSuiteScriptReference, resolveSuiteScriptReference } from './suiteScriptReferences';
import { suiteScriptRawAssetPath } from './suiteScriptAssetScan';
import { suiteScriptSafeMeta } from './suiteScriptMeta';

type ArchiveLink = { id: string; home?: { classId: string; mediaId: string }; copies?: Record<string, string> };

// Prepare a copy for a plain-text intermediary. The exported ID is resolved
// from the existing object, not its filename, title or temporary URL.
export async function suiteScriptCopyNodes(content: JSONContent[], uid: string, space: string): Promise<JSONContent[]> {
  let archive: ArchiveLink[] | null = null;
  const getArchive = async () => {
    if (!archive) archive = (await getDocs(collection(db, 'users', uid, 'archive'))).docs.map(snap => ({ id: snap.id, ...(snap.data() as Omit<ArchiveLink, 'id'>) }));
    return archive;
  };
  const findMedia = async (mediaId: string) => (await getArchive()).find(item => (item.home?.classId === space && item.home.mediaId === mediaId) || item.copies?.[space] === mediaId)?.id;
  async function visit(node: JSONContent): Promise<JSONContent> {
    const attrs = node.attrs ?? {};
    let source: { kind: 'archive' | 'sharedDoc'; id: string } | null = null;
    // A file copied into Class media keeps its opaque, checked source reference.
    // Recheck it for this teacher and Class on every export; an ID saved in a
    // task must never grant access by itself.
    const savedRef = typeof attrs.suiteRef === 'string' ? attrs.suiteRef : '';
    const copiedMedia = (node.type === 'picture' || node.type === 'pdfBlock')
      ? typeof attrs.src === 'string' && attrs.src.startsWith('media:')
      : (node.type === 'media' || node.type === 'inlineMedia') && !!attrs.media;
    if (savedRef && copiedMedia) {
      const ref = await resolveSuiteScriptReference(savedRef, { mode: 'class', classId: space, mediaCopy: true });
      const image = node.type === 'picture'
        && (ref.kind === 'archive' && ref.itemType === 'image'
          || ref.kind === 'sharedDoc' && ref.itemType === 'file' && /^image\/(png|jpeg|webp|gif)$/.test(ref.mime ?? ''));
      const pdf = node.type === 'pdfBlock' && ref.kind === 'sharedDoc'
        && (ref.itemType === 'pdf' || ref.itemType === 'file' && ref.mime === 'application/pdf');
      const sound = (node.type === 'media' || node.type === 'inlineMedia')
        && (ref.kind === 'archive' && ref.itemType === attrs.kind
          || ref.kind === 'sharedDoc' && ref.itemType === 'file'
            && (attrs.kind === 'video' ? /^video\/(mp4|webm)$/.test(ref.mime ?? '') : attrs.kind === 'audio' && /^audio\/(mpeg|mp4|wav|x-wav|ogg)$/.test(ref.mime ?? '')));
      if (!image && !pdf && !sound) throw new Error('This file reference no longer matches the element. Reselect the item from Files.');
      source = { kind: ref.kind, id: ref.sourceId };
    }
    if (node.type === 'media' || node.type === 'inlineMedia') {
      const id = source ? '' : attrs.archiveId || (attrs.media ? await findMedia(attrs.media) : '');
      if (id) source = { kind: 'archive', id };
      else if (!source && attrs.media) throw new Error('This recording is not in My Files. Save it there before copying it as SuiteScript.');
    } else if (node.type === 'picture') {
      const fileId = typeof attrs.src === 'string' && attrs.src.startsWith('file:') ? attrs.src.slice(5) : '';
      const mediaId = typeof attrs.src === 'string' && attrs.src.startsWith('media:') ? attrs.src.slice(6) : '';
      if (!source && fileId) source = { kind: 'sharedDoc', id: fileId };
      else if (!source && mediaId) { const id = await findMedia(mediaId); if (id) source = { kind: 'archive', id }; }
      if (mediaId && !source) throw new Error('This picture is not in My Files. Save it there before copying it as SuiteScript.');
      if (attrs.src && !source) throw new Error('This picture needs to be saved in My Files before copying it as SuiteScript.');
    } else if (node.type === 'pdfBlock') {
      if (!source && typeof attrs.src === 'string' && attrs.src.startsWith('file:')) source = { kind: 'sharedDoc', id: attrs.src.slice(5) };
      else if (!source && attrs.src) throw new Error('This PDF needs a My Files reference before copying it as SuiteScript.');
    } else if (node.type === 'collab') {
      if (attrs.fileDoc) source = { kind: 'sharedDoc', id: attrs.fileDoc };
      else if (attrs.docKey) throw new Error('This class-only shared document must be saved in My Files before copying it as SuiteScript.');
    }
    const nested = suiteScriptRawAssetPath(node, !!source);
    if (nested) throw new Error(`This element has a picture, recording or file at ${nested}. Save that item in My Files and add it with its SuiteScript reference before copying.`);
    if (source) {
      if (node.type === 'picture' && attrs.bw) throw new Error('This picture has a separate black-and-white print version. Remove that version or choose it separately before copying as SuiteScript.');
      const safe = suiteScriptSafeMeta(node);
      const children = node.content?.length ? await Promise.all(node.content.map(visit)) : node.content;
      return { ...node, attrs: { ...safe, ...(node.type === 'media' || node.type === 'inlineMedia' ? { kind: attrs.kind } : {}), suiteRef: savedRef && copiedMedia ? savedRef : await ensureSuiteScriptReference(source.kind, source.id) }, ...(children ? { content: children } : {}) };
    }
    if (!node.content?.length) return node;
    return { ...node, content: await Promise.all(node.content.map(visit)) };
  }
  return Promise.all(content.map(visit));
}

import type { JSONContent } from '@tiptap/react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { ensureSuiteScriptReference } from './suiteScriptReferences';
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
    if (node.type === 'media' || node.type === 'inlineMedia') {
      const id = attrs.archiveId || (attrs.media ? await findMedia(attrs.media) : '');
      if (id) source = { kind: 'archive', id };
      else if (attrs.media) throw new Error('This recording is not in My Files. Save it there before copying it as SuiteScript.');
    } else if (node.type === 'picture') {
      const fileId = typeof attrs.src === 'string' && attrs.src.startsWith('file:') ? attrs.src.slice(5) : '';
      const mediaId = typeof attrs.src === 'string' && attrs.src.startsWith('media:') ? attrs.src.slice(6) : '';
      if (fileId) source = { kind: 'sharedDoc', id: fileId };
      else if (mediaId) { const id = await findMedia(mediaId); if (id) source = { kind: 'archive', id }; }
      if (mediaId && !source) throw new Error('This picture is not in My Files. Save it there before copying it as SuiteScript.');
      if (attrs.src && !source) throw new Error('This picture needs to be saved in My Files before copying it as SuiteScript.');
    } else if (node.type === 'pdfBlock') {
      if (typeof attrs.src === 'string' && attrs.src.startsWith('file:')) source = { kind: 'sharedDoc', id: attrs.src.slice(5) };
      else if (attrs.src) throw new Error('This PDF needs a My Files reference before copying it as SuiteScript.');
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
      return { ...node, attrs: { ...safe, ...(node.type === 'media' || node.type === 'inlineMedia' ? { kind: attrs.kind } : {}), suiteRef: await ensureSuiteScriptReference(source.kind, source.id) }, ...(children ? { content: children } : {}) };
    }
    if (!node.content?.length) return node;
    return { ...node, content: await Promise.all(node.content.map(visit)) };
  }
  return Promise.all(content.map(visit));
}

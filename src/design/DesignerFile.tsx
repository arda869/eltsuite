import { useEffect, useRef, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadAnyFile } from '../lib/fileStore';
import type { SharedDoc } from '../lib/sharedDocs';
import { DesignFile } from './Editor';
import { pagesCol, elsCol, metaRef, storePicture, useDesign } from './model';
import './design.css';

import { isImageFile } from './files';
export { isImageFile } from './files';

// Designer files are pictures and pages. Storyboards were removed from ELT Suite; one that has
// not been cleaned up yet says so instead of opening.
export async function startDesigner(id: string, _type: 'image' = 'image') {
  void _type;
  const b = writeBatch(db);
  b.set(metaRef(id), { type: 'image' }, { merge: true });
  b.update(doc(db, 'sharedDocs', id), { designType: 'image' });
  b.set(doc(pagesCol(id), 'canvas'), { order: 0, w: 1080, h: 1080, bg: '#ffffff' });
  await b.commit();
}

export function DesignerFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const { pages, meta } = useDesign(d.id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState('');
  const story = d.kind === ('storyboard' as string) || d.designType === ('storyboard' as string) || meta.type === ('storyboard' as string);
  useEffect(() => {
    if (!isImageFile(d) || canEdit || pages === null || pages.length) return;
    let url = '';
    let active = true;
    void loadAnyFile(d.id, d.file)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) setOriginal(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => setError('We couldn’t open the original picture. Reload to try again.'));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [d.id, canEdit, pages]);
  const importing = useRef(false);
  useEffect(() => {
    if (!isImageFile(d) || pages === null || pages.length || !canEdit || importing.current) return;
    importing.current = true;
    setBusy(true);
    void (async () => {
      const picture = await storePicture(d.id, await loadAnyFile(d.id, d.file));
      const b = writeBatch(db);
      b.set(doc(pagesCol(d.id), 'canvas'), { order: 0, w: picture.w, h: picture.h, bg: '#ffffff' });
      b.set(doc(elsCol(d.id), 'original'), { page: 'canvas', t: 'image', z: 0, x: 0, y: 0, w: picture.w, h: picture.h, iw: picture.w, ih: picture.h, img: picture.id, name: d.title });
      await b.commit();
    })()
      .catch(() => setError('We couldn’t open this picture. Your original is unchanged. Reload to try again.'))
      .finally(() => setBusy(false));
  }, [d.id, pages, canEdit]);
  // A new, empty design gets its first page.
  const starting = useRef(false);
  useEffect(() => {
    if (story || isImageFile(d) || pages === null || pages.length || !canEdit || starting.current) return;
    starting.current = true;
    setBusy(true);
    void startDesigner(d.id)
      .catch(() => setError('We couldn’t make your page. Reload and try again.'))
      .finally(() => setBusy(false));
  }, [story, pages, canEdit, d.id]);
  if (story) return <div className="dp-msg">Storyboards are no longer part of ELT Suite.</div>;
  if (error) return <p role="alert" className="dp-msg">{error}</p>;
  if (pages === null || busy) return <div className="dp-msg" role="status">One moment…</div>;
  if (pages.length) return <DesignFile d={d} canEdit={canEdit} />;
  if (!canEdit && isImageFile(d)) return original ? <img src={original} alt={d.title} style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} /> : <div className="dp-msg">One moment…</div>;
  return <div className="dp-msg">This Designer file is empty.</div>;
}

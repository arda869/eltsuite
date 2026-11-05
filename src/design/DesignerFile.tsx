import { useEffect, useRef, useState } from 'react';
import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadAnyFile } from '../lib/fileStore';
import type { SharedDoc } from '../lib/sharedDocs';
import { StoryboardFile } from '../storyboard/StoryboardFile';
import { DesignFile } from './Editor';
import { pagesCol, elsCol, metaRef, storePicture, useDesign } from './model';
import './design.css';

import { isImageFile } from './files';
export { isImageFile } from './files';

// A storyboard is panels on the Designer's canvas: 16:9, like a slide, so it fills the board.
export const PANEL = { w: 1280, h: 720 };

export async function startDesigner(id: string, type: 'image' | 'storyboard') {
  const b = writeBatch(db);
  b.set(metaRef(id), { type }, { merge: true });
  b.update(doc(db, 'sharedDocs', id), { designType: type });
  if (type === 'image') b.set(doc(pagesCol(id), 'canvas'), { order: 0, w: 1080, h: 1080, bg: '#ffffff' });
  else b.set(doc(pagesCol(id), 'panel1'), { order: 0, ...PANEL, bg: '#ffffff', name: 'Panel 1' });
  await b.commit();
}

// Storyboards made before the canvas kept their scenes in `scenes`; they still open in the old
// storyboard editor, so nothing already made is lost.
const legacy = new Map<string, Promise<boolean>>();
function hasLegacyScenes(id: string) {
  if (!legacy.has(id)) legacy.set(id, getDocs(query(collection(db, 'sharedDocs', id, 'scenes'), limit(1))).then((s) => !s.empty, () => false));
  return legacy.get(id)!;
}

export function DesignerFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const { pages, meta } = useDesign(d.id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState('');
  const story = d.kind === 'storyboard' || d.designType === 'storyboard' || meta.type === 'storyboard';
  const [old, setOld] = useState<boolean | null>(null);
  useEffect(() => {
    if (!story || pages === null || pages.length) return;
    let on = true;
    void hasLegacyScenes(d.id).then((v) => on && setOld(v));
    return () => void (on = false);
  }, [story, pages, d.id]);
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
      .catch(() => setError('Could not open the original image. Please reload to try again.'));
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
      .catch(() => setError('We could not open this image. Your original is unchanged. Reload to try again.'))
      .finally(() => setBusy(false));
  }, [d.id, pages, canEdit]);
  // A new storyboard with nothing in it yet gets its first panel.
  const starting = useRef(false);
  useEffect(() => {
    if (!story || pages === null || pages.length || old !== false || !canEdit || starting.current) return;
    starting.current = true;
    setBusy(true);
    void startDesigner(d.id, 'storyboard')
      .catch(() => setError('We couldn’t make the first panel. Reload to try again.'))
      .finally(() => setBusy(false));
  }, [story, pages, old, canEdit, d.id]);
  if (error) return <p role="alert" className="dp-msg">{error}</p>;
  if (pages === null || busy) return <div className="dp-msg" role="status">Opening Designer…</div>;
  if (story) {
    if (pages.length) return <DesignFile d={d} canEdit={canEdit} />;
    if (old === null) return <div className="dp-msg" role="status">Opening Designer…</div>;
    if (old) return <StoryboardFile d={d} canEdit={canEdit} />;
    if (!canEdit) return <div className="dp-msg">This storyboard is empty.</div>;
    return <div className="dp-msg" role="status">Opening Designer…</div>;
  }
  if (pages.length || meta.type === 'image') return <DesignFile d={d} canEdit={canEdit} />;
  if (!canEdit && isImageFile(d)) return original ? <img src={original} alt={d.title} style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} /> : <div className="dp-msg">Opening image…</div>;
  if (!canEdit) return <div className="dp-msg">This Designer file is empty.</div>;
  return (
    <section className="dz-start">
      <div className="dz-start-in">
        <p className="dz-kicker">Designer</p>
        <h1>What will you make?</h1>
        <p className="dz-start-sub">Tell a story in panels, or make a picture your own.</p>
        <div className="dz-start-grid">
          {(['storyboard', 'image'] as const).map((type) => (
            <button
              className="dz-start-card"
              key={type}
              onClick={() => {
                setBusy(true);
                void startDesigner(d.id, type)
                  .catch(() => setError('We couldn’t make your canvas. Reload and try again.'))
                  .finally(() => setBusy(false));
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 48 }}>{type === 'storyboard' ? '▤' : '◈'}</span>
              <strong>{type === 'storyboard' ? 'Storyboard' : 'Image'}</strong>
              <span>{type === 'storyboard' ? 'Scenes with people, things and speech bubbles' : 'Make with AI, upload, crop, filter and add text'}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

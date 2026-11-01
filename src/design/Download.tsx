import { useState } from 'react';
import { auth } from '../lib/firebase';
import { tell } from '../lib/ask';
import { uploadPicture } from '../editor/PackNode';
import type { Ctx } from './Editor';
import { downloadImage, downloadPdf, pageBlob } from './tools';
import type { Env } from './render';

// Export image artwork or save a reusable picture in Resources.
export function DownloadMenu({ cx }: { cx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const env: Env = { imgs: cx.imgs, view: cx.view, accent: cx.accent };
  const name = cx.d.title || 'Design';
  const run = async (what: string, f: () => Promise<void>) => {
    setOpen(false);
    setBusy(what);
    try {
      await f();
    } catch {
      void tell('We couldn’t make the download just now. Try again.');
    } finally {
      setBusy('');
    }
  };
  const toFiles = async () => {
    const u = auth.currentUser;
    if (!u) return;
    const blob = await pageBlob(cx.page, cx.els, env, 1.6);
    await uploadPicture('user:' + u.uid, blob, 'high', `${name}${cx.pages.length > 1 ? ' – page ' + (cx.pages.indexOf(cx.page) + 1) : ''}`);
    void tell('The page is in your Resources as a picture. You can add it to any lesson or task from there.');
  };
  return (
    <>
      {busy && <span className="dz-busy" role="status">{busy}</span>}
      <button type="button" className="btn primary dz-dl" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download
      </button>
      {open && (
        <>
          <div className="dz-dl-scrim" onClick={() => setOpen(false)} />
          <div className="dz-dl-pop" role="menu">
            <p className="dz-dl-h">This page</p>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'png', 2.5))}>
              <strong>Picture (PNG)</strong><span>Sharp, for screens and slides</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'jpg', 2))}>
              <strong>Picture (JPG)</strong><span>A smaller file, for messages</span>
            </button>
            {!cx.learnerUser && (
              <button type="button" role="menuitem" onClick={() => void run('Saving to Resources…', toFiles)}>
                <strong>Save as a picture in Resources</strong><span>To use in lessons and tasks</span>
              </button>
            )}
            <p className="dz-dl-h">All {cx.pages.length} {cx.pages.length === 1 ? 'page' : 'pages'}, to print</p>
            <button type="button" role="menuitem" onClick={() => void run('Making the PDF…', () => downloadPdf(cx.pages, cx.els, env, name, [{view:'all',learner:false,label:''}]))}>
              <strong>PDF</strong><span>Everything, as you see it</span>
            </button>
          </div>
        </>
      )}

    </>
  );
}

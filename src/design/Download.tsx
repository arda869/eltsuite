import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { auth } from '../lib/firebase';
import { tell } from '../lib/ask';
import { uploadPicture } from '../editor/PackNode';
import type { Ctx } from './Editor';
import { downloadImage, downloadPdf, pageBlob } from './tools';
import type { Env } from './render';

const classReturn = (value: string | null) => {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/class\/[A-Za-z0-9_-]+\/lesson\/[A-Za-z0-9_-]+$/.test(url.pathname)) return '';
    const task = url.searchParams.get('task');
    return task && /^[A-Za-z0-9_-]{1,100}$/.test(task) ? `${url.pathname}?task=${encodeURIComponent(task)}` : '';
  } catch { return ''; }
};

// Export image artwork or save a reusable picture in My Files.
export function DownloadMenu({ cx, beforeReturn }: { cx: Ctx; beforeReturn?: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const env: Env = { imgs: cx.imgs, view: cx.view, accent: cx.accent };
  const name = cx.d.title || 'Design';
  const returnTo = classReturn(new URLSearchParams(window.location.search).get('returnTo'));
  const run = async (what: string, f: () => Promise<void>) => {
    setOpen(false);
    setBusy(what);
    try {
      await f();
    } catch {
      void tell(what === 'Preparing for Classes…' ? 'We couldn’t save this design for Classes. Your work is still here; try again.' : 'We couldn’t make the download just now. Try again.');
    } finally {
      setBusy('');
    }
  };
  const toFiles = async (notify = true) => {
    const u = auth.currentUser;
    if (!u) return;
    const blob = await pageBlob(cx.page, cx.els, env, 1.6);
    await uploadPicture('user:' + u.uid, blob, 'high', `${name}${cx.pages.length > 1 ? ' – page ' + (cx.pages.indexOf(cx.page) + 1) : ''}`, '', cx.d.id);
    if (notify) void tell('The page is in My Files as a picture. You can add it to any lesson or task from there.');
  };
  const useInClasses = async () => {
    if (!returnTo || !cx.canEdit || !await beforeReturn?.()) throw Error('Design not ready');
    await toFiles(false);
    const destination = new URL(returnTo, window.location.origin);
    destination.searchParams.set('designer', cx.d.id);
    window.location.assign(destination.pathname + destination.search);
  };
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && current === 0) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (!event.shiftKey && current === items.length - 1) {
        // Removing the last option during the browser's Tab step can send
        // focus to the page body. Pick the next visible control first.
        const tabbables = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
          .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
        const next = tabbables[tabbables.indexOf(items[current]) + 1];
        event.preventDefault();
        setOpen(false);
        (next ?? triggerRef.current)?.focus();
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
        : current < 0 ? items.length - 1 : (current + items.length - 1) % items.length;
    items[next].focus();
  };
  return (
    <>
      {busy && <span className="dz-busy" role="status">{busy}</span>}
      {!cx.learnerUser && cx.canEdit && returnTo && <button type="button" className="btn dz-return" disabled={!!busy} onClick={() => void run('Preparing for Classes…', useInClasses)}>Use in Classes</button>}
      <button ref={triggerRef} type="button" className="btn primary dz-dl" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        Download
      </button>
      {open && (
        <>
          <div className="dz-dl-scrim" onClick={() => setOpen(false)} />
          <div ref={menuRef} className="dz-dl-pop" role="menu" aria-label="Download options" onKeyDown={onMenuKey} onBlur={event => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            // Let the browser finish moving focus before removing the menu.
            // Unmounting it during Tab can leave focus on the page body.
            window.setTimeout(() => { if (!menuRef.current?.contains(document.activeElement)) setOpen(false); }, 0);
          }}>
            <p className="dz-dl-h">This page</p>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'png', 2.5))}>
              <strong>Picture (PNG)</strong><span>Sharp, for screens and slides</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void run('Making the picture…', () => downloadImage(cx.page, cx.els, env, name, 'jpg', 2))}>
              <strong>Picture (JPG)</strong><span>A smaller file, for messages</span>
            </button>
            {!cx.learnerUser && (
              <button type="button" role="menuitem" onClick={() => void run('Saving to My Files…', toFiles)}>
                <strong>Save as a picture in My Files</strong><span>To use in lessons and tasks</span>
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

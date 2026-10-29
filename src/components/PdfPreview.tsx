import { copyText } from '../lib/copyText';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth';
import { UiIcon } from './UiIcon';
import { ask, tell } from '../lib/ask';
import { docLink, newSharedDoc, useSharedDoc } from '../lib/sharedDocs';
import { openPdf, pageSizes, saveFilePdf } from '../pdf/pdfData';
import { ShareDialog } from '../pages/DocPage';

// A PDF that was just made, in a viewer: download it, or save it in Files, and once it is
// saved, share it or copy its link. Leaving without saving asks first.
export function PdfPreview({ bytes, name, onClose }: { bytes: Uint8Array; name: string; onClose: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(name);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const d = useSharedDoc(id || undefined);
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes]);
  const leave = async () => {
    if (!id && !(await ask('This PDF isn’t saved in your Files. You can make it again at any time.', { ok: 'Close without saving', cancel: 'Keep it open' }))) return;
    onClose();
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !sharing && void leave();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const pages = await pageSizes(await openPdf(bytes.slice()));
      const nid = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'pdf', title.trim() || name);
      await saveFilePdf(nid, bytes, pages);
      setId(nid);
    } catch (e) {
      console.error(e);
      void tell('We couldn’t save the PDF. Check your connection and how much space you have left, then try again.');
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = (title.trim() || name) + '.pdf';
    a.click();
  };
  return createPortal(
    // Clicks stay here: the dialog that made the PDF is behind it.
    <div className="pv" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <header className="pv-bar">
        <button type="button" className="dp-ib" onClick={() => void leave()} aria-label="Close" data-tip="Close">
          <UiIcon name="prev" size={16} />
        </button>
        <span className="pv-kind" aria-hidden="true">
          <UiIcon name="annotate" size={16} />
        </span>
        <span className="pv-names">
          <input className="dp-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="File name" disabled={!!id} />
          <span className="dp-sub">{id ? 'Saved in your Files' : 'Not saved yet'}</span>
        </span>
        <span className="dp-acts">
          <button type="button" className="dp-ib" onClick={download} aria-label="Download" data-tip="Download the PDF">
            <UiIcon name="import" size={16} />
          </button>
          {!id ? (
            <button type="button" className="btn primary dp-share" disabled={busy} onClick={() => void save()}>
              <UiIcon name="archive" size={15} /> {busy ? 'Saving…' : 'Save in Files'}
            </button>
          ) : (
            <>
              <button type="button" className="btn primary dp-share" disabled={!d} onClick={() => setSharing(true)}>
                <UiIcon name="lock" size={15} /> Share
              </button>
              <button type="button" className="btn small-btn" onClick={() => void copyText(docLink(id)).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1600)))}>
                <UiIcon name="link" size={14} /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="btn small-btn" href={`/doc/${id}`} target="_blank" rel="noopener">
                Open in Files
              </a>
            </>
          )}
        </span>
      </header>
      <PdfPages bytes={bytes} />
      {sharing && d && <ShareDialog d={d} onClose={() => setSharing(false)} />}
    </div>,
    document.body,
  );
}

// The pages, drawn here with pdf.js, so the preview looks the same in every browser.
function PdfPages({ bytes }: { bytes: Uint8Array }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let dead = false;
    void (async () => {
      const pdf = await openPdf(bytes.slice());
      if (dead) return;
      setN(pdf.numPages);
      const host = ref.current;
      if (!host) return;
      host.innerHTML = '';
      const width = Math.min(900, host.clientWidth - 32);
      for (let i = 1; i <= pdf.numPages && !dead; i++) {
        const page = await pdf.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const scale = (width / v1.width) * (window.devicePixelRatio || 1);
        const v = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.round(v.width);
        c.height = Math.round(v.height);
        c.style.width = width + 'px';
        c.className = 'pv-page';
        c.setAttribute('aria-label', `Page ${i}`);
        host.append(c);
        await page.render({ canvasContext: c.getContext('2d')!, viewport: v } as Parameters<typeof page.render>[0]).promise;
      }
    })();
    return () => void (dead = true);
  }, [bytes]);
  return (
    <div className="pv-pages" ref={ref} aria-label={n ? `${n} pages` : 'Opening the pages'}>
      <span className="hint">Opening the pages…</span>
    </div>
  );
}

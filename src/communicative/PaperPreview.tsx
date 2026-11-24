import { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { ACTIVITY_LABELS } from './model';

// The activity on paper while you write it: the same print engine as the worksheet and the PDF,
// in a frame, so what you see is what prints (A4 or US Letter, colour or black and white).
export function ActivityPaperPreview({ node, classId }: { node: JSONContent; classId: string }) {
  const [paper, setPaper] = useState<'A4' | 'Letter'>('A4');
  const [mono, setMono] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setFull(false));
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [full]);
  const [html, setHtml] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const frame = useRef<HTMLIFrameElement>(null);
  const key = JSON.stringify(node);
  // Pages are drawn at their real size; scale them to the width of the pane.
  const fit = () => {
    const f = frame.current, d = f?.contentDocument;
    if (!f || !d?.documentElement) return;
    const pageW = paper === 'Letter' ? 816 : 794;
    if (!d.getElementById('ca-paper-style')) { const st = d.createElement('style'); st.id = 'ca-paper-style'; st.textContent = '.toolbar { display: none !important; }'; d.head.append(st); }
    d.documentElement.style.zoom = String(Math.min(1.25, Math.max(0.3, (f.clientWidth - 28) / (pageW + 40))));
  };
  useEffect(() => {
    const f = frame.current;
    if (!f || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(f);
    return () => ro.disconnect();
  });
  useEffect(() => { fit(); }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let stop = false;
    setState('loading');
    const t = window.setTimeout(async () => {
      try {
        const [{ flattenTask }, { worksheetHtml }, { sheetPictures }] = await Promise.all([import('../lib/worksheet'), import('../lib/worksheetHtml'), import('../lib/sheetMedia')]);
        const items = [{ kind: 'task' as const, task: flattenTask({ title: '', content: { type: 'doc', content: [node] } }) }];
        const media = await sheetPictures(classId, items).catch(() => ({}));
        if (stop) return;
        setHtml(worksheetHtml(ACTIVITY_LABELS[node.attrs?.kind as keyof typeof ACTIVITY_LABELS] ?? 'Activity', items, { header: false, key: false, qr: false, paper, mono, columns: 1, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d98f63', media }));
        setState('ready');
      } catch {
        if (!stop) setState('error');
      }
    }, 450);
    return () => { stop = true; window.clearTimeout(t); };
  }, [key, paper, mono, classId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'ca-paper' + (full ? ' is-full' : '')} role={full ? 'dialog' : undefined} aria-label={full ? 'The activity on paper' : undefined}>
      <div className="ca-paper-bar">
        <span className="seg small-seg" role="radiogroup" aria-label="Paper size">
          {(['A4', 'Letter'] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={paper === p} className={paper === p ? 'on' : ''} onClick={() => setPaper(p)}>{p === 'A4' ? 'A4' : 'US Letter'}</button>)}
        </span>
        <span className="seg small-seg" role="radiogroup" aria-label="Colour">
          <button type="button" role="radio" aria-checked={!mono} className={!mono ? 'on' : ''} onClick={() => setMono(false)}>Colour</button>
          <button type="button" role="radio" aria-checked={mono} className={mono ? 'on' : ''} onClick={() => setMono(true)}>Black and white</button>
        </span>
        <button type="button" className="btn small-btn ca-paper-full" onClick={() => setFull((f) => !f)}>{full ? 'Close full screen' : 'Full screen'}</button>
        <span className="hint" role="status">{state === 'loading' ? 'Laying out the pages…' : state === 'error' ? 'We couldn’t show the pages just now. Your activity is safe.' : 'As it prints'}</span>
      </div>
      {html && <iframe ref={frame} className="ca-paper-frame" style={{ width: '100%', height: full ? '100%' : 'min(82vh, 1120px)', border: 0, borderRadius: 12, background: '#e9e7e2' }} title="The activity on paper" srcDoc={html} sandbox="allow-scripts allow-same-origin" onLoad={fit} />}
    </div>
  );
}

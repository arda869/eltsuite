import { useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import { saveCsv, saveDocx, savePdf, saveXlsx, type Report } from '../lib/reportFiles';
import { UiIcon } from './UiIcon';

// One Download button for every report: Excel, PDF, Word or CSV, in the class colour.
export function ReportDownload({ make, disabled, label = 'Download' }: { make: () => Report; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useDismiss<HTMLSpanElement>(open, () => setOpen(false));
  const here = useRef<HTMLButtonElement>(null);
  const accent = () => {
    const v = getComputedStyle(here.current ?? document.documentElement).getPropertyValue('--accent').trim();
    const x = document.createElement('canvas').getContext('2d');
    if (!x) return '#b8744e';
    x.fillStyle = v || '#b8744e';
    return x.fillStyle.startsWith('#') ? x.fillStyle : '#b8744e';
  };
  const run = async (f: (r: Report, a: string) => unknown) => {
    setOpen(false);
    setBusy(true);
    try {
      await f(make(), accent());
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="cd-dl rp-dl" ref={ref}>
      <button ref={here} type="button" className="btn small-btn" disabled={disabled || busy} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <UiIcon name="import" size={14} /> {busy ? 'Preparing…' : label}
      </button>
      {open && (
        <span className="cd-dl-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run(saveXlsx)}>
            Excel (.xlsx)
          </button>
          <button type="button" role="menuitem" onClick={() => run(savePdf)}>
            PDF (print or save)
          </button>
          <button type="button" role="menuitem" onClick={() => run(saveDocx)}>
            Word (.docx)
          </button>
          <button type="button" role="menuitem" onClick={() => run((r) => saveCsv(r))}>
            CSV
          </button>
        </span>
      )}
    </span>
  );
}

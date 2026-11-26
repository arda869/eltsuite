import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';
import './add-window.css';

// One window for adding things across ELT Suite: pictures, recordings, videos. Where it comes from
// is down the left (My Files first, then Upload, then the other places), what you choose fills the
// right, and the choices for how it looks sit along the bottom. Drop files anywhere on it to upload.

export type AddSource<K extends string> = { k: K; label: string; icon: string; about?: string };

export function AddWindow<K extends string>({ title, sources, source, onSource, onClose, children, options, status, onDropFiles, wide }: {
  title: string;
  sources: AddSource<K>[];
  source: K;
  onSource: (k: K) => void;
  onClose: () => void;
  children: ReactNode;
  // Settings for what is added (size, label…), along the bottom.
  options?: ReactNode;
  status?: string;
  onDropFiles?: (files: File[]) => void;
  wide?: boolean;
}) {
  const [over, setOver] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  useEffect(() => { box.current?.querySelector<HTMLElement>('.aw-src.on')?.focus(); }, []);
  const here = sources.find((s) => s.k === source);
  return createPortal(
    <div className="aw-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        className={'aw' + (wide ? ' wide' : '') + (over ? ' over' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onDragOver={onDropFiles ? (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } } : undefined}
        onDragLeave={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={onDropFiles ? (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); onDropFiles(Array.from(e.dataTransfer.files)); } : undefined}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <aside className="aw-rail">
          <h2>{title}</h2>
          <nav role="tablist" aria-orientation="vertical" aria-label="Where from" onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const i = sources.findIndex((s) => s.k === source);
            const next = sources[(i + (e.key === 'ArrowDown' ? 1 : sources.length - 1)) % sources.length];
            onSource(next.k);
            window.requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('.aw-src.on')?.focus());
          }}>
            {sources.map((s) => (
              <button key={s.k} type="button" role="tab" aria-selected={s.k === source} tabIndex={s.k === source ? 0 : -1} className={'aw-src' + (s.k === source ? ' on' : '')} onClick={() => onSource(s.k)}>
                <span className="aw-ic"><UiIcon name={s.icon} size={18} /></span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          {onDropFiles && <p className="aw-hint">You can drop files anywhere on this window, or paste a picture you copied.</p>}
        </aside>
        <section className="aw-main" role="tabpanel" aria-label={here?.label}>
          <header className="aw-head">
            <div>
              <h3>{here?.label}</h3>
              {here?.about && <p>{here.about}</p>}
            </div>
            <button type="button" className="aw-x" aria-label="Close" data-tip="Close" onClick={onClose}>×</button>
          </header>
          <div className="aw-body">{children}</div>
          {(options || status) && (
            <footer className="aw-foot">
              {status && <span className="aw-status" role="status">{status}</span>}
              {options && <div className="aw-opts">{options}</div>}
            </footer>
          )}
        </section>
        {over && <div className="aw-drop" aria-hidden="true"><UiIcon name="upload" size={28} /><b>Drop to upload</b></div>}
      </div>
    </div>,
    document.body,
  );
}

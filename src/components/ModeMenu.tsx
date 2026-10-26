import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UiIcon } from './UiIcon';

// Like the mode switch in Google Docs: one button at the top right says what you are doing,
// and the menu changes it.
export type Mode = 'edit' | 'teach' | 'present' | 'preview';
const MODES: { mode: Mode; icon: string; label: string; about: string }[] = [
  { mode: 'edit', icon: 'edit', label: 'Editing', about: 'Change tasks, questions and settings' },
  { mode: 'teach', icon: 'sync', label: 'Teaching', about: 'Live: learners see where you are and you see their answers' },
  { mode: 'preview', icon: 'revealAll', label: 'Learner view', about: 'Try the lesson as a learner sees it; nothing is saved' },
];

export function ModeMenu({ mode, live, onMode, onEnd, endLabel, children }: { mode: Mode; live: boolean; onMode: (m: Mode) => void; onEnd: () => void; endLabel?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [open]);
  const cur = MODES.find((m) => m.mode === mode)!;
  return (
    <div className="menu-anchor mode-menu" ref={ref}>
      <button type="button" className={'mode-btn m-' + mode + (live ? ' live' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {live && <span className="live-dot" aria-hidden="true" />}
        <UiIcon name={cur.icon} />
        <span className="mode-label">{cur.label}{live && mode === 'edit' ? ' · live' : ''}</span>
        <span aria-hidden="true" className="mode-caret">▾</span>
      </button>
      {open && (
        <div className="menu mode-list" role="menu">
          {MODES.map((m) => (
            <button key={m.mode} role="menuitemradio" aria-checked={mode === m.mode} className={(mode === m.mode ? 'on' : '') + (m.mode === 'present' ? ' desktop-only' : '')} onClick={() => (setOpen(false), onMode(m.mode))}>
              <UiIcon name={m.icon} />
              <span className="mode-text">
                <span>{m.label}</span>
                <span className="hint">{m.about}</span>
              </span>
              {mode === m.mode && <UiIcon name="check" />}
            </button>
          ))}
          {children}
          {live && (
            <>
              <span className="menu-sep" aria-hidden="true" />
              <button role="menuitem" className="danger-item" onClick={() => (setOpen(false), onEnd())}>
                <UiIcon name="presentOff" />
                <span className="mode-text">
                  <span>{endLabel ?? 'End the live lesson'}</span>
                  <span className="hint">Learners stop following you</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

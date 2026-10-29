import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UiIcon } from './UiIcon';

// Like the mode switch in Google Docs: one button at the top right says what you are doing,
// and the menu changes it. Editing is the default; Teaching has a switch that starts and ends
// the live lesson; Learner view tries the lesson, or opens it as one of your learners.
export type Mode = 'edit' | 'teach' | 'present' | 'preview';
const LABEL: Record<Mode, { icon: string; label: string }> = {
  edit: { icon: 'edit', label: 'Editing' },
  teach: { icon: 'sync', label: 'Teaching' },
  present: { icon: 'sync', label: 'Teaching' },
  preview: { icon: 'revealAll', label: 'Learner view' },
};

export function ModeMenu({ mode, live, online = 0, onMode, onEnd, endLabel, viewAs, children, noEdit, noTeach }: { noEdit?: boolean; noTeach?: boolean; mode: Mode; live: boolean; online?: number; onMode: (m: Mode) => void; onEnd: () => void; endLabel?: string; viewAs?: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [asOpen, setAsOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return setConfirm(false), setAsOpen(false);
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [open]);
  const cur = LABEL[mode];
  const pick = (m: Mode) => (setOpen(false), onMode(m));
  const finish = () => (setOpen(false), setConfirm(false), onEnd());
  const toggle = () => (live ? (online > 0 ? setConfirm(true) : finish()) : pick('teach'));
  return (
    <div className="menu-anchor mode-menu" ref={ref}>
      <button type="button" className={'mode-btn m-' + mode + (live ? ' live' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {live && <span className="live-dot" aria-hidden="true" />}
        <UiIcon name={cur.icon} />
        <span className="mode-label">
          {cur.label}
          {live && mode === 'edit' ? ' · live' : ''}
        </span>
        <span aria-hidden="true" className="mode-caret">▾</span>
      </button>
      {open && (
        <div className="menu mode-list" role="menu">
          {noEdit ? (
            <span className="mode-noedit hint">Editing lessons needs a larger screen: a tablet or a computer.</span>
          ) : (
          <button role="menuitemradio" aria-checked={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => pick('edit')}>
            <UiIcon name="edit" />
            <span className="mode-text">
              <span>Editing</span>
              <span className="hint">{live ? 'Change things while the class stays live' : 'Change tasks, questions and settings'}</span>
            </span>
            {mode === 'edit' && <UiIcon name="check" />}
          </button>
          )}

          {/* Only lessons are taught live; homework, tests and practice are done on learners' own time. */}
          {(!noTeach || live) && (
          <div className={'mode-row' + (mode === 'teach' || mode === 'present' ? ' on' : '')}>
            <button role="menuitemradio" aria-checked={mode === 'teach' || mode === 'present'} className="mode-main" onClick={() => pick('teach')}>
              <UiIcon name="sync" />
              <span className="mode-text">
                <span>Teaching</span>
                <span className="hint">{live ? `Live${online ? ` · ${online} ${online === 1 ? 'learner' : 'learners'} online` : ''}` : 'Go live: learners follow you and you see their answers'}</span>
              </span>
            </button>
            <button type="button" role="switch" aria-checked={live} aria-label={live ? 'Finish teaching' : 'Start teaching'} className={'mode-switch' + (live ? ' on' : '')} onClick={toggle}>
              <span />
            </button>
          </div>
          )}
          {confirm && (
            <div className="mode-confirm" role="alertdialog" aria-label="Finish teaching?">
              <strong>
                {online} {online === 1 ? 'learner is' : 'learners are'} online.
              </strong>
              <span className="hint">Finish teaching? They stop following you and the live tools close.</span>
              <span className="mode-confirm-btns">
                <button type="button" className="btn small-btn" onClick={() => setConfirm(false)}>
                  Keep teaching
                </button>
                <button type="button" className="btn small-btn danger" onClick={finish}>
                  Finish teaching
                </button>
              </span>
            </div>
          )}

          <div className={'mode-row' + (mode === 'preview' ? ' on' : '')}>
            <button role="menuitemradio" aria-checked={mode === 'preview'} className="mode-main" onClick={() => pick('preview')}>
              <UiIcon name="revealAll" />
              <span className="mode-text">
                <span>Learner view</span>
                <span className="hint">Try the lesson as a learner sees it; nothing is saved</span>
              </span>
            </button>
            {viewAs && (
              <button type="button" className={'mode-as' + (asOpen ? ' on' : '')} aria-expanded={asOpen} onClick={() => setAsOpen((v) => !v)} data-tip="View as one of your learners">
                View as <span aria-hidden="true">{asOpen ? '▴' : '▾'}</span>
              </button>
            )}
          </div>
          {asOpen && viewAs}
          {children}
          {endLabel && live && (
            <>
              <span className="menu-sep" aria-hidden="true" />
              <button role="menuitem" className="danger-item" onClick={finish}>
                <UiIcon name="presentOff" />
                <span className="mode-text">
                  <span>{endLabel}</span>
                  <span className="hint">Learners stop following</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

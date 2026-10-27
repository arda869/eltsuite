import { useEffect, useState, type ReactNode } from 'react';

// Teacher notes under the task, like the notes pane under a slide in PowerPoint: drag its top edge
// to make it taller, or fold it away. Only the teacher sees it.
const KEY = 'll.notesPane';
type Pane = { open: boolean; h: number };
const read = (): Pane => {
  try {
    return { open: true, h: 150, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { open: true, h: 150 };
  }
};

export function usePresenterNotes() {
  const [pane, setPane] = useState<Pane>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(pane));
    } catch {
      /* private window */
    }
  }, [pane]);
  return {
    open: pane.open,
    h: pane.h,
    toggle: () => setPane((p) => ({ ...p, open: !p.open })),
    show: () => setPane((p) => ({ ...p, open: true })),
    setH: (h: number) => setPane((p) => ({ ...p, h: Math.round(Math.min(Math.max(h, 80), window.innerHeight * 0.6)) })),
  };
}

export function PresenterNotes({ pane, hasNotes, children }: { pane: ReturnType<typeof usePresenterNotes>; hasNotes: boolean; children: ReactNode }) {
  const [drag, setDrag] = useState(false);
  if (!pane.open)
    return (
      <button type="button" className="pn-closed" onClick={pane.toggle} data-tip="Show your notes for this task (N)">
        <span className="pn-caret" aria-hidden="true">▴</span>
        Notes{hasNotes ? <span className="pn-dot" aria-label="This task has notes" /> : null}
      </button>
    );
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = pane.h;
    setDrag(true);
    document.body.classList.add('resizing-v');
    const move = (ev: PointerEvent) => pane.setH(h0 - (ev.clientY - y0));
    const up = () => {
      setDrag(false);
      document.body.classList.remove('resizing-v');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <section className={'pn' + (drag ? ' dragging' : '')} style={{ height: pane.h }} aria-label="Teacher notes">
      <div className="pn-grip" role="separator" aria-orientation="horizontal" aria-label="Resize the notes" aria-valuenow={Math.round(pane.h)} aria-valuemin={0} aria-valuemax={2000} tabIndex={0} onPointerDown={start} onKeyDown={(e) => (e.key === 'ArrowUp' ? pane.setH(pane.h + 20) : e.key === 'ArrowDown' ? pane.setH(pane.h - 20) : null)} data-tip="Drag to resize" />
      <div className="pn-head">
        <span className="pn-label">Notes</span>
        <span className="hint">Only you see these</span>
        <button type="button" className="pn-fold" onClick={pane.toggle} aria-label="Hide the notes" data-tip="Hide the notes (N)">
          ▾
        </button>
      </div>
      <div className="pn-body">{children}</div>
    </section>
  );
}

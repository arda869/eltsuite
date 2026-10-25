import { useEffect, useRef, useState } from 'react';
import { useAuth, type TextSize } from '../lib/auth';

// Per-person text size for tasks, saved to their profile.
export function TextSizeControl() {
  const { profile, setTextSize } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const cur = profile?.textSize ?? 'M';
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="ts-ctl" ref={ref}>
      <button type="button" className="btn small-btn ts-btn" aria-label="Text size" title="Text size" onClick={() => setOpen((o) => !o)}>
        <span className="ts-a small">A</span>
        <span className="ts-a">A</span>
      </button>
      {open && (
        <span className="ts-pop" role="radiogroup" aria-label="Text size">
          {(['S', 'M', 'L', 'XL'] as TextSize[]).map((t, i) => (
            <button key={t} type="button" role="radio" aria-checked={cur === t} className={cur === t ? 'on' : ''} onClick={() => setTextSize(t)} style={{ fontSize: 12 + i * 3 }}>
              A
            </button>
          ))}
          <span className="hint">Text size for tasks</span>
        </span>
      )}
    </span>
  );
}

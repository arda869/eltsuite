import { useEffect, useRef, useState } from 'react';
import { useAuth, type Reading, type TextSize } from '../lib/auth';
import { IconBtn } from './UiIcon';

// Per-person text size for tasks, saved to their profile.
export function TextSizeControl() {
  const { profile, setTextSize, setReading } = useAuth();
  const r: Reading = profile?.reading ?? {};
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
      <IconBtn icon="textSize" label="Text size and reading" active={open} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} />
      {open && (
        <span className="ts-pop" role="dialog" aria-label="Text size and reading">
          <span className="rd-title">Text size for tasks</span>
          <span className="ts-sizes" role="radiogroup" aria-label="Text size">
            {(['S', 'M', 'L', 'XL'] as TextSize[]).map((t, i) => (
              <button key={t} type="button" role="radio" aria-checked={cur === t} aria-label={{ S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' }[t]} className={cur === t ? 'on' : ''} onClick={() => setTextSize(t)} style={{ fontSize: 12 + i * 3 }}>
                Aa
              </button>
            ))}
          </span>
          <span className="rd-opts">
            <span className="rd-title">Reading comfort</span>
            <label className="pop-check">
              <input type="checkbox" checked={r.font === 'clear'} onChange={() => setReading({ font: r.font === 'clear' ? 'default' : 'clear' })} />
              Clearer font (dyslexia-friendly)
            </label>
            <label className="pop-check">
              <input type="checkbox" checked={!!r.focus} onChange={() => setReading({ focus: !r.focus })} />
              Line focus (dims everything but the paragraph you point at)
            </label>
            <label className="pop-check">
              <input type="checkbox" checked={!!r.contrast} onChange={() => setReading({ contrast: !r.contrast })} />
              High contrast
            </label>
            <span className="rd-row">
              Letter spacing
              <span className="seg small-seg" role="radiogroup">
                {(['Normal', 'Wide', 'Wider'] as const).map((l, i) => (
                  <button key={l} type="button" role="radio" aria-checked={(r.letter ?? 0) === i} className={(r.letter ?? 0) === i ? 'on' : ''} onClick={() => setReading({ letter: i as 0 | 1 | 2 })}>
                    {l}
                  </button>
                ))}
              </span>
            </span>
            <span className="rd-row">
              Line spacing
              <span className="seg small-seg" role="radiogroup">
                {(['Normal', 'Open', 'Wide'] as const).map((l, i) => (
                  <button key={l} type="button" role="radio" aria-checked={(r.line ?? 0) === i} className={(r.line ?? 0) === i ? 'on' : ''} onClick={() => setReading({ line: i as 0 | 1 | 2 })}>
                    {l}
                  </button>
                ))}
              </span>
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

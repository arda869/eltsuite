import { useEffect, useRef, useState } from 'react';
import { loadPins, openAsLearner } from '../lib/proxy';

// "View as a learner…": pick a learner and open this task in a tab signed in as them.
export function ViewAsLearner({ classId, classCode, roster, path }: { classId: string; classCode: string; roster: { id: string; name: string }[]; path: string }) {
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || pins) return;
    loadPins(classId, roster.map((r) => r.id)).then(setPins, () => setPins({}));
  }, [open, pins, classId, roster]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!roster.length) return null;
  return (
    <div className="menu-anchor" ref={ref}>
      <button type="button" className="btn block" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Open this task in a new tab, signed in as one of your learners">
        View as a learner…
      </button>
      {open && (
        <div className="menu va-menu" role="menu">
          {!pins ? (
            <span className="hint" style={{ padding: 10 }}>
              Loading…
            </span>
          ) : (
            roster.map((r) => (
              <button
                key={r.id}
                role="menuitem"
                disabled={!pins[r.id]}
                onClick={() => {
                  const ok = openAsLearner({ classId, classCode, learnerId: r.id, name: r.name, pin: pins[r.id] ?? '', path });
                  setMsg(ok ? '' : 'Your browser blocked the new tab. Allow pop-ups for this site.');
                  setOpen(false);
                }}
              >
                {r.name}
              </button>
            ))
          )}
        </div>
      )}
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

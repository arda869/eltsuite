import { useEffect, useRef, useState } from 'react';
import { loadPins, openAsLearner } from '../lib/proxy';
import { UiIcon } from './UiIcon';

// "View as a learner…": pick a learner and open this task in a tab signed in as them.
// inMenu: shown inside the mode menu, with the learners listed under it.
export function ViewAsLearner({ classId, classCode, roster, path, inMenu, list }: { classId: string; classCode: string; roster: { id: string; name: string }[]; path: string; inMenu?: boolean; list?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pins, setPins] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((!open && !list) || pins) return;
    loadPins(classId, roster.map((r) => r.id)).then(setPins, () => setPins({}));
  }, [open, pins, classId, roster]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!roster.length) return null;
  const pick = (r: { id: string; name: string }) => {
    const ok = openAsLearner({ classId, classCode, learnerId: r.id, name: r.name, pin: pins?.[r.id] ?? '', path });
    setMsg(ok ? '' : 'Your browser blocked the new tab. Allow pop-ups for this site.');
    setOpen(false);
  };
  // Just the learners, for the mode menu's "View as" list.
  if (list)
    return (
      <div className="va-list" role="group" aria-label="View as">
        {!pins ? (
          <span className="hint">Loading…</span>
        ) : (
          roster.map((r) => (
            <button key={r.id} role="menuitem" disabled={!pins[r.id]} title={pins[r.id] ? 'Opens a new tab signed in as ' + r.name : 'This learner set their own PIN, so you can’t sign in as them'} onClick={() => pick(r)}>
              {r.name}
            </button>
          ))
        )}
        {msg && <span className="hint">{msg}</span>}
      </div>
    );
  if (inMenu)
    return (
      <>
        <span className="menu-sep" aria-hidden="true" />
        <button role="menuitem" aria-expanded={open} className={open ? 'on' : ''} onClick={() => setOpen((v) => !v)}>
          <UiIcon name="groups" />
          <span className="mode-text">
            <span>View as a learner…</span>
            <span className="hint">Open this task in a new tab, signed in as one of your learners</span>
          </span>
          <span aria-hidden="true" className="mode-caret">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="va-list" role="group" aria-label="Learners">
            {!pins ? (
              <span className="hint">Loading…</span>
            ) : (
              roster.map((r) => (
                <button key={r.id} role="menuitem" disabled={!pins[r.id]} title={pins[r.id] ? undefined : 'This learner set their own PIN, so you can’t sign in as them'} onClick={() => pick(r)}>
                  {r.name}
                </button>
              ))
            )}
          </div>
        )}
        {msg && <span className="hint" style={{ padding: '4px 12px' }}>{msg}</span>}
      </>
    );
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

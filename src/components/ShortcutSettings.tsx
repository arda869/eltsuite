import { useEffect, useState } from 'react';
import { COMMANDS, comboOf, label, problemWith, resetKeys, setKey, useKeys, type CmdId } from '../lib/shortcuts';
import { openShortcuts } from './Shortcuts';

// Settings → Keyboard shortcuts: each shortcut teachers can change, with Change and Reset. Press the
// keys you want (one combination, or two keys one after the other); keys the browser keeps, or that
// are already in use, are explained instead of saved.
export function ShortcutSettings() {
  const keys = useKeys();
  const [editing, setEditing] = useState<CmdId | null>(null);
  const [got, setGot] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!editing) return;
    let t = 0;
    const save = (combo: string) => {
      const p = problemWith(combo, editing, keys);
      if (p) { setMsg(p); setGot([]); return; }
      void setKey(editing, combo);
      setEditing(null); setGot([]); setMsg('');
    };
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setEditing(null); setGot([]); setMsg(''); return; }
      const c = comboOf(e);
      if (!c) return;
      window.clearTimeout(t);
      setGot((g) => {
        const next = g.length ? [g[0], c] : [c];
        // With Ctrl, Alt or ⌘ one combination is enough; plain keys wait a moment for a second key.
        if (next.length === 2 || c.includes('Mod') || c.includes('Alt')) { window.setTimeout(() => save(next.join(' ')), 0); return next; }
        t = window.setTimeout(() => save(next.join(' ')), 1200);
        return next;
      });
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); window.clearTimeout(t); };
  }, [editing, keys]);
  const groups = ['Go to', 'Make', 'Everywhere'] as const;
  const changed = Object.keys(keys).length > 0;
  return (
    <div className="ks">
      <p className="hint ks-about">
        Press G then a letter to go somewhere, and N then a letter to make something. Change any of them here. Your browser keeps a few keys for itself (such as {label('Mod+T')} for a new tab and {label('Mod+W')} to close it), so no web page can use those. <button type="button" className="btn link" onClick={() => openShortcuts()}>See every shortcut</button>
      </p>
      {groups.map((g) => (
        <section key={g} className="ks-group">
          <h3>{g}</h3>
          {COMMANDS.filter((c) => c.group === g).map((c) => {
            const k = keys[c.id] || c.def;
            const on = editing === c.id;
            return (
              <div key={c.id} className={'ks-row' + (on ? ' on' : '')}>
                <span className="ks-what">{c.label}</span>
                <span className="ks-keys" aria-live="polite">
                  {on ? (got.length ? <kbd>{label(got.join(' '))}</kbd> : <span className="ks-wait">Press the keys…</span>) : k.split(' ').map((x, i) => <span key={i}>{i > 0 && <span className="ks-then">then</span>}<kbd>{label(x)}</kbd></span>)}
                  {keys[c.id] && !on && <span className="ks-mine">Yours</span>}
                </span>
                {on ? (
                  <button type="button" className="btn small-btn" onClick={() => { setEditing(null); setGot([]); setMsg(''); }}>Cancel</button>
                ) : (
                  <span className="ks-btns">
                    <button type="button" className="btn small-btn" onClick={() => { setEditing(c.id); setGot([]); setMsg(''); }}>Change</button>
                    {keys[c.id] && <button type="button" className="btn small-btn link" onClick={() => void setKey(c.id, null)}>Reset</button>}
                  </span>
                )}
                {on && msg && <p className="ks-msg" role="alert">{msg}</p>}
              </div>
            );
          })}
        </section>
      ))}
      {changed && <button type="button" className="btn small-btn" onClick={() => void resetKeys()}>Reset all shortcuts</button>}
    </div>
  );
}

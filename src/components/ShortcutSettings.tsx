import { useEffect, useState } from 'react';
import { COMMANDS, comboOf, fullScreenOnly, label, problemWith, resetKeys, setKey, useKeys, type CmdId } from '../lib/shortcuts';
import { lockEveryKey } from '../lib/keys';
import { openShortcuts } from './Shortcuts';

// Settings → Keyboard shortcuts: each shortcut teachers can change, with Change and Reset. Press the
// keys you want (one combination, or two keys one after the other); keys already in use are
// explained instead of saved. A key the browser keeps (Ctrl+T) never reaches a normal tab, so
// "Press it in full screen" holds every key for a moment; that shortcut then works in full screen.
export function ShortcutSettings() {
  const keys = useKeys();
  const [editing, setEditing] = useState<CmdId | null>(null);
  const [got, setGot] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [full, setFull] = useState(false);
  // Full screen with every key held, only while you press the keys.
  const pressFull = async () => {
    lockEveryKey(true);
    try { await document.documentElement.requestFullscreen(); setFull(true); }
    catch { lockEveryKey(false); setMsg('Your browser didn’t open full screen. Try another key instead.'); }
  };
  const leaveFull = () => { lockEveryKey(false); setFull(false); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) { lockEveryKey(false); setFull(false); } }; document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => {
    if (!editing) return;
    let t = 0;
    const save = (combo: string) => {
      const p = problemWith(combo, editing, keys);
      if (p) { setMsg(p); setGot([]); return; }
      void setKey(editing, combo);
      setEditing(null); setGot([]); setMsg('');
      leaveFull();
    };
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setEditing(null); setGot([]); setMsg(''); leaveFull(); return; }
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
    <div className="kys">
      <p className="hint kys-about">
        Press G then a letter to go somewhere, and N then a letter to make something. Change any of them here. Your browser keeps a few keys for itself, such as {label('Mod+T')} for a new tab. You can still use one: press it in full screen, and the shortcut works when ELT Suite is in full screen. <button type="button" className="btn link" onClick={() => openShortcuts()}>See every shortcut</button>
      </p>
      {groups.map((g) => (
        <section key={g} className="kys-group">
          <h3>{g}</h3>
          {COMMANDS.filter((c) => c.group === g).map((c) => {
            const k = keys[c.id] || c.def;
            const on = editing === c.id;
            return (
              <div key={c.id} className={'kys-row' + (on ? ' on' : '')}>
                <span className="kys-what">{c.label}</span>
                <span className="kys-keys" aria-live="polite">
                  {on ? (got.length ? <kbd>{label(got.join(' '))}</kbd> : <span className="kys-wait">Press the keys…</span>) : k.split(' ').map((x, i) => <span key={i}>{i > 0 && <span className="kys-then">then</span>}<kbd>{label(x)}</kbd></span>)}
                  {keys[c.id] && !on && <span className="kys-mine">Yours</span>}
                  {!on && fullScreenOnly(k) && <span className="kys-mine">In full screen</span>}
                </span>
                {on ? (
                  <span className="kys-btns">
                    {!full && <button type="button" className="btn small-btn" onClick={() => void pressFull()}>Press it in full screen</button>}
                    <button type="button" className="btn small-btn" onClick={() => { setEditing(null); setGot([]); setMsg(''); leaveFull(); }}>Cancel</button>
                  </span>
                ) : (
                  <span className="kys-btns">
                    <button type="button" className="btn small-btn" onClick={() => { setEditing(c.id); setGot([]); setMsg(''); }}>Change</button>
                    {keys[c.id] && <button type="button" className="btn small-btn link" onClick={() => void setKey(c.id, null)}>Reset</button>}
                  </span>
                )}
                {on && full && !msg && <p className="kys-msg">Press the keys now, such as {label('Mod+T')}. Esc goes back.</p>}
                {on && msg && <p className="kys-msg" role="alert">{msg}</p>}
              </div>
            );
          })}
        </section>
      ))}
      {changed && <button type="button" className="btn small-btn" onClick={() => void resetKeys()}>Reset all shortcuts</button>}
    </div>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { lockKeysToo, typingIn } from '../lib/keys';
import { COMMANDS, canRunHere, comboOf, keysNow, loadKeys, lockCodesNow, type Cmd } from '../lib/shortcuts';
import { newSharedDoc } from '../lib/sharedDocs';

// Runs the shortcuts teachers can change (lib/shortcuts.ts): G then H goes Home, N then D makes a
// document, and so on. Sequences wait a moment for the second key. Never while typing.
export function ShortcutRunner() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const teacher = profile?.role === 'teacher';
  useEffect(() => { if (user && teacher) void loadKeys(user.uid); }, [user?.uid, teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  // In full screen the browser hands over its own keys a teacher has used (Ctrl+T and so on).
  useEffect(() => { if (teacher) lockKeysToo(lockCodesNow); }, [teacher]);
  useEffect(() => {
    if (!teacher) return;
    let first = '';
    let timer = 0;
    const run = async (c: Cmd) => {
      if (c.id === 'copy-suite-script') { window.dispatchEvent(new Event('ll:copy-suitescript')); return; }
      if (c.make && user) {
        const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, c.make);
        return navigate('/doc/' + id);
      }
      if (c.to) navigate(c.to);
    };
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const combo = comboOf(e);
      if (!combo) return;
      const keys = keysNow();
      const bound = COMMANDS.filter((c) => c.id !== 'search').map((c) => ({ c, k: keys[c.id] || c.def }));
      const plain = !combo.includes('Mod') && !combo.includes('Alt');
      // Plain keys and sequences never while typing or in a window on top.
      if (plain && (typingIn(e.target) || document.querySelector('.scrim, [role="dialog"][aria-modal="true"]'))) { first = ''; return; }
      const seq = first ? first + ' ' + combo : combo;
      const hit = bound.find((b) => b.k === seq);
      if (hit && canRunHere(hit.k, !!document.fullscreenElement)) {
        if (hit.c.id === 'copy-suite-script' && !(document.activeElement as HTMLElement | null)?.closest('.ProseMirror')) return;
        e.preventDefault();
        first = '';
        window.clearTimeout(timer);
        void run(hit.c);
        return;
      }
      if (!first && bound.some((b) => b.k.split(' ').length > 1 && b.k.split(' ')[0] === combo)) {
        first = combo;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { first = ''; }, 1500);
        return;
      }
      first = '';
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); window.clearTimeout(timer); };
  }, [teacher, user, navigate]);
  return null;
}

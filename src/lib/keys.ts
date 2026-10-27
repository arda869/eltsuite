// Keys, the same everywhere: the Mac or Windows name of a shortcut, and a guard so that
// typing with an input method (Chinese, Japanese, Cantonese, Korean) never sends, picks or closes
// anything while a word is still being composed.

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent);

// "Mod+Shift+K" → "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere.
export function keyLabel(combo: string): string {
  const parts = combo.split('+').map((p) => p.trim());
  const mac: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↩', Up: '↑', Down: '↓', Left: '←', Right: '→', Esc: 'Esc', Backspace: '⌫' };
  const pc: Record<string, string> = { Mod: 'Ctrl', Up: '↑', Down: '↓', Left: '←', Right: '→' };
  return isMac ? parts.map((p) => mac[p] ?? p).join('') : parts.map((p) => pc[p] ?? p).join('+');
}

// True while an input method is composing: the key belongs to the IME, not to the app.
// Safari sends the Enter that confirms a word with isComposing false but keyCode 229.
export function composing(e: KeyboardEvent | { nativeEvent: KeyboardEvent }): boolean {
  const k = 'nativeEvent' in e ? e.nativeEvent : e;
  return k.isComposing || (k.keyCode === 229 && GUARDED.has(k.key));
}
const GUARDED = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown']);

// Installed once (from lib/ask, which every page loads): Enter, Escape, Tab and the up and down
// arrows that belong to the IME never reach the app's own key handlers. The browser still
// confirms or cancels the word, as nothing is prevented, only stopped on the way down.
let installed = false;
export function installImeGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (composing(e)) e.stopImmediatePropagation();
    },
    true,
  );
}

// Typing in a field of its own (a question's answer box, a title): editor-wide shortcuts leave it alone.
export function inField(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

// Anywhere text is typed, including rich text: global keys like "?" leave it alone.
export function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// A mouse or trackpad (not only a touch screen): fields may take the focus when a panel opens.
// On phones and tablets that would pop the keyboard up over what people came to see.
export const autoFocusOk = typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches;

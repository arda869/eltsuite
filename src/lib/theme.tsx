import { useEffect, useState } from 'react';

// Light, dark, or the same as the device. Kept on this device.
export type ThemePref = 'light' | 'dark' | 'auto';
const KEY = 'll.theme';
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');
export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
export function applyTheme(p = themePref()) {
  const dark = p === 'dark' || (p === 'auto' && mq().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function startTheme() {
  applyTheme();
  mq().addEventListener('change', () => applyTheme());
  // A change in another tab or window applies here at once.
  window.addEventListener('storage', (e) => e.key === KEY && (applyTheme(), listeners.forEach((f) => f(themePref()))));
}
const listeners = new Set<(p: ThemePref) => void>();
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [p, setP] = useState<ThemePref>(themePref);
  useEffect(() => applyTheme(p), [p]);
  useEffect(() => {
    listeners.add(setP);
    return () => void listeners.delete(setP);
  }, []);
  return [
    p,
    (v) => {
      try {
        localStorage.setItem(KEY, v);
      } catch {
        /* fine */
      }
      listeners.forEach((f) => f(v));
      setP(v);
    },
  ];
}

// The three choices, for account menus.
export function ThemeChoice() {
  const [p, set] = useThemePref();
  return (
    <span className="theme-choice" role="radiogroup" aria-label="Appearance">
      <span className="hint">Appearance</span>
      <span className="seg small-seg">
        {(
          [
            ['light', 'Light'],
            ['dark', 'Dark'],
            ['auto', 'Device'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={p === k} className={p === k ? 'on' : ''} onClick={() => set(k)}>
            {l}
          </button>
        ))}
      </span>
    </span>
  );
}

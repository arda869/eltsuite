export type ThemeKey = 'flame' | 'ochre' | 'clay' | 'plum' | 'slate' | 'teal' | 'graphite';

export const THEMES: { key: ThemeKey; name: string; accent: string; text: string }[] = [
  { key: 'flame', name: 'Flame', accent: '#d98f63', text: '#975f40' },
  { key: 'ochre', name: 'Ochre', accent: '#c9a15b', text: '#876a2b' },
  { key: 'clay', name: 'Clay', accent: '#b98a74', text: '#8a5f4c' },
  { key: 'plum', name: 'Plum', accent: '#9a7fb0', text: '#6f5687' },
  { key: 'slate', name: 'Slate', accent: '#7a8fb3', text: '#526891' },
  { key: 'teal', name: 'Teal', accent: '#5f9ea0', text: '#3c7577' },
  { key: 'graphite', name: 'Graphite', accent: '#7a7a7a', text: '#4f4f4f' },
];

export const theme = (key?: string) => THEMES.find((t) => t.key === key) ?? THEMES[0];

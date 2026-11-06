export const MARK_COLORS: { k: string; bg: string; label: string }[] = [
  { k: 'yellow', bg: 'rgba(255, 214, 64, .42)', label: 'Yellow' },
  { k: 'green', bg: 'rgba(110, 200, 130, .38)', label: 'Green' },
  { k: 'blue', bg: 'rgba(100, 160, 240, .34)', label: 'Blue' },
  { k: 'pink', bg: 'rgba(240, 120, 170, .34)', label: 'Pink' },
];
export const INK_COLORS: { k: string; c: string; label: string }[] = [
  { k: 'ink', c: '#23211d', label: 'Black' },
  { k: 'blue', c: '#2b4c9e', label: 'Blue' },
  { k: 'plum', c: '#7a4fa3', label: 'Purple' },
  { k: 'amber', c: '#c07a12', label: 'Amber' },
];
// A colour of its own: each person's colour (as in the document), for drawing together.
export const inkColor = (k: string) => (k.startsWith('#') ? k : INK_COLORS.find((c) => c.k === k)?.c ?? INK_COLORS[0].c);

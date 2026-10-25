// Soft fills for table cells.
export const CELL_COLORS = [
  { key: 'grey', label: 'Grey', bg: '#f1f1ef' },
  { key: 'dark', label: 'Dark grey', bg: '#e2e2df' },
  { key: 'sand', label: 'Sand', bg: '#f5efe3' },
  { key: 'sage', label: 'Sage', bg: '#e8f0e6' },
  { key: 'sky', label: 'Sky', bg: '#e6eef7' },
  { key: 'rose', label: 'Rose', bg: '#f6e7e6' },
  { key: 'lilac', label: 'Lilac', bg: '#ece6f4' },
];
export const cellBg = (k?: string) => CELL_COLORS.find((c) => c.key === k)?.bg;

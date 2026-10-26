// Labels for numbered lists: 1, 2, 3 · a, b, c · A, B, C · i, ii, iii · I, II, III.
export type ListType = '1' | 'a' | 'A' | 'i' | 'I';

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

const toRoman = (n: number) => {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
};

const fromRoman = (s: string): number | null => {
  const up = s.toUpperCase();
  if (!/^[MDCLXVI]+$/.test(up)) return null;
  let n = 0;
  let rest = up;
  for (const [v, sym] of ROMAN) while (rest.startsWith(sym)) { n += v; rest = rest.slice(sym.length); }
  return n > 0 && toRoman(n) === up ? n : null;
};

// a … z, aa, ab … (like spreadsheet columns)
const toAlpha = (n: number) => {
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(97 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
};

const fromAlpha = (s: string): number | null => {
  if (!/^[a-z]+$/i.test(s)) return null;
  let n = 0;
  for (const c of s.toLowerCase()) n = n * 26 + (c.charCodeAt(0) - 96);
  return n;
};

export const listLabel = (n: number, type: string = '1'): string => {
  if (n < 1 || type === '1') return String(n);
  if (type === 'a') return toAlpha(n);
  if (type === 'A') return toAlpha(n).toUpperCase();
  if (type === 'i') return toRoman(n).toLowerCase();
  if (type === 'I') return toRoman(n);
  return String(n);
};

// What the teacher typed in "Start at": 4 · d · D · iv · IV. Letters that are also Roman
// numerals (i, v, x, c, d …) follow the list's current style.
export const parseListStart = (raw: string, current: string = '1'): { listType: ListType; start: number } | null => {
  const s = raw.trim().replace(/[.)]$/, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 0 && n < 100000 ? { listType: '1', start: n } : null;
  }
  const upper = s === s.toUpperCase();
  const roman = fromRoman(s);
  const alpha = fromAlpha(s);
  const preferRoman = current === 'i' || current === 'I' || (s.length > 1 && roman !== null) || (s.toLowerCase() === 'i' && current !== 'a' && current !== 'A');
  if (roman !== null && (preferRoman || alpha === null)) return { listType: upper ? 'I' : 'i', start: roman };
  if (alpha !== null) return { listType: upper ? 'A' : 'a', start: alpha };
  return null;
};

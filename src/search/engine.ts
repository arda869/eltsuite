// Finding things: every word typed must be found (at the start of a word, or anywhere in a longer
// word), in the name first. Names count more than text, whole names more than parts, and newer
// things a little more. Accents and case do not matter.

export type Group = 'Apps' | 'Files' | 'Messages' | 'Chats' | 'Classes' | 'Lessons' | 'Learners' | 'Resource Hub' | 'Help';
export type Entry = { key: string; group: Group; title: string; sub?: string; text?: string; to: string; at?: number; icon: string; external?: boolean };
export type Indexed = Entry & { nt: string; nx: string };
export type Hit = { e: Indexed; score: number; snippet?: { before: string; match: string; after: string } };

export const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"');
// The words searched: the name, then the text, then where it is (so “pdf” or a class name finds it).
export const indexed = (e: Entry): Indexed => ({ ...e, nt: norm(e.title), nx: norm([e.text ?? '', e.sub ?? ''].join('\n')) });
export const tokens = (q: string) => norm(q).split(/[^\p{L}\p{N}'@.#-]+/u).map((t) => t.replace(/^[.'-]+|[.'-]+$/g, '')).filter(Boolean);

const wordStart = (hay: string, t: string) => { let i = hay.indexOf(t); while (i >= 0) { if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1])) return i; i = hay.indexOf(t, i + 1); } return -1; };

export function search(list: Indexed[], q: string, now = Date.now()): Hit[] {
  const ts = tokens(q);
  if (!ts.length) return [];
  const phrase = norm(q.trim());
  const out: Hit[] = [];
  for (const e of list) {
    let score = 0;
    let ok = true;
    let firstText = -1, firstLen = 0;
    for (const t of ts) {
      const tw = wordStart(e.nt, t);
      if (tw >= 0) { score += tw === 0 ? 40 : 30; continue; }
      if (t.length > 2 && e.nt.includes(t)) { score += 16; continue; }
      const xw = e.nx ? wordStart(e.nx, t) : -1;
      if (xw >= 0) { score += 10; if (firstText < 0) { firstText = xw; firstLen = t.length; } continue; }
      if (t.length > 3 && e.nx.includes(t)) { score += 5; if (firstText < 0) { firstText = e.nx.indexOf(t); firstLen = t.length; } continue; }
      ok = false;
      break;
    }
    if (!ok) continue;
    if (e.nt === phrase) score += 80;
    else if (e.nt.startsWith(phrase)) score += 40;
    else if (ts.length > 1 && e.nt.includes(phrase)) score += 30;
    else if (ts.length > 1 && e.nx.includes(phrase)) { score += 15; firstText = e.nx.indexOf(phrase); firstLen = phrase.length; }
    if (e.at) score += Math.max(0, 8 - (now - e.at) / (86400000 * 30)); // up to 8 for things from the last months
    if (e.group === 'Apps') score += 6;
    const text = e.text ?? '';
    const snippet = firstText >= 0 && firstText < text.length ? cut(text, firstText, firstLen) : undefined;
    out.push({ e, score, snippet });
  }
  return out.sort((a, b) => b.score - a.score || (b.e.at ?? 0) - (a.e.at ?? 0));
}

// About a line of text around what was found. The normalised text has the same length as the
// original for nearly all text, so positions carry over.
function cut(text: string, at: number, len: number) {
  const from = Math.max(0, at - 50);
  const to = Math.min(text.length, at + len + 80);
  return { before: (from > 0 ? '…' : '') + text.slice(from, at).replace(/\s+/g, ' '), match: text.slice(at, at + len), after: text.slice(at + len, to).replace(/\s+/g, ' ') + (to < text.length ? '…' : '') };
}

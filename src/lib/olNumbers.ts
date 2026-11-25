import type { JSONContent } from '@tiptap/react';

// Numbered lists in one task carry on from each other (1–3, then 4–6), so no two questions share
// a number. A list whose first number the teacher set keeps it, and the next lists go on from there.
// Lists of letters or Roman numbers count on their own. Used by the screen and by paper alike.
export function olStarts(doc?: JSONContent | null): WeakMap<object, number> {
  const m = new WeakMap<object, number>();
  const run: Record<string, number> = {};
  const visit = (nodes?: JSONContent[]) => {
    for (const n of nodes ?? []) {
      if (n.type === 'orderedList') {
        const t = String(n.attrs?.listType ?? '1');
        const own = typeof n.attrs?.start === 'number' && n.attrs.start !== 1 ? n.attrs.start : null;
        const s = own ?? (run[t] ?? 0) + 1;
        m.set(n, s);
        run[t] = s + Math.max(1, n.content?.length ?? 1) - 1;
      } else if (n.type === 'subTask') {
        // A part (a, b) starts its own numbers.
        const saved = { ...run };
        for (const k of Object.keys(run)) delete run[k];
        visit(n.content);
        Object.assign(run, saved);
      }
    }
  };
  visit(doc?.content);
  return m;
}

// A text copied from a coursebook often brings its own question numbers (“Excuse me, ¹ ___”). We
// number questions ourselves, so a bare number written just before a gap or choice is left out:
// superscript digits (¹²³), or a run of digits in superscript, at the end of the text before it.
const INLINE_Q = new Set(['gap', 'choice', 'dropgap', 'lettergap']);
const SUP_END = /\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*$/;
export function dropSourceNumbers<T extends JSONContent | null | undefined>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc;
  const fix = (n: JSONContent): JSONContent => {
    if (!Array.isArray(n.content)) return n;
    const out: JSONContent[] = [];
    let changed = false;
    n.content.forEach((c, i) => {
      const next = n.content![i + 1];
      if (c.type === 'text' && next && INLINE_Q.has(next.type ?? '')) {
        const sup = c.marks?.some((m) => m.type === 'superscript') && /^\s*\d{1,3}\s*$/.test(c.text ?? '');
        if (sup) { changed = true; return; }
        if (SUP_END.test(c.text ?? '')) {
          changed = true;
          const t = (c.text ?? '').replace(SUP_END, ' ');
          if (t) out.push({ ...c, text: t });
          return;
        }
      }
      const f = fix(c);
      if (f !== c) changed = true;
      out.push(f);
    });
    return changed ? { ...n, content: out } : n;
  };
  return fix(doc as JSONContent) as T;
}

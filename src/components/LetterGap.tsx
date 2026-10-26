import { useRef } from 'react';

// Letter gaps: one short line for each letter of the answer, for a word or a whole sentence.
// The pattern marks each hidden letter with "_"; spaces, punctuation and any given first letters show.

export function makePattern(answer: string, firstLetter: boolean) {
  let start = true;
  return Array.from(answer.trim())
    .map((ch) => {
      const letter = /[\p{L}\p{N}]/u.test(ch);
      const out = letter ? (firstLetter && start ? ch : '_') : ch;
      start = !letter && !/['’-]/.test(ch) ? true : letter ? false : start;
      return out;
    })
    .join('');
}

// The learner's answer is stored as the full sentence: the pattern with their letters in it.
// An empty line is a space, so the string keeps its length.
export function LetterGap({ pattern, value, onChange, disabled, label, className = '' }: { pattern: string; value: string; onChange: (v: string) => void; disabled?: boolean; label: string; className?: string }) {
  const chars = Array.from(pattern);
  const typed = Array.from(value.padEnd(chars.length, ' ')).slice(0, chars.length);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const slots = chars.map((c, i) => (c === '_' ? i : -1)).filter((i) => i >= 0);
  const emit = (next: string[]) => {
    const full = chars.map((c, i) => (c === '_' ? (next[i] && next[i] !== ' ' ? next[i] : ' ') : c)).join('');
    onChange(slots.some((i) => next[i] && next[i] !== ' ') ? full : '');
  };
  const focusSlot = (k: number) => {
    const i = slots[Math.max(0, Math.min(slots.length - 1, k))];
    const el = refs.current[i];
    el?.focus();
    el?.select();
  };
  // Words stay together; the line breaks between them.
  const words: number[][] = [];
  let cur: number[] = [];
  chars.forEach((c, i) => {
    if (c === ' ') {
      if (cur.length) words.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) words.push(cur);
  return (
    <span className={'lg ' + className} role="group" aria-label={label}>
      {words.map((w, wi) => (
        <span key={wi} className="lg-word">
          {w.map((i) =>
            chars[i] === '_' ? (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                className="lg-slot"
                value={typed[i] === ' ' ? '' : typed[i]}
                disabled={disabled}
                maxLength={1}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`${label}, letter ${slots.indexOf(i) + 1} of ${slots.length}`}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const ch = Array.from(e.target.value).pop() ?? '';
                  const next = [...typed];
                  next[i] = ch || ' ';
                  emit(next);
                  if (ch) focusSlot(slots.indexOf(i) + 1);
                }}
                onKeyDown={(e) => {
                  const k = slots.indexOf(i);
                  if (e.key === 'Backspace' && (typed[i] === ' ' || !typed[i])) {
                    e.preventDefault();
                    const prev = slots[k - 1];
                    if (prev !== undefined) {
                      const next = [...typed];
                      next[prev] = ' ';
                      emit(next);
                      focusSlot(k - 1);
                    }
                  } else if (e.key === 'ArrowLeft') (e.preventDefault(), focusSlot(k - 1));
                  else if (e.key === 'ArrowRight') (e.preventDefault(), focusSlot(k + 1));
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = Array.from(e.clipboardData.getData('text').replace(/[^\p{L}\p{N}]/gu, ''));
                  const k = slots.indexOf(i);
                  const next = [...typed];
                  text.forEach((ch, n) => slots[k + n] !== undefined && (next[slots[k + n]] = ch));
                  emit(next);
                  focusSlot(k + text.length);
                }}
              />
            ) : (
              <span key={i} className="lg-given">
                {chars[i]}
              </span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}

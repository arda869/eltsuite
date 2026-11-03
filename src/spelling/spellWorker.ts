// The spelling dictionaries, in a background worker. Building an English dictionary takes a few
// seconds and finding suggestions is slow too; doing both here keeps typing and scrolling smooth
// while it happens. Nothing leaves the device: the dictionaries are the suite's own files.
import nspell from 'nspell';

type Checker = { correct: (word: string) => boolean; suggest: (word: string) => string[] };
const built = new Map<string, Promise<Checker>>();

function load(variant: string): Promise<Checker> {
  let p = built.get(variant);
  if (!p) {
    const get = (ext: string) => fetch(`/spelling/${variant}.${ext}`).then((r) => { if (!r.ok) throw Error('Dictionary unavailable'); return r.text(); });
    p = Promise.all([get('aff'), get('dic')]).then(([aff, dic]) => nspell({ aff, dic }));
    built.set(variant, p);
    p.catch(() => built.delete(variant));
  }
  return p;
}

// The page's typings, not a worker's: post replies through this.
const reply = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);

type Ask = { id: number; variant: string; words?: string[]; limit?: number };
self.onmessage = async (e: MessageEvent<Ask>) => {
  const { id, variant, words, limit = 12 } = e.data;
  try {
    const check = await load(variant);
    if (!words) { reply({ id, ok: true, wrong: [] }); return; }
    const wrong: { word: string; suggestions: string[] }[] = [];
    for (const word of words) {
      if (check.correct(word.replace(/’/g, "'"))) continue;
      wrong.push({ word, suggestions: check.suggest(word).slice(0, 5) });
      if (wrong.length >= limit) break;
    }
    reply({ id, ok: true, wrong });
  } catch {
    reply({ id, ok: false });
  }
};

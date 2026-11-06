import { useCallback, useEffect, useState } from 'react';
import { FACES, PEOPLE, POSES, THINGS, type ThingGroup } from '../storyboard/art';
import { SCENES } from '../storyboard/scenes';
import type { ArtView, El } from './model';

// The library of built-in people, things and backdrops for scenes: one list to search, with the
// teacher's favourites and the things they used last, remembered on this device.

export type Item =
  | { kind: 'person'; key: string; name: string; group: 'People'; tags: string[]; child?: boolean }
  | { kind: 'thing'; key: string; name: string; group: ThingGroup; tags: string[]; views?: ArtView[]; wide?: boolean; floats?: boolean }
  | { kind: 'scene'; key: string; name: string; group: 'Inside' | 'Outside'; tags: string[] };

const PERSON_TAGS: Record<string, string[]> = {
  maya: ['woman', 'long hair', 'adult', 'teacher'],
  leo: ['man', 'curly hair', 'adult'],
  sam: ['man', 'glasses', 'adult', 'office'],
  grace: ['woman', 'bun', 'glasses', 'adult', 'teacher', 'skirt'],
  omar: ['man', 'beard', 'adult'],
  zoe: ['girl', 'child', 'teenager', 'ponytail', 'learner'],
  nina: ['woman', 'bob', 'adult'],
  tom: ['man', 'bald', 'beard', 'older', 'adult'],
  amira: ['woman', 'hijab', 'headscarf', 'adult', 'skirt'],
  kwame: ['man', 'afro', 'adult'],
  elena: ['woman', 'grey hair', 'older', 'grandmother', 'glasses'],
  raj: ['man', 'fringe', 'glasses', 'adult', 'young'],
  ivy: ['girl', 'child', 'pigtails', 'young learner', 'daughter'],
  milo: ['boy', 'child', 'young learner', 'son'],
};

export const ITEMS: Item[] = [
  ...Object.entries(PEOPLE).map(([key, p]) => ({ kind: 'person' as const, key, name: p.name, group: 'People' as const, tags: PERSON_TAGS[key] ?? [], child: (p.scale ?? 1) < 0.85 })),
  ...Object.entries(THINGS).map(([key, t]) => ({ kind: 'thing' as const, key, name: t.name, group: t.group, tags: t.tags ?? [], views: t.views, wide: t.wide, floats: t.floats })),
  ...Object.entries(SCENES).filter(([k]) => k !== 'plain').map(([key, s]) => ({ kind: 'scene' as const, key, name: s.name, group: s.group, tags: s.tags })),
];
export const GROUPS: string[] = [...new Set(ITEMS.map((i) => i.group))];
export const POSE_KEYS = Object.keys(POSES);
export const FACE_KEYS = Object.keys(FACES);

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Matches names, groups and search terms; a word matches the start of any word.
export function search(q: string, list: Item[] = ITEMS): Item[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list
    .map((it) => {
      const hay = [it.name, it.group, ...it.tags].map(norm);
      let score = 0;
      for (const w of words) {
        if (norm(it.name).startsWith(w)) score += 3;
        else if (hay.some((h) => h.split(/[\s,]+/).some((p) => p.startsWith(w)))) score += 1;
        else return null;
      }
      return { it, score };
    })
    .filter((x): x is { it: Item; score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name))
    .map((x) => x.it);
}

export const itemId = (it: Pick<Item, 'kind' | 'key'>) => `${it.kind}:${it.key}`;

// Remembered on this device, like the rest of the Designer's preferences.
const FAV = 'designer-favourites';
const RECENT = 'designer-recents';
const read = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const write = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    window.dispatchEvent(new Event('designer-library'));
  } catch {
    // Nothing kept: the library still works.
  }
};

export function useLibraryMemory() {
  const [fav, setFav] = useState<string[]>(() => read(FAV));
  const [recent, setRecent] = useState<string[]>(() => read(RECENT));
  useEffect(() => {
    const f = () => (setFav(read(FAV)), setRecent(read(RECENT)));
    window.addEventListener('designer-library', f);
    window.addEventListener('storage', f);
    return () => (window.removeEventListener('designer-library', f), window.removeEventListener('storage', f));
  }, []);
  const toggleFav = useCallback((id: string) => {
    const cur = read(FAV);
    write(FAV, cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 60));
  }, []);
  const used = useCallback((id: string) => {
    const cur = read(RECENT).filter((x) => x !== id);
    write(RECENT, [id, ...cur].slice(0, 24));
  }, []);
  return { fav, recent, toggleFav, used };
}

// What goes on the page for a library item, before it is placed and sized (see scene.ts).
export function elFor(it: Item, accent?: string): Partial<El> | null {
  if (it.kind === 'person') return { t: 'art', art: 'person', ref: it.key, pose: 'stand', face: 'happy', view: 'front', name: it.name, ground: true, ...(accent ? { accent } : {}) };
  if (it.kind === 'thing') return { t: 'art', art: 'thing', ref: it.key, name: it.name, ground: !it.floats, ...(it.views?.length ? { view: it.views[0] } : {}), ...(accent ? { accent } : {}) };
  return null;
}

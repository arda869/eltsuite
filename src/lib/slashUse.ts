import { doc, getDoc, increment, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// How often each teacher uses each / command, so the menu can lead with their favourites.
// Kept on their user record (so it follows them to other devices) and cached on this device.

let counts: Record<string, number> | null = null;
let loadedFor = '';
const KEY = 'll.slashUse';

function local(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function slashCounts(): Record<string, number> {
  const uid = auth.currentUser?.uid ?? '';
  if (!counts) counts = local();
  if (uid && loadedFor !== uid) {
    loadedFor = uid;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        const remote = (s.data()?.slashUse ?? {}) as Record<string, number>;
        counts = { ...local(), ...remote };
        try {
          localStorage.setItem(KEY, JSON.stringify(counts));
        } catch {
          /* fine */
        }
      })
      .catch(() => {});
  }
  return counts;
}

export function noteSlash(key: string) {
  const c = slashCounts();
  c[key] = (c[key] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* fine */
  }
  const uid = auth.currentUser?.uid;
  if (uid) void setDoc(doc(db, 'users', uid), { slashUse: { [key]: increment(1) } }, { merge: true }).catch(() => {});
}

// The teacher's most used commands first; before there is any history, a sensible start.
const STARTERS = ['gap', 'dropdown', 'textbox', 'heading', 'image'];
export function topSlash<T extends { key: string }>(items: T[], n = 3): T[] {
  const c = slashCounts();
  const f = favAdds();
  const rank = (k: string) => (f.includes(k) ? 1e6 : 0) + (c[k] ?? 0) * 100 + (STARTERS.includes(k) ? 10 - STARTERS.indexOf(k) : 0);
  return [...items].sort((a, b) => rank(b.key) - rank(a.key)).slice(0, n);
}

// Starred elements in + Add: the teacher's favourites, shown first.
const FKEY = 'll.favAdds';
let favs: string[] | null = null;
let favsFor = '';
const favListeners = new Set<(f: string[]) => void>();
export function favAdds(): string[] {
  const uid = auth.currentUser?.uid ?? '';
  if (!favs) {
    try {
      favs = JSON.parse(localStorage.getItem(FKEY) || '[]');
    } catch {
      favs = [];
    }
  }
  if (uid && favsFor !== uid) {
    favsFor = uid;
    getDoc(doc(db, 'users', uid))
      .then((s) => {
        const remote = s.data()?.favAdds;
        if (Array.isArray(remote)) {
          favs = remote.map(String);
          try {
            localStorage.setItem(FKEY, JSON.stringify(favs));
          } catch {
            /* fine */
          }
          favListeners.forEach((f) => f(favs!));
        }
      })
      .catch(() => {});
  }
  return favs!;
}
export function onFavs(f: (v: string[]) => void) {
  favListeners.add(f);
  return () => void favListeners.delete(f);
}
export function toggleFav(key: string) {
  const cur = favAdds();
  favs = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  try {
    localStorage.setItem(FKEY, JSON.stringify(favs));
  } catch {
    /* fine */
  }
  favListeners.forEach((f) => f(favs!));
  const uid = auth.currentUser?.uid;
  if (uid) void setDoc(doc(db, 'users', uid), { favAdds: favs }, { merge: true }).catch(() => {});
}

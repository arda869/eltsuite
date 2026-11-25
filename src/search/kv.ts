// A small store in the browser (IndexedDB) for the search index, so search is quick from the first
// key press and only what changed since last time is fetched again. Kept per person.
const DB = 'elt-search';
let opened: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  opened ??= new Promise((ok) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch { ok(null); }
  });
  return opened;
}
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((ok) => {
    try {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => ok(r.result as T | undefined);
      r.onerror = () => ok(undefined);
    } catch { ok(undefined); }
  });
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((ok) => {
    try {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(value, key);
      t.oncomplete = () => ok();
      t.onerror = () => ok();
    } catch { ok(); }
  });
}

// Shared localStorage-backed store with cross-tab change events, for the mock Firebase.
type Listener = () => void;
const listeners = new Set<Listener>();
export function load<T>(key: string, empty: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : empty;
  } catch {
    return empty;
  }
}
export function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  queueMicrotask(() => listeners.forEach((l) => l()));
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
window.addEventListener('storage', () => listeners.forEach((l) => l()));

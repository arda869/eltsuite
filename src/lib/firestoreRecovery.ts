// A failed Firestore internal queue can leave every later read pending. Keep the
// persistent cache untouched; this tab can temporarily use an in-memory cache.
const KEY = 'll.firestore-memory-recovery';
let fatal = false;
let watching = false;
const listeners = new Set<() => void>();

function messageOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value ?? '');
  const e = value as { message?: unknown; reason?: unknown; cause?: unknown };
  return [e.message, e.reason, e.cause].map((part) => typeof part === 'string' ? part : '').join(' ');
}

export function isFatalFirestoreError(value: unknown): boolean {
  const message = messageOf(value);
  return (/FIRESTORE\b[\s\S]*INTERNAL ASSERTION FAILED[\s\S]*(?:b815|ca9)/i.test(message)
    || /getTargetData[\s\S]*Cannot read properties of null|Cannot read properties of null[\s\S]*getTargetData/i.test(message));
}

export function firestoreCacheFailed() { return fatal; }
export function onFirestoreCacheFailure(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function watchFirestoreCacheFailures() {
  if (watching) return;
  watching = true;
  const note = (value: unknown) => {
    if (fatal || !isFatalFirestoreError(value)) return;
    fatal = true;
    listeners.forEach((listener) => listener());
  };
  window.addEventListener('error', (event) => note(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => note(event.reason));
}

export function usingTemporaryFirestore(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; }
  catch { return false; }
}
export function openTemporaryFirestore(): boolean {
  try { sessionStorage.setItem(KEY, '1'); }
  catch { return false; }
  window.location.reload();
  return true;
}
export function retryPersistentFirestore(): boolean {
  try { sessionStorage.removeItem(KEY); }
  catch { return false; }
  window.location.reload();
  return true;
}

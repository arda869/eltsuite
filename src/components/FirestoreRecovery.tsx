import { useEffect, useRef, useState } from 'react';
import { firestoreCacheFailed, onFirestoreCacheFailure, openTemporaryFirestore, retryPersistentFirestore, usingTemporaryFirestore } from '../lib/firestoreRecovery';

export function FirestoreRecovery() {
  const [failed, setFailed] = useState(firestoreCacheFailed);
  const [temporary] = useState(usingTemporaryFirestore);
  const [storageError, setStorageError] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => onFirestoreCacheFailure(() => setFailed(true)), []);
  useEffect(() => {
    if (!failed) return;
    const backdrop = first.current?.closest('.firestore-recovery-backdrop');
    const siblings = [...(backdrop?.parentElement?.children ?? [])].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop);
    const previous = siblings.map((node) => [node, node.inert] as const);
    siblings.forEach((node) => { node.inert = true; });
    return () => { previous.forEach(([node, inert]) => { node.inert = inert; }); };
  }, [failed]);
  useEffect(() => { if (failed) first.current?.focus(); }, [failed]);

  if (failed) return (
    <div className="firestore-recovery-backdrop">
      <section className="firestore-recovery" role="alertdialog" aria-modal="true" aria-labelledby="firestore-recovery-title" aria-describedby="firestore-recovery-description">
        <span className="firestore-recovery-mark" aria-hidden="true">E</span>
        <h1 id="firestore-recovery-title">Your account couldn’t finish loading</h1>
        <p id="firestore-recovery-description">This browser’s saved connection stopped working. Your locally saved work has not been deleted.</p>
        <p>Open with a temporary connection to continue online. Your saved device cache will stay here, but it will not appear in the temporary session. Work entered while offline in that session may not survive a reload.</p>
        {storageError && <p role="alert">This browser did not allow a temporary session. Please keep this tab open and try another browser while your saved work remains here.</p>}
        <div className="firestore-recovery-actions">
          <button ref={first} type="button" className="btn primary" onClick={() => setStorageError(!openTemporaryFirestore())}>Open with temporary connection</button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Retry normal connection</button>
        </div>
      </section>
    </div>
  );
  if (!temporary) return null;
  return <aside className="firestore-temporary" role="status"><strong>Temporary connection</strong><span>Your saved device cache is preserved and temporarily out of use. Keep this tab open if you work offline.</span><button type="button" className="btn" onClick={() => setStorageError(!retryPersistentFirestore())}>Try normal connection</button>{storageError && <span>Browser storage is unavailable; this connection will remain temporary until the tab closes.</span>}</aside>;
}

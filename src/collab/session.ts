import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { RtdbProvider } from './provider';

export type CollabSession = { doc: Y.Doc; provider: RtdbProvider; pud: Y.PermanentUserData };

// A shared document and its live connection, made in an effect (React may mount twice in
// development) and closed when the component goes or opens another document.
export function useCollabSession(docKey: string, uid: string) {
  const [session, setSession] = useState<CollabSession | null>(null);
  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new RtdbProvider(docKey, doc, uid);
    const pud = new Y.PermanentUserData(doc);
    pud.setUserMapping(doc, doc.clientID, uid);
    setSession({ doc, provider, pud });
    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [docKey, uid]);
  return session;
}

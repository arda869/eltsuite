import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
export function useAiPilot() {
  const { user } = useAuth();
  const [grant, setGrant] = useState<{ uid: string; enabled: boolean } | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    setGrant(null);
    if (!uid || import.meta.env.VITE_ELT_AI_PILOT !== 'true') return;
    return onSnapshot(doc(db, 'aiPilot', uid), snap => setGrant({ uid, enabled: snap.data()?.enabled === true }), () => setGrant(null));
  }, [uid]);
  return import.meta.env.VITE_ELT_AI_PILOT === 'true' && !!uid && grant?.uid === uid && grant.enabled;
}

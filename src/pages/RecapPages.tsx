import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc } from '../lib/classes';
import { theme } from '../lib/themes';
import { Wordmark } from '../components/Wordmark';
import { TextSizeControl } from '../components/TextSizeControl';
import { RecapView } from '../components/Recap';
import { loadRecap, readShared, recapId, type Recap } from '../lib/recap';

// A learner reads a recap the teacher shared.
export function LearnerRecap() {
  const { itemId = '' } = useParams();
  const { user, profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const [c, setC] = useState<ClassDoc | null>(null);
  const [r, setR] = useState<Recap | null | undefined>(undefined);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }), () => {});
  }, [classId]);
  useEffect(() => {
    if (!classId || !user) return;
    loadRecap(classId, recapId(itemId, user.uid)).then(setR, () => setR(null));
  }, [classId, itemId, user]);
  const t = theme(c?.themeColor);
  if (!user || profile?.role !== 'learner') return null;
  return (
    <div className="shell narrow" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">{c?.name ?? 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">Recap</span>
        </nav>
        <span className="right">
          <TextSizeControl />
        </span>
      </header>
      <main>
        {r === undefined ? <p className="hint">Loading…</p> : r === null || r.status !== 'shared' ? <p className="placeholder">This recap is not available yet.</p> : <RecapView r={r} learnerLinks />}
      </main>
    </div>
  );
}

// A parent opens a recap from a private link, without signing in.
export function SharedRecap() {
  const { token = '' } = useParams();
  const [r, setR] = useState<Awaited<ReturnType<typeof readShared>> | undefined>(undefined);
  useEffect(() => {
    readShared(token).then(setR, () => setR(null));
  }, [token]);
  return (
    <div className="shell narrow">
      <header className="topbar">
        <Wordmark />
      </header>
      <main>
        {r === undefined ? <p className="hint">Loading…</p> : r === null ? <p className="placeholder">This link does not work any more. Ask the teacher for a new one.</p> : <RecapView r={r} />}
        <p className="hint" style={{ marginTop: 24 }}>
          Shared privately by the teacher with Lesson Lit. Please don’t pass the link on.
        </p>
      </main>
    </div>
  );
}

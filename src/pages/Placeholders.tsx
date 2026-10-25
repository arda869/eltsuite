import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ClassDoc } from '../lib/classes';
import { theme } from '../lib/themes';
import { TopBar } from '../components/TopBar';
import { Wordmark } from '../components/Wordmark';

export function ClassComingSoon() {
  const { classId = '' } = useParams();
  const [c, setC] = useState<ClassDoc | null | undefined>(undefined);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'classes', classId),
        (s) => setC(s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }) : null),
        () => setC(null),
      ),
    [classId],
  );

  const t = theme(c?.themeColor);
  return (
    <div className="shell" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <TopBar>
        <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 8, color: '#737373' }}>
          <Link to="/" style={{ color: '#737373', textDecoration: 'none' }}>
            Classes
          </Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{c?.name ?? '…'}</span>
        </nav>
      </TopBar>
      {c === null ? (
        <p className="placeholder">This class could not be found.</p>
      ) : c ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 className="page-title">{c.name}</h1>
          <span className="sub">
            {c.level} · Class code <strong style={{ letterSpacing: '0.08em', color: 'var(--ink)' }}>{c.classCode}</strong>
          </span>
          <p className="placeholder">The class page with lessons, topics and learners is the next part to be built.</p>
        </div>
      ) : (
        <span className="sub">Loading…</span>
      )}
    </div>
  );
}

export function LearnerJoinComingSoon() {
  return (
    <div className="signin">
      <div className="intro">
        <Wordmark big />
        <p>Learner sign-in, with your class code, name and PIN, is coming very soon.</p>
      </div>
      <div className="card">
        <h1>Join your class</h1>
        <span className="hint">Your teacher will give you a class code and a PIN when your class is ready.</span>
        <Link to="/" className="small">
          I am a teacher
        </Link>
      </div>
    </div>
  );
}

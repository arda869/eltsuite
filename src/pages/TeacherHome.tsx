import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc } from '../lib/classes';
import { theme } from '../lib/themes';
import { TopBar } from '../components/TopBar';
import { NewClassDialog } from '../components/NewClassDialog';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function TeacherHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }))),
      (e) => {
        console.error(e);
        setError('Your classes could not be loaded. Please refresh the page.');
        setClasses([]);
      },
    );
  }, [user]);

  const active = useMemo(
    () =>
      (classes ?? [])
        .filter((c) => c.status === 'active')
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now())),
    [classes],
  );
  const archivedCount = (classes ?? []).filter((c) => c.status === 'archived').length;
  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const firstName = (user?.displayName || user?.email?.split('@')[0] || '').split(' ')[0];

  return (
    <div className="shell">
      <TopBar>
        <nav aria-label="Main">
          <Link to="/" className="on">
            Classes
          </Link>
        </nav>
      </TopBar>

      <div className="home">
        <main>
          <div className="row-between" style={{ alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 className="page-title">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </h1>
              {classes && active.length > 0 && (
                <span className="sub">
                  {active.length} {active.length === 1 ? 'class' : 'classes'} · {learners} {learners === 1 ? 'learner' : 'learners'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {archivedCount > 0 && <span className="small sub">Archived classes ({archivedCount})</span>}
              {active.length > 0 && (
                <button className="btn" onClick={() => setCreating(true)}>
                  + New class
                </button>
              )}
            </div>
          </div>

          {error && <span className="error">{error}</span>}

          {classes === null ? (
            <span className="sub">Loading your classes…</span>
          ) : active.length === 0 ? (
            <div className="empty">
              <h2>Create your first class</h2>
              <p>A class holds your lessons, homework and learners. Learners join with a class code and a PIN, so they don’t need an email.</p>
              <button className="btn primary" onClick={() => setCreating(true)}>
                + New class
              </button>
            </div>
          ) : (
            <div className="classes">
              {active.map((c) => {
                const t = theme(c.themeColor);
                return (
                  <Link key={c.id} to={`/class/${c.id}`} className="class-card">
                    <span className="name">
                      <span className="dot" style={{ background: t.accent }} />
                      {c.name}
                      <span className="level">{c.level}</span>
                    </span>
                    <span className="meta">
                      {c.learnerCount ?? 0} {(c.learnerCount ?? 0) === 1 ? 'learner' : 'learners'} · no lessons yet
                    </span>
                    <span className="code">Class code {c.classCode}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {creating && user && (
        <NewClassDialog
          teacherId={user.uid}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            navigate(`/class/${id}`);
          }}
        />
      )}
    </div>
  );
}

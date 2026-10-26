import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { updateClass, type ClassDoc, type Item } from '../lib/classes';
import { isLive, liveRef, type LiveState } from '../lib/live';
import { theme } from '../lib/themes';
import { DELETE_AFTER_DAYS, purgeClass, restoreClass } from '../lib/deletion';
import { createDemoClass } from '../lib/demo';
import { acceptInvite, declineInvite, emailKey, syncLiveTeachers, useInvites, useTeacherClasses } from '../lib/coteach';
import { TopBar } from '../components/TopBar';
import { NewClassDialog } from '../components/NewClassDialog';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

type ItemWithTime = Item & { createdAt?: { toMillis: () => number } };

// Lessons and live state for each class on the home screen.
function useClassDetails(ids: string[]) {
  const [items, setItems] = useState<Record<string, ItemWithTime[]>>({});
  const [live, setLive] = useState<Record<string, LiveState | null>>({});
  const key = ids.join(',');
  useEffect(() => {
    const unsubs = ids.flatMap((id) => [
      onSnapshot(
        collection(db, 'classes', id, 'items'),
        (s) => setItems((m) => ({ ...m, [id]: s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ItemWithTime, 'id'>) })) })),
        () => {},
      ),
      onSnapshot(liveRef(id), (s) => setLive((m) => ({ ...m, [id]: s.exists() ? (s.data() as LiveState) : null })), () => {}),
    ]);
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { items, live };
}

export function TeacherHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [demoStep, setDemoStep] = useState('');
  async function makeDemo() {
    if (!user) return;
    try {
      const { classId } = await createDemoClass(user.uid, setDemoStep);
      navigate(`/class/${classId}`);
    } catch (e) {
      console.error(e);
      setError('The demo class could not be created. Please try again.');
    } finally {
      setDemoStep('');
    }
  }

  const mine = useTeacherClasses(user?.uid);
  const classes = mine.classes;
  useEffect(() => {
    if (mine.error) setError(mine.error);
  }, [mine.error]);
  const invites = useInvites(user?.email);
  const [inviteMsg, setInviteMsg] = useState('');
  // Keep the live database in step with the co-teacher list for the classes I own.
  useEffect(() => {
    for (const c of classes ?? []) if (c.teacherId === user?.uid && c.coTeachers && Object.keys(c.coTeachers).length) syncLiveTeachers(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((classes ?? []).map((c) => [c.id, c.coTeachers ?? null]))]);

  const byNewest = (a: ClassDoc, b: ClassDoc) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now());
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active').sort(byNewest), [classes]);
  const archived = useMemo(() => (classes ?? []).filter((c) => c.status === 'archived').sort(byNewest), [classes]);
  const deleted = useMemo(() => (classes ?? []).filter((c) => c.status === 'deleted'), [classes]);
  const daysLeft = (c: ClassDoc) => Math.max(0, DELETE_AFTER_DAYS - Math.floor((Date.now() - (c.deletedAt?.toMillis?.() ?? Date.now())) / 86400000));
  const [purging, setPurging] = useState('');
  // Classes deleted more than 30 days ago are removed for good.
  useEffect(() => {
    const due = deleted.filter((c) => daysLeft(c) === 0 && c.deletedAt);
    if (!due.length || purging) return;
    (async () => {
      for (const c of due) {
        setPurging(c.name);
        await purgeClass(c).catch((e) => console.error(e));
      }
      setPurging('');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleted.length]);
  const { items, live } = useClassDetails(active.map((c) => c.id));

  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const firstName = (user?.displayName || user?.email?.split('@')[0] || '').split(' ')[0];

  // The lesson to show at the top: one being taught now, otherwise the newest lesson.
  const liveClass = active.find((c) => isLive(live[c.id]));
  const featured = useMemo(() => {
    if (liveClass) {
      const it = items[liveClass.id]?.find((i) => i.id === live[liveClass.id]?.itemId);
      if (it) return { c: liveClass, item: it, isLive: true };
    }
    let best: { c: ClassDoc; item: ItemWithTime; t: number } | null = null;
    for (const c of active)
      for (const it of items[c.id] ?? []) {
        const t = it.createdAt?.toMillis?.() ?? 0;
        if (!best || t > best.t) best = { c, item: it, t };
      }
    return best ? { c: best.c, item: best.item, isLive: false } : null;
  }, [active, items, live, liveClass]);

  const attention = active.flatMap((c) => {
    const out: { title: string; sub: string; to: string }[] = [];
    if (!c.learnerCount) out.push({ title: 'Add learners', sub: `${c.name} · no learners yet`, to: `/class/${c.id}` });
    if (items[c.id] && items[c.id].length === 0) out.push({ title: 'Add a first lesson', sub: `${c.name} · no lessons yet`, to: `/class/${c.id}` });
    return out;
  });

  return (
    <div className="shell narrow">
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
              {archived.length > 0 && (
                <button className="btn link small" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? 'Hide archived classes' : `Archived classes (${archived.length})`}
                </button>
              )}
              {active.length > 0 && !active.some((c) => c.name === 'Demo class') && (
                <button className="btn link small" disabled={!!demoStep} onClick={makeDemo}>
                  {demoStep ? demoStep + '…' : 'Add a demo class'}
                </button>
              )}
              {active.length > 0 && (
                <button className="btn" onClick={() => setCreating(true)}>
                  + New class
                </button>
              )}
            </div>
          </div>

          {error && <span className="error">{error}</span>}

          {invites.length > 0 && user && (
            <section className="invite-card" aria-label="Invitations">
              <span className="eyebrow" style={{ fontSize: 11 }}>
                You are invited
              </span>
              {invites.map((c) => {
                const inv = c.invites?.[emailKey(user.email ?? '')];
                return (
                  <div key={c.id} className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <span>
                      <strong>{c.name}</strong> <span className="hint">· {inv?.by ?? 'A teacher'} invited you as {inv?.role === 'viewer' ? 'a viewer' : 'a co-teacher'}</span>
                    </span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn small-btn" onClick={() => declineInvite(c, user.email ?? '').catch((e) => setInviteMsg((e as Error).message))}>
                        Decline
                      </button>
                      <button type="button" className="btn small-btn primary" onClick={() => acceptInvite(c, { uid: user.uid, email: user.email ?? '', name: user.displayName || user.email?.split('@')[0] || 'Teacher' }).catch((e) => setInviteMsg((e as Error).message))}>
                        Accept
                      </button>
                    </span>
                  </div>
                );
              })}
              {inviteMsg && <span className="error">{inviteMsg}</span>}
            </section>
          )}

          {featured && (
            <section
              className="live-card"
              style={{ ['--accent' as string]: theme(featured.c.themeColor).accent, ['--accent-text' as string]: theme(featured.c.themeColor).text }}
              aria-label={featured.isLive ? 'Teaching now' : 'Latest lesson'}
            >
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="eyebrow accent" style={{ letterSpacing: '0.2em' }}>
                  {featured.isLive ? 'Teaching now' : 'Latest lesson'}
                </span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500 }}>{featured.item.title}</span>
                <span className="hint">
                  {featured.c.name} · {featured.c.learnerCount ?? 0} {(featured.c.learnerCount ?? 0) === 1 ? 'learner' : 'learners'}
                </span>
              </span>
              {featured.c.meeting?.url && (
                <a className="btn" href={featured.c.meeting.url} target="_blank" rel="noopener noreferrer">
                  Open call
                </a>
              )}
              <Link className="btn" to={`/class/${featured.c.id}/lesson/${featured.item.id}`}>
                Edit lesson
              </Link>
              <Link className="btn primary" to={`/class/${featured.c.id}/lesson/${featured.item.id}?teach=1`}>
                {featured.isLive ? 'Back to lesson' : 'Start teaching'}
              </Link>
            </section>
          )}

          {classes === null ? (
            <span className="sub">Loading your classes…</span>
          ) : active.length === 0 ? (
            <div className="empty">
              <h2>Create your first class</h2>
              <p>A class holds your lessons, homework and learners. Learners join with a class code and a PIN, so they don’t need an email.</p>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={() => setCreating(true)}>
                  + New class
                </button>
                <button className="btn" disabled={!!demoStep} onClick={makeDemo}>
                  {demoStep ? demoStep + '…' : 'Try a demo class'}
                </button>
              </span>
              <span className="hint">The demo class has 6 learners and a sample lesson that uses every question type.</span>
            </div>
          ) : (
            <div className="classes">
              {active.map((c) => {
                const t = theme(c.themeColor);
                const list = items[c.id] ?? [];
                const lessons = list.filter((i) => i.type === 'lesson').length;
                const teaching = isLive(live[c.id]);
                return (
                  <Link key={c.id} to={`/class/${c.id}`} className="class-card" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
                    <span className="name">
                      <span className="dot" style={{ background: t.accent }} />
                      {c.name}
                      <span className="level">{c.level}</span>
                    </span>
                    <span className="meta">
                      {c.learnerCount ?? 0} {(c.learnerCount ?? 0) === 1 ? 'learner' : 'learners'}
                    </span>
                    <span className="meta">
                      {teaching ? <span style={{ color: t.text, fontWeight: 600 }}>Teaching now</span> : lessons ? `${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}` : 'No lessons yet'}
                    </span>
                    <span className="code">{c.teacherId !== user?.uid ? (c.coTeachers?.[user?.uid ?? '']?.role === 'viewer' ? 'Viewer · shared with you' : 'Co-teacher · shared with you') : `Class code ${c.classCode}`}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {deleted.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="eyebrow" style={{ fontSize: 11 }}>
                Recently deleted
              </span>
              {purging && <span className="hint">Removing {purging} for good…</span>}
              {deleted.map((c) => (
                <div key={c.id} className="row-between" style={{ maxWidth: 640 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--muted)' }}>{c.name}</span>
                    <span className="hint">removed for good in {daysLeft(c)} {daysLeft(c) === 1 ? 'day' : 'days'}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small-btn" onClick={() => restoreClass(c)}>
                      Restore
                    </button>
                    <button
                      className="btn small-btn danger"
                      disabled={!!purging}
                      onClick={async () => {
                        if (!window.confirm(`Remove ${c.name} for good now? This can't be undone.`)) return;
                        setPurging(c.name);
                        await purgeClass(c).catch((e) => console.error(e));
                        setPurging('');
                      }}
                    >
                      Delete now
                    </button>
                  </span>
                </div>
              ))}
            </section>
          )}

          {showArchived && archived.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="eyebrow" style={{ fontSize: 11 }}>
                Archived
              </span>
              {archived.map((c) => (
                <div key={c.id} className="row-between" style={{ maxWidth: 640 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <Link to={`/class/${c.id}`} style={{ fontFamily: 'var(--serif)', fontSize: 14, textDecoration: 'none' }}>
                      {c.name}
                    </Link>
                    <span className="class-card-level">{c.level}</span>
                  </span>
                  <button className="btn small-btn" onClick={() => updateClass(c, { status: 'active' })}>
                    Restore
                  </button>
                </div>
              ))}
            </section>
          )}
        </main>

        {active.length > 0 && (
          <aside className="attention" aria-label="Needs your attention">
            <h2>Needs your attention</h2>
            {attention.length === 0 ? (
              <span className="hint">Nothing right now.</span>
            ) : (
              attention.slice(0, 6).map((a, i) => (
                <Link key={i} to={a.to} className="attention-item">
                  <strong>{a.title}</strong>
                  <span className="hint">{a.sub}</span>
                </Link>
              ))
            )}
          </aside>
        )}
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

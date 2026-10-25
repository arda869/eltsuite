import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc, Item, Topic } from '../lib/classes';
import { theme } from '../lib/themes';
import { isLive, liveRef, type LiveState } from '../lib/live';
import { usePresenceBeat } from '../lib/presence';
import { Wordmark } from '../components/Wordmark';
import { initials } from '../components/TopBar';

export function LearnerHome({ classId, name }: { classId: string; name: string }) {
  const { signOutNow, user, profile } = useAuth();
  usePresenceBeat(classId, user?.uid, { name, learnerId: profile?.role === 'learner' ? profile.learnerId : '', itemId: '', taskId: '' });
  const [c, setC] = useState<ClassDoc | null | undefined>(undefined);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [menu, setMenu] = useState(false);
  const [live, setLiveState] = useState<LiveState | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'classes', classId), (s) => setC(s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }) : null), () => setC(null)),
      onSnapshot(collection(db, 'classes', classId, 'topics'), (s) => setTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic)), () => {}),
      onSnapshot(collection(db, 'classes', classId, 'items'), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)), () => {}),
    ];
    unsubs.push(onSnapshot(liveRef(classId), (s) => setLiveState(s.exists() ? (s.data() as LiveState) : null), () => {}));
    return () => unsubs.forEach((u) => u());
  }, [classId]);

  const t = theme(c?.themeColor);
  const visible = items.filter((i) => !i.hidden);
  const groups = [...topics]
    .sort((a, b) => a.order - b.order)
    .map((tp) => ({ tp, list: visible.filter((i) => i.topicId === tp.id).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.list.length > 0);
  const firstName = name.split(' ')[0];
  const liveNow = isLive(live) ? items.find((i) => i.id === live!.itemId) : undefined;
  const showCall = !!c?.meeting?.url && (c.meeting.visibility === 'always' || !!liveNow);

  return (
    <div className="shell" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <header className="topbar">
        <Wordmark />
        <span className="sub">{c?.name ?? ''}</span>
        <div className="right">
          <button className="avatar" style={{ background: '#eef4ef', color: '#4e6b55' }} aria-label="Account" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {initials(name)}
          </button>
          {menu && (
            <div className="menu" role="menu">
              <div className="who">
                <strong>{name}</strong>
                <span className="hint">{c?.name}</span>
              </div>
              <button role="menuitem" onClick={signOutNow}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {c === null ? (
        <p className="placeholder">You’re no longer in this class. Ask your teacher if this is a mistake.</p>
      ) : (
        <main style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 820 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 className="page-title">Hello, {firstName}</h1>
            <span className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>

          {liveNow && (
            <section className="live-card">
              <span className="live-dot" aria-hidden="true" />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow accent">Live now</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{liveNow.title}</span>
                <span className="hint">{live?.teacherName ?? 'Your teacher'} is teaching</span>
              </span>
              {showCall && (
                <a className="btn" href={c!.meeting!.url} target="_blank" rel="noopener noreferrer">
                  Join call
                </a>
              )}
              <Link className="btn primary" to={`/learn/${liveNow.id}`}>
                Join lesson
              </Link>
            </section>
          )}

          {showCall && !liveNow && (
            <section className="live-card">
              <span className="live-dot" aria-hidden="true" />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow accent">Class call</span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>{c?.name}</span>
              </span>
              <a className="btn primary" href={c!.meeting!.url} target="_blank" rel="noopener noreferrer">
                Join call
              </a>
            </section>
          )}

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 16 }}>Lessons and work</h2>
            {groups.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>
                Your teacher hasn’t shared any lessons yet. They will appear here.
              </p>
            ) : (
              groups.map(({ tp, list }) => (
                <div key={tp.id} className="topic">
                  <div className="topic-head">
                    <span className="topic-name static">{tp.name}</span>
                  </div>
                  <ul className="items">
                    {list.map((i) => (
                      <li key={i.id} className="item">
                        <span className="type">{i.type}</span>
                        <Link to={`/learn/${i.id}`} className="title">
                          {i.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </main>
      )}
    </div>
  );
}

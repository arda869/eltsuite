import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc, Item, Topic } from '../lib/classes';
import { theme } from '../lib/themes';
import { Wordmark } from '../components/Wordmark';
import { TextSizeControl } from '../components/TextSizeControl';
import { Notebook } from '../components/Notebook';

// The learner's notebook page: class notebook, my notebook, grammar bank and vocabulary bank.
export function LearnerNotebook() {
  const { user, profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const [c, setC] = useState<ClassDoc | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [params] = useSearchParams();
  useEffect(() => {
    if (!classId) return;
    const u = [
      onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }), () => {}),
      onSnapshot(collection(db, 'classes', classId, 'topics'), (s) => setTopics(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Topic).sort((a, b) => a.order - b.order)), () => {}),
      onSnapshot(collection(db, 'classes', classId, 'items'), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Item).filter((i) => !i.hidden).sort((a, b) => a.order - b.order)), () => {}),
    ];
    return () => u.forEach((x) => x());
  }, [classId]);
  const t = theme(c?.themeColor);
  if (!user || profile?.role !== 'learner') return null;
  return (
    <div className="shell" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">{c?.name ?? 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">Notebook</span>
        </nav>
        <span className="right-push">
          <TextSizeControl />
        </span>
      </header>
      <main className="nb-page">
        <h1 className="page-title">Notebook</h1>
        <Notebook classId={classId} c={c} me={{ uid: user.uid, name: profile.displayName, learnerId: profile.learnerId, teacher: false }} items={items} topics={topics} focus={params.get('entry')} />
      </main>
    </div>
  );
}

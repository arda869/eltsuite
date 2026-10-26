import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { ClassDoc } from '../lib/classes';
import { theme } from '../lib/themes';
import { useClassmates } from '../lib/learners';
import { Wordmark } from '../components/Wordmark';
import { TextSizeControl } from '../components/TextSizeControl';
import { PhoneMessagesLink } from '../components/ChatDock';
import { DiscussionBoard } from '../components/Discussion';
import { NoticeToasts } from '../components/NoticeToasts';

// The learner's view of the class discussion board.
export function LearnerDiscussion() {
  const { tid } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const [c, setC] = useState<ClassDoc | null>(null);
  const classmates = useClassmates(c?.classCode);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(doc(db, 'classes', classId), (s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }), () => {});
  }, [classId]);
  const t = theme(c?.themeColor);
  if (!user || profile?.role !== 'learner') return null;
  // classmates come from the roster (learnerId + name); their uids are not public, so mentions resolve by name to learnerIds for notices
  const people: { uid: string; name: string; learnerId?: string }[] = [...classmates.map((m) => ({ uid: m.id === profile.learnerId ? user.uid : 'l_' + m.id, name: m.name, learnerId: m.id })), { uid: c?.teacherId ?? 'teacher', name: 'teacher' }];
  return (
    <div className="shell" style={{ ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text }}>
      <NoticeToasts classId={classId} to={profile.learnerId} link={(i, tk) => (i === 'disc' ? `/discuss/${tk}` : `/learn/${i}?task=${tk}`)} />
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </Link>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">{c?.name ?? 'Home'}</Link>
          <span aria-hidden="true">/</span>
          <span className="here">Discussion</span>
        </nav>
        <span className="right">
          <PhoneMessagesLink />
          <TextSizeControl />
        </span>
      </header>
      <main>
        {c && <DiscussionBoard c={c} me={{ uid: user.uid, name: profile.displayName, learnerId: profile.learnerId, teacher: false }} people={people} open={tid ?? null} onOpen={(id) => navigate(id ? `/discuss/${id}` : '/discuss')} threadLink={(id) => `/discuss/${id}`} />}
      </main>
    </div>
  );
}

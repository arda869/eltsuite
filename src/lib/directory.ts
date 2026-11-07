import { currentOrg } from './admin';
import { shownName, type MessagingMode } from './classes';
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { allTeacherClasses } from './coteach';
import type { ClassDoc } from './classes';
import type { Person } from './chat';

// Who I can write to, in groups: my colleagues and the learners and teachers of each class
// (for a teacher); my classmates and teachers (for a learner).

export type Directory = { me: Person; groups: { id: string; label: string; people: Person[] }[]; loading?: boolean; error?: string; retry?: () => void; learnerElements?: boolean; mode?: MessagingMode; nameFor?: (key: string, name: string) => string };

export function useDirectory(): Directory | null {
  const { user, profile } = useAuth();
  const [dir, setDir] = useState<Directory | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setDir(null);
    if (!user || !profile) return;
    let dead = false;
    (async () => {
      if (profile.role === 'learner') {
        const c = await getDoc(doc(db, 'classes', profile.classId)).catch(() => null);
        const cd = c?.data() as (ClassDoc & { teacherName?: string }) | undefined;
        // Names as the class shows them to learners; who learners may write to.
        const me: Person = { key: profile.learnerId, name: shownName(profile.displayName, profile.learnerId, cd), role: 'learner', classId: profile.classId };
        const mode: MessagingMode = cd?.messaging?.mode ?? 'free';
        const teachers: Person[] = cd ? [{ key: cd.teacherId, name: cd.teacherName || 'Your teacher', role: 'teacher' }, ...Object.entries(cd.coTeachers ?? {}).filter(([, t]) => t.role === 'co').map(([k, t]) => ({ key: k, name: t.name || 'Teacher', role: 'teacher' as const }))] : [];
        const code = cd?.classCode ? await getDoc(doc(db, 'classCodes', cd.classCode)).catch(() => null) : null;
        const roster = ((code?.data()?.roster ?? []) as { id: string; name: string }[]).filter((r) => r.id !== me.key).sort((a, b) => a.name.localeCompare(b.name));
        if (!dead)
          setDir({
            me,
            learnerElements: cd?.messaging?.learnerElements !== false,
            mode,
            nameFor: (k, n) => shownName(n, k, cd),
            groups:
              mode === 'off'
                ? []
                : [
                    { id: 'teachers', label: 'Teachers', people: teachers },
                    ...(mode === 'free' ? [{ id: profile.classId, label: cd?.name ? `${cd.name} · classmates` : 'Classmates', people: roster.map((r) => ({ key: r.id, name: shownName(r.name, r.id, cd), role: 'learner' as const, classId: profile.classId })) }] : []),
                  ],
          });
        return;
      }
      const me: Person = { key: user.uid, name: user.displayName || user.email?.split('@')[0] || 'Teacher', role: 'teacher' };
      // Existing chats can open as soon as we know who the teacher is. The contact list
      // takes longer because it includes every class roster.
      if (!dead) setDir({ me, groups: [], loading: true });
      const [classResult, colleagueResult] = await Promise.allSettled([allTeacherClasses(user.uid), getDocs(collection(db, 'users', user.uid, 'colleagues'))]);
      if (classResult.status === 'rejected') {
        if (!dead) setDir({ me, groups: [], error: 'We couldn’t load people from your classes.', retry: () => setAttempt((a) => a + 1) });
        return;
      }
      const classes = classResult.value;
      const cols = colleagueResult.status === 'fulfilled' ? colleagueResult.value : null;
      const groups: Directory['groups'] = [{ id: 'colleagues', label: 'Colleagues', people: (cols?.docs ?? []).map((d) => ({ key: d.id, name: String(d.data().name ?? 'Colleague'), role: 'teacher' as const })).sort((a, b) => a.name.localeCompare(b.name)) }];
      const classGroups = await Promise.all(classes.filter((x) => x.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(async (c) => {
        const ls = await getDocs(collection(db, 'classes', c.id, 'learners')).catch(() => null);
        const co = Object.entries(c.coTeachers ?? {}).filter(([k]) => k !== user.uid).map(([k, t]) => ({ key: k, name: t.name || 'Teacher', role: 'teacher' as const }));
        const owner = c.teacherId !== user.uid ? [{ key: c.teacherId, name: (c as ClassDoc & { teacherName?: string }).teacherName || 'Class teacher', role: 'teacher' as const }] : [];
        return { id: c.id, label: c.name, people: [...owner, ...co, ...(ls?.docs ?? []).map((d) => ({ key: d.id, name: String(d.data().displayName ?? 'Learner'), role: 'learner' as const, classId: c.id })).sort((a, b) => a.name.localeCompare(b.name))] };
      }));
      if (!dead) setDir({ me, groups: [...groups, ...classGroups], loading: false });
    })();
    return () => {
      dead = true;
    };
  }, [user, profile, attempt]);
  return dir;
}

// Who someone is, in a few words: a teacher (with their job title, in your organisation), or a
// learner and their class.
export function whoLine(dir: Directory | null | undefined, key: string | undefined, role?: 'teacher' | 'learner'): string {
  if (!key) return '';
  const all = dir?.groups.flatMap((g) => g.people.map((p) => ({ p, g }))) ?? [];
  const hit = all.find((x) => x.p.key === key);
  const r = role ?? hit?.p.role;
  if (r === 'teacher') {
    const title = currentOrg()?.teachers?.[key]?.title?.trim();
    return title ? `Teacher · ${title}` : 'Teacher';
  }
  const cls = all.find((x) => x.p.key === key && x.p.classId && x.g.id !== 'colleagues')?.g.label.replace(/ · classmates$/, '');
  return cls && cls !== 'Classmates' ? `Learner · ${cls}` : 'Learner';
}

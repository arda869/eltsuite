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

export type Directory = { me: Person; groups: { id: string; label: string; people: Person[] }[]; learnerElements?: boolean; mode?: MessagingMode; nameFor?: (key: string, name: string) => string };

export function useDirectory(): Directory | null {
  const { user, profile } = useAuth();
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => {
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
      const [classes, cols] = await Promise.all([allTeacherClasses(user.uid).catch(() => [] as ClassDoc[]), getDocs(collection(db, 'users', user.uid, 'colleagues')).catch(() => null)]);
      const groups: Directory['groups'] = [{ id: 'colleagues', label: 'Colleagues', people: (cols?.docs ?? []).map((d) => ({ key: d.id, name: String(d.data().name ?? 'Colleague'), role: 'teacher' as const })).sort((a, b) => a.name.localeCompare(b.name)) }];
      for (const c of classes.filter((x) => x.status === 'active').sort((a, b) => a.name.localeCompare(b.name))) {
        const ls = await getDocs(collection(db, 'classes', c.id, 'learners')).catch(() => null);
        const co = Object.entries(c.coTeachers ?? {}).filter(([k]) => k !== user.uid).map(([k, t]) => ({ key: k, name: t.name || 'Teacher', role: 'teacher' as const }));
        const owner = c.teacherId !== user.uid ? [{ key: c.teacherId, name: (c as ClassDoc & { teacherName?: string }).teacherName || 'Class teacher', role: 'teacher' as const }] : [];
        groups.push({ id: c.id, label: c.name, people: [...owner, ...co, ...(ls?.docs ?? []).map((d) => ({ key: d.id, name: String(d.data().displayName ?? 'Learner'), role: 'learner' as const, classId: c.id })).sort((a, b) => a.name.localeCompare(b.name))] });
      }
      if (!dead) setDir({ me, groups });
    })();
    return () => {
      dead = true;
    };
  }, [user, profile]);
  return dir;
}

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTeacherClasses } from '../lib/coteach';
import { NSelect } from '../components/Select';
import type { ClassDoc, Item } from '../lib/classes';

// Who a drafted dialogue is for. A teacher picks one of their classes (and, if they like, the lesson
// it will go in), and the draft fits that class: its level, course type, age group and goals. If it
// isn't for a class, they say who it's for instead (General English, EAP, young learners…).
export type DialogueContext = { courseType: string; ageGroup: string; className?: string; lessonTitle?: string; goals?: string; needs?: string };
export const COURSE_TYPES = ['General English', 'Business English', 'Academic English (EAP)', 'Exam preparation', 'English for specific purposes'];
export const AGE_GROUPS = ['Adults', 'Young learners', 'Teenagers', 'Mixed ages'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function contextOf(c: ClassDoc, lesson?: Item): DialogueContext {
  const p = c.learningProfile;
  const course = p?.courseType === 'Academic English' ? 'Academic English (EAP)' : p?.courseType;
  return {
    courseType: course && COURSE_TYPES.includes(course) ? course : 'General English',
    ageGroup: c.lessonStyle === 'young' ? 'Young learners' : p?.ageGroup && AGE_GROUPS.includes(p.ageGroup) ? p.ageGroup : 'Adults',
    className: c.name.slice(0, 160),
    ...(lesson ? { lessonTitle: lesson.title.slice(0, 160) } : {}),
    ...(p?.goals ? { goals: p.goals.slice(0, 600) } : {}),
    ...(p?.needs ? { needs: p.needs.slice(0, 600) } : {}),
  };
}

export function DialogueAudience({ onChange, onLevel }: { onChange: (c: DialogueContext) => void; onLevel: (level: string) => void }) {
  const { user } = useAuth();
  const { classes } = useTeacherClasses(user?.uid);
  const live = (classes ?? []).filter((c) => c.status === 'active' && c.kind !== 'training').sort((a, b) => a.name.localeCompare(b.name));
  const [mode, setMode] = useState<'class' | 'audience'>('class');
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<Item[] | null>(null);
  const [itemId, setItemId] = useState('');
  const [courseType, setCourseType] = useState('General English');
  const [ageGroup, setAgeGroup] = useState('Adults');
  const chosen = live.find((c) => c.id === classId);
  // No classes yet: go straight to choosing who it's for.
  useEffect(() => { if (classes && !live.length) setMode('audience'); }, [classes, live.length]);
  // The lessons in the chosen class, for the optional lesson choice.
  useEffect(() => {
    setLessons(null); setItemId('');
    if (!classId) return;
    let gone = false;
    getDocs(collection(db, 'classes', classId, 'items')).then((s) => {
      if (!gone) setLessons(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    }, () => { if (!gone) setLessons([]); });
    return () => { gone = true; };
  }, [classId]);
  useEffect(() => {
    if (mode === 'class' && chosen) {
      onChange(contextOf(chosen, lessons?.find((l) => l.id === itemId)));
      if (CEFR.includes(chosen.level)) onLevel(chosen.level);
    } else onChange({ courseType, ageGroup });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, classId, itemId, lessons, courseType, ageGroup]);

  return (
    <fieldset className="speech-audience">
      <legend>Who is it for?</legend>
      <div className="speech-audience-switch" role="radiogroup" aria-label="Who is it for?">
        <button type="button" role="radio" aria-checked={mode === 'class'} disabled={!live.length} onClick={() => setMode('class')}>One of my classes</button>
        <button type="button" role="radio" aria-checked={mode === 'audience'} onClick={() => setMode('audience')}>Not for a class</button>
      </div>
      {mode === 'class' ? (
        <div className="speech-line-top">
          <label>Class<NSelect aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Choose a class</option>
            {live.map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` · ${c.level}` : ''}</option>)}
          </NSelect></label>
          <label>Lesson (optional)<NSelect aria-label="Lesson" value={itemId} disabled={!classId || !lessons?.length} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{!classId ? 'Choose a class first' : lessons === null ? 'One moment…' : lessons.length ? 'Any lesson' : 'No lessons yet'}</option>
            {lessons?.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </NSelect></label>
        </div>
      ) : (
        <div className="speech-line-top">
          <label>Course<NSelect aria-label="Course" value={courseType} onChange={(e) => setCourseType(e.target.value)}>{COURSE_TYPES.map((t) => <option key={t}>{t}</option>)}</NSelect></label>
          <label>Age group<NSelect aria-label="Age group" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>{AGE_GROUPS.map((t) => <option key={t}>{t}</option>)}</NSelect></label>
        </div>
      )}
      {mode === 'class' && chosen && <p className="hint">The draft fits {chosen.name}: its level, learners and goals.</p>}
    </fieldset>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useTeacherClasses } from '../../lib/coteach';
import { theme } from '../../lib/themes';
import { UiIcon } from '../../components/UiIcon';
import { MOODS, saveVersioned, wordsIn, type Entry, type Mood } from './data';
import { blankEntry } from './Journal';
import { reflectionDoc } from '../model';

// Lessons with the Companion: before (bring a lesson and choose what to work on together) and after
// (a two-minute debrief that becomes a journal entry linked to the lesson).

export type LessonPick = { classId: string; itemId: string; title: string; className: string; level: string; colour: string; at: number };

function useLessons(uid: string) {
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const [lessons, setLessons] = useState<LessonPick[] | null>(null);
  useEffect(() => {
    if (classes === null) return;
    let on = true;
    Promise.all(active.map((c) => getDocs(collection(db, 'classes', c.id, 'items')).then((s) => s.docs.filter((d) => (d.data().type ?? 'lesson') === 'lesson').map((d) => ({ classId: c.id, itemId: d.id, title: String(d.data().title || 'Untitled lesson'), className: c.name, level: c.level ?? '', colour: theme(c.themeColor).accent, at: d.data().schedule?.at ?? d.data().createdAt?.toMillis?.() ?? 0 })), () => [])))
      .then((all) => on && setLessons(all.flat().sort((a, b) => b.at - a.at)));
    return () => { on = false; };
  }, [classes, active]);
  return lessons;
}

function LessonList({ lessons, onPick, empty }: { lessons: LessonPick[] | null; onPick: (l: LessonPick) => void; empty: string }) {
  const [q, setQ] = useState('');
  if (lessons === null) return <p className="cp-empty">One moment…</p>;
  if (!lessons.length) return <p className="cp-empty">{empty}</p>;
  const s = q.trim().toLowerCase();
  const shown = lessons.filter((l) => !s || `${l.title} ${l.className}`.toLowerCase().includes(s)).slice(0, 24);
  return (
    <>
      <span className="jh-search"><UiIcon name="search" size={15} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a lesson or class" aria-label="Find a lesson or class" /></span>
      <div className="cl-list">
        {shown.map((l) => (
          <button key={l.classId + l.itemId} type="button" className="cl-lesson" style={{ ['--cc' as string]: l.colour }} onClick={() => onPick(l)}>
            <i aria-hidden="true" />
            <span><b>{l.title}</b><small>{l.className}{l.level ? ` · ${l.level}` : ''}{l.at > 0 ? ` · ${new Date(l.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</small></span>
            <UiIcon name="next" size={16} />
          </button>
        ))}
      </div>
    </>
  );
}

// What the Companion can help with, before a lesson. Each starts a conversation with the lesson attached.
const BEFORE: { k: string; title: string; about: string; prompt: (l: LessonPick) => string }[] = [
  { k: 'plan', title: 'Plan it with me', about: 'Aims, timing and flow', prompt: (l) => `Help me plan “${l.title}” for ${l.className}${l.level ? ` (${l.level})` : ''}. Check the aims, the timing and how the stages flow, and suggest one improvement.` },
  { k: 'tricky', title: 'Predict the tricky bits', about: 'Language and tasks that may cause problems', prompt: (l) => `Look at “${l.title}”. Which language, instructions or tasks are likely to cause problems for ${l.level || 'this'} learners, and how can I prepare for them?` },
  { k: 'mixed', title: 'Mixed ability', about: 'Support and stretch', prompt: (l) => `How can I adapt “${l.title}” for a mixed-ability class: support for learners who find it hard, and stretch for those who finish early?` },
  { k: 'level', title: 'Adapt for another level', about: 'Easier or harder', prompt: (l) => `Suggest how to adapt “${l.title}” for a level above and a level below ${l.level || 'its current level'}. Keep the same aims.` },
  { k: 'ccq', title: 'Check understanding', about: 'Concept questions and instruction checks', prompt: (l) => `Write concept-checking questions for the key language in “${l.title}”, and instruction-checking questions for its main tasks.` },
  { k: 'speak', title: 'More speaking', about: 'More talk, less teacher talk', prompt: (l) => `Where in “${l.title}” could learners speak more and I talk less? Suggest two or three concrete changes.` },
];

export function BringLesson({ uid, onTalk }: { uid: string; onTalk: (lesson: LessonPick, prompt: string) => void }) {
  const lessons = useLessons(uid);
  const [l, setL] = useState<LessonPick | null>(null);
  if (!l) return (
    <div className="cp-section">
      <header className="cp-head"><span className="cp-k">Before the lesson</span><h2>Bring a lesson</h2><p>Choose a lesson and what you’d like to work on. The Companion reads the lesson and suggests. Nothing changes in your lesson unless you change it.</p></header>
      <LessonList lessons={lessons} onPick={setL} empty="No lessons yet. Make one in a class and it appears here." />
    </div>
  );
  return (
    <div className="cp-section">
      <button type="button" className="cp-link cp-back" onClick={() => setL(null)}>← Choose another lesson</button>
      <header className="cp-head" style={{ ['--cc' as string]: l.colour }}><span className="cp-k">{l.className}{l.level ? ` · ${l.level}` : ''}</span><h2>{l.title}</h2><p>What would you like to work on?</p></header>
      <div className="cl-helps">
        {BEFORE.map((b) => (
          <button key={b.k} type="button" className="cl-help" onClick={() => onTalk(l, b.prompt(l))}>
            <b>{b.title}</b><span>{b.about}</span><UiIcon name="discuss" size={16} />
          </button>
        ))}
        <button type="button" className="cl-help open" onClick={() => onTalk(l, '')}><b>Something else</b><span>Ask in your own words</span><UiIcon name="discuss" size={16} /></button>
      </div>
      <a className="cp-link" href={`/class/${l.classId}/lesson/${l.itemId}`} target="_blank" rel="noopener noreferrer">Open the lesson ↗</a>
    </div>
  );
}

// After the lesson: three short steps, each with quick choices and room for a sentence.
const STEPS = [
  { k: 'went', q: 'How did it go?', chips: ['Better than planned', 'About as planned', 'It drifted', 'It didn’t work'] },
  { k: 'moment', q: 'One moment that stays with you', chips: ['A learner surprised me', 'Pair work took off', 'Instructions confused them', 'Timing ran over', 'Energy dropped', 'A great question'] },
  { k: 'next', q: 'Next time, I’ll…', chips: ['Model it first', 'Give more thinking time', 'Cut a stage', 'Check instructions', 'Add a warmer', 'Try it again'] },
] as const;

export function AfterLesson({ uid, onDone }: { uid: string; onDone: (e: Entry, talk: boolean) => void }) {
  const lessons = useLessons(uid);
  const [l, setL] = useState<LessonPick | null>(null);
  const [mood, setMood] = useState<Mood | ''>('');
  const [answers, setAnswers] = useState<Record<string, { chips: string[]; text: string }>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recent = lessons?.filter((x) => x.at <= Date.now() + 3600e3);
  if (!l) return (
    <div className="cp-section">
      <header className="cp-head"><span className="cp-k">After the lesson</span><h2>Two minutes, while it’s fresh</h2><p>Three quick steps. It goes into your journal, linked to the lesson, so you can find it when you teach it again.</p></header>
      <LessonList lessons={recent ?? null} onPick={setL} empty="No lessons yet. After you teach one, it appears here." />
    </div>
  );
  const cur = STEPS[step];
  const a = answers[cur.k] ?? { chips: [], text: '' };
  const set = (p: Partial<{ chips: string[]; text: string }>) => setAnswers((x) => ({ ...x, [cur.k]: { ...a, ...p } }));
  const finish = async (talk: boolean) => {
    setBusy(true); setError('');
    const text = STEPS.map((s) => { const x = answers[s.k]; const body = [x?.chips.join('. '), x?.text.trim()].filter(Boolean).join('. '); return body ? `${s.q}\n${body}` : ''; }).filter(Boolean).join('\n\n');
    const e = blankEntry({ title: `After ${l.title}`, text, content: reflectionDoc(text), mood, kind: 'debrief', theme: 'Lesson plan vs reality', lessonRef: { classId: l.classId, itemId: l.itemId, title: l.title, className: l.className }, words: wordsIn(text), lesson: l.title, intention: '', reality: answers.moment?.text ?? '', next: [...(answers.next?.chips ?? []), answers.next?.text ?? ''].filter(Boolean).join('. ') });
    try {
      const v = await saveVersioned(uid, 'reflections', e);
      onDone({ ...e, version: v }, talk);
    } catch { setError('We couldn’t save that just now. Check your connection and try again. Your answers are still here.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="cp-section cl-debrief">
      <button type="button" className="cp-link cp-back" onClick={() => setL(null)}>← Another lesson</button>
      <header className="cp-head" style={{ ['--cc' as string]: l.colour }}><span className="cp-k">{l.className}</span><h2>{l.title}</h2></header>
      <div className="cl-steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s.k} className={i <= step ? 'on' : ''} />)}</div>
      <section className="cl-step">
        <h3>{cur.q}</h3>
        {step === 0 && (
          <div className="jw-moods cl-moods" role="radiogroup" aria-label="How it felt">
            {MOODS.map((m) => <button key={m.k} type="button" role="radio" aria-checked={mood === m.k} className={'jw-mood' + (mood === m.k ? ' on' : '')} style={{ ['--m' as string]: m.colour }} onClick={() => setMood(mood === m.k ? '' : m.k)}><i aria-hidden="true" />{m.k[0].toUpperCase() + m.k.slice(1)}</button>)}
          </div>
        )}
        <div className="cl-chips">
          {cur.chips.map((c) => <button key={c} type="button" className={'jw-tag' + (a.chips.includes(c) ? ' on' : '')} aria-pressed={a.chips.includes(c)} onClick={() => set({ chips: a.chips.includes(c) ? a.chips.filter((x) => x !== c) : [...a.chips, c] })}>{c}</button>)}
        </div>
        <textarea className="cl-text" value={a.text} rows={3} placeholder="In your own words (optional)" aria-label={cur.q} onChange={(e) => set({ text: e.target.value })} />
      </section>
      {error && <p className="cp-error" role="alert">{error}</p>}
      <div className="cl-nav">
        {step > 0 && <button type="button" className="cp-soft" onClick={() => setStep(step - 1)}>Back</button>}
        <span style={{ flex: 1 }} />
        {step < STEPS.length - 1 ? (
          <button type="button" className="cp-primary" onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <>
            <button type="button" className="cp-soft" disabled={busy} onClick={() => void finish(false)}>Save to my journal</button>
            <button type="button" className="cp-primary" disabled={busy} onClick={() => void finish(true)}>{busy ? 'Saving…' : 'Save and talk it through'}</button>
          </>
        )}
      </div>
    </div>
  );
}

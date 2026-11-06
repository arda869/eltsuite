import { teacherPanel } from '../ai/teacherPanel';
// Questions for a live quiz, drafted by AI from a short description and, if you like, a class and a lesson.
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { AiButton } from '../components/AiMark';
import { useAiActivity } from '../components/AiActivity';
import { AI_ALLOWANCE, AiActions, AiDraft, AiExamples, AiField, AiFootnote, AiHeader, AiMore, AiNotice, AiUses, AiWorking } from '../ai/kit';
type GameRound = { id: string; prompt: string; answer: string; choices: string[] };

const EXAMPLES = [
  'A1 adults recognising places in a town',
  'Past simple irregular verbs for B1 teenagers',
  'Food and drink vocabulary for young learners',
  'Prepositions of place with classroom objects',
];

function QuizDraftPanel({ gameId, existingCount = 0, onApply }: { gameId: string; existingCount?: number; onApply: (r: GameRound[], append?: boolean) => void }) {
  const type = 'show';
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(''), [classId, setClassId] = useState(''), [lessonId, setLessonId] = useState('');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]), [lessons, setLessons] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState<GameRound[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  useAiActivity({ active: busy, title: 'Quiz questions', detail: 'Writing and checking your questions…', error });
  useEffect(() => { if (!user || !open) return; void getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid))).then(s => setClasses(s.docs.map(d => ({ id: d.id, name: d.data().name || 'Class' })))).catch(() => {}); }, [user, open]);
  useEffect(() => { setLessonId(''); setLessons([]); if (classId) void getDocs(collection(db, 'classes', classId, 'items')).then(s => setLessons(s.docs.filter(d => d.data().kind !== 'topic').map(d => ({ id: d.id, name: d.data().title || 'Lesson' })))).catch(() => {}); }, [classId]);

  const create = async () => {
    if (busy || !description.trim()) return;
    setBusy(true); setError(''); setDone('');
    try {
      const r = await httpsCallable(getFunctions(app, 'us-central1'), 'classroomGameDraft', { timeout: 300000 })({ id: gameId, type, description, classId, lessonId, requestId: crypto.randomUUID() });
      setDraft((r.data as { rounds: GameRound[] }).rounds);
    } catch (e) {
      setError((e as Error).message || 'We couldn’t write the questions just now. Try again in a moment.');
    } finally { setBusy(false); }
  };
  const use = (append: boolean) => {
    if (!draft) return;
    onApply(draft, append);
    setDone(append ? `${draft.length} questions added. Review them below, then save.` : `${draft.length} questions are in the editor. Review them below, then save.`);
    setDraft(null);
  };
  const className = classes.find(c => c.id === classId)?.name, lessonName = lessons.find(l => l.id === lessonId)?.name;

  if (!open) return <div className="game-draft game-draft-closed">
    <AiButton type="button" className="btn" onClick={() => setOpen(true)}>Write questions with AI</AiButton>
    <span className="hint">Describe what learners should practise; you’ll review every question before it goes in.</span>
    {done && <AiNotice kind="success" onDismiss={() => setDone('')}>{done}</AiNotice>}
  </div>;

  return <section className="game-draft" aria-label="Write questions with AI">
    <AiHeader level={3} title="Write questions with AI" lede="Multiple-choice questions written for the learners you describe. You review them before they go in." onClose={() => { if (!busy) setOpen(false); }} closeDisabled={busy}>
      <AiUses items={['Your description', className && `Class: ${className}`, lessonName && `Lesson: ${lessonName}`]} />
    </AiHeader>
    {!draft && <>
      <AiField label="What should learners practise?" hint="A level, who they are and the language or topic is enough.">
        <textarea value={description} disabled={busy} rows={2} maxLength={1000} onChange={e => setDescription(e.target.value)} placeholder="For example: A1 adults recognising places in a town" />
      </AiField>
      <AiExamples examples={EXAMPLES} disabled={busy} onPick={setDescription} />
      <AiMore summary={classId ? `Context: ${className || 'a class'}${lessonName ? ' · ' + lessonName : ''}` : 'Use a class or lesson for context'}>
        <div className="aik-field-row">
          <AiField label="Class" optional hint="Level and age come from the class.">
            <select value={classId} disabled={busy} onChange={e => setClassId(e.target.value)}><option value="">No class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </AiField>
          {classId && <AiField label="Lesson" optional hint="Questions follow the lesson's language.">
            <select value={lessonId} disabled={busy} onChange={e => setLessonId(e.target.value)}><option value="">No lesson</option>{lessons.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </AiField>}
        </div>
      </AiMore>
      {busy
        ? <AiWorking title="Writing and checking your questions…" detail="Each question is checked for one clear answer. Your existing questions stay as they are." />
        : <AiActions note={description.trim()?AI_ALLOWANCE:"Describe the questions or choose an example to begin."}><AiButton type="button" className="btn primary" disabled={!description.trim()} onClick={() => void create()}>Write questions</AiButton></AiActions>}
      {error && <AiNotice kind="error" action={() => void create()} actionDisabled={busy || !description.trim()}>{error} Your description is still here.</AiNotice>}
    </>}
    {draft && <AiDraft title={`${draft.length} questions`} meta={description.slice(0, 80)} actions={<>
      <button type="button" className="btn primary" onClick={() => use(false)}>{existingCount ? 'Replace my questions' : 'Use these questions'}</button>
      {existingCount > 0 && <button type="button" className="btn" onClick={() => use(true)}>Add to my questions</button>}
      <AiButton type="button" className="btn" disabled={busy} onClick={() => { setDraft(null); void create(); }}>Write another set</AiButton>
      <button type="button" className="btn link" onClick={() => setDraft(null)}>Discard</button>
    </>} note={existingCount > 0 ? `You have ${existingCount} questions already. Replace them or add these at the end; either way you can edit everything before saving.` : 'You can edit every question in the editor before saving.'}>
      <ol className="aik-items">{draft.map(r => <li key={r.id}><span>{r.prompt}<br /><span className="aik-item-answer">{r.answer}</span>{r.choices.length > 0 && <p className="aik-item-sub">Other options: {r.choices.join(' · ')}</p>}</span></li>)}</ol>
    </AiDraft>}
    {done && <AiNotice kind="success" onDismiss={() => setDone('')}>{done}</AiNotice>}
    <AiFootnote>Only your description and, if you chose them, the class level and lesson text are sent. Learners’ names are not.</AiFootnote>
  </section>;
}

export const QuizDraft = teacherPanel(QuizDraftPanel);

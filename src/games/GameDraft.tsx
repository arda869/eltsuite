import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import type { GameRound, GameType } from './model';
export function GameDraft({ gameId, type, existingCount = 0, onApply }: {
    gameId: string;
    type: GameType;
    existingCount?: number;
    onApply: (r: GameRound[], append?: boolean) => void;
}) {
    const { user } = useAuth();
    const [description, setDescription] = useState(''), [classId, setClassId] = useState(''), [lessonId, setLessonId] = useState(''), [classes, setClasses] = useState<{
        id: string;
        name: string;
    }[]>([]), [lessons, setLessons] = useState<{
        id: string;
        name: string;
    }[]>([]), [draft, setDraft] = useState<GameRound[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { if (!user)
        return; void getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid))).then(s => setClasses(s.docs.map(d => ({ id: d.id, name: d.data().name || 'Class' })))).catch(e => setError(e.message)); }, [user]);
    useEffect(() => { setLessonId(''); setLessons([]); if (classId)
        void getDocs(collection(db, 'classes', classId, 'items')).then(s => setLessons(s.docs.filter(d => d.data().kind !== 'topic').map(d => ({ id: d.id, name: d.data().title || 'Lesson' })))).catch(e => setError(e.message)); }, [classId]);
    return <details><summary>Create questions with AI</summary><label>What should learners practise?<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="For example: A1 adults recognising places in a town"/></label><label>Class context (optional)<select value={classId} onChange={e => setClassId(e.target.value)}><option value="">No class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{classId && <label>Lesson context (optional)<select value={lessonId} onChange={e => setLessonId(e.target.value)}><option value="">No lesson</option>{lessons.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{!description.trim() && <p>Describe the learning focus to create a draft.</p>}{error && <p role="alert">{error}</p>}<button type="button" className="btn" disabled={busy || !description.trim()} onClick={async () => { setBusy(true); setError(''); try {
        const r = await httpsCallable(getFunctions(app, 'us-central1'), 'classroomGameDraft', { timeout: 300000 })({ id: gameId, type, description, classId, lessonId, requestId: crypto.randomUUID() });
        setDraft((r.data as {
            rounds: GameRound[];
        }).rounds);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>{busy ? 'Writing and checking your questions…' : 'Create draft'}</button>{busy && <p role="status">Your existing game is kept while the draft is prepared.</p>}{draft && <section><h3>Review questions and answers</h3><ol>{draft.map(r => <li key={r.id}>{r.prompt}<br /><strong>{r.answer}</strong>{r.choices.length > 0 && <p>Other options: {r.choices.join(' · ')}</p>}</li>)}</ol><button type="button" className="btn" onClick={() => { onApply(draft); setDraft(null); }}>{existingCount ? 'Replace questions with draft' : 'Use these questions'}</button>{existingCount > 0 && <button type="button" className="btn" onClick={() => { onApply(draft, true); setDraft(null); }}>Add draft to questions</button>}<button type="button" className="btn" onClick={() => setDraft(null)}>Discard draft</button><p>Choose whether to replace or add questions. Review them in the editor, then save when ready.</p></section>}</details>;
}

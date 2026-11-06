// The quiz editor: a saved quiz in Files (kind 'game'). Slides on the left; the chosen slide on the
// right. Quick slides (multiple choice, true or false, type the answer, poll) are made from boxes;
// "Any class question" is the lesson task editor, so every marked question type works. From here a
// teacher hosts the quiz for anyone with a code, or puts it into a class lesson.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useMyDocs, type SharedDoc } from '../lib/sharedDocs';
import { configOf, plainOf, type Card, type FlashConfig } from '../lib/flash';
import { TaskEditor } from '../editor/TaskEditor';
import { UiIcon } from '../components/UiIcon';
import { QuizDraft } from './QuizDraft';
import { AddToLesson } from './AddToLesson';
import { Backdrop, Shape, answerStyle } from './Stage';
import { quizApi } from './live';
import { KINDS, MAX_OPTIONS, MAX_SLIDES, SECONDS, blankQuiz, choiceOf, fromSaved, newSlide, quizProblems, slideProblem, slideTitle, slidesFromRounds, typedOf, withChoice, withTyped, type QuizDoc, type QuizSlide, type SlideKind } from './model';
import './quiz.css';
import { NSelect } from '../components/Select';

export function QuizFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [quiz, setQuiz] = useState<QuizDoc | null>(null);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('Saved');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const dirtyRef = useRef(false);
  const latest = useRef<QuizDoc | null>(null);
  latest.current = quiz;

  useEffect(() => {
    dirtyRef.current = false;
    setDirty(false);
    setQuiz(null);
    return onSnapshot(
      doc(db, 'sharedDocs', d.id, 'game', 'main'),
      (s) => {
        if (!dirtyRef.current) setQuiz(s.exists() ? fromSaved(s.data()) : blankQuiz());
      },
      (e) => setError(e.message),
    );
  }, [d.id]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);

  const save = async (q = latest.current) => {
    if (!q) return false;
    setStatus('Saving…');
    try {
      await setDoc(doc(db, 'sharedDocs', d.id, 'game', 'main'), q);
      await updateDoc(doc(db, 'sharedDocs', d.id), { updatedAt: serverTimestamp() });
      if (latest.current === q) {
        dirtyRef.current = false;
        setDirty(false);
        setStatus('Saved');
      }
      return true;
    } catch {
      setStatus('Not saved');
      setError('We couldn’t save that just now. Check your connection and try again. Your work is still here.');
      return false;
    }
  };
  // Saves on its own a moment after each change.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [quiz, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => (quiz ? quizProblems(quiz) : []), [quiz]);
  if (!quiz) return <p role="status">One moment…</p>;
  const index = Math.max(0, quiz.slides.findIndex((s) => s.id === selected));
  const slide = quiz.slides[index];

  const change = (q: QuizDoc) => {
    dirtyRef.current = true;
    setDirty(true);
    setStatus('Unsaved changes');
    setQuiz(q);
  };
  const setSlide = (s: QuizSlide) => change({ ...quiz, slides: quiz.slides.map((x) => (x.id === s.id ? s : x)) });
  const add = (kind: SlideKind) => {
    if (quiz.slides.length >= MAX_SLIDES) return;
    const s = newSlide(kind);
    const slides = [...quiz.slides];
    slides.splice(index + 1, 0, s);
    change({ ...quiz, slides });
    setSelected(s.id);
  };
  const addMany = (more: QuizSlide[], replace = false) => {
    const empty = quiz.slides.length === 1 && !!slideProblem(quiz.slides[0]) && !slideTitle(quiz.slides[0]).trim();
    const slides = replace || empty ? more : [...quiz.slides, ...more];
    change({ ...quiz, slides: slides.slice(0, MAX_SLIDES) });
    setSelected(more[0]?.id || '');
  };
  const remove = () => {
    if (quiz.slides.length === 1) return change({ ...quiz, slides: [newSlide(slide.kind)] });
    const slides = quiz.slides.filter((s) => s.id !== slide.id);
    change({ ...quiz, slides });
    setSelected(slides[Math.min(index, slides.length - 1)].id);
  };
  const move = (by: number) => {
    const to = index + by;
    if (to < 0 || to >= quiz.slides.length) return;
    const slides = [...quiz.slides];
    [slides[index], slides[to]] = [slides[to], slides[index]];
    change({ ...quiz, slides });
  };
  const duplicate = () => {
    const copy = JSON.parse(JSON.stringify(slide).replace(/"id":"[a-z0-9]{8}"/g, () => `"id":"${Math.random().toString(36).slice(2, 10)}"`)) as QuizSlide;
    const slides = [...quiz.slides];
    slides.splice(index + 1, 0, copy);
    change({ ...quiz, slides });
    setSelected(copy.id);
  };

  const host = async () => {
    setBusy(true);
    setError('');
    try {
      if (dirtyRef.current && !(await save())) return;
      const r = await quizApi<{ runId: string }>('host', { source: { kind: 'doc', id: d.id } });
      nav('/quiz-host/' + r.runId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = problems.length === 0;
  return (
    <div className="qe">
      <header className="qe-bar">
        <h2>Live quiz</h2>
        <span className="qe-status" role="status">
          {canEdit ? status : 'You can view this quiz'}
        </span>
        {canEdit && (
          <button type="button" className="btn" disabled={!ready} onClick={() => setAdding(true)} title={ready ? '' : 'Finish every question first'}>
            <UiIcon name="plus" />
            Add to a class
          </button>
        )}
        <button type="button" className="btn primary" disabled={!ready || busy} onClick={() => void host()} title={ready ? 'Start the quiz on this screen. Players join with a code.' : 'Finish every question first'}>
          <UiIcon name="videoPlay" />
          {busy ? 'Starting…' : 'Host live'}
        </button>
      </header>
      {error && (
        <p role="alert" className="game-error">
          {error}
        </p>
      )}
      {!ready && (
        <p className="qe-hint">
          {problems.length === 1 ? 'One question needs' : `${problems.length} questions need`} finishing before you can play.{' '}
          <button type="button" className="btn link" onClick={() => setSelected(quiz.slides[problems[0].i].id)}>
            Go to question {problems[0].i + 1}
          </button>
        </p>
      )}
      {adding && <AddToLesson quiz={quiz} title={d.title} sourceId={d.id} onClose={() => setAdding(false)} />}
      {canEdit && (
        <div className="game-sources">
          <QuizDraft gameId={d.id} existingCount={quiz.slides.length} onApply={(rounds, append) => addMany(slidesFromRounds(rounds), !append)} />
          <FromCards onUse={(s, replace) => addMany(s, replace)} />
        </div>
      )}
      <div className="qe-grid">
        <nav className="qe-list" aria-label="Questions">
          {quiz.slides.map((s, i) => {
            const p = slideProblem(s);
            return (
              <button key={s.id} type="button" className="qe-slide" aria-current={s.id === slide.id ? 'true' : undefined} onClick={() => setSelected(s.id)}>
                <span className="qe-slide-n">{i + 1}</span>
                <span>
                  <strong>{slideTitle(s) || 'New question'}</strong>
                  <small className={p ? 'qe-warn' : ''}>{p ? 'Needs finishing' : `${KINDS.find((k) => k.id === s.kind)?.name} · ${s.seconds} s${s.points === 2 ? ' · double' : s.points === 0 && s.kind !== 'poll' ? ' · no points' : ''}`}</small>
                </span>
              </button>
            );
          })}
          {canEdit && quiz.slides.length < MAX_SLIDES && (
            <div className="qe-add">
              <p>Add a question</p>
              <div className="qe-add-row">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" className="btn small-btn" title={k.about} onClick={() => add(k.id)}>
                    {k.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <PastRuns sourceId={d.id} uid={user?.uid} />
        </nav>
        <section className="qe-card" aria-label={`Question ${index + 1}`}>
          <div className="qe-row">
            <label>
              Question type
              <NSelect
                value={slide.kind}
                disabled={!canEdit}
                onChange={(e) => {
                  const kind = e.target.value as SlideKind;
                  const fresh = newSlide(kind);
                  // Keep the words when moving between the quick kinds.
                  const prompt = slide.kind === 'type' ? typedOf(slide).prompt : slide.kind === 'task' ? '' : choiceOf(slide).prompt;
                  let next: QuizSlide = { ...fresh, id: slide.id, seconds: slide.seconds, points: kind === 'poll' ? 0 : slide.points || 1 };
                  if (kind === 'type') next = withTyped(next, { prompt });
                  else if (kind !== 'task') next = withChoice(next, { prompt, ...(slide.kind !== 'type' && slide.kind !== 'task' && kind !== 'truefalse' ? { options: choiceOf(slide).options } : {}) });
                  setSlide(next);
                }}
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </NSelect>
            </label>
            <label>
              Time to answer
              <NSelect value={slide.seconds} disabled={!canEdit} onChange={(e) => setSlide({ ...slide, seconds: Number(e.target.value) })}>
                {SECONDS.map((n) => (
                  <option key={n} value={n}>
                    {n < 60 ? `${n} seconds` : `${n / 60} ${n === 60 ? 'minute' : 'minutes'}`}
                  </option>
                ))}
              </NSelect>
            </label>
            {slide.kind !== 'poll' && (
              <label>
                Points
                <NSelect value={slide.points} disabled={!canEdit} onChange={(e) => setSlide({ ...slide, points: Number(e.target.value) as 0 | 1 | 2 })}>
                  <option value={1}>Standard</option>
                  <option value={2}>Double points</option>
                  <option value={0}>No points</option>
                </NSelect>
              </label>
            )}
            {canEdit && (
              <span className="game-editor-actions" style={{ marginLeft: 'auto' }}>
                <button type="button" className="btn small-btn" disabled={index === 0} onClick={() => move(-1)} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="btn small-btn" disabled={index === quiz.slides.length - 1} onClick={() => move(1)} aria-label="Move down">
                  ↓
                </button>
                <button type="button" className="btn small-btn" onClick={duplicate}>
                  Duplicate
                </button>
                <button type="button" className="btn small-btn" onClick={remove}>
                  Remove
                </button>
              </span>
            )}
          </div>
          <p className="qe-hint">{KINDS.find((k) => k.id === slide.kind)?.about}</p>
          <SlideEditor key={slide.id} slide={slide} onChange={setSlide} readOnly={!canEdit} />
          {slideProblem(slide) && <p className="qe-problem">{slideProblem(slide)}</p>}
          <SlidePreview slide={slide} n={index + 1} total={quiz.slides.length} />
        </section>
      </div>
    </div>
  );
}

function SlideEditor({ slide, onChange, readOnly }: { slide: QuizSlide; onChange: (s: QuizSlide) => void; readOnly: boolean }) {
  const [typed, setTyped] = useState('');
  if (slide.kind === 'task')
    return (
      <div className="qe-task">
        <TaskEditor content={slide.content} onChange={(c) => onChange({ ...slide, content: c })} label="Question" placeholder="Write the question, then add a gap, matching, word order or any other question from the + menu…" />
      </div>
    );
  if (slide.kind === 'type') {
    const t = typedOf(slide);
    const addAnswer = () => {
      const v = typed.trim();
      if (!v || t.answers.some((a) => a.toLowerCase() === v.toLowerCase())) return setTyped('');
      onChange(withTyped(slide, { answers: [...t.answers, v] }));
      setTyped('');
    };
    return (
      <>
        <textarea className="qe-prompt" placeholder="Write the question" value={t.prompt} disabled={readOnly} maxLength={300} onChange={(e) => onChange(withTyped(slide, { prompt: e.target.value }))} />
        <div className="qe-answers">
          {t.answers.map((a) => (
            <span key={a} className="qe-chip">
              {a}
              {!readOnly && (
                <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(withTyped(slide, { answers: t.answers.filter((x) => x !== a) }))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <span className="qe-row">
              <input
                type="text"
                className="field"
                placeholder="An answer you accept"
                value={typed}
                maxLength={120}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAnswer();
                  }
                }}
              />
              <button type="button" className="btn small-btn" onClick={addAnswer}>
                Add answer
              </button>
            </span>
          )}
        </div>
        <p className="qe-hint">Capital letters and full stops don’t matter. Add other spellings you accept, such as “colour” and “color”.</p>
      </>
    );
  }
  const c = choiceOf(slide);
  const fixed = slide.kind === 'truefalse';
  const toggle = (i: number) => {
    const has = c.correct.includes(i);
    const correct = c.multi ? (has ? c.correct.filter((x) => x !== i) : [...c.correct, i].sort()) : [i];
    onChange(withChoice(slide, { correct }));
  };
  return (
    <>
      <textarea className="qe-prompt" placeholder={fixed ? 'Write a statement' : slide.kind === 'poll' ? 'Ask the class something' : 'Write the question'} value={c.prompt} disabled={readOnly} maxLength={300} onChange={(e) => onChange(withChoice(slide, { prompt: e.target.value }))} />
      <div className="qe-options">
        {c.options.map((o, i) => (
          <div key={i} className="qe-option" style={answerStyle(i)}>
            <Shape i={i} size={22} />
            <input type="text" aria-label={`Answer ${i + 1}`} value={o} placeholder={`Answer ${i + 1}`} disabled={readOnly || fixed} maxLength={120} onChange={(e) => onChange(withChoice(slide, { options: c.options.map((x, k) => (k === i ? e.target.value : x)) }))} />
            {slide.kind !== 'poll' && (
              <label className="qe-right">
                <input type={c.multi ? 'checkbox' : 'radio'} name={'right-' + slide.id} checked={c.correct.includes(i)} disabled={readOnly} onChange={() => toggle(i)} />
                Right
              </label>
            )}
            {!readOnly && !fixed && c.options.length > 2 && (
              <button
                type="button"
                className="qe-x"
                aria-label={`Remove answer ${i + 1}`}
                onClick={() => onChange(withChoice(slide, { options: c.options.filter((_, k) => k !== i), correct: c.correct.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)) }))}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && !fixed && (
        <div className="qe-row">
          {c.options.length < MAX_OPTIONS && (
            <button type="button" className="btn small-btn" onClick={() => onChange(withChoice(slide, { options: [...c.options, ''] }))}>
              Add an answer
            </button>
          )}
          {slide.kind === 'choice' && (
            <label className="qe-check">
              <input type="checkbox" checked={c.multi} onChange={(e) => onChange(withChoice(slide, { multi: e.target.checked, correct: e.target.checked ? c.correct : c.correct.slice(0, 1) }))} /> More than one right answer
            </label>
          )}
        </div>
      )}
    </>
  );
}

/** How the question will look on the big screen. */
function SlidePreview({ slide, n, total }: { slide: QuizSlide; n: number; total: number }) {
  const choice = slide.kind !== 'task' && slide.kind !== 'type' ? choiceOf(slide) : null;
  const prompt = choice ? choice.prompt : slideTitle(slide);
  return (
    <details className="qe-preview" open>
      <summary className="qe-hint">How it looks on the big screen</summary>
      <Backdrop className="qz-host">
        <div className="qz-question">
          <div className="qz-panel">
            <p className="qz-kicker">
              Question {n} of {total}
              {slide.kind === 'poll' ? ' · Poll' : slide.points === 2 ? ' · Double points' : ''}
            </p>
            <h1 className="qz-prompt md">{prompt || 'Your question'}</h1>
          </div>
          <div />
          {choice ? (
            <div className={'qz-tiles n' + choice.options.length}>
              {choice.options.map((o, i) => (
                <div key={i} className="qz-tile" style={answerStyle(i)}>
                  <Shape i={i} size={28} />
                  <span className="qz-tile-text">{o || '…'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="qz-phone-hint">Learners answer on their phones.</p>
          )}
        </div>
      </Backdrop>
    </details>
  );
}

/** Make questions from a flashcard set: the front is the question, the back the right answer. */
function FromCards({ onUse }: { onUse: (s: QuizSlide[], replace: boolean) => void }) {
  const { user } = useAuth();
  const { mine } = useMyDocs(user?.uid);
  const [source, setSource] = useState('');
  const [ready, setReady] = useState<QuizSlide[] | null>(null);
  const [error, setError] = useState('');
  const sets = mine?.filter((d) => d.kind === 'flash') || [];
  const load = async () => {
    setError('');
    try {
      const f = mine?.find((d) => d.id === source) as SharedDoc & { flash?: FlashConfig };
      const cfg = configOf(f?.flash);
      const cards = (await getDocs(collection(db, 'sharedDocs', source, 'cards'))).docs.map((x) => ({ ...x.data(), id: x.id }) as Card).sort((a, b) => a.order - b.order);
      const rows = cards.map((c) => ({ prompt: cfg.front.map((k) => plainOf(c.f[k])).filter(Boolean).join(' — '), answer: cfg.back.map((k) => plainOf(c.f[k])).filter(Boolean).join(' — '), choices: [] as string[] })).filter((r) => r.prompt && r.answer).slice(0, MAX_SLIDES);
      if (!rows.length) throw Error('This set has no text on both sides. Add words to the front and back of the cards first.');
      rows.forEach((r, i) => (r.choices = [1, 2, 3].map((k) => rows[(i + k * 3) % rows.length].answer).filter((a) => a !== r.answer)));
      setReady(slidesFromRounds(rows));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!sets.length) return null;
  return (
    <details>
      <summary>Make questions from a flashcard set</summary>
      <p className="qe-hint">The front of each card becomes the question and the back the right answer. Other cards’ answers become the wrong ones. Your set stays as it is.</p>
      <div className="qe-row">
        <NSelect value={source} onChange={(e) => (setSource(e.target.value), setReady(null))} aria-label="Flashcard set">
          <option value="" disabled>Choose a set</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </NSelect>
        <button type="button" className="btn" disabled={!source} onClick={() => void load()}>
          Make questions
        </button>
      </div>
      {error && <p className="qe-problem">{error}</p>}
      {ready && (
        <div className="qe-row">
          <span>{ready.length} questions ready.</span>
          <button type="button" className="btn" onClick={() => (onUse(ready, false), setReady(null))}>
            Add them
          </button>
          <button type="button" className="btn" onClick={() => (onUse(ready, true), setReady(null))}>
            Replace my questions
          </button>
        </div>
      )}
    </details>
  );
}

/** Earlier games of this quiz, with links to their results. */
function PastRuns({ sourceId, uid }: { sourceId: string; uid?: string }) {
  const [runs, setRuns] = useState<{ id: string; createdAt: number; players: number; status: string }[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'quizRuns'), where('owner', '==', uid), where('source.id', '==', sourceId)),
      (s) => setRuns(s.docs.map((x) => ({ id: x.id, ...(x.data() as { createdAt: number; players: number; status: string }) })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)),
      () => {},
    );
  }, [sourceId, uid]);
  if (!runs.length) return null;
  return (
    <div className="qe-runs">
      <p className="qe-hint">Games played</p>
      {runs.map((r) => (
        <a key={r.id} href={(r.status === 'ended' ? '/quiz-results/' : '/quiz-host/') + r.id}>
          <span>{new Date(r.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span>
            {r.players} {r.players === 1 ? 'player' : 'players'}
            {r.status !== 'ended' ? ' · open' : ''}
          </span>
        </a>
      ))}
    </div>
  );
}

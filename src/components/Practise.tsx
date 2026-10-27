import { NSelect } from './Select';
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, query, setDoc, where, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { speak } from '../lib/media';
import type { Entry, EntryData, MyNote } from '../lib/notebook';
import { removeMistake, reviewMistake, useMistakes, type Mistake } from '../lib/mistakes';

// Learner practice: flashcards from the notebook (Leitner boxes) and the mistake review deck.

type Card = { id: string; data: EntryData; source: 'class' | 'mine' };
type FlashState = { entryId: string; box: number; nextAt: number };
const DAY = 86400000;
const BOX_DAYS = [0, 1, 3, 7, 21];

function useFlash(classId: string, uid?: string) {
  const [map, setMap] = useState<Record<string, FlashState>>({});
  useEffect(() => {
    if (!classId || !uid) return;
    return onSnapshot(query(collection(db, 'classes', classId, 'myNotes'), where('uid', '==', uid), where('kind', '==', 'flash')), (s) => setMap(Object.fromEntries(s.docs.map((d) => [d.data().entryId, d.data() as FlashState]))), () => {});
  }, [classId, uid]);
  const rate = (entryId: string, good: boolean) => {
    const cur = map[entryId]?.box ?? 0;
    const box = good ? Math.min(4, cur + 1) : 0;
    return setDoc(doc(db, 'classes', classId, 'myNotes', `fc_${entryId}_${uid}`), { uid, kind: 'flash', entryId, box, nextAt: Date.now() + BOX_DAYS[box] * DAY }, { merge: true });
  };
  return { map, rate };
}

export function Practise({ classId, uid, entries, mine }: { classId: string; uid: string; entries: Entry[]; mine: MyNote[] }) {
  const [mode, setMode] = useState<'cards' | 'review'>('cards');
  const mistakes = useMistakes(classId, uid);
  const due = mistakes.filter((m) => !m.done && m.nextAt <= Date.now());
  return (
    <div className="pr">
      <span className="seg small-seg" style={{ width: 300 }} role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'cards'} className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>
          Flashcards
        </button>
        <button type="button" role="tab" aria-selected={mode === 'review'} className={mode === 'review' ? 'on' : ''} onClick={() => setMode('review')}>
          My mistakes{due.length ? ` · ${due.length}` : ''}
        </button>
      </span>
      {mode === 'cards' ? <Flashcards classId={classId} uid={uid} entries={entries} mine={mine} /> : <ReviewDeck classId={classId} mistakes={mistakes} />}
    </div>
  );
}

function Flashcards({ classId, uid, entries, mine }: { classId: string; uid: string; entries: Entry[]; mine: MyNote[] }) {
  const { map, rate } = useFlash(classId, uid);
  const [source, setSource] = useState<'all' | 'class' | 'mine'>('all');
  const all = useMemo<Card[]>(
    () => [
      ...entries.filter((e) => e.type === 'vocab' && e.data.word && e.status === 'published').map((e) => ({ id: e.id, data: e.data, source: 'class' as const })),
      ...mine.filter((n) => n.kind === 'entry' && n.type === 'vocab' && n.data?.word && !n.from).map((n) => ({ id: n.id, data: n.data!, source: 'mine' as const })),
    ],
    [entries, mine],
  );
  const pool = all.filter((c) => source === 'all' || c.source === source);
  const dueCards = pool.filter((c) => (map[c.id]?.nextAt ?? 0) <= Date.now()).sort((a, b) => (map[a.id]?.box ?? 0) - (map[b.id]?.box ?? 0));
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState(0);
  const translations = useMemo(() => Object.fromEntries(mine.filter((n) => n.kind === 'translation').map((n) => [n.entryId, n.translation])), [mine]);
  const card = dueCards[Math.min(i, dueCards.length - 1)];
  useEffect(() => setFlip(false), [card?.id]);
  if (!all.length) return <p className="hint">Flashcards come from the words in the class notebook and your own notebook. Nothing to practise yet.</p>;
  const next = async (good: boolean) => {
    if (!card) return;
    await rate(card.id, good).catch(() => {});
    setDone((n) => n + 1);
    setI((x) => (x >= dueCards.length - 1 ? 0 : x));
  };
  const known = pool.filter((c) => (map[c.id]?.box ?? 0) >= 3).length;
  return (
    <div className="fc">
      <span className="fc-bar">
        <NSelect value={source} onChange={(e) => (setSource(e.target.value as typeof source), setI(0))} aria-label="Which words">
          <option value="all">All my words</option>
          <option value="class">Class notebook</option>
          <option value="mine">My notebook</option>
        </NSelect>
        <span className="hint">
          {dueCards.length} to review · {known} of {pool.length} known well
        </span>
      </span>
      {!card ? (
        <div className="fc-empty">
          <span className="fc-big">All done for now</span>
          <span className="hint">{done ? `You reviewed ${done} ${done === 1 ? 'card' : 'cards'}. ` : ''}Cards come back after 1, 3, 7 and 21 days as you get them right.</span>
        </div>
      ) : (
        <>
          <button type="button" className={'fc-card' + (flip ? ' flipped' : '')} onClick={() => setFlip((f) => !f)} aria-label={flip ? 'Show the word' : 'Show the meaning'}>
            <span className="fc-face front">
              <span className="fc-word">{card.data.word}</span>
              {card.data.def?.pos && <em className="fc-pos">{card.data.def.pos}</em>}
              <span className="hint">Tap to turn</span>
            </span>
            <span className="fc-face back">
              {card.data.def?.meaning && <span className="fc-meaning">{card.data.def.meaning}</span>}
              {card.data.def?.example && <span className="fc-example">{card.data.def.example}</span>}
              {(card.data.def?.translation || translations[card.id]) && <span className="fc-tr">{card.data.def?.translation || translations[card.id]}</span>}
            </span>
          </button>
          <span className="fc-acts">
            <button type="button" className="icon-btn fc-say" aria-label="Listen" onClick={() => speak(card.data.word ?? '')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            </button>
            <button type="button" className="btn" onClick={() => next(false)}>
              Again
            </button>
            <button type="button" className="btn primary" onClick={() => next(true)}>
              Got it
            </button>
          </span>
          <span className="hint">
            Card {Math.min(i, dueCards.length - 1) + 1} of {dueCards.length} · box {(map[card.id]?.box ?? 0) + 1} of 5
          </span>
        </>
      )}
    </div>
  );
}

function ReviewDeck({ classId, mistakes }: { classId: string; mistakes: Mistake[] }) {
  const due = mistakes.filter((m) => !m.done && m.nextAt <= Date.now()).sort((a, b) => b.wrongCount - a.wrongCount);
  const later = mistakes.filter((m) => !m.done && m.nextAt > Date.now()).length;
  const [show, setShow] = useState(false);
  const m = due[0];
  useEffect(() => setShow(false), [m?.id]);
  if (!mistakes.length) return <p className="hint">Questions you get wrong in homework and practice come here with the right answer, so you can review them. Nothing yet.</p>;
  if (!m)
    return (
      <div className="fc-empty">
        <span className="fc-big">Nothing to review right now</span>
        <span className="hint">{later ? `${later} ${later === 1 ? 'question comes' : 'questions come'} back later. ` : ''}A question leaves the deck after you get it right on two different days.</span>
      </div>
    );
  return (
    <div className="fc">
      <span className="hint">
        {due.length} to review{later ? ` · ${later} later` : ''}
      </span>
      <div className="rv-card">
        <span className="eyebrow">{({ gap: 'Gap fill', mcq: 'Multiple choice', multi: 'Multiple choice', drop: 'Drag and drop', order: 'Word order', match: 'Matching' } as Record<string, string>)[m.type] ?? m.type}</span>
        <span className="rv-prompt">{m.prompt}</span>
        {!show ? (
          <button type="button" className="btn" onClick={() => setShow(true)}>
            Show the answer
          </button>
        ) : (
          <>
            <span className="rv-answer">
              <span className="dc-k">Answer</span> <strong>{m.answer}</strong>
            </span>
            {m.wrong && (
              <span className="rv-wrong">
                <span className="dc-k">You wrote</span> <span>{m.wrong}</span>
              </span>
            )}
            <span className="fc-acts">
              <button type="button" className="btn" onClick={() => reviewMistake(classId, m, false)}>
                Not yet
              </button>
              <button type="button" className="btn primary" onClick={() => reviewMistake(classId, m, true)}>
                I’ve got it
              </button>
              <button type="button" className="btn link small" onClick={() => removeMistake(classId, m.id)}>
                Remove
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Real tasks in a class lesson frame, for screenshots and hands-on checks.
// /test/young-gallery.html?style=young|adult  &checked=1 shows every task marked, with some answers wrong.
// &only=<n> shows one task. Each task also has its own Check and Try again buttons.
import '../src/styles.css';
import '../src/cohesion.css';
import '../src/lessons/youngLesson.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { JSONContent } from '@tiptap/react';
import { TaskRenderer } from '../src/components/TaskRenderer';
import { isAnswered, questionIds, scoreTask, splitKey, type Responses } from '../src/lib/questions';
import { YoungCue, YoungInstr, YoungProgress, YoungScore } from '../src/lessons/young';

const q = new URLSearchParams(location.search);
const style = q.get('style') || 'young';
const startChecked = q.get('checked') === '1';
const only = q.get('only');
if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme')!;

const t = (text: string): JSONContent => ({ type: 'text', text });
const p = (...content: (JSONContent | string)[]): JSONContent => ({ type: 'paragraph', content: content.map((c) => (typeof c === 'string' ? t(c) : c)) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const choice = (id: string, options: string[], correct: number, display = 'letters'): JSONContent => ({ type: 'choice', attrs: { id, options, correct, display } });
const gap = (id: string, answer: string, extra: Record<string, unknown> = {}): JSONContent => ({ type: 'gap', attrs: { id, answers: [answer], ...extra } });
const drop = (id: string, answer: string): JSONContent => ({ type: 'dropgap', attrs: { id, answer } });

type Fixture = { title: string; instr: string; content: JSONContent; answers: Responses };
const TASKS: Fixture[] = [
  {
    title: 'Which animal?',
    instr: 'Listen and choose.',
    content: doc(
      { type: 'mcq', attrs: { id: 'mcq1', prompt: 'Which animal says “moo”?', options: ['a cat', 'a cow', 'a dog', 'a duck'], correct: 1 } },
      { type: 'mcq', attrs: { id: 'mcq2', prompt: 'Which one can fly?', options: ['a fish', 'a bird', 'an elephant that is very big and grey and lives in Africa'], correct: 1, feedback: 'Birds have wings.' } },
    ),
    answers: { mcq1: 1, mcq2: 0 },
  },
  {
    title: 'Choose the word',
    instr: 'Tap the right word.',
    content: doc(
      p('I ', choice('c1', ['am', 'is', 'are'], 0), ' seven years old.'),
      p('She ', choice('c2', ['have', 'has'], 1, 'dropdown'), ' a red bike.'),
      p('Is it a cat? ', choice('c3', ['True', 'False'], 0, 'truefalse')),
    ),
    answers: { c1: 0, c2: 0, c3: 0 },
  },
  {
    title: 'What do you like?',
    instr: 'Choose one.',
    content: doc(p('My favourite fruit is…'), p(choice('r1', ['apples', 'bananas', 'oranges'], 1, 'radio'))),
    answers: { r1: 1 },
  },
  {
    title: 'Finish the sentences',
    instr: 'Write the missing word.',
    content: doc(
      p('The ', gap('g1', 'cat'), ' is on the mat.'),
      p('I ', gap('g2', 'like'), ' bananas.'),
      p('Spell it: ', gap('g3', 'green', { letters: true, pattern: 'g____' })),
    ),
    answers: { g1: 'cat', g2: 'lik', g3: 'green' },
  },
  {
    title: 'Match the pairs',
    instr: 'Tap a word, then tap its picture word.',
    content: doc({ type: 'match', attrs: { id: 'm1', pairs: [{ left: 'big', right: 'small' }, { left: 'hot', right: 'cold' }, { left: 'happy', right: 'sad' }, { left: 'fast', right: 'slow' }], extras: [] } }),
    answers: {},
  },
  {
    title: 'Use the words',
    instr: 'Drag or tap a word, then tap a gap.',
    content: doc(
      { type: 'wordbank', attrs: { id: 'wb1', extras: ['blue'] } },
      p('The sky is ', drop('d1', 'grey'), ' today.'),
      p('I wear a ', drop('d2', 'hat'), ' when it is ', drop('d3', 'sunny'), '.'),
    ),
    answers: { d1: 'grey', d2: 'sunny' },
  },
  {
    title: 'Make a sentence',
    instr: 'Tap the words in order.',
    content: doc(
      { type: 'order', attrs: { id: 'o1', sentence: 'I can swim very well' } },
      { type: 'order', attrs: { id: 'o2', sentence: 'My dog is brown' } },
    ),
    answers: { o1: 'I can swim very well', o2: 'dog My is brown' },
  },
  {
    title: 'Write about you',
    instr: 'Write three sentences about your family.',
    content: doc({ type: 'writing', attrs: { id: 'w1', minWords: 10, maxWords: 40 } }),
    answers: { w1: 'I have a sister. She is six.' },
  },
];

const prepared = TASKS.map((f) => ({ ...f, ...splitKey(f.content) }));
const fill = (f: Fixture, key: ReturnType<typeof splitKey>['key']): Responses => {
  const out: Responses = { ...f.answers };
  // Matching answers are positions in the shuffled right-hand list; fill all but the last right.
  for (const [id, e] of Object.entries(key)) if (e.kind === 'match') out[id] = e.map.map((m, i) => (i === e.map.length - 1 ? (m + 1) % e.map.length : m));
  return out;
};

function Task({ f, i }: { f: (typeof prepared)[number]; i: number }) {
  const [checked, setChecked] = useState(startChecked);
  const [r, setR] = useState<Responses>(() => (startChecked ? fill(f, f.key) : {}));
  const qs = questionIds(f.content);
  const answered = qs.filter((q) => isAnswered(r[q.id])).length;
  const result = scoreTask(qs, f.key, r);
  return (
    <main data-lesson-style={style} className="task-frame" data-gallery={i + 1} style={{ ['--ts' as string]: 1, margin: '0 auto 28px', maxWidth: 980 }}>
      <div className="frame-inner">
        <div className="frame-head">
          <h1 className="task-title">{style === 'young' && <span className="yl-activity-number" aria-hidden="true">{i + 1}</span>}{f.title}</h1>
          {style === 'young' ? <YoungInstr content={f.content}><p className="task-instr">{f.instr}</p></YoungInstr> : <p className="task-instr">{f.instr}</p>}
        </div>
        <div className="frame-body">
          <TaskRenderer content={f.content} responses={r} results={checked ? f.key : null} onChange={(id, v) => setR((s) => ({ ...s, [id]: v }))} />
        </div>
        <div className="frame-foot">
          {checked && style === 'young' && !result.hasWriting ? (
            <YoungScore got={result.score} total={result.total}>{result.total > 0 && <><span className="big">{result.score}</span> of {result.total} correct</>}</YoungScore>
          ) : (
            <span className="hint foot-status">{style === 'young' && <YoungProgress done={answered} total={qs.length} />}<span className="foot-long">{answered} of {qs.length} answered</span></span>
          )}
          <span className="foot-acts">
            {checked ? <button className="btn primary" onClick={() => setChecked(false)}>Try again</button> : <button className="btn primary" disabled={answered === 0} onClick={() => setChecked(true)}>Check<span className="foot-long"> answers</span></button>}
          </span>
        </div>
      </div>
    </main>
  );
}

const CUES: [string, JSONContent][] = [
  ['tap', doc(choice('x', ['a'], 0))], ['write', doc(p(gap('x', 'a')))], ['drag', doc({ type: 'wordbank', attrs: {} })], ['match', doc({ type: 'match', attrs: { id: 'x' } })],
  ['order', doc({ type: 'order', attrs: { id: 'x' } })], ['listen', doc({ type: 'media', attrs: {} })], ['speak', doc({ type: 'pq', attrs: { kind: 'speaking' } })], ['read', doc(p('Text'))],
];
if (q.get('icons') === '1')
  createRoot(document.getElementById('root')!).render(
    <main data-lesson-style="young" className="task-frame" style={{ padding: 24, display: 'flex', gap: 20, flexWrap: 'wrap', zoom: 2 }}>
      {CUES.map(([name, c]) => <figure key={name} style={{ margin: 0, textAlign: 'center', font: '12px Karla' }}><YoungCue content={c} /><figcaption>{name}</figcaption></figure>)}
    </main>,
  );
else createRoot(document.getElementById('root')!).render(<div style={{ padding: 'clamp(8px, 2vw, 24px)' }}>{prepared.map((f, i) => (!only || Number(only) === i + 1 ? <Task key={i} f={f} i={i} /> : null))}</div>);

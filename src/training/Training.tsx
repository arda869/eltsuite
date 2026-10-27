import { tr } from '../lib/terms';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Grip } from '../editor/nodes';
import { newId } from '../lib/tasks';
import { fmtTime } from '../lib/sound';
import { useAuth } from '../lib/auth';

// Teacher training: a language analysis, a lesson plan and an observation form. The trainer
// fills one in as a model, or leaves it for trainees to complete (their answers come back like
// any other task). Also: comments pinned to moments in a lesson video.

export type TTKind = 'analysis' | 'plan' | 'observe' | 'loop';
type Data = Record<string, string>;
export type Fields = { fields: Data };

export const TT_KINDS: { k: TTKind; label: string; about: string }[] = [
  { k: 'analysis', label: 'Language analysis', about: tr('Meaning, form and pronunciation, concept-checking questions, and problems learners may have with solutions') },
  { k: 'plan', label: 'Lesson plan', about: 'Aims, assumptions and the stages with aims, procedure, interaction and timing' },
  { k: 'observe', label: 'Observation form', about: tr('Strengths and action points against criteria for planning, language, teaching and learners') },
  { k: 'loop', label: 'Loop input: step back', about: 'After you model a technique, trainees open this to see what you did and why' },
];

// Lesson frameworks: the stages each starts with.
export const FRAMEWORKS: { k: string; label: string; stages: [string, string][] }[] = [
  { k: 'ppp', label: 'PPP', stages: [['Lead-in', tr('To engage learners and set the context')], ['Presentation', 'To clarify the meaning, form and pronunciation of the target language'], ['Controlled practice', 'To give accurate practice of the form'], ['Freer practice', 'To use the language in a communicative task'], ['Feedback', 'To praise good use and correct errors']] },
  { k: 'ttt', label: 'Test-teach-test', stages: [['Lead-in', tr('To engage learners and set the context')], ['Test 1', tr('To see what learners already know')], ['Teach', tr('To clarify the language learners needed')], ['Test 2', 'To give further practice and check progress'], ['Feedback', 'To review and correct']] },
  { k: 'tbl', label: 'Task-based (TBL)', stages: [['Pre-task', 'To introduce the topic and the task'], ['Task', 'To complete a meaningful task'], ['Planning', 'To prepare a report on the task'], ['Report', 'To present to the class'], ['Language focus', 'To analyse and practise language from the task']] },
  { k: 'esa', label: 'ESA', stages: [['Engage', tr('To arouse interest and get learners talking')], ['Study', 'To focus on language and how it works'], ['Activate', 'To use the language freely']] },
  { k: 'receptive', label: 'Reading or listening', stages: [['Lead-in', tr('To engage learners and activate what they know')], ['Pre-teach vocabulary', 'To remove blocking vocabulary'], ['Gist task', 'To understand the main idea'], ['Detail task', 'To understand specific information'], ['Follow-up', 'To respond to the text in speaking or writing']] },
];
export const INTERACTION = ['T–Ss', 'S–S', 'Ss–Ss', 'S', 'Ss–T', 'Groups'];

export const CRITERIA: { g: string; items: { id: string; t: string }[] }[] = [
  { g: 'Planning', items: [{ id: 'p1', t: 'Clear, achievable aims' }, { id: 'p2', t: 'Stages that build towards the aim' }, { id: 'p3', t: 'Realistic timing' }] },
  { g: 'Language', items: [{ id: 'l1', t: 'Accurate analysis of the target language' }, { id: 'l2', t: 'Meaning checked clearly (concept questions, timelines)' }, { id: 'l3', t: 'Pronunciation modelled and drilled' }] },
  { g: 'Teaching', items: [{ id: 't1', t: 'Clear instructions, checked' }, { id: 't2', t: 'Monitoring and support during tasks' }, { id: 't3', t: 'Useful feedback and error correction' }] },
  { g: 'Learners', items: [{ id: 's1', t: tr('Learners speak more than the teacher') }, { id: 's2', t: 'Varied interaction: pairs and groups' }, { id: 's3', t: tr('Rapport, and every learner included') }] },
];
const RATINGS = ['Not yet', 'Achieved', 'Strong'];

// ------------------------------------------------------------------ the forms

function Area({ v, set, ph, rows = 2, ro }: { v: string; set: (v: string) => void; ph?: string; rows?: number; ro?: boolean }) {
  if (ro) return <span className="tt-ro">{v || <span className="hint">—</span>}</span>;
  // Grows with what is written, so a long stage never needs dragging open.
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  };
  return <textarea ref={fit} className="tt-in" rows={rows} value={v} placeholder={ph} onChange={(e) => (set(e.target.value), fit(e.target))} onKeyDown={(e) => e.stopPropagation()} />;
}

function Analysis({ v, set, ro }: { v: Data; set: (k: string, x: string) => void; ro?: boolean }) {
  const ccqs = (v.ccqs ?? '').split('\n');
  const probs = (v.problems ?? '').split('\n').filter((x, i, a) => x.trim() || i === a.length - 1 || ro);
  return (
    <div className="tt-grid analysis">
      <label className="tt-f wide">
        <span>Target language</span>
        <Area v={v.target ?? ''} set={(x) => set('target', x)} ph="I've been to Paris (present perfect for experience)" rows={1} ro={ro} />
      </label>
      <label className="tt-f wide">
        <span>Context and model sentence</span>
        <Area v={v.context ?? ''} set={(x) => set('context', x)} ph="Two friends talk about holidays…" ro={ro} />
      </label>
      <label className="tt-f">
        <span className="tt-mfp m">Meaning</span>
        <Area v={v.meaning ?? ''} set={(x) => set('meaning', x)} ph="A past experience; the time is not important" rows={3} ro={ro} />
      </label>
      <label className="tt-f">
        <span className="tt-mfp f">Form</span>
        <Area v={v.form ?? ''} set={(x) => set('form', x)} ph="subject + have/has + past participle" rows={3} ro={ro} />
      </label>
      <label className="tt-f">
        <span className="tt-mfp p">Pronunciation</span>
        <Area v={v.pron ?? ''} set={(x) => set('pron', x)} ph="/aɪv bɪn tə/ weak form of been, linking I‿have" rows={3} ro={ro} />
      </label>
      <div className="tt-f wide">
        <span>Concept-checking questions, with answers</span>
        {ro ? (
          <ol className="tt-ccq">{ccqs.filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ol>
        ) : (
          <Area v={v.ccqs ?? ''} set={(x) => set('ccqs', x)} ph={'Did she go to Paris? Yes.\nDo we know when? No.\nIs it important when? No.'} rows={4} />
        )}
      </div>
      <div className="tt-f wide">
        <span>Anticipated problems and solutions</span>
        {ro ? (
          <table className="tt-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>Solution</th>
              </tr>
            </thead>
            <tbody>
              {probs.filter((x) => x.trim()).map((x, i) => {
                const [p, s] = x.split('|');
                return (
                  <tr key={i}>
                    <td>{p?.trim()}</td>
                    <td>{s?.trim()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Area v={v.problems ?? ''} set={(x) => set('problems', x)} ph={tr('Learners say "I have been to Paris last year" | Timeline: finished time needs the past simple')} rows={3} />
        )}
        {!ro && <span className="hint">One per line: the problem, then | and the solution.</span>}
      </div>
    </div>
  );
}

function Plan({ v, set, ro, stagesFrom }: { v: Data; set: (k: string, x: string) => void; ro?: boolean; stagesFrom?: (k: string) => void }) {
  const n = Math.max(1, Number(v.n ?? 0) || 0);
  const cols: [string, string, number][] = [
    ['stage', 'Stage', 1],
    ['aim', 'Stage aim', 2],
    ['proc', 'Procedure', 3],
    ['int', 'Interaction', 1],
    ['time', 'Time', 1],
  ];
  return (
    <div className="tt-plan">
      <div className="tt-grid">
        <label className="tt-f wide">
          <span>Main aim</span>
          <Area v={v.aim ?? ''} set={(x) => set('aim', x)} ph="By the end of the lesson, learners will have…" ro={ro} />
        </label>
        <label className="tt-f">
          <span>Subsidiary aims</span>
          <Area v={v.subaims ?? ''} set={(x) => set('subaims', x)} ro={ro} />
        </label>
        <label className="tt-f">
          <span>Level and length</span>
          <Area v={v.level ?? ''} set={(x) => set('level', x)} ph="B1, 45 minutes" rows={1} ro={ro} />
        </label>
        <label className="tt-f">
          <span>Assumptions</span>
          <Area v={v.assume ?? ''} set={(x) => set('assume', x)} ph="Learners know the past simple" ro={ro} />
        </label>
      </div>
      {!ro && stagesFrom && (
        <span className="tt-frames">
          <span className="hint">Start the stages from</span>
          {FRAMEWORKS.map((f) => (
            <button key={f.k} type="button" className="ap-chip" onClick={() => stagesFrom(f.k)}>
              {f.label}
            </button>
          ))}
        </span>
      )}
      <div className="tt-stages">
        <table className="tt-table">
          <thead>
            <tr>
              {cols.map(([k, l]) => (
                <th key={k}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                {cols.map(([k, , r]) => (
                  <td key={k} className={'c-' + k}>
                    {k === 'int' && !ro ? (
                      <select value={v[`s${i}.${k}`] ?? ''} onChange={(e) => set(`s${i}.${k}`, e.target.value)}>
                        <option value="">—</option>
                        {INTERACTION.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    ) : (
                      <Area v={v[`s${i}.${k}`] ?? ''} set={(x) => set(`s${i}.${k}`, x)} rows={r} ro={ro} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!ro && (
          <span className="tt-rowacts">
            <button type="button" className="btn small-btn" onClick={() => set('n', String(n + 1))}>
              + Add a stage
            </button>
            {n > 1 && (
              <button type="button" className="btn link small" onClick={() => set('n', String(n - 1))}>
                Remove the last stage
              </button>
            )}
            <span className="hint">
              Total: {Array.from({ length: n }, (_, i) => parseInt(v[`s${i}.time`] ?? '', 10) || 0).reduce((a, b) => a + b, 0)} minutes
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function Observe({ v, set, ro }: { v: Data; set: (k: string, x: string) => void; ro?: boolean }) {
  return (
    <div className="tt-obs">
      <div className="tt-grid">
        <label className="tt-f">
          <span>{tr('Teacher')}</span>
          <Area v={v.who ?? ''} set={(x) => set('who', x)} rows={1} ro={ro} />
        </label>
        <label className="tt-f">
          <span>Observer</span>
          <Area v={v.by ?? ''} set={(x) => set('by', x)} rows={1} ro={ro} />
        </label>
        <label className="tt-f">
          <span>Lesson and date</span>
          <Area v={v.when ?? ''} set={(x) => set('when', x)} rows={1} ro={ro} />
        </label>
      </div>
      {CRITERIA.map((g) => (
        <div key={g.g} className="tt-crit">
          <span className="tt-crit-h">{g.g}</span>
          {g.items.map((c) => (
            <div key={c.id} className="tt-crit-row">
              <span className="tt-crit-t">{c.t}</span>
              <span className="tt-rate" role="radiogroup" aria-label={c.t}>
                {RATINGS.map((r, i) => (
                  <button key={r} type="button" role="radio" aria-checked={v[`r.${c.id}`] === String(i)} disabled={ro} className={'r' + i + (v[`r.${c.id}`] === String(i) ? ' on' : '')} onClick={() => set(`r.${c.id}`, v[`r.${c.id}`] === String(i) ? '' : String(i))}>
                    {r}
                  </button>
                ))}
              </span>
              <Area v={v[`c.${c.id}`] ?? ''} set={(x) => set(`c.${c.id}`, x)} ph="Evidence from the lesson" rows={1} ro={ro} />
            </div>
          ))}
        </div>
      ))}
      <div className="tt-grid">
        <label className="tt-f">
          <span>Strengths</span>
          <Area v={v.strengths ?? ''} set={(x) => set('strengths', x)} rows={3} ro={ro} />
        </label>
        <label className="tt-f">
          <span>Action points for the next lesson</span>
          <Area v={v.actions ?? ''} set={(x) => set('actions', x)} rows={3} ro={ro} />
        </label>
      </div>
    </div>
  );
}

function Form({ kind, v, set, setMany, ro }: { kind: TTKind; v: Data; set: (k: string, x: string) => void; setMany?: (p: Data) => void; ro?: boolean }) {
  const stagesFrom = (k: string) => {
    const f = FRAMEWORKS.find((x) => x.k === k);
    if (!f) return;
    const p: Data = { n: String(f.stages.length) };
    f.stages.forEach(([s, a], i) => ((p[`s${i}.stage`] = s), (p[`s${i}.aim`] = a)));
    setMany?.(p);
  };
  if (kind === 'analysis') return <Analysis v={v} set={set} ro={ro} />;
  if (kind === 'plan') return <Plan v={v} set={set} ro={ro} stagesFrom={stagesFrom} />;
  if (kind === 'loop')
    return (
      <div className="tt-grid">
        <label className="tt-f wide">
          <span>The technique</span>
          <Area v={v.tech ?? ''} set={(x) => set('tech', x)} ph="A jigsaw reading" rows={1} ro={ro} />
        </label>
        <label className="tt-f wide">
          <span>What I did, and why</span>
          <Area v={v.why ?? ''} set={(x) => set('why', x)} ph="You each read part of the text, so you had a real reason to talk…" rows={4} ro={ro} />
        </label>
        <label className="tt-f wide">
          <span>Questions for you</span>
          <Area v={v.qs ?? ''} set={(x) => set('qs', x)} ph="How would you set this up with a large class?" rows={2} ro={ro} />
        </label>
      </div>
    );
  return <Observe v={v} set={set} ro={ro} />;
}

// What trainees see: the trainer's model, or a form to complete.
export function TTBlock({ kind, title, mode, data, value, onChange, disabled }: { kind: TTKind; title: string; mode: 'model' | 'complete'; data: Data; value?: Fields; onChange?: (v: Fields) => void; disabled?: boolean }) {
  const [opened, setOpened] = useState(false);
  if (kind === 'loop')
    return (
      <div className={'tt k-loop' + (opened ? ' open' : '')}>
        <button type="button" className="tt-loop-btn" onClick={() => setOpened((o) => !o)} aria-expanded={opened}>
          <span className="tt-kind">Step back</span>
          <b>{title || data.tech || 'What did your trainer just do?'}</b>
          <span className="tt-loop-chev" aria-hidden="true">{opened ? '−' : '+'}</span>
        </button>
        {opened && <Form kind="loop" v={data} set={() => {}} ro />}
      </div>
    );
  return <TTForm kind={kind} title={title} mode={mode} data={data} value={value} onChange={onChange} disabled={disabled} />;
}
function TTForm({ kind, title, mode, data, value, onChange, disabled }: { kind: TTKind; title: string; mode: 'model' | 'complete'; data: Data; value?: Fields; onChange?: (v: Fields) => void; disabled?: boolean }) {
  const label = TT_KINDS.find((k) => k.k === kind)?.label ?? '';
  const model = mode === 'model';
  const cur = model ? data : { ...data, ...(value?.fields ?? {}) };
  const [local, setLocal] = useState<Data>(cur);
  useEffect(() => setLocal(model ? data : { ...data, ...(value?.fields ?? {}) }), [JSON.stringify(data), JSON.stringify(value?.fields ?? {}), model]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMany = (p: Data) => {
    const next = { ...local, ...p };
    setLocal(next);
    onChange?.({ fields: Object.fromEntries(Object.entries(next).filter(([key]) => next[key] !== data[key])) });
  };
  const set = (k: string, x: string) => setMany({ [k]: x });
  return (
    <div className={'tt k-' + kind}>
      <div className="tt-head">
        <span className="tt-kind">{label}</span>
        {title && <b>{title}</b>}
        {!model && <span className="hint">Complete it. Your trainer sees your answers.</span>}
      </div>
      <Form kind={kind} v={local} set={set} setMany={setMany} ro={model || disabled || !onChange} />
    </div>
  );
}

function TTView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const a = node.attrs as { kind: TTKind; title: string; mode: 'model' | 'complete'; data: Data };
  // In a shared document everyone writes in the same form, so the choice is only for lessons.
  const shared = editor.extensionManager.extensions.some((e) => e.name === 'collaboration');
  return (
    <NodeViewWrapper className={'block-node tt-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{TT_KINDS.find((k) => k.k === a.kind)?.label}</span>
        {a.kind !== 'loop' && !shared && <span className="seg small-seg" role="radiogroup" aria-label="How trainees use it">
          {([
            ['model', 'A model to read'],
            ['complete', 'For trainees to complete'],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={a.mode === k} className={a.mode === k ? 'on' : ''} onClick={() => updateAttributes({ mode: k })}>
              {l}
            </button>
          ))}
        </span>}
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="tt-title" value={a.title} placeholder="Title (optional)" onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      {!shared && <span className="hint">{a.kind === 'loop' ? 'Trainees see a closed box; they open it after you model the technique.' : a.mode === 'model' ? 'Fill it in: trainees read it.' : 'Fill in what trainees start with, or leave it empty: each trainee completes their own.'}</span>}
      <div className={'tt k-' + a.kind}>
        <Form kind={a.kind} v={a.data ?? {}} set={(k, x) => updateAttributes({ data: { ...(node.attrs.data ?? {}), [k]: x } })} setMany={(p) => updateAttributes({ data: { ...(node.attrs.data ?? {}), ...p } })} />
      </div>
    </NodeViewWrapper>
  );
}

export const TTNode = Node.create({
  name: 'tt',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, kind: { default: 'analysis' }, title: { default: '' }, mode: { default: 'model' }, data: { default: {} } }),
  parseHTML: () => [{ tag: 'div[data-tt]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-tt': '' })],
  addNodeView: () => ReactNodeViewRenderer(TTView),
});
export const newTT = (kind: TTKind) => ({ type: 'tt', attrs: { id: newId(), kind, title: '', mode: kind === 'observe' ? 'complete' : 'model', data: {} } });

// ------------------------------------------------------------------ comments at moments in a video

type Note = { id: string; t: number; text: string; by: string; name: string; at: number };
const notesCol = (classId: string, key: string) => collection(db, 'classes', classId, 'ttnotes', key, 'c');

export function TimeNotes({ classId, noteKey, time, seek, teacher }: { classId: string; noteKey: string; time: number; seek: (t: number) => void; teacher?: boolean }) {
  const { user, profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!classId || !noteKey) return;
    return onSnapshot(query(notesCol(classId, noteKey), orderBy('t')), (s) => setNotes(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Note, 'id'>) }))), () => {});
  }, [classId, noteKey]);
  const name = profile?.role === 'learner' ? profile.displayName : user?.displayName || 'Trainer';
  const add = () => {
    const t = Math.max(0, time);
    if (!text.trim() || !user) return;
    void addDoc(notesCol(classId, noteKey), { t, text: text.trim().slice(0, 1000), by: user.uid, name, at: Date.now() });
    setText('');
  };
  return (
    <div className="tn">
      <div className="tn-add">
        <span className="tn-at">{fmtTime(time)}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="A comment at this moment" aria-label="Comment" />
        <button type="button" className="btn small-btn" disabled={!text.trim()} onClick={add}>
          Add
        </button>
      </div>
      {notes.length > 0 && (
        <ol className="tn-list">
          {notes.map((n) => (
            <li key={n.id} className={Math.abs(time - n.t) < 2 ? 'now' : ''}>
              <button type="button" className="tn-t" onClick={() => seek(n.t)}>
                {fmtTime(n.t)}
              </button>
              <span className="tn-text">
                <b>{n.name.split(' ')[0]}</b> {n.text}
              </span>
              {(teacher || n.by === user?.uid) && (
                <button type="button" className="icon-btn" aria-label="Delete the comment" onClick={() => void deleteDoc(doc(notesCol(classId, noteKey), n.id))}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Is this class a teacher training course? Cached, for the editor and what trainees see.
const kinds: Record<string, string> = {};
export function useTrainingClass(classId?: string) {
  const [k, setK] = useState(classId ? kinds[classId] ?? '' : '');
  useEffect(() => {
    if (!classId || classId.includes(':')) return;
    return onSnapshot(
      doc(db, 'classes', classId),
      (s) => {
        kinds[classId] = String(s.data()?.kind ?? 'language');
        setK(kinds[classId]);
      },
      () => {},
    );
  }, [classId]);
  return k === 'training';
}

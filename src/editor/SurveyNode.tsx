import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { newQ, TEMPLATES, TYPE_LABELS, type SurveyQ, type SurveyType } from '../lib/survey';
import { Grip } from './nodes';

// A survey in a task: rating scales, faces, thumbs, choices, ranking and open answers.
function SurveyView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const qs: SurveyQ[] = node.attrs.questions ?? [];
  const setQ = (i: number, p: Partial<SurveyQ>) => updateAttributes({ questions: qs.map((q, k) => (k === i ? { ...q, ...p } : q)) });
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  return (
    <NodeViewWrapper className={'block-node sv-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Survey</span>
        <select
          className="sv-template"
          value=""
          aria-label="Start from a template"
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.key === e.target.value);
            if (t && (!qs.some((q) => q.prompt) || window.confirm('Replace the questions with the template?'))) updateAttributes({ title: t.title, questions: t.questions() });
          }}
        >
          <option value="">Templates…</option>
          {TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="r-title" value={node.attrs.title ?? ''} placeholder="Title (optional), for example: How was today’s lesson?" onKeyDown={stop} onChange={(e) => updateAttributes({ title: e.target.value })} />
      <label className="r-share">
        <input type="checkbox" checked={!!node.attrs.anonymous} onChange={() => updateAttributes({ anonymous: !node.attrs.anonymous })} />
        Anonymous
        <span className="hint">You see the answers but not who gave them. This can’t be changed once learners answer.</span>
      </label>
      <div className="sv-edit">
        {qs.map((q, i) => (
          <div key={q.id} className="sv-edit-q">
            <span className="sv-edit-head">
              <span className="pq-n">{i + 1}</span>
              <select value={q.type} aria-label="Question type" onChange={(e) => setQ(i, { ...newQ(e.target.value as SurveyType, q.prompt), id: q.id, ...(q.options && ['single', 'multi', 'rank'].includes(e.target.value) ? { options: q.options } : {}) })}>
                {(Object.keys(TYPE_LABELS) as SurveyType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className="sv-edit-move">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => updateAttributes({ questions: swap(qs, i, i - 1) })}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === qs.length - 1} onClick={() => updateAttributes({ questions: swap(qs, i, i + 1) })}>
                  ↓
                </button>
                <button type="button" className="icon-btn" aria-label="Remove question" onClick={() => updateAttributes({ questions: qs.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </span>
            </span>
            <input className="sv-edit-prompt" value={q.prompt} placeholder="The question" onKeyDown={stop} onChange={(e) => setQ(i, { prompt: e.target.value })} />
            {q.type === 'scale' && (
              <span className="pq-row">
                <select value={q.max ?? 5} aria-label="Scale" onChange={(e) => setQ(i, { max: Number(e.target.value) })}>
                  <option value={5}>1 to 5</option>
                  <option value={10}>1 to 10</option>
                </select>
                <input value={q.low ?? ''} placeholder="Label for 1" onKeyDown={stop} onChange={(e) => setQ(i, { low: e.target.value })} />
                <input value={q.high ?? ''} placeholder={`Label for ${q.max ?? 5}`} onKeyDown={stop} onChange={(e) => setQ(i, { high: e.target.value })} />
              </span>
            )}
            {(q.type === 'single' || q.type === 'multi' || q.type === 'rank') && (
              <div className="pq-lines">
                {(q.options ?? []).map((o, k) => (
                  <span key={k} className="pq-line">
                    <input value={o} placeholder={`Option ${k + 1}`} onKeyDown={stop} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} />
                    <button type="button" className="icon-btn" aria-label="Remove option" disabled={(q.options ?? []).length <= 2} onClick={() => setQ(i, { options: (q.options ?? []).filter((_, j) => j !== k) })}>
                      ×
                    </button>
                  </span>
                ))}
                <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => setQ(i, { options: [...(q.options ?? []), ''] })}>
                  + Option
                </button>
              </div>
            )}
          </div>
        ))}
        <span className="sv-add">
          Add a question:
          {(Object.keys(TYPE_LABELS) as SurveyType[]).map((t) => (
            <button key={t} type="button" className="btn small-btn" onClick={() => updateAttributes({ questions: [...qs, newQ(t)] })}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </span>
      </div>
    </NodeViewWrapper>
  );
}

function swap<T>(a: T[], i: number, j: number) {
  const out = [...a];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export const SurveyNode = Node.create({
  name: 'survey',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, title: { default: '' }, anonymous: { default: false }, questions: { default: [] } }),
  parseHTML: () => [{ tag: 'div[data-survey]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-survey': '' })],
  addNodeView: () => ReactNodeViewRenderer(SurveyView),
});

export const newSurvey = () => ({ type: 'survey', attrs: { id: 's' + newId(), title: '', anonymous: true, questions: [newQ('scale', '')] } });

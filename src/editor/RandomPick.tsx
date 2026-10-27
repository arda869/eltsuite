import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { Grip } from './nodes';
import { PICK_LOOKS, PICK_SYMBOLS, PickStage, type PickLook } from '../components/PickStage';

// A small, non-interactive preview of how learners will see it.
function PickPreview({ mode, look, symbol, titles }: { mode: PickMode; look: PickLook; symbol: string; titles: string[] }) {
  return (
    <div className="pick-preview-inner" aria-hidden="true">
      <PickStage mode={mode} look={look} symbol={symbol} repeat titles={titles} state={{ h: [], b: [] }} canDraw={false} onDraw={() => {}} renderCard={() => null} />
    </div>
  );
}

// "Draw a card": a pile of cards with rich text (and questions) on them. Learners draw one at random.
// The same cards can be shown as a spinning wheel or as boxes to open.

export type PickMode = 'cards' | 'wheel' | 'boxes';
export const PICK_MODES: { key: PickMode; label: string }[] = [
  { key: 'cards', label: 'Draw a card' },
  { key: 'wheel', label: 'Spin the wheel' },
  { key: 'boxes', label: 'Open a box' },
];

function RandomPickView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
  const mode = (node.attrs.mode ?? 'cards') as PickMode;
  const repeat = !!node.attrs.repeat;
  const play = node.attrs.play === 'class' ? 'class' : 'own';
  const whoDraws = node.attrs.whoDraws === 'anyone' ? 'anyone' : 'teacher';
  const addCard = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    const end = pos + node.nodeSize - 1;
    editor.chain().insertContentAt(end, newPickCard(node.childCount)).focus(end + 2).run();
  };
  return (
    <NodeViewWrapper className={'pick-node block-node mode-' + mode + (selected ? ' is-selected' : '')}>
      <div className="mcq-tools pick-tools" contentEditable={false}>
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Random pick</span>
        <span className="seg small-seg" role="radiogroup" aria-label="Show as">
          {PICK_MODES.map((m) => (
            <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={mode === m.key ? 'on' : ''} onClick={() => updateAttributes({ mode: m.key })}>
              {m.label}
            </button>
          ))}
        </span>
        <button type="button" className="remove" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="pick-settings" contentEditable={false}>
        <span className="seg small-seg" role="radiogroup" aria-label="Repeats">
          <button type="button" role="radio" aria-checked={!repeat} className={!repeat ? 'on' : ''} onClick={() => updateAttributes({ repeat: false })} title="Once a card is drawn it leaves the pile">
            Each card once
          </button>
          <button type="button" role="radio" aria-checked={repeat} className={repeat ? 'on' : ''} onClick={() => updateAttributes({ repeat: true })} title="Every draw is from the full pile">
            Cards can repeat
          </button>
        </span>
        <span className="seg small-seg" role="radiogroup" aria-label="Who plays">
          <button type="button" role="radio" aria-checked={play === 'own'} className={play === 'own' ? 'on' : ''} onClick={() => updateAttributes({ play: 'own' })} title="Every learner draws on their own screen">
            Each learner plays alone
          </button>
          <button type="button" role="radio" aria-checked={play === 'class'} className={play === 'class' ? 'on' : ''} onClick={() => updateAttributes({ play: 'class' })} title="One pile for the class; every draw shows on everyone's screen">
            Together, on every screen
          </button>
        </span>
        {play === 'class' && (
          <span className="seg small-seg" role="radiogroup" aria-label="Who can draw">
            <button type="button" role="radio" aria-checked={whoDraws === 'teacher'} className={whoDraws === 'teacher' ? 'on' : ''} onClick={() => updateAttributes({ whoDraws: 'teacher' })}>
              Only I draw
            </button>
            <button type="button" role="radio" aria-checked={whoDraws === 'anyone'} className={whoDraws === 'anyone' ? 'on' : ''} onClick={() => updateAttributes({ whoDraws: 'anyone' })}>
              Any learner can draw
            </button>
          </span>
        )}
        <span className="pick-look" role="radiogroup" aria-label="Look">
          <span className="hint">Look</span>
          {PICK_LOOKS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={(node.attrs.look ?? 'graphite') === l.key} title={l.label} className={'look-sw' + ((node.attrs.look ?? 'graphite') === l.key ? ' on' : '')} onClick={() => updateAttributes({ look: l.key })}>
              <span style={{ background: l.sw[0] }} />
              <span style={{ background: l.sw[1] }} />
            </button>
          ))}
        </span>
        {mode === 'cards' && (
          <span className="pick-look" role="radiogroup" aria-label="Symbol on the back of the cards">
            <span className="hint">Card back</span>
            {PICK_SYMBOLS.map((sy) => (
              <button key={sy || 'none'} type="button" role="radio" aria-checked={(node.attrs.symbol ?? '✦') === sy} className={'sym-btn' + ((node.attrs.symbol ?? '✦') === sy ? ' on' : '')} onClick={() => updateAttributes({ symbol: sy })} title={sy ? 'Symbol ' + sy : 'No symbol'}>
                {sy || '–'}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="pick-preview" contentEditable={false}>
        <PickPreview mode={mode} look={(node.attrs.look ?? 'graphite') as PickLook} symbol={node.attrs.symbol ?? '✦'} titles={node.content.content.map((c) => c.attrs.title as string)} />
      </div>
      <NodeViewContent className="pick-cards" />
      <div className="pick-foot" contentEditable={false}>
        <button type="button" className="btn small-btn dashed" onClick={addCard}>
          + Add card
        </button>
        <span className="hint">
          {node.childCount} {node.childCount === 1 ? 'card' : 'cards'} · cards can hold text, images and questions. Questions only count once their card is drawn.
        </span>
      </div>
    </NodeViewWrapper>
  );
}

function PickCardView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  const parent = typeof pos === 'number' ? editor.state.doc.resolve(pos).parent : null;
  const only = parent?.type.name === 'randomPick' && parent.childCount <= 1;
  const mode = parent?.attrs.mode ?? 'cards';
  return (
    <NodeViewWrapper className="pick-card-node">
      <div className="pick-card-head" contentEditable={false}>
        <span className="pick-card-n" />
        <input aria-label={mode === 'wheel' ? 'Label on the wheel (optional)' : 'Card name (optional, shown after it is drawn)'}
          className="pick-card-title"
          value={node.attrs.title ?? ''}
          placeholder={mode === 'wheel' ? 'Label on the wheel (optional)' : 'Card name (optional, shown after it is drawn)'}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        {!only && (
          <button type="button" className="icon-btn" aria-label="Delete card" title="Delete card" onClick={deleteNode}>
            ×
          </button>
        )}
      </div>
      <NodeViewContent className="pick-card-body" />
    </NodeViewWrapper>
  );
}

export const PickCard = Node.create({
  name: 'pickCard',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({ title: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-pick-card]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-pick-card': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(PickCardView),
});

export const RandomPick = Node.create({
  name: 'randomPick',
  group: 'block',
  content: 'pickCard+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null },
    mode: { default: 'cards' },
    repeat: { default: false },
    play: { default: 'own' }, // 'own': each learner plays alone · 'class': one pile, the same on every screen
    whoDraws: { default: 'teacher' },
    look: { default: 'graphite' },
    symbol: { default: '✦' }, // when played together: 'teacher' or 'anyone'
  }),
  parseHTML: () => [{ tag: 'div[data-random-pick]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-random-pick': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(RandomPickView),
});

export const newPickCard = (_i = 0) => ({ type: 'pickCard', attrs: { title: '' }, content: [{ type: 'paragraph' }] });
export const newRandomPick = (mode: PickMode = 'cards') => ({
  type: 'randomPick',
  attrs: { id: newId(), mode, repeat: false, play: 'own', whoDraws: 'teacher' },
  content: [newPickCard(), newPickCard(), newPickCard()],
});

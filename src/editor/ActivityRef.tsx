import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import { RefChip, useRefs } from '../components/Identity';
import { refSnap, refText, resolveRef, type RefAttrs } from '../lib/identity';

// A reference inside a sentence to another activity ("the words from Activation 2") or to a
// version of this one ("Learner A starts"). It sits on the line like a question number. The label
// comes from the lesson each time, by the target's stable anchor; a target that has gone is
// marked and the teacher is told.

function ActivityRefView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const a = node.attrs as RefAttrs & { fresh?: boolean };
  const { targets, versions, here } = useRefs();
  const view = resolveRef(a, targets);
  const [open, setOpen] = useState(!!a.fresh);
  const [tab, setTab] = useState<'activity' | 'version'>(a.kind === 'version' ? 'version' : targets?.some((t) => t.anchor !== here) ? 'activity' : 'version');
  const [q, setQ] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const pos = usePopPos(ref, open, 300);
  // Keep the last label with the reference, for places that have no lesson to look at.
  useEffect(() => {
    if (!editor.isEditable || !targets) return;
    const s = refSnap(view);
    if (s && JSON.stringify(s) !== JSON.stringify(a.snap ?? null)) updateAttributes({ snap: s });
  }, [view.label, view.n, view.icon, view.colour, view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (a.fresh) updateAttributes({ fresh: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), close());
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key, true));
  });
  // A reference left without a target when its picker closes is removed.
  const close = () => {
    setOpen(false);
    if (!a.anchor && a.kind !== 'version') deleteNode();
    else editor.commands.focus();
  };
  const choose = (patch: RefAttrs) => {
    const next = { ...a, ...patch };
    updateAttributes({ ...patch, snap: refSnap(resolveRef(next, targets)) });
    setOpen(false);
    editor.commands.focus();
  };
  const list = (targets ?? []).filter((t) => t.anchor !== here && `${t.n} ${t.title} ${t.identity?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const letters = versions.length ? versions : ['A', 'B'];
  return (
    <NodeViewWrapper as="span" className="aref-node" ref={ref} data-drag-handle>
      <span contentEditable={false}>
        <RefChip view={view} editing={selected || open} onClick={editor.isEditable ? () => setOpen((o) => !o) : undefined} />
      </span>
      {open && (
        <span className="def-pop link-pop aref-pop" contentEditable={false} style={{ position: 'fixed', ...pos }} role="dialog" aria-label="Refer to">
          <span className="pop-type">Refer to</span>
          {view.missing && <p className="aref-warn">“{refText(view)}” is no longer in this lesson. Choose another activity or remove the reference.</p>}
          <span className="seg small-seg" role="tablist" aria-label="Refer to">
            <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
              An activity
            </button>
            <button type="button" role="tab" aria-selected={tab === 'version'} className={tab === 'version' ? 'on' : ''} onClick={() => setTab('version')}>
              A learner version
            </button>
          </span>
          {tab === 'activity' && (
            <>
              {(targets?.length ?? 0) > 6 && <input className="link-search" type="search" aria-label="Find an activity" autoFocus value={q} placeholder="Find an activity" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />}
              <span className="link-list">
                {!targets && <span className="hint">Save this activity in a lesson to refer to its other activities.</span>}
                {targets && list.length === 0 && <span className="hint">No other activities in this lesson yet.</span>}
                {list.map((t) => (
                  <button key={t.anchor} type="button" className={'link-item' + (a.kind !== 'version' && a.anchor === t.anchor ? ' on' : '')} onClick={() => choose({ kind: 'activity', anchor: t.anchor, version: '' })}>
                    <span className="n">{t.n}</span>
                    <span>
                      <RefChip view={resolveRef({ kind: 'activity', anchor: t.anchor }, targets)} />
                      {t.title && <span className="aref-title"> {t.title}</span>}
                    </span>
                  </button>
                ))}
              </span>
            </>
          )}
          {tab === 'version' && (
            <span className="link-list">
              {letters.map((v) => (
                <button key={v} type="button" className={'link-item' + (a.kind === 'version' && a.version === v ? ' on' : '')} onClick={() => choose({ kind: 'version', version: v, anchor: '' })}>
                  <RefChip view={resolveRef({ kind: 'version', version: v }, targets)} />
                </button>
              ))}
              <span className="hint">Shows only the sign and name. Learners never see another version’s content.</span>
            </span>
          )}
          <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => (deleteNode(), editor.commands.focus())}>
            Remove reference
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const ActivityRefNode = Node.create({
  name: 'activityRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    kind: { default: 'activity' },
    anchor: { default: '' },
    version: { default: '' },
    snap: { default: null, parseHTML: (el) => JSON.parse((el as HTMLElement).getAttribute('data-snap') || 'null'), renderHTML: (a) => ({ 'data-snap': JSON.stringify(a.snap) }) },
    fresh: { default: false, rendered: false },
  }),
  parseHTML: () => [{ tag: 'span[data-aref]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-aref': '' })],
  addNodeView: () => ReactNodeViewRenderer(ActivityRefView),
});

export const insertActivityRef = (editor: Editor) => editor.chain().focus().insertContent({ type: 'activityRef', attrs: { fresh: true } }).run();

export const REF_TOOL_FACE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="8" height="10" rx="2" />
    <path d="M14 12h7M18 8.5l3.5 3.5-3.5 3.5" />
  </svg>
);

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { newSharedDoc, useMyDocs } from '../lib/sharedDocs';
import { Grip } from '../editor/nodes';
import { StoryStripFit, type SbItem, type SbScene, type SbSnap } from './Stage';

// A storyboard inside a lesson, a message or a Collab document. The block keeps a copy of the
// storyboard's scenes, so everyone who sees the lesson sees them (and they print), even people the
// file itself isn't shared with. The copy is brought up to date from the file whenever a teacher
// who can open the file has the lesson open to edit, or presses "Update".

export type SbAttrs = { docId: string; title: string; cols: number; snap: SbSnap | null };

export async function readStoryboard(id: string): Promise<SbSnap & { title: string }> {
  const [sc, it, d] = await Promise.all([getDocs(query(collection(db, 'sharedDocs', id, 'scenes'), orderBy('order'))), getDocs(collection(db, 'sharedDocs', id, 'sbitems')), getDoc(doc(db, 'sharedDocs', id))]);
  return {
    title: String(d.data()?.title ?? ''),
    scenes: sc.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SbScene, 'id'>) })),
    items: it.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SbItem, 'id'>) })),
  };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function StoryboardView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const a = node.attrs as SbAttrs;
  const { user } = useAuth();
  const { mine, withMe } = useMyDocs(a.docId ? undefined : user?.uid);
  const [busy, setBusy] = useState('');
  const editable = editor.isEditable;
  const refresh = async (quiet = false) => {
    if (!a.docId) return;
    if (!quiet) setBusy('Updating…');
    try {
      const { title, ...snap } = await readStoryboard(a.docId);
      if (!same(snap, a.snap) || (title && title !== a.title)) updateAttributes({ snap, title: title || a.title });
      setBusy('');
    } catch {
      setBusy(quiet ? '' : 'We couldn’t open the storyboard. It may not be shared with you.');
    }
  };
  // Keep the copy up to date while the lesson is open for editing.
  useEffect(() => {
    if (editable && a.docId) void refresh(true);
  }, [a.docId, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  const boards = [...(mine ?? []), ...(withMe ?? [])].filter((d, i, all) => (d.kind === 'storyboard' || (d.kind==='design'&&d.designType==='storyboard')) && all.findIndex((x) => x.id === d.id) === i);
  const make = async () => {
    if (!user) return;
    const w = window.open('about:blank', '_blank');
    const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'storyboard', 'Storyboard');
    updateAttributes({ docId: id, title: 'Storyboard', snap: null });
    if (w) w.location.href = `/doc/${id}`;
  };

  return (
    <NodeViewWrapper className={'block-node sbn' + (selected ? ' is-selected' : '')} contentEditable={false}>
      {editable && (
        <div className="mcq-tools">
          <Grip editor={editor} getPos={getPos} />
          <span className="block-label">Storyboard</span>
          {a.docId && (
            <>
              <span className="sbn-title">{a.title}</span>
              <label className="sbn-cols">
                <span>Scenes a row</span>
                <select value={a.cols ?? 2} onChange={(e) => updateAttributes({ cols: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="sbn-b" onClick={() => void refresh()} data-tip="Bring in the latest changes from the file">
                Update
              </button>
              <a className="sbn-b" href={`/doc/${a.docId}`} target="_blank" rel="noreferrer">
                Open the storyboard
              </a>
              <button type="button" className="sbn-b" onClick={() => updateAttributes({ docId: '', title: '', snap: null })}>
                Choose another
              </button>
            </>
          )}
          <button type="button" className="remove" onClick={() => deleteNode()}>
            Remove
          </button>
        </div>
      )}
      {!a.docId ? (
        editable ? (
          <div className="sbn-pick">
            <p className="hint">Choose a storyboard from your files, or make a new one. Learners see its scenes here, and they print with the worksheet.</p>
            <div className="sbn-list">
              {boards.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="sbn-item"
                  onClick={async () => {
                    updateAttributes({ docId: d.id, title: d.title || 'Storyboard', snap: null });
                    setBusy('One moment…');
                    try {
                      const { title, ...snap } = await readStoryboard(d.id);
                      updateAttributes({ snap, title: title || d.title || 'Storyboard' });
                      setBusy('');
                    } catch {
                      setBusy('We couldn’t open that storyboard. Try again in a moment.');
                    }
                  }}
                >
                  {d.title || 'Untitled storyboard'}
                </button>
              ))}
              {mine && withMe && !boards.length && <span className="hint">No storyboards yet.</span>}
              <button type="button" className="sbn-item new" onClick={() => void make()}>
                + Make a new storyboard
              </button>
            </div>
          </div>
        ) : null
      ) : a.snap && a.snap.scenes?.length ? (
        <StoryStripFit snap={a.snap} cols={a.cols} />
      ) : (
        <p className="hint sbn-empty">{busy || (editable ? 'This storyboard has no scenes yet. Open it to add some, then press Update.' : '')}</p>
      )}
      {busy && a.snap && <p className="hint">{busy}</p>}
    </NodeViewWrapper>
  );
}

export const StoryboardNode = Node.create({
  name: 'storyboard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      docId: { default: '' },
      title: { default: '' },
      cols: { default: 2 },
      snap: { default: null, parseHTML: (el) => JSON.parse(el.getAttribute('data-snap') || 'null'), renderHTML: (a) => ({ 'data-snap': JSON.stringify(a.snap) }) },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-storyboard]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-storyboard': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(StoryboardView);
  },
});

export const newStoryboard = () => ({ type: 'storyboard', attrs: { docId: '', title: '', cols: 2, snap: null } });

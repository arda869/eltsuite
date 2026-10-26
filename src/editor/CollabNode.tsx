import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Grip } from './nodes';
import { useEditorClass } from './context';
import { newId } from '../lib/tasks';
import { useGroupSets } from '../lib/groups';
import { NoteEditor } from '../components/NoteEditor';
import { UiIcon } from '../components/UiIcon';
import type { CollabAttrs } from '../collab/CollabTask';
import type { CollabMode } from '../collab/suggest';
import { CollabTask } from '../collab/CollabTask';

// "Collaborate": a document the class writes together, live. The block holds the settings;
// the writing lives in the shared document, kept with the class (and listed in the archive).

export type CollabEntry = { id: string; title: string; kind: string; scope: string; at?: unknown };
export const registryCol = (classId: string) => collection(db, 'classes', classId, 'collabs');

function CollabView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const { classId, classmates } = useEditorClass();
  const a = node.attrs as CollabAttrs;
  const sets = useGroupSets(classId);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState<CollabEntry[] | null>(null);
  // Every shared document is listed with its class, so it can be found and continued later.
  useEffect(() => {
    if (!classId || !a.docKey) return;
    setDoc(doc(registryCol(classId), a.docKey), { title: a.title || 'Shared document', kind: a.kind, scope: a.scope, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [classId, a.docKey, a.title, a.kind, a.scope]);
  const modes = a.modes ?? [];
  const toggleMode = (m: CollabMode) => updateAttributes({ modes: modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m] });
  const seg = <K extends string>(list: [K, string][], cur: K, set: (k: K) => void, aria: string) => (
    <span className="seg small-seg" role="radiogroup" aria-label={aria}>
      {list.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={cur === k} className={cur === k ? 'on' : ''} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </span>
  );
  return (
    <NodeViewWrapper className={'block-node co-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Collaborate</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="co-settings">
        <label className="md-set co-title">
          <span>Name</span>
          <input value={a.title} onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="For example: Our class story" />
        </label>
        <div className="md-set">
          <span>Who writes together</span>
          {seg(
            [
              ['class', 'The whole class'],
              ['group', 'Each group'],
              ['solo', 'Each learner, then their group'],
            ],
            a.scope,
            (k) => updateAttributes({ scope: k }),
            'Who writes together',
          )}
        </div>
        {a.scope !== 'class' && (
          <label className="md-set">
            <span>Groups</span>
            <select value={a.groupSet} onChange={(e) => updateAttributes({ groupSet: e.target.value })}>
              <option value="">{sets.length ? 'The first group set' : 'No groups yet'}</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="md-set">
          <span>Learners can</span>
          <span className="up-kinds">
            {(
              [
                ['edit', 'Edit'],
                ['suggest', 'Suggest'],
                ['comment', 'Comment'],
              ] as [CollabMode, string][]
            ).map(([m, l]) => (
              <button key={m} type="button" className={'ap-chip' + (modes.includes(m) ? ' on' : '')} onClick={() => toggleMode(m)}>
                {l}
              </button>
            ))}
          </span>
        </div>
        <div className="md-set">
          <span>Shows</span>
          {seg(
            [
              ['inline', 'In the task'],
              ['expand', 'In the task, can enlarge'],
              ['full', 'Full screen'],
            ],
            a.display,
            (k) => updateAttributes({ display: k }),
            'Shows',
          )}
        </div>
        <label className="check-row up-shrink">
          <input type="checkbox" checked={a.download} onChange={(e) => updateAttributes({ download: e.target.checked })} />
          Learners can download it (Word or PDF)
        </label>
      </div>
      <div className="co-start">
        <span className="hint">
          {a.scope === 'class' ? 'Starting text: it is put in the document when it is first opened.' : a.scope === 'group' ? 'Starting text: each group’s document begins with it.' : 'Starting text: each learner’s document begins with it.'}
        </span>
        <NoteEditor value={a.start} onChange={(v) => updateAttributes({ start: v })} placeholder="Optional: a heading, questions to answer, a text to improve…" />
      </div>
      <span className="co-acts">
        <button type="button" className="btn small-btn" onClick={() => setOpen((o) => !o)}>
          <UiIcon name="task" size={14} /> {open ? 'Close the documents' : a.scope === 'class' ? 'Open the class document' : 'Open the documents'}
        </button>
        <button
          type="button"
          className="btn small-btn"
          onClick={async () => {
            const s = await getDocs(registryCol(classId)).catch(() => null);
            setChoosing((s?.docs ?? []).map((d) => ({ id: d.id, ...(d.data() as Omit<CollabEntry, 'id'>) })).filter((d) => d.id !== a.docKey));
          }}
          disabled={!classId}
        >
          Keep working on an earlier document…
        </button>
        <button type="button" className="btn link" onClick={() => updateAttributes({ docKey: newId() })} data-tip="Start a new, empty document for this task">
          Start a new document
        </button>
      </span>
      {choosing && (
        <div className="co-choose">
          <span className="hint">{choosing.length ? 'This task will open the document you choose, with everything written in it so far.' : 'There are no other shared documents in this class yet.'}</span>
          {choosing.map((d) => (
            <button key={d.id} type="button" className="ap-chip" onClick={() => (updateAttributes({ docKey: d.id, title: a.title || d.title, scope: d.scope || a.scope }), setChoosing(null))}>
              {d.title}
            </button>
          ))}
          <button type="button" className="btn link" onClick={() => setChoosing(null)}>
            Cancel
          </button>
        </div>
      )}
      {open && classId && <CollabTask a={a} classId={classId} teacher classmates={classmates} />}
    </NodeViewWrapper>
  );
}

export const CollabBlock = Node.create({
  name: 'collab',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: '' },
    docKey: { default: '' },
    kind: { default: 'doc' },
    title: { default: '' },
    scope: { default: 'group' },
    groupSet: { default: '' },
    modes: { default: ['edit', 'suggest', 'comment'] },
    display: { default: 'expand' },
    download: { default: true },
    start: { default: null },
  }),
  parseHTML: () => [{ tag: 'div[data-collab]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-collab': '' })],
  addNodeView: () => ReactNodeViewRenderer(CollabView),
});

export const newCollab = () => ({ type: 'collab', attrs: { id: newId(), docKey: newId(), kind: 'doc', title: '', scope: 'group', groupSet: '', modes: ['edit', 'suggest', 'comment'], display: 'expand', download: true, start: null } });

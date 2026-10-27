import { NSelect } from '../components/Select';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { ROLES, modesFor, noteClass, useMyDocs, type DocRole, type SharedDoc } from '../lib/sharedDocs';
import { db } from '../lib/firebase';
import { Grip } from './nodes';
import { useEditorClass } from './context';
import { newId } from '../lib/tasks';
import { useGroupSets } from '../lib/groups';
import { NoteEditor } from '../components/NoteEditor';
import { UiIcon } from '../components/UiIcon';
import type { CollabAttrs } from '../collab/CollabTask';
import type { CollabMode } from '../collab/suggest';
import { CollabTask, templateKeyOf } from '../collab/CollabTask';
import { SlidesDoc } from '../collab/slides/SlidesDoc';
import { useAuth } from '../lib/auth';

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
  const [tplOpen, setTplOpen] = useState(false);
  const [fromFiles, setFromFiles] = useState(false);
  const { user } = useAuth();
  const slides = a.kind === 'slides';
  // Every shared document is listed with its class, so it can be found and continued later.
  useEffect(() => {
    if (!classId || !a.docKey) return;
    setDoc(doc(registryCol(classId), a.docKey), { title: a.title || 'Shared document', kind: a.kind, scope: a.scope, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [classId, a.docKey, a.title, a.kind, a.scope]);
  const modes = a.modes ?? [];
  // Suggesting and commenting go together.
  const toggleMode = (m: CollabMode) => {
    const both: CollabMode[] = m === 'suggest' ? ['suggest', 'comment'] : [m];
    updateAttributes({ modes: modes.includes(m) ? modes.filter((x) => !both.includes(x)) : [...new Set([...modes, ...both])] });
  };
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
        <span className="block-label">{a.kind === 'slides' ? 'Shared slides' : 'Shared document'}</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="co-settings">
        <label className="md-set co-title">
          <span>Name</span>
          <input value={a.title} onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder={slides ? 'For example: Our trip to Japan' : 'For example: Our class story'} />
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
            <NSelect value={a.groupSet} onChange={(e) => updateAttributes({ groupSet: e.target.value })}>
              <option value="">{sets.length ? 'The first group set' : 'No groups yet'}</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NSelect>
          </label>
        )}
        <div className="md-set">
          <span>Learners can</span>
          <span className="up-kinds">
            {(
              [
                ['edit', 'Edit'],
                ['suggest', 'Suggest and comment'],
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
          {slides ? 'Learners can download it (PowerPoint or PDF)' : 'Learners can download it (Word or PDF)'}
        </label>
        {slides && a.scope !== 'solo' && (
          <label className="check-row up-shrink" data-tip="Learners add their own slides and change only those; they can comment on everyone's">
            <input type="checkbox" checked={!!a.ownSlides} onChange={(e) => updateAttributes({ ownSlides: e.target.checked })} />
            Each learner makes their own slides in the shared deck
          </label>
        )}
      </div>
      {slides ? (
        <div className="co-start">
          <span className="hint">{a.scope === 'class' ? 'Starting slides: the class deck begins with them.' : a.scope === 'group' ? 'Starting slides: each group’s deck begins with them.' : 'Starting slides: each learner’s deck begins with them.'} Without them, a deck begins with a title slide.</span>
          <span>
            <button type="button" className="btn small-btn" onClick={() => setTplOpen((o) => !o)} disabled={!classId}>
              <UiIcon name="present" size={14} /> {tplOpen ? 'Close the starting slides' : 'Make the starting slides'}
            </button>
          </span>
          {tplOpen && classId && user && <SlidesDoc docKey={templateKeyOf(a)} title={(a.title || 'Slides') + ' · starting slides'} modes={['edit']} teacher me={{ uid: user.uid, name: user.displayName || 'Teacher' }} classId={classId} display="expand" canDownload />}
        </div>
      ) : (
        <div className="co-start">
        <span className="hint">
          {a.scope === 'class' ? 'Starting text: it is put in the document when it is first opened.' : a.scope === 'group' ? 'Starting text: each group’s document begins with it.' : 'Starting text: each learner’s document begins with it.'}
        </span>
        <NoteEditor value={a.start} onChange={(v) => updateAttributes({ start: v })} placeholder="Optional: a heading, questions to answer, a text to improve…" />
      </div>
      )}
      <span className="co-acts">
        <button type="button" className="btn small-btn" onClick={() => setOpen((o) => !o)}>
          <UiIcon name="task" size={14} /> {open ? (slides ? 'Close the slides' : 'Close the documents') : a.scope === 'class' ? (slides ? 'Open the class slides' : 'Open the class document') : slides ? 'Open the slides' : 'Open the documents'}
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
        <button type="button" className="btn small-btn" onClick={() => setFromFiles(true)} disabled={!classId}>
          From your files…
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
      {fromFiles && user && (
        <FromFiles
          uid={user.uid}
          onCancel={() => setFromFiles(false)}
          onPick={async (d, role) => {
            updateAttributes({ docKey: d.docKey, title: d.title, kind: d.kind, scope: 'class', modes: modesFor(role).filter((m) => m !== 'view' || role === 'view'), fileDoc: d.id });
            const cn = await getDoc(doc(db, 'classes', classId)).then((x) => String(x.data()?.name ?? 'A class')).catch(() => 'A class');
            await noteClass(d, classId, cn, role).catch(() => {});
            setFromFiles(false);
          }}
        />
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
    ownSlides: { default: false },
    fileDoc: { default: '' },
  }),
  parseHTML: () => [{ tag: 'div[data-collab]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-collab': '' })],
  addNodeView: () => ReactNodeViewRenderer(CollabView),
});

export const newCollab = () => ({ type: 'collab', attrs: { id: newId(), docKey: newId(), kind: 'doc', title: '', scope: 'group', groupSet: '', modes: ['edit', 'suggest', 'comment'], display: 'expand', download: true, start: null } });

// A document from the teacher's files, added to a lesson: everyone in the class gets access, so
// the teacher confirms that and chooses what learners can do.
function FromFiles({ uid, onPick, onCancel }: { uid: string; onPick: (d: SharedDoc, role: DocRole) => void; onCancel: () => void }) {
  const { mine } = useMyDocs(uid);
  const [d, setD] = useState<SharedDoc | null>(null);
  const [role, setRole] = useState<DocRole>('comment');
  return (
    <div className="co-choose co-files">
      {!d ? (
        <>
          <span className="hint">{mine === null ? 'Opening your files…' : mine.length ? 'Choose a document from your files.' : 'There are no documents in your files yet. Make one in the resources library, under Collaborative documents.'}</span>
          {(mine ?? []).filter((x) => x.kind === 'doc').map((x) => (
            <button key={x.id} type="button" className="ap-chip" onClick={() => setD(x)}>
              {x.kind === 'slides' ? 'Slides: ' : ''}
              {x.title}
            </button>
          ))}
          <button type="button" className="btn link" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : (
        <div className="co-warn" role="alertdialog" aria-label="Give the class access">
          <b>Everyone in this class will be able to open “{d.title}”.</b>
          <span className="hint">The colleagues and learners you shared it with keep their access. What should learners in this class be able to do?</span>
          <span className="dp-roles" role="radiogroup" aria-label="What learners can do">
            {ROLES.map((r) => (
              <button key={r.k} type="button" role="radio" aria-checked={role === r.k} className={role === r.k ? 'on' : ''} onClick={() => setRole(r.k)}>
                <b>{r.label}</b>
                <span className="hint">{r.about}</span>
              </button>
            ))}
          </span>
          <span className="co-warn-acts">
            <button type="button" className="btn" onClick={() => setD(null)}>
              Back
            </button>
            <button type="button" className="btn primary" onClick={() => onPick(d, role)}>
              Give the class access
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

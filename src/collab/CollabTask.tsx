import { useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { roomOf, useGroupSets } from '../lib/groups';
import { CollabDoc, type CollabProps } from './CollabDoc';
import { SlidesDoc } from './slides/SlidesDoc';
import { setShared, watchFlags } from './provider';
import type { CollabMode } from './suggest';

// The Collaborate block in a lesson: which document each person opens.
// Whole class: one document. Groups: one for each group. Each learner: their own, which they
// can share with their group (the group can then comment and suggest).

export type CollabAttrs = {
  id: string;
  docKey: string;
  kind: 'doc' | 'slides';
  title: string;
  scope: 'class' | 'group' | 'solo';
  groupSet: string;
  modes: CollabMode[];
  display: 'inline' | 'expand' | 'full';
  download: boolean;
  start: JSONContent | null;
  ownSlides?: boolean;
};

type AnyProps = CollabProps & { kind?: 'doc' | 'slides'; ownSlides?: boolean; templateKey?: string };
// A shared document or shared slides, with the same settings.
function AnyDoc({ kind, ownSlides, templateKey, template, ...p }: AnyProps) {
  return kind === 'slides' ? <SlidesDoc {...p} ownSlides={ownSlides} templateKey={templateKey} /> : <CollabDoc {...p} template={template} />;
}
export const templateKeyOf = (a: Pick<CollabAttrs, 'docKey'>) => `${a.docKey}~t`;
export const keyFor = (a: Pick<CollabAttrs, 'docKey'>, who?: { group?: string; learner?: string; preview?: string }) =>
  who?.preview ? `${a.docKey}~p${who.preview}` : who?.group ? `${a.docKey}~g${who.group}` : who?.learner ? `${a.docKey}~l${who.learner}` : a.docKey;

export function CollabTask({ a, classId, teacher, selfId, classmates }: { a: CollabAttrs; classId: string; teacher?: boolean; selfId?: string; classmates?: { id: string; name: string }[] }) {
  const { user, profile } = useAuth();
  const sets = useGroupSets(classId);
  const set = sets.find((s) => s.id === a.groupSet) ?? (a.scope === 'group' ? sets[0] : undefined);
  const uid = user?.uid ?? auth.currentUser?.uid ?? '';
  const myName = (profile?.role === 'learner' ? profile.displayName : user?.displayName || 'Teacher').split(' ')[0];
  const me = { uid, name: myName };
  const modes: CollabMode[] = a.modes?.length ? a.modes : ['edit'];
  const [pick, setPick] = useState('');
  const [peer, setPeer] = useState<string | null>(null); // a groupmate's shared document

  if (!uid || !a.docKey) return <p className="hint">Sign in to open the shared document.</p>;
  const common = { kind: a.kind, ownSlides: !!a.ownSlides, templateKey: a.kind === 'slides' ? templateKeyOf(a) : undefined, title: a.title || (a.kind === 'slides' ? 'Shared slides' : 'Shared document'), template: a.start, classId, me, display: a.display, canDownload: a.download };

  // Teachers: any document, picked from the groups or learners.
  if (teacher) {
    if (a.scope === 'class') return <AnyDoc {...common} docKey={keyFor(a)} modes={modes} teacher />;
    const options = a.scope === 'group' ? (set?.groups ?? []).map((g) => ({ id: g.id, name: g.name })) : (classmates ?? []);
    const cur = pick || options[0]?.id || '';
    const head = (
      <select className="cd-pick" value={cur} onChange={(e) => setPick(e.target.value)} aria-label={a.scope === 'group' ? 'Group' : 'Learner'}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
    if (!options.length) return <p className="hint">{a.scope === 'group' ? 'Make groups for this class first (Groups in the teaching tools).' : 'No learners in this class yet.'}</p>;
    return <AnyDoc key={cur} {...common} docKey={keyFor(a, a.scope === 'group' ? { group: cur } : { learner: cur })} modes={modes} teacher head={head} />;
  }

  // Previewing the lesson: a practice document of your own.
  if (!selfId) return <AnyDoc {...common} docKey={keyFor(a, { preview: uid })} modes={modes} head={<span className="hint">Preview: your own practice copy</span>} />;

  if (a.scope === 'class') return <AnyDoc {...common} docKey={keyFor(a)} modes={modes} />;
  if (a.scope === 'group') {
    const g = roomOf(set, selfId);
    if (g) return <AnyDoc {...common} docKey={keyFor(a, { group: g.id })} modes={modes} head={<span className="cd-for">{g.name}</span>} />;
    return <AnyDoc {...common} docKey={keyFor(a, { learner: selfId })} modes={modes} head={<span className="hint">You are not in a group, so this one is yours</span>} />;
  }
  // Each learner: their own document, and their group's shared ones.
  const g = roomOf(set, selfId);
  const mates = (g?.members ?? []).filter((m) => m !== selfId).map((m) => ({ id: m, name: classmates?.find((c) => c.id === m)?.name ?? 'Classmate' }));
  if (peer) {
    const who = mates.find((m) => m.id === peer);
    return (
      <AnyDoc
        key={peer}
        {...common}
        title={`${who?.name.split(' ')[0] ?? 'A classmate'}’s ${a.title || 'document'}`}
        docKey={keyFor(a, { learner: peer })}
        modes={modes.filter((m) => m !== 'edit').length ? modes.filter((m) => m !== 'edit') : ['comment']}
        head={
          <button type="button" className="btn small-btn" onClick={() => setPeer(null)}>
            Back to mine
          </button>
        }
      />
    );
  }
  return <SoloDoc a={a} common={common} modes={modes} own={keyFor(a, { learner: selfId })} mates={g ? mates : []} onPeer={setPeer} />;
}

function SoloDoc({ a, common, modes, own, mates, onPeer }: { a: CollabAttrs; common: Omit<AnyProps, 'docKey' | 'modes'>; modes: CollabMode[]; own: string; mates: { id: string; name: string }[]; onPeer: (id: string) => void }) {
  const [shared, setSharedState] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => watchFlags(own, (f) => setSharedState(!!f.shared)), [own]);
  const mateKeys = useMemo(() => mates.map((m) => ({ ...m, key: keyFor(a, { learner: m.id }) })), [mates, a]);
  useEffect(() => {
    const offs = mateKeys.map((m) => watchFlags(m.key, (f) => setOpen((o) => ({ ...o, [m.id]: !!f.shared }))));
    return () => offs.forEach((f) => f());
  }, [mateKeys]);
  const sharedMates = mateKeys.filter((m) => open[m.id]);
  return (
    <div className="cd-solo">
      <AnyDoc
        {...common}
        docKey={own}
        modes={modes}
        head={
          mates.length > 0 ? (
            <label className="cd-share" data-tip="Your group can read it, comment and suggest">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(own, e.target.checked)} />
              Share with my group
            </label>
          ) : undefined
        }
      />
      {sharedMates.length > 0 && (
        <div className="cd-mates">
          <span className="hint">Shared by your group</span>
          {sharedMates.map((m) => (
            <button key={m.id} type="button" className="ap-chip" onClick={() => onPeer(m.id)}>
              {m.name.split(' ')[0]}’s {a.title || 'document'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

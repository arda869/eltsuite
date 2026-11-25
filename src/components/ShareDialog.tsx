import { ask } from '../lib/ask';
import { AccessRow, AddPeople, GeneralAccess, RoleMenu, ShareShell } from './ShareShell';
import { NSelect } from './Select';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { createShare, refreshShare, setShareAccess, shareLink, stopShare, useColleagues, useMyShares, type Share } from '../lib/sharing';

// Share with colleagues: a read-only copy, for chosen colleagues or anyone with the link.
// Opened again for the same thing, it shows the share as it is, to change or stop.

export type ShareWhat = Pick<Share, 'kind' | 'title' | 'about' | 'src' | 'item' | 'archive'>;
const KIND: Record<Share['kind'], string> = { lesson: 'lesson', task: 'task', doc: 'shared document', media: 'media' };

export function ShareDialog({ what, onClose }: { what: ShareWhat; onClose: () => void }) {
  const { user } = useAuth();
  const colleagues = useColleagues(user?.uid);
  const mine = useMyShares(user?.uid);
  const same = (s: Share) => s.kind === what.kind && s.src.classId === what.src.classId && s.src.itemId === what.src.itemId && s.src.taskId === what.src.taskId && s.src.docKey === what.src.docKey && s.src.archiveId === what.src.archiveId;
  const existing = mine?.find(same);
  const [mode, setMode] = useState<Share['mode']>('people');
  const [people, setPeople] = useState<string[]>([]);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (existing) setMode(existing.mode), setPeople(existing.people ?? []), setNotes(!!existing.notes);
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = existing && (existing.mode !== mode || (existing.people ?? []).slice().sort().join() !== people.slice().sort().join());
  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    setErr('');
    try {
      await f();
    } catch (e) {
      console.error(e);
      setErr('That didn’t work. Try again.');
    } finally {
      setBusy('');
    }
  };
  const share = () =>
    run('Sharing…', async () => {
      if (!user) return;
      await createShare({ ...what, owner: user.uid, ownerName: user.displayName || 'A colleague', ownerEmail: user.email ?? '', mode, people: mode === 'people' ? people : [], notes, about: what.about ?? '' });
    });
  const canShare = mode === 'link' || people.length > 0;
  // Copy link: share first if it isn't shared yet (with anyone who has the link), then copy.
  const linkFor = async () => {
    if (existing) {
      if (changed) await setShareAccess(existing.id, mode, mode === 'people' ? people : []);
      return shareLink(existing.id);
    }
    if (!user) throw new Error('signed out');
    const id = await createShare({ ...what, owner: user.uid, ownerName: user.displayName || 'A colleague', ownerEmail: user.email ?? '', mode: people.length ? mode : 'link', people: mode === 'people' ? people : [], notes, about: what.about ?? '' });
    if (!people.length) setMode('link');
    return shareLink(typeof id === 'string' ? id : (id as { id: string }).id);
  };
  const close = async () => {
    // Done keeps what was chosen: a new share is made, a changed one saved.
    if (!existing && people.length) await share();
    else if (existing && changed && canShare) await run('Saving…', () => setShareAccess(existing.id, mode, mode === 'people' ? people : []));
    onClose();
  };
  const byId = new Map((colleagues ?? []).map((c) => [c.id, c]));
  return (
    <ShareShell name={what.title} onClose={() => void close()} link={linkFor} linkNote={existing ? 'Link copied' : 'Shared, and the link is copied'}>
      <p className="s2-msg">Colleagues get a read-only copy of this {KIND[what.kind]}. They can make their own copy to change. Learners’ work is never shared.</p>
      <AddPeople
        placeholder="Add colleagues"
        loading={colleagues === null}
        options={(colleagues ?? []).map((c) => ({ key: c.id, name: c.name }))}
        picked={[]}
        onPick={(o) => { setPeople((p) => (p.includes(o.key) ? p : [...p, o.key])); setMode('people'); }}
        onUnpick={() => {}}
      />
      {colleagues?.length === 0 && <p className="s2-msg">No colleagues yet. <Link to="/colleagues">Invite a colleague</Link> first, or share with anyone who has the link.</p>}
      <section>
        <h3>People with access</h3>
        <div className="s2-list">
          <AccessRow face={<span className="s2-ini">{(user?.displayName || 'Y').slice(0, 1).toUpperCase()}</span>} name={`${user?.displayName || 'You'} (you)`} right={<span className="s2-fixed">Owner</span>} />
          {people.map((id) => {
            const c = byId.get(id);
            return <AccessRow key={id} face={<span className="s2-ini">{(c?.name || '?').slice(0, 1).toUpperCase()}</span>} name={c?.name || 'Colleague'} sub="Can open a read-only copy" right={<RoleMenu value={'view' as const} roles={[{ k: 'view' as const, label: 'Viewer' }]} onRemove={() => setPeople((p) => p.filter((x) => x !== id))} label={`What ${c?.name ?? 'they'} can do`} />} />;
          })}
        </div>
      </section>
      <GeneralAccess open={mode === 'link'} about={mode === 'link' ? 'Any teacher signed in to ELT Suite with the link can open it' : 'Only the colleagues you add can open it'}>
        <NSelect value={mode} onChange={(e) => setMode(e.target.value as Share['mode'])} aria-label="Who can open it">
          <option value="people">Restricted</option>
          <option value="link">Anyone with the link</option>
        </NSelect>
      </GeneralAccess>
      {(what.kind === 'lesson' || what.kind === 'task') && !existing && (
        <label className="s2-check"><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />Include my teacher notes</label>
      )}
      {existing && (
        <div className="s2-more">
          {what.kind !== 'doc' && <button type="button" className="s2-link" disabled={!!busy} onClick={() => run('Updating…', () => refreshShare(existing))}>Update the shared copy</button>}
          <button type="button" className="s2-link danger" disabled={!!busy} onClick={() => void ask('Stop sharing? The link stops working, and colleagues no longer see it.').then((ok) => { if (ok) run('Stopping…', () => stopShare(existing.id)); })}>Stop sharing</button>
        </div>
      )}
      {(busy || err) && <p className={'s2-msg' + (err ? ' err' : '')} role="status">{err || busy}</p>}
      {!existing && !canShare && mine !== null && <p className="s2-msg">Add colleagues, or choose Anyone with the link, then press Done.</p>}
    </ShareShell>
  );
}

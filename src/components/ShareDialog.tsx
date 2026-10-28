import { ask } from '../lib/ask';
import { FileIcon, type FileKind } from './FileIcon';
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
  const [copied, setCopied] = useState(false);
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
  const copy = (id: string) => {
    navigator.clipboard?.writeText(shareLink(id)).then(() => (setCopied(true), window.setTimeout(() => setCopied(false), 1800)));
  };
  const toggle = (id: string) => setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const canShare = mode === 'link' || people.length > 0;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog sh-dialog" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <span className="sh-head">
          <FileIcon kind={(what.kind as FileKind) || 'lesson'} size={38} />
          <span>
            <h2 style={{ margin: 0 }}>Share “{what.title}”</h2>
            <span className="hint">Colleagues get a read-only copy of this {KIND[what.kind]}. They can make their own copy to change. Learners’ work is never shared.</span>
          </span>
        </span>

        <div className="sh-modes" role="radiogroup" aria-label="Who can open it">
          <label className={'sh-mode' + (mode === 'people' ? ' on' : '')}>
            <input type="radio" checked={mode === 'people'} onChange={() => setMode('people')} />
            <span>
              <b>Only colleagues I choose</b>
              <span className="hint">It shows in their archive, under Shared with me.</span>
            </span>
          </label>
          <label className={'sh-mode' + (mode === 'link' ? ' on' : '')}>
            <input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} />
            <span>
              <b>Anyone with the link</b>
              <span className="hint">Any teacher signed in to ELT Suite who has the link can open it.</span>
            </span>
          </label>
        </div>

        {mode === 'people' && (
          <div className="sh-people">
            {colleagues === null ? (
              <span className="hint">Loading your colleagues…</span>
            ) : colleagues.length === 0 ? (
              <span className="hint">
                No colleagues yet. <Link to="/colleagues">Invite a colleague</Link> with a link first, or share with anyone who has the link.
              </span>
            ) : (
              colleagues.map((c) => (
                <label key={c.id} className={'sh-person' + (people.includes(c.id) ? ' on' : '')}>
                  <input type="checkbox" checked={people.includes(c.id)} onChange={() => toggle(c.id)} />
                  <span className="sh-av">{c.name.trim().slice(0, 1).toUpperCase()}</span>
                  <span className="sh-pt">
                    <b>{c.name}</b>
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        {(what.kind === 'lesson' || what.kind === 'task') && !existing && (
          <label className="check-row">
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
            Include my teacher notes
          </label>
        )}

        {existing && (
          <div className="sh-live">
            <span className="sh-live-top">
              <b>{existing.mode === 'link' ? 'Shared with anyone who has the link' : `Shared with ${existing.people?.length ?? 0} ${existing.people?.length === 1 ? 'colleague' : 'colleagues'}`}</b>
              <span className="hint">Copy made {new Date(existing.updated ?? existing.at ?? Date.now()).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            </span>
            <span className="sh-link">
              <input readOnly value={shareLink(existing.id)} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn small-btn" onClick={() => copy(existing.id)}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </span>
            <span className="sh-live-acts">
              {what.kind !== 'doc' && (
                <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => run('Updating…', () => refreshShare(existing))} data-tip="Colleagues see your latest version">
                  Update the shared copy
                </button>
              )}
              <button type="button" className="btn small-btn danger" disabled={!!busy} onClick={() => void ask('Stop sharing? The link stops working, and colleagues no longer see it.').then((ok) => { if (ok) run('Stopping…', () => stopShare(existing.id)); })}>
                Stop sharing
              </button>
            </span>
          </div>
        )}

        {err && <span className="error">{err}</span>}
        <span className="sh-foot">
          {busy && <span className="hint">{busy}</span>}
          <button type="button" className="btn" onClick={onClose}>
            {existing ? 'Done' : 'Cancel'}
          </button>
          {!existing && (
            <button type="button" className="btn primary" disabled={!!busy || !canShare || mine === null} onClick={share}>
              Share
            </button>
          )}
          {existing && changed && (
            <button type="button" className="btn primary" disabled={!!busy || !canShare} onClick={() => run('Saving…', () => setShareAccess(existing.id, mode, mode === 'people' ? people : []))}>
              Save who can open it
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { cancelScheduled, pinAnnouncement, postAnnouncement, remind, retract, useAnnouncements } from '../lib/announce';
import { useAuth } from '../lib/auth';

// Teacher: send a short announcement to the class or to some learners, and see who has read it.
export function AnnounceDialog({ classId, roster, onClose }: { classId: string; roster: { id: string; name: string }[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [withChime, setWithChime] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [later, setLater] = useState('');
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const list = useAnnouncements(classId).filter((a) => a.to === 'all' || (Array.isArray(a.to) && a.to.length));
  const laterAt = later ? new Date(later).getTime() : 0;
  const toLocal = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name.split(' ')[0] ?? 'A learner';
  const okLink = !link.trim() || /^https:\/\//.test(link.trim());

  async function send() {
    if (!text.trim() || !okLink) return;
    setBusy(true);
    try {
      await postAnnouncement(classId, { text: text.trim(), link: link.trim() || undefined, to: all ? 'all' : picked, chime: withChime, pinned, ...(laterAt > Date.now() ? { sendAt: laterAt } : {}), byName: (user?.displayName || 'Teacher').split(' ')[0] });
      setText('');
      setLink('');
      setLater('');
      setPinned(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog ann-dialog" role="dialog" aria-label="Announcement" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Announcement</h2>
        <textarea className="ann-input" value={text} maxLength={400} autoFocus placeholder="For example: Please open Task 4 and work in pairs." onChange={(e) => setText(e.target.value)} />
        <input className="ann-link-input" value={link} placeholder="Link (optional), https://…" onChange={(e) => setLink(e.target.value)} />
        {!okLink && <span className="error">The link must start with https://</span>}
        <div className="ann-to">
          <span className="seg small-seg" role="radiogroup" aria-label="Send to">
            <button type="button" role="radio" aria-checked={all} className={all ? 'on' : ''} onClick={() => setAll(true)}>
              Whole class
            </button>
            <button type="button" role="radio" aria-checked={!all} className={!all ? 'on' : ''} onClick={() => setAll(false)}>
              Some learners
            </button>
          </span>
          <label className="pop-check">
            <input type="checkbox" checked={withChime} onChange={() => setWithChime((v) => !v)} />
            Soft chime
          </label>
        </div>
        <div className="ann-to">
          <label className="pop-check" title="Pinned announcements stay at the top of the class home screen, for example a homework reminder or a schedule change">
            <input type="checkbox" checked={pinned} onChange={() => setPinned((v) => !v)} />
            Pin to the class home
          </label>
          <label className="pop-check" style={{ gap: 6 }}>
            Send later
            <input type="datetime-local" value={later} onChange={(e) => setLater(e.target.value)} aria-label="Send at" style={{ fontSize: 13 }} />
          </label>
        </div>
        {!all && (
          <div className="ann-people">
            {roster.map((r) => (
              <label key={r.id} className={'ann-person' + (picked.includes(r.id) ? ' on' : '')}>
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                {r.name}
              </label>
            ))}
          </div>
        )}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={!text.trim() || !okLink || busy || (!all && !picked.length)} onClick={send}>
            {laterAt > Date.now() ? `Send ${toLocal(laterAt)}` : 'Send'}
          </button>
        </span>
        {list.length > 0 && (
          <div className="ann-history">
            <span className="eyebrow">Board · all announcements</span>
            {list.map((a) => {
              const targets = a.to === 'all' ? roster.map((r) => r.id) : (a.to as string[]);
              const read = targets.filter((id) => a.acks?.[id] && (a.acks[id] >= (a.remindAt ?? 0)));
              const notYet = targets.filter((id) => !read.includes(id));
              const scheduled = (a.sendAt ?? 0) > Date.now();
              return (
                <div key={a.id} className={'ann-row' + (a.pinned ? ' pinned' : '')}>
                  <span className="ann-row-text">
                    {a.pinned && <span className="ann-pin">Pinned</span>}
                    {a.text}
                  </span>
                  <span className="hint">
                    {scheduled ? `Goes out ${toLocal(a.sendAt)}` : `${toLocal(a.sendAt ?? a.at?.toMillis?.() ?? Date.now())} · ${read.length} of ${targets.length} got it${notYet.length > 0 && notYet.length <= 6 ? ` · waiting for ${notYet.map(nameOf).join(', ')}` : ''}`}
                  </span>
                  <span className="ann-row-acts">
                    <button type="button" className="btn link small" onClick={() => pinAnnouncement(classId, a.id, !a.pinned)}>
                      {a.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    {scheduled && (
                      <button type="button" className="btn link small" onClick={() => cancelScheduled(classId, a.id)}>
                        Cancel
                      </button>
                    )}
                    {!scheduled && notYet.length > 0 && (
                      <button type="button" className="btn link small" onClick={() => remind(classId, a.id)}>
                        Remind
                      </button>
                    )}
                    <button type="button" className="btn link small" onClick={() => retract(classId, a.id)}>
                      Take back
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { postAnnouncement, remind, retract, useAnnouncements } from '../lib/announce';

// Teacher: send a short announcement to the class or to some learners, and see who has read it.
export function AnnounceDialog({ classId, roster, onClose }: { classId: string; roster: { id: string; name: string }[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [withChime, setWithChime] = useState(true);
  const [busy, setBusy] = useState(false);
  const list = useAnnouncements(classId).filter((a) => a.to === 'all' || (Array.isArray(a.to) && a.to.length));
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name.split(' ')[0] ?? 'A learner';
  const okLink = !link.trim() || /^https:\/\//.test(link.trim());

  async function send() {
    if (!text.trim() || !okLink) return;
    setBusy(true);
    try {
      await postAnnouncement(classId, { text: text.trim(), link: link.trim() || undefined, to: all ? 'all' : picked, chime: withChime });
      setText('');
      setLink('');
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
            Send
          </button>
        </span>
        {list.length > 0 && (
          <div className="ann-history">
            <span className="eyebrow">Sent</span>
            {list.slice(0, 6).map((a) => {
              const targets = a.to === 'all' ? roster.map((r) => r.id) : (a.to as string[]);
              const read = targets.filter((id) => a.acks?.[id] && (a.acks[id] >= (a.remindAt ?? 0)));
              const notYet = targets.filter((id) => !read.includes(id));
              return (
                <div key={a.id} className="ann-row">
                  <span className="ann-row-text">{a.text}</span>
                  <span className="hint">
                    {read.length} of {targets.length} got it{notYet.length > 0 && notYet.length <= 6 ? ` · waiting for ${notYet.map(nameOf).join(', ')}` : ''}
                  </span>
                  <span className="ann-row-acts">
                    {notYet.length > 0 && (
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

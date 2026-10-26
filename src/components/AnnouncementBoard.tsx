import { useEffect, useMemo, useState } from 'react';
import { useAnnouncements, type Announcement } from '../lib/announce';

// The class announcements board on the learner's home screen: pinned messages first, then the
// history. Unread ones are marked until the learner opens the board.
export function AnnouncementBoard({ classId, learnerId }: { classId: string; learnerId: string }) {
  const all = useAnnouncements(classId, true);
  const list = useMemo(() => all.filter((a) => a.to === 'all' || (Array.isArray(a.to) && a.to.includes(learnerId))), [all, learnerId]);
  const key = `ann-seen-${classId}`;
  const [seenAt, setSeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem(key) ?? 0);
    } catch {
      return 0;
    }
  });
  const [open, setOpen] = useState(false);
  const unread = list.filter((a) => (a.sendAt ?? 0) > seenAt).length;
  const pinned = list.filter((a) => a.pinned);
  const rest = list.filter((a) => !a.pinned);
  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(key, String(now));
    } catch {
      /* private window */
    }
  }, [open, key, list.length]);
  if (!list.length) return null;
  const when = (a: Announcement) => new Date(a.sendAt ?? a.at?.toMillis?.() ?? Date.now()).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const Row = ({ a }: { a: Announcement }) => (
    <li className={'board-row' + ((a.sendAt ?? 0) > seenAt ? ' unread' : '') + (a.pinned ? ' pinned' : '')}>
      <span className="board-text">{a.text}</span>
      <span className="hint">
        {a.pinned ? 'Pinned · ' : ''}
        {when(a)}
        {a.byName ? ` · ${a.byName}` : ''}
        {a.link && /^https:\/\//.test(a.link) && (
          <>
            {' · '}
            <a href={a.link} target="_blank" rel="noopener noreferrer">
              Open the link ↗
            </a>
          </>
        )}
      </span>
    </li>
  );
  return (
    <section className="board" aria-label="Announcements">
      <button type="button" className="board-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Announcements</h2>
          {unread > 0 && <span className="board-badge">{unread} new</span>}
        </span>
        <span className="hint">{open ? 'Hide' : pinned.length ? pinned[0].text.slice(0, 80) : `${list.length} ${list.length === 1 ? 'message' : 'messages'}`}</span>
      </button>
      {(open || pinned.length > 0) && (
        <ul className="board-list">
          {pinned.map((a) => (
            <Row key={a.id} a={a} />
          ))}
          {open && rest.slice(0, 30).map((a) => <Row key={a.id} a={a} />)}
        </ul>
      )}
    </section>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewNotices } from '../lib/notices';

// Small cards in the corner when someone tags you.
export function NoticeToasts({ classId, to, link }: { classId: string; to: string; link: (itemId: string, taskId: string) => string }) {
  const list = useNewNotices(classId, to);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const shown = list.filter((n) => !gone.has(n.id)).slice(-3);
  if (!shown.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {shown.map((n) => (
        <div key={n.id} className="toast">
          <span className="toast-at" aria-hidden="true">@</span>
          <span className="toast-body">
            <strong>{n.fromName || 'Someone'}</strong> tagged you {n.what}
            {n.text && <span className="toast-text">“{n.text.length > 90 ? n.text.slice(0, 88) + '…' : n.text}”</span>}
            <span className="toast-actions">
              <button type="button" className="btn small-btn primary" onClick={() => (navigate(link(n.itemId, n.taskId)), setGone((g) => new Set(g).add(n.id)))}>
                Go there
              </button>
              <button type="button" className="btn link small" onClick={() => setGone((g) => new Set(g).add(n.id))}>
                Dismiss
              </button>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

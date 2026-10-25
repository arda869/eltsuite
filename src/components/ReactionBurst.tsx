import { useEffect, useRef, useState } from 'react';
import type { Signal } from '../lib/session';
import { Icon } from '../editor/Icons';
import { REACTIONS } from './LiveExtras';

// Learners' quick reactions float up on the teacher's screen for a moment.
export function ReactionBurst({ signals }: { signals: Record<string, Signal> }) {
  const [items, setItems] = useState<{ id: string; icon: string; name: string; x: number }[]>([]);
  const seen = useRef<Record<string, number>>({});
  useEffect(() => {
    const fresh: typeof items = [];
    for (const [uid, s] of Object.entries(signals)) {
      if (!s.reaction || !s.reactionAt || seen.current[uid] === s.reactionAt) continue;
      const first = seen.current[uid] === undefined;
      seen.current[uid] = s.reactionAt;
      if (first && Date.now() - s.reactionAt > 4000) continue;
      fresh.push({ id: uid + s.reactionAt, icon: REACTIONS.find((r) => r.key === s.reaction)?.icon ?? 'smile', name: s.name.split(' ')[0], x: 10 + Math.random() * 80 });
    }
    if (!fresh.length) return;
    setItems((cur) => [...cur, ...fresh]);
    const t = window.setTimeout(() => setItems((cur) => cur.filter((i) => !fresh.includes(i))), 3200);
    return () => window.clearTimeout(t);
  }, [signals]);
  if (!items.length) return null;
  return (
    <div className="burst" aria-hidden="true">
      {items.map((i) => (
        <span key={i.id} className="burst-item" style={{ left: i.x + '%' }}>
          <Icon name={i.icon} size="26" tone="accent" />
          <span>{i.name}</span>
        </span>
      ))}
    </div>
  );
}

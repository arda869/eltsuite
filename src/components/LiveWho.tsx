import { isOnline, usePresence } from '../lib/presence';
import { Avatar } from './avatars';

// For learners: the lesson is live, and who is in it now.
export function LiveWho({ classId, itemId, teacherName, selfId, compact }: { classId: string; itemId: string; teacherName?: string; selfId?: string; compact?: boolean }) {
  const all = usePresence(classId);
  const here = all.filter((p) => p.itemId === itemId && isOnline(p));
  const names = here.map((p) => (p.learnerId === selfId ? 'You' : p.name.split(' ')[0])).sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : a.localeCompare(b)));
  return (
    <div className={'live-who' + (compact ? ' compact' : '')} aria-label="Live lesson">
      <span className="live-who-top">
        <span className="live-dot" aria-hidden="true" />
        <b>Live</b>
        <span className="hint">{teacherName ?? 'Your teacher'} is teaching</span>
      </span>
      {here.length > 0 && (
        <span className="live-who-people" title={names.join(', ')}>
          <span className="live-who-faces">
            {here.slice(0, 8).map((p) => (
              <Avatar key={p.id} k={p.avatar} name={p.name} size={compact ? 22 : 26} />
            ))}
          </span>
          <span className="hint">
            {here.length === 1 ? `${names[0] === 'You' ? 'Just you' : names[0]} in the lesson` : `${here.length} in the lesson: ${names.slice(0, 3).join(', ')}${here.length > 3 ? ` and ${here.length - 3} more` : ''}`}
          </span>
        </span>
      )}
    </div>
  );
}

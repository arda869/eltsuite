import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ClassDoc, Item } from '../lib/classes';
import { isOnline, type Presence } from '../lib/presence';
import { theme } from '../lib/themes';
import { ago, useRecentWork } from '../lib/activity';
import { Avatar } from './avatars';

// The home screen card: who is online now and what they are doing, and the latest work
// across every class, with the moments worth a look picked out.

function usePresenceAll(ids: string[]) {
  const [map, setMap] = useState<Record<string, Presence[]>>({});
  const [, tick] = useState(0);
  const key = ids.join(',');
  useEffect(() => {
    const offs = ids.map((c) => onSnapshot(collection(db, 'classes', c, 'presence'), (s) => setMap((m) => ({ ...m, [c]: s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Presence, 'id'>) })) })), () => {}));
    const t = window.setInterval(() => tick((x) => x + 1), 20000);
    return () => (offs.forEach((f) => f()), window.clearInterval(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

export function LearnerActivity({ classes, items }: { classes: ClassDoc[]; items: Record<string, Item[]> }) {
  const ids = classes.map((c) => c.id);
  const presence = usePresenceAll(ids);
  const recent = useRecentWork(ids, items);
  const cls = (id?: string) => classes.find((c) => c.id === id);
  const online = Object.entries(presence)
    .flatMap(([c, list]) => list.filter((p) => isOnline(p) && p.learnerId).map((p) => ({ ...p, classId: c })))
    .sort((a, b) => a.name.localeCompare(b.name));
  const day = recent.filter((a) => Date.now() - a.at < 7 * 86400000);
  const handedIn = day.filter((a) => a.kind === 'submit' && Date.now() - a.at < 86400000).length;
  if (!online.length && !day.length) return null;
  return (
    <section className="la" aria-label="Learner activity">
      <h2>Learner activity</h2>
      <div className="la-online">
        <span className="la-sub">
          {online.length ? <span className="live-dot" aria-hidden="true" /> : null}
          {online.length ? `${online.length} online now` : 'No one online right now'}
        </span>
        {online.slice(0, 8).map((p) => {
          const c = cls(p.classId);
          const item = (items[p.classId] ?? []).find((i) => i.id === p.itemId);
          return (
            <Link key={p.classId + p.id} to={`/class/${p.classId}?learner=${p.learnerId}`} className="la-person">
              <span className="la-face">
                <Avatar k={p.avatar} name={p.name} size={28} />
                <i />
              </span>
              <span className="la-person-t">
                <b>{p.name}</b>
                <span className="hint">
                  <span className="la-cdot" style={{ background: theme(c?.themeColor).accent }} />
                  {item ? item.title : c?.name ?? ''}
                </span>
              </span>
            </Link>
          );
        })}
        {online.length > 8 && <span className="hint">and {online.length - 8} more</span>}
      </div>
      <div className="la-recent">
        <span className="la-sub">{handedIn ? `Recent · ${handedIn} handed in today` : 'Recent'}</span>
        {day.length === 0 && <span className="hint">Work learners do shows here.</span>}
        {day.slice(0, 8).map((a, i) => {
          const c = cls(a.classId);
          return (
            <Link key={i} to={`/class/${a.classId}?learner=${a.learnerId}`} className="la-ev">
              <span className="la-cdot" style={{ background: theme(c?.themeColor).accent }} />
              <span className="la-ev-t">
                <span>
                  <b>{a.name?.split(' ')[0]}</b> {a.title.charAt(0).toLowerCase() + a.title.slice(1)} <span className="la-where">{a.where}</span>
                </span>
                <span className="hint">
                  {ago(a.at)}
                  {a.pct === 100 && <span className="ld-tag">Full marks</span>}
                  {a.pct != null && a.pct < 50 && <span className="ld-tag">Found it hard</span>}
                  {a.late && <span className="ld-tag">Late</span>}
                </span>
              </span>
              {a.pct != null && <span className="ld-pct">{a.pct}%</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

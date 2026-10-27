import { useState } from 'react';
import { UiIcon } from '../../components/UiIcon';
import { Empty, PageHead, Pills, millis } from './ui';
import type { Go, OrgData } from './types';

// What happened in the organisation: what its admins changed (kept in its log), and who joined,
// was invited or made a class (from the invitations and classes themselves).

export type Ev = { id: string; at: number; kind: 'change' | 'people' | 'classes'; who: string; text: string; detail?: string };

export function orgEvents(d: OrgData): Ev[] {
  const nameOf = (uid: string) => d.org.teachers[uid]?.name || d.org.teachers[uid]?.email || 'A teacher';
  const out: Ev[] = d.log.map((l) => ({ id: 'l' + l.id, at: l.at, kind: 'change', who: l.byName, text: l.what, detail: l.detail }));
  for (const i of d.invites) {
    out.push({ id: 's' + i.id, at: i.at, kind: 'people', who: i.byName, text: `invited ${i.name || i.email}${i.admin ? ' as an admin' : ''}` });
    if (i.answeredAt) out.push({ id: 'a' + i.id, at: i.answeredAt, kind: 'people', who: i.name || i.email, text: i.status === 'accepted' ? `joined ${d.org.name}` : 'said no to the invitation' });
  }
  for (const c of d.classes) {
    const at = millis(c.createdAt);
    if (at) out.push({ id: 'c' + c.id, at, kind: 'classes', who: nameOf(c.teacherId), text: `has a new class, ${c.name}`, detail: [c.level, c.kind === 'training' ? 'teacher training' : ''].filter(Boolean).join(', ') });
  }
  return out.sort((a, b) => b.at - a.at);
}

const dayOf = (ms: number) => {
  const d = new Date(ms);
  const t = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const ICON: Record<Ev['kind'], string> = { change: 'settings', people: 'person', classes: 'classes' };

export function EventList({ list }: { list: Ev[] }) {
  const days: [string, Ev[]][] = [];
  for (const e of list) {
    const k = dayOf(e.at);
    const last = days[days.length - 1];
    if (last?.[0] === k) last[1].push(e);
    else days.push([k, [e]]);
  }
  return (
    <div className="hq-events">
      {days.map(([day, evs]) => (
        <section key={day} className="hq-day">
          <h3>{day}</h3>
          <ol>
            {evs.map((e) => (
              <li key={e.id} className={'hq-ev hq-ev-' + e.kind}>
                <span className="hq-ev-ic" aria-hidden="true">
                  <UiIcon name={ICON[e.kind]} size={14} />
                </span>
                <span className="hq-ev-t">
                  <span>
                    <b>{e.who}</b> {e.kind === 'change' ? e.text.charAt(0).toLowerCase() + e.text.slice(1) : e.text}
                  </span>
                  {e.detail && <span className="hq-ev-d">{e.detail}</span>}
                </span>
                <time dateTime={new Date(e.at).toISOString()}>{new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function OrgActivity({ d, params, go }: { d: OrgData; params: URLSearchParams; go: Go }) {
  const all = orgEvents(d);
  const [more, setMore] = useState(80);
  const f = params.get('f') || 'all';
  const pills = [
    { v: 'all', label: 'Everything', n: all.length },
    { v: 'change', label: 'Changes by admins', n: all.filter((e) => e.kind === 'change').length },
    { v: 'people', label: 'Teachers', n: all.filter((e) => e.kind === 'people').length },
    { v: 'classes', label: 'Classes', n: all.filter((e) => e.kind === 'classes').length },
  ];
  const shown = all.filter((e) => f === 'all' || e.kind === f);
  return (
    <div className="hq-page">
      <PageHead title="Activity" lede={`What happened in ${d.org.name}: what its admins changed, who joined and which classes began.`} />
      <div className="hq-tools">
        <Pills value={f} options={pills} onChange={(v) => go({ tab: 'activity', f: v === 'all' ? '' : v, replace: true })} label="Show" />
      </div>
      {!shown.length ? (
        <Empty title="Nothing yet" text="Invitations, new classes and changes to rules, branding and the library show here as they happen." />
      ) : (
        <>
          <EventList list={shown.slice(0, more)} />
          {shown.length > more && (
            <button type="button" className="btn hq-more" onClick={() => setMore((m) => m + 80)}>
              Show older
            </button>
          )}
        </>
      )}
    </div>
  );
}

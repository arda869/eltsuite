import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ActEv, Visit } from '../../lib/usage';
import type { Teacher } from '../../lib/admin';
import { Empty, PageHead, Pills, Search, Who, ago } from './ui';

// Super Admin → Activity: who came when, and, for teachers, every page they opened and everything
// they clicked. Learners: only when they came. Kept 90 days.

type Sum = { uid: string; last: number; visits: number; role: 'teacher' | 'learner' };

function useSummaries() {
  const [list, setList] = useState<Sum[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'usage'),
        (s) => setList(s.docs.map((d) => ({ uid: d.id, last: Number(d.data().last) || 0, visits: Number(d.data().visits) || 0, role: (d.data().role === 'learner' ? 'learner' : 'teacher') as Sum['role'] })).sort((a, b) => b.last - a.last)),
        () => setList([]),
      ),
    [],
  );
  return list;
}
function useVisits(uid: string | null) {
  const [list, setList] = useState<Visit[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    setList(null);
    return onSnapshot(
      query(collection(db, 'usage', uid, 'visits'), orderBy('start', 'desc'), limit(40)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Visit, 'id'>) }))),
      () => setList([]),
    );
  }, [uid]);
  return list;
}
// Learners' names, read once each.
const names = new Map<string, Promise<string>>();
const learnerName = (uid: string) => {
  if (!names.has(uid)) names.set(uid, getDoc(doc(db, 'users', uid)).then((s) => String(s.data()?.displayName || 'A learner'), () => 'A learner'));
  return names.get(uid)!;
};

// The page, in words.
const PAGES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/classes/, 'Classes'],
  [/^\/class\/[^/]+\/lesson\//, 'A lesson (editing)'],
  [/^\/class\//, 'A class'],
  [/^\/timetable/, 'Timetable'],
  [/^\/rooms/, 'Rooms'],
  [/^\/call\//, 'A call'],
  [/^\/archive/, 'Resources'],
  [/^\/collab/, 'Collab'],
  [/^\/reading/, 'Reading Journal'],
  [/^\/pdf/, 'PDF'],
  [/^\/recordings/, 'Recordings'],
  [/^\/doc\//, 'A file'],
  [/^\/studio\//, 'Studio'],
  [/^\/messages/, 'Messages'],
  [/^\/colleagues?/, 'Colleagues'],
  [/^\/library/, 'Organisation library'],
  [/^\/guide/, 'Guide'],
  [/^\/settings/, 'Settings'],
  [/^\/org-admin/, 'Organisation admin'],
  [/^\/admin/, 'Super Admin'],
  [/^\/learn\//, 'A lesson'],
];
const pageName = (p = '') => {
  const [path, tab] = p.split('?');
  const n = PAGES.find(([r]) => r.test(path))?.[1] ?? path;
  return tab ? `${n} · ${tab}` : n;
};
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const mins = (a: number, b: number) => {
  const m = Math.max(1, Math.round((b - a) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export function SuperUsage({ teachers }: { teachers: Teacher[] }) {
  const sums = useSummaries();
  const [who, setWho] = useState('teacher');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [ln, setLn] = useState<Record<string, string>>({});
  const byUid = useMemo(() => new Map(teachers.map((t) => [t.uid, t])), [teachers]);
  useEffect(() => {
    for (const s of sums ?? []) if (s.role === 'learner' && !ln[s.uid]) void learnerName(s.uid).then((n) => setLn((m) => ({ ...m, [s.uid]: n })));
  }, [sums]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (s: Sum) => (s.role === 'teacher' ? byUid.get(s.uid)?.name || byUid.get(s.uid)?.email || 'A teacher' : ln[s.uid] || 'A learner');
  const words = q.trim().toLowerCase();
  const list = (sums ?? []).filter((s) => s.role === who && (!words || `${nameOf(s)} ${byUid.get(s.uid)?.email ?? ''}`.toLowerCase().includes(words)));
  const cur = (sums ?? []).find((s) => s.uid === sel) ?? null;
  const today = (sums ?? []).filter((s) => Date.now() - s.last < 864e5);
  return (
    <>
      <PageHead
        title="Activity"
        lede={
          <>
            What people do when they come. Teachers: every visit, page and click (what they clicked, never what they typed). Learners: only when they came. Kept for 90 days. {today.length ? `${today.length} people came in the last 24 hours.` : ''}
          </>
        }
      />
      <div className="us">
        <aside className="us-side">
          <Pills
            label="Whose activity"
            value={who}
            onChange={(v) => (setWho(v), setSel(null))}
            options={[
              { v: 'teacher', label: 'Teachers', n: (sums ?? []).filter((s) => s.role === 'teacher').length },
              { v: 'learner', label: 'Learners', n: (sums ?? []).filter((s) => s.role === 'learner').length },
            ]}
          />
          <Search value={q} onChange={setQ} placeholder="Search by name" />
          <ul className="us-list">
            {list.map((s) => (
              <li key={s.uid}>
                <button type="button" className={'us-person' + (sel === s.uid ? ' on' : '')} onClick={() => setSel(s.uid)}>
                  <Who name={nameOf(s)} pic={byUid.get(s.uid)?.avatar} sub={`${ago(s.last)} · ${s.visits} ${s.visits === 1 ? 'visit' : 'visits'}`} size={30} />
                  {Date.now() - s.last < 5 * 60000 && <span className="us-live" data-tip="Here now" aria-label="Here now" />}
                </button>
              </li>
            ))}
            {sums && !list.length && <li className="hint us-none">{words ? 'Nobody matches.' : 'Nobody yet: activity starts with the next visit.'}</li>}
          </ul>
        </aside>
        <section className="us-main" aria-label="Their visits">
          {cur ? <Visits uid={cur.uid} name={nameOf(cur)} role={cur.role} /> : <Empty title="Choose someone" text="Their visits appear here, newest first, with what they did in each." />}
        </section>
      </div>
    </>
  );
}

function Visits({ uid, name, role }: { uid: string; name: string; role: 'teacher' | 'learner' }) {
  const visits = useVisits(uid);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [uid]);
  if (!visits) return <span className="hint">Opening their visits…</span>;
  if (!visits.length) return <Empty title={`${name} has no visits yet`} text="Visits are kept from now on, for 90 days." />;
  const first = open ?? visits[0].id;
  return (
    <div className="us-visits">
      <b className="us-name">{name}</b>
      {visits.map((v) => {
        const isOpen = role === 'teacher' && first === v.id;
        const clicks = v.events.filter((e) => e.k === 'click').length;
        const pages = v.events.filter((e) => e.k === 'page').length;
        return (
          <article key={v.id} className={'us-visit' + (isOpen ? ' open' : '')}>
            <button type="button" className="us-visit-h" aria-expanded={isOpen} disabled={role !== 'teacher'} onClick={() => setOpen(isOpen ? '' : v.id)}>
              <span className="us-when">
                <b>{day(v.start)}</b> {clock(v.start).slice(0, 5)}–{clock(v.last).slice(0, 5)}
              </span>
              <span className="hint">
                {mins(v.start, v.last)} · {v.device}
                {role === 'teacher' ? ` · ${pages + 1} ${pages ? 'pages' : 'page'}, ${clicks} ${clicks === 1 ? 'click' : 'clicks'}` : ''}
              </span>
            </button>
            {isOpen && <Timeline events={v.events} />}
          </article>
        );
      })}
    </div>
  );
}

function Timeline({ events }: { events: ActEv[] }) {
  const list = [...events].sort((a, b) => a.t - b.t);
  return (
    <ol className="us-tl">
      {list.map((e, i) => (
        <li key={i} className={'k-' + e.k}>
          <span className="us-t">{clock(e.t)}</span>
          <span className="us-what">
            {e.k === 'in' ? (
              <>
                <b>Came in</b> on {pageName(e.p)}
              </>
            ) : e.k === 'page' ? (
              <>
                <b>Opened</b> {pageName(e.p)}
              </>
            ) : (
              <>
                Clicked <q>{e.l}</q>
                <span className="hint"> · {pageName(e.p)}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Avatar } from '../components/avatars';
import { formatBytes } from '../lib/archive';
import { PLANS, useOrgInvites, useOrgPictures, type Account, type Org, type Teacher } from '../lib/admin';
import type { ClassDoc } from '../lib/classes';

// Overviews for Super Admin and Organisation admin: the numbers that matter, then the people
// behind them. One series per chart, in the organisation's colour; hover a bar for its value.

const GB = 1024 ** 3;
type Bar = { label: string; n: number; tip?: string };

function Tile({ n, label, sub, tone }: { n: string | number; label: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={'ov-tile' + (tone ? ' ' + tone : '')}>
      <b>{n}</b>
      <span>{label}</span>
      {sub && <span className="hint">{sub}</span>}
    </div>
  );
}

function Bars({ data, unit }: { data: Bar[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.length) return <p className="hint">Nothing to show yet.</p>;
  return (
    <div className="ov-bars" role="img" aria-label={data.map((d) => `${d.label}: ${d.n} ${unit}`).join(', ')}>
      {data.map((d) => (
        <span key={d.label} className="ov-bar" data-tip={d.tip ?? `${d.label}: ${d.n} ${unit}`}>
          <span className="ov-bar-v">{d.n || ''}</span>
          <i style={{ height: `${Math.max(d.n ? 4 : 0, (d.n / max) * 100)}%` }} />
          <span className="ov-bar-l">{d.label}</span>
        </span>
      ))}
    </div>
  );
}

// Horizontal bars for a ranked list: who has the most.
function Ranked({ rows, fmt }: { rows: { key: string; who: React.ReactNode; n: number; of?: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.of ?? r.n));
  return (
    <ul className="ov-rank">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="ov-rank-who">{r.who}</span>
          <span className="ov-rank-track" data-tip={fmt(r.n) + (r.of ? ` of ${fmt(r.of)}` : '')}>
            <i style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="ov-rank-n">{fmt(r.n)}</span>
        </li>
      ))}
    </ul>
  );
}

const LEVEL_ORDER = ['Pre-A1', 'A1', 'A2', 'B1', 'B1+', 'B2', 'C1', 'C2'];
const byLevel = (classes: ClassDoc[]) => {
  const m = new Map<string, number>();
  for (const c of classes) m.set(c.level || 'Other', (m.get(c.level || 'Other') ?? 0) + (c.learnerCount ?? 0));
  return [...m.entries()].sort((a, b) => (LEVEL_ORDER.indexOf(a[0]) + 1 || 99) - (LEVEL_ORDER.indexOf(b[0]) + 1 || 99)).map(([label, n]) => ({ label, n }));
};

// ------------------------------------------------------------------ an organisation
export function OrgOverview({ org, onTab }: { org: Org; onTab: (t: string) => void }) {
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [accs, setAccs] = useState<Record<string, Account>>({});
  const pics = useOrgPictures(org);
  const invites = useOrgInvites(org);
  useEffect(() => {
    void getDocs(query(collection(db, 'classes'), where('org', '==', org.id)))
      .then((s) => setClasses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })).filter((c) => c.status === 'active')))
      .catch(() => setClasses([]));
    void getDocs(query(collection(db, 'accounts'), where('org', '==', org.id)))
      .then((s) => setAccs(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Account]))))
      .catch(() => setAccs({}));
  }, [org.id]);
  const teachers = Object.entries(org.teachers);
  const cls = classes ?? [];
  const learners = cls.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const used = Object.values(accs).reduce((n, a) => n + (a.usedBytes ?? 0), 0);
  const pending = invites.filter((i) => i.status === 'pending').length;
  const per = (uid: string) => cls.filter((c) => c.teacherId === uid);
  const rows = teachers
    .map(([uid, t]) => ({ uid, t, classes: per(uid).length, learners: per(uid).reduce((n, c) => n + (c.learnerCount ?? 0), 0), used: accs[uid]?.usedBytes ?? 0, gb: t.gb ?? org.perTeacherGb ?? 1 }))
    .sort((a, b) => b.learners - a.learners || a.t.name.localeCompare(b.t.name));
  const quiet = rows.filter((r) => !r.classes);
  const big = [...cls].sort((a, b) => (b.learnerCount ?? 0) - (a.learnerCount ?? 0)).slice(0, 6);
  return (
    <div className="ov">
      <div className="ov-tiles">
        <Tile n={teachers.length} label={teachers.length === 1 ? 'teacher' : 'teachers'} sub={`${org.adminEmails.length} admin${org.adminEmails.length === 1 ? '' : 's'}${org.allow?.trainers ? ` · ${teachers.filter(([, t]) => t.trainer).length} trainers` : ''}`} />
        <Tile n={classes ? cls.length : '…'} label="classes" sub={classes ? `${(learners / Math.max(1, cls.length)).toFixed(1)} learners a class` : undefined} />
        <Tile n={classes ? learners : '…'} label="learners" sub={classes ? `${(learners / Math.max(1, teachers.length)).toFixed(1)} a teacher` : undefined} />
        <Tile n={formatBytes(used)} label="space used" sub={`of ${org.limitGb} GB`} tone={used > org.limitGb * GB * 0.9 ? 'warn' : undefined} />
        <Tile n={pending} label="invitations waiting" sub={pending ? 'Send them again from Teachers' : 'None waiting'} />
      </div>
      <div className="ov-grid">
        <section className="ov-card">
          <header>
            <h2>Learners by level</h2>
            <button type="button" className="btn link small" onClick={() => onTab('classes')}>Classes</button>
          </header>
          <Bars data={byLevel(cls)} unit="learners" />
        </section>
        <section className="ov-card">
          <header>
            <h2>Largest classes</h2>
          </header>
          {big.length ? (
            <Ranked rows={big.map((c) => ({ key: c.id, who: <span><b>{c.name}</b><span className="hint">{org.teachers[c.teacherId]?.name ?? ''} · {c.level}</span></span>, n: c.learnerCount ?? 0 }))} fmt={(n) => `${n}`} />
          ) : (
            <p className="hint">No classes yet.</p>
          )}
        </section>
        <section className="ov-card wide">
          <header>
            <h2>Teachers</h2>
            <button type="button" className="btn link small" onClick={() => onTab('teachers')}>Manage teachers</button>
          </header>
          <div className="adm-table-wrap">
            <table className="adm-table ov-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Classes</th>
                  <th>Learners</th>
                  <th>Space</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid}>
                    <td>
                      <span className="adm-who">
                        <Avatar k={pics[r.uid]} name={r.t.name || r.t.email} size={30} />
                        <span>
                          <b>{r.t.name || r.t.email}</b>
                          <span className="hint">{r.t.title || r.t.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>{r.classes}</td>
                    <td>{r.learners}</td>
                    <td>
                      <span className="ov-space" data-tip={`${formatBytes(r.used)} of ${r.gb} GB`}>
                        <i style={{ width: `${Math.min(100, (r.used / (r.gb * GB)) * 100)}%` }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {quiet.length > 0 && <span className="hint">{quiet.length === 1 ? `${quiet[0].t.name || quiet[0].t.email} has no classes yet.` : `${quiet.length} teachers have no classes yet.`}</span>}
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the whole of ELT Suite
export function SuperOverview({ teachers, accounts, orgs, onOpen }: { teachers: Teacher[] | null; accounts: Record<string, Account>; orgs: Org[]; onOpen: (id: string) => void }) {
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  useEffect(() => {
    void getDocs(collection(db, 'classes'))
      .then((s) => setClasses(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })).filter((c) => c.status === 'active')))
      .catch(() => setClasses([]));
  }, []);
  const list = teachers ?? [];
  const cls = classes ?? [];
  const learners = cls.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const used = list.reduce((n, t) => n + (accounts[t.uid]?.usedBytes ?? t.usedBytes ?? 0), 0);
  const week = Date.now() - 7 * 864e5;
  const fresh = list.filter((t) => (t.createdAt ?? 0) > week).length;
  const paused = Object.values(accounts).filter((a) => a.suspended).length;
  const over = Object.values(accounts).filter((a) => a.over).length;
  // Sign-ups, a bar a week, for the last eight weeks.
  const weeks = useMemo(() => {
    const out: Bar[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = Date.now() - i * 7 * 864e5;
      const start = end - 7 * 864e5;
      const n = list.filter((t) => (t.createdAt ?? 0) > start && (t.createdAt ?? 0) <= end).length;
      const d = new Date(start);
      out.push({ label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), n, tip: `Week from ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: ${n} new teachers` });
    }
    return out;
  }, [list]);
  const plans = PLANS.map((p) => ({ label: p.label, n: list.filter((t) => (accounts[t.uid]?.org ? 'school' : accounts[t.uid]?.plan ?? 'free') === p.k).length }));
  const spaceTop = [...list].map((t) => ({ t, n: accounts[t.uid]?.usedBytes ?? t.usedBytes ?? 0 })).sort((a, b) => b.n - a.n).slice(0, 6);
  const orgRows = [...orgs].map((o) => ({ o, n: Object.keys(o.teachers).length, learners: cls.filter((c) => (c as ClassDoc & { org?: string }).org === o.id).reduce((s, c) => s + (c.learnerCount ?? 0), 0) })).sort((a, b) => b.learners - a.learners || b.n - a.n).slice(0, 6);
  const newest = [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6);
  return (
    <div className="ov">
      <div className="ov-tiles">
        <Tile n={list.length} label="teachers" sub={`${fresh} new this week`} />
        <Tile n={orgs.length} label="organisations" sub={`${orgs.reduce((n, o) => n + Object.keys(o.teachers).length, 0)} teachers in them`} />
        <Tile n={classes ? cls.length : '…'} label="classes" />
        <Tile n={classes ? learners : '…'} label="learners" />
        <Tile n={formatBytes(used)} label="space used" sub={over ? `${over} accounts are full` : 'No account is full'} tone={over ? 'warn' : undefined} />
        <Tile n={paused} label="paused" sub={paused ? 'Accounts you paused' : 'No account paused'} />
      </div>
      <div className="ov-grid">
        <section className="ov-card">
          <header>
            <h2>New teachers</h2>
            <span className="hint">a bar a week</span>
          </header>
          <Bars data={weeks} unit="teachers" />
        </section>
        <section className="ov-card">
          <header>
            <h2>Plans</h2>
          </header>
          <Ranked rows={plans.map((p) => ({ key: p.label, who: <b>{p.label}</b>, n: p.n }))} fmt={(n) => `${n}`} />
          <h2 className="ov-sub">Learners by level</h2>
          <Bars data={byLevel(cls)} unit="learners" />
        </section>
        <section className="ov-card">
          <header>
            <h2>Organisations</h2>
          </header>
          {orgRows.length ? (
            <ul className="ov-list">
              {orgRows.map(({ o, n, learners: l }) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onOpen(o.id)}>
                    <span className="adm-dot" style={{ background: o.brand?.color ?? '#5d6f80' }} />
                    <b>{o.name}</b>
                    <span className="hint">
                      {n} {n === 1 ? 'teacher' : 'teachers'} · {l} learners
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No organisations yet.</p>
          )}
        </section>
        <section className="ov-card">
          <header>
            <h2>Most space</h2>
          </header>
          <Ranked rows={spaceTop.map(({ t, n }) => ({ key: t.uid, who: <span className="adm-who"><Avatar k={t.avatar} name={t.name || t.email} size={26} /><b>{t.name || t.email}</b></span>, n, of: (accounts[t.uid]?.limitGb ?? 1) * GB }))} fmt={formatBytes} />
        </section>
        <section className="ov-card wide">
          <header>
            <h2>Newest teachers</h2>
          </header>
          <ul className="ov-people">
            {newest.map((t) => (
              <li key={t.uid}>
                <Avatar k={t.avatar} name={t.name || t.email} size={36} />
                <span>
                  <b>{t.name || 'No name'}</b>
                  <span className="hint">{t.email}</span>
                  <span className="hint">{[t.createdAt ? new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '', accounts[t.uid]?.org ? orgs.find((o) => o.id === accounts[t.uid]?.org)?.name ?? '' : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { UiIcon } from '../components/UiIcon';
import { Avatar } from '../components/avatars';
import { PLANS } from '../lib/admin';
import { givenGb, limitGbOf, orgAttention, orgSetup, superAttention, usedOf, type Attention } from './admin/attention';
import { EventList, orgEvents } from './admin/OrgActivity';
import { GB, Meter, PageHead, Panel, daysSince, dateStr, fmtBytes, fmtGb, plural } from './admin/ui';
import type { Go, OrgData, SuperData } from './admin/types';
import type { OrgClass } from '../lib/admin';

// Overviews for Super Admin and Organisation admin: first what needs a look, then the numbers that
// matter, then the people behind them. One series per chart, in the organisation's colour.

type Bar = { label: string; n: number; tip?: string };

// Tile and Bars are also used by the class portfolio (components/Portfolio.tsx).
export function Tile({ n, label, sub, tone }: { n: string | number; label: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={'ov-tile' + (tone ? ' ' + tone : '')}>
      <b>{n}</b>
      <span>{label}</span>
      {sub && <span className="hint">{sub}</span>}
    </div>
  );
}

export function Bars({ data, unit }: { data: Bar[]; unit: string }) {
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

const LEVEL_ORDER = ['Pre-A1', 'A1', 'A2', 'B1', 'B1+', 'B2', 'C1', 'C2'];
const byLevel = (classes: OrgClass[]) => {
  const m = new Map<string, number>();
  for (const c of classes) m.set(c.level || 'Other', (m.get(c.level || 'Other') ?? 0) + (c.learnerCount ?? 0));
  return [...m.entries()].sort((a, b) => (LEVEL_ORDER.indexOf(a[0]) + 1 || 99) - (LEVEL_ORDER.indexOf(b[0]) + 1 || 99)).map(([label, n]) => ({ label, n }));
};
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

// What needs a look, most pressing first; a calm line when nothing does.
function Ledger({ items, go, calm }: { items: Attention[]; go: Go; calm: string }) {
  const high = items.filter((i) => !i.low);
  const low = items.filter((i) => i.low);
  return (
    <section className={'hq-ledger' + (items.length ? '' : ' calm')} aria-labelledby="hq-ledger-h">
      <h2 id="hq-ledger-h">{items.length ? 'Worth a look' : 'All in order'}</h2>
      {!items.length ? (
        <p>{calm}</p>
      ) : (
        <ul>
          {[...high, ...low].map((i) => (
            <li key={i.k} className={i.low ? 'low' : ''}>
              <span className="hq-ledger-n" aria-hidden={!i.n}>
                {i.n || ''}
              </span>
              <span className="hq-ledger-t">
                <b>{i.n ? `${i.n} ${i.title}` : i.title}</b>
                <span>{i.text}</span>
              </span>
              <button type="button" className="btn small-btn" onClick={() => go({ tab: i.go.tab, f: i.go.f })}>
                {i.act}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The few numbers that describe the place, in one strip.
function Figures({ items }: { items: { n: string | number; label: string; sub?: string; go?: () => void }[] }) {
  return (
    <dl className="hq-figs">
      {items.map((f) => (
        <div key={f.label} className={f.go ? 'go' : ''}>
          <dt>{f.label}</dt>
          <dd>
            {f.go ? (
              <button type="button" onClick={f.go} aria-label={`${f.label}: ${f.n}. Open`}>
                {f.n}
              </button>
            ) : (
              f.n
            )}
          </dd>
          {f.sub && <dd className="hq-figs-s">{f.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ an organisation
export function OrgOverview({ d, go }: { d: OrgData; go: Go }) {
  const { org, classes, accounts, invites } = d;
  const active = classes.filter((c) => c.status === 'active');
  const items = d.loading ? [] : orgAttention(org, classes, accounts, invites);
  const setup = orgSetup(org, d.folders.length, invites);
  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const teachers = Object.keys(org.teachers);
  const used = teachers.reduce((n, uid) => n + (accounts[uid]?.usedBytes ?? 0), 0);
  const given = givenGb(org);
  const waiting = invites.filter((i) => i.status === 'pending').length;
  const old = invites.filter((i) => i.status === 'pending' && daysSince(i.at) >= 7).length;
  const big = [...active].sort((a, b) => (b.learnerCount ?? 0) - (a.learnerCount ?? 0)).slice(0, 6);
  const recent = orgEvents(d).slice(0, 6);
  const trainers = teachers.filter((uid) => org.teachers[uid].trainer).length;
  return (
    <div className="hq-page">
      <PageHead title={org.name} lede={`${today()}.${d.loading ? '' : items.length ? ` ${plural(items.filter((i) => !i.low).length || items.length, 'thing')} worth a look.` : ' Nothing needs you today.'}`} />
      {!d.loading && <Ledger items={items} go={go} calm="Every teacher has a class, every class has learners, nobody is short of space and no invitation is waiting long." />}
      {setup.some((s) => !s.done) && (
        <Panel title={`Getting ${org.name} ready`} className="hq-setup">
          <ol>
            {setup.map((s) => (
              <li key={s.k} className={s.done ? 'done' : ''}>
                <span className="hq-setup-m" aria-hidden="true">
                  {s.done ? '✓' : ''}
                </span>
                {s.done ? (
                  <span>{s.label}</span>
                ) : (
                  <button type="button" className="btn link" onClick={() => go({ tab: s.tab })}>
                    {s.label}
                  </button>
                )}
                {s.done && <span className="hq-sr">, done</span>}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      <Figures
        items={[
          { n: teachers.length, label: 'Teachers', sub: [plural(org.adminEmails.length, 'admin'), org.allow?.trainers ? plural(trainers, 'trainer') : ''].filter(Boolean).join(', '), go: () => go({ tab: 'teachers' }) },
          { n: d.loading ? '…' : active.length, label: 'Classes', sub: active.length ? `${(learners / active.length).toFixed(1)} learners a class` : 'None yet', go: () => go({ tab: 'classes' }) },
          { n: d.loading ? '…' : learners, label: 'Learners', sub: teachers.length ? `${(learners / teachers.length).toFixed(1)} a teacher` : undefined },
          { n: fmtBytes(used), label: 'Space used', sub: `${fmtGb(given)} given out of ${fmtGb(org.limitGb)}`, go: () => go({ tab: 'space' }) },
          { n: waiting, label: 'Invitations waiting', sub: waiting ? (old ? `${old} for more than a week` : 'All sent this week') : 'Nobody is waiting', go: () => go({ tab: 'invites' }) },
        ]}
      />
      <div className="hq-grid">
        <Panel title="Learners by level" action={<button type="button" className="btn link small" onClick={() => go({ tab: 'classes' })}>Classes</button>}>
          <Bars data={byLevel(active)} unit="learners" />
        </Panel>
        <Panel title="Largest classes">
          {big.length ? (
            <ul className="hq-rank">
              {big.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go({ tab: 'classes', c: c.id })}>
                    <span className="hq-rank-n">
                      <b>{c.name}</b>
                      <span>
                        {org.teachers[c.teacherId]?.name ?? ''}, {c.level}
                      </span>
                    </span>
                    <span className="hq-bar" aria-hidden="true">
                      <i style={{ width: `${((c.learnerCount ?? 0) / Math.max(1, big[0].learnerCount ?? 1)) * 100}%` }} />
                    </span>
                    <span className="hq-rank-v">{plural(c.learnerCount ?? 0, 'learner')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No classes yet.</p>
          )}
        </Panel>
        <Panel title="Recent activity" action={<button type="button" className="btn link small" onClick={() => go({ tab: 'activity' })}>All activity</button>} className="wide">
          {recent.length ? <EventList list={recent} /> : <p className="hint">Invitations, new classes and changes show here as they happen.</p>}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the whole of ELT Suite
export function SuperOverview({ d, go }: { d: SuperData; go: Go }) {
  const [findTeacher,setFindTeacher]=useState('');
  const { teachers, accounts, orgs, classes, invites } = d;
  const active = classes.filter((c) => c.status === 'active');
  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const used = teachers.reduce((n, t) => n + usedOf(accounts[t.uid], t), 0);
  const fresh = teachers.filter((t) => daysSince(t.createdAt) < 7 && t.createdAt).length;
  const paused = teachers.filter((t) => accounts[t.uid]?.suspended).length;
  const items = d.loading ? [] : superAttention(teachers, accounts, orgs, classes, invites);
  // Sign-ups, a bar a week, for the last eight weeks.
  const weeks = useMemo(() => {
    const out: Bar[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = Date.now() - i * 7 * 864e5;
      const start = end - 7 * 864e5;
      const n = teachers.filter((t) => (t.createdAt ?? 0) > start && (t.createdAt ?? 0) <= end).length;
      const day = new Date(start);
      out.push({ label: day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), n, tip: `Week from ${day.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: ${plural(n, 'new teacher')}` });
    }
    return out;
  }, [teachers]);
  const plans = PLANS.map((p) => ({ p, n: teachers.filter((t) => (accounts[t.uid]?.org ? 'school' : accounts[t.uid]?.plan ?? 'free') === p.k).length }));
  const spaceTop = teachers
    .map((t) => ({ t, n: usedOf(accounts[t.uid], t), of: limitGbOf(accounts[t.uid], orgs, t.uid) * GB }))
    .sort((a, b) => b.n / b.of - a.n / a.of)
    .slice(0, 6);
  const orgRows = orgs
    .map((o) => ({ o, n: Object.keys(o.teachers).length, l: active.filter((c) => c.org === o.id).reduce((s, c) => s + (c.learnerCount ?? 0), 0) }))
    .sort((a, b) => b.l - a.l || b.n - a.n)
    .slice(0, 8);
  const newest = [...teachers].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6);
  const orgName = (id?: string | null) => orgs.find((o) => o.id === id)?.name ?? '';
  return (
    <div className="hq-page">
      <PageHead title="Your admin workspace" lede={`${today()}.${d.loading ? '' : items.length ? ` ${plural(items.filter((i) => !i.low).length || items.length, 'thing')} worth a look.` : ' Nothing needs you today.'}`} />
      {!d.loading && <Ledger items={items} go={go} calm="No account is full, every organisation has an admin and gives out only the space it has." />}
      <section className="hq-start" aria-labelledby="hq-start-title">
        <div className="hq-start-head"><div><h2 id="hq-start-title">What do you need to do?</h2><p>Start with a teacher, an organisation or a setting.</p></div><form className="hq-find" onSubmit={e=>{e.preventDefault();go({tab:'teachers',q:findTeacher.trim()});}}><label className="hq-sr" htmlFor="admin-find-teacher">Find a teacher by name or email</label><input id="admin-find-teacher" value={findTeacher} onChange={e=>setFindTeacher(e.target.value)} placeholder="Teacher’s name or email"/><button className="btn" type="submit"><UiIcon name="person" size={16}/>Find teacher</button></form></div>
        <div className="hq-start-grid">{[
          {title:'Manage a teacher',text:'Account, plan, apps and teaching privileges.',icon:'person',tab:'teachers'},
          {title:'Invite teachers',text:'Create and manage invitation codes.',icon:'plus',tab:'codes'},
          {title:'Teacher trainers',text:'Independent teachers with training-course access.',icon:'classes',tab:'teachers',f:'trainers'},
          {title:'Manage an organisation',text:'People, classes, policies and shared resources.',icon:'groups',tab:'orgs'},
          {title:'Review AI usage',text:'Allowances, access and usage in one place.',icon:'board',tab:'ai'},
          {title:'Configure the product',text:'App availability and default experience.',icon:'settings',tab:'apps'},
        ].map(x=><button type="button" key={x.title} className="hq-start-card" onClick={()=>go({tab:x.tab,f:x.f})}><UiIcon name={x.icon} size={20}/><span><b>{x.title}</b><span>{x.text}</span></span><span aria-hidden="true">→</span></button>)}</div>
      </section>
      <Figures
        items={[
          { n: teachers.length, label: 'Teachers', sub: `${fresh} new this week`, go: () => go({ tab: 'teachers' }) },
          { n: orgs.length, label: 'Organisations', sub: `${plural(orgs.reduce((n, o) => n + Object.keys(o.teachers).length, 0), 'teacher')} in them`, go: () => go({ tab: 'orgs' }) },
          { n: d.loading ? '…' : active.length, label: 'Classes' },
          { n: d.loading ? '…' : learners, label: 'Learners' },
          { n: fmtBytes(used), label: 'Space used', sub: 'Files, as last measured' },
          { n: paused, label: 'Paused', sub: paused ? 'Accounts you paused' : 'No account paused', go: paused ? () => go({ tab: 'teachers', f: 'paused' }) : undefined },
        ]}
      />
      <details className="hq-insights"><summary>Usage and growth details</summary><div className="hq-grid">
        <Panel title="New teachers" action={<span className="hint">a bar a week</span>}>
          <Bars data={weeks} unit="teachers" />
        </Panel>
        <Panel title="Plans">
          <ul className="hq-rank">
            {plans.map(({ p, n }) => (
              <li key={p.k}>
                <span className="hq-rank-row">
                  <span className="hq-rank-n">
                    <b>{p.label}</b>
                    <span>{p.about}</span>
                  </span>
                  <span className="hq-bar" aria-hidden="true">
                    <i style={{ width: `${(n / Math.max(1, teachers.length)) * 100}%` }} />
                  </span>
                  <span className="hq-rank-v">{plural(n, 'teacher')}</span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="hq-sub">Learners by level</h3>
          <Bars data={byLevel(active)} unit="learners" />
        </Panel>
        <Panel title="Organisations" action={<button type="button" className="btn link small" onClick={() => go({ tab: 'orgs' })}>All</button>}>
          {orgRows.length ? (
            <ul className="hq-rank">
              {orgRows.map(({ o, n, l }) => (
                <li key={o.id}>
                  <button type="button" onClick={() => go({ org: o.id, tab: 'overview' })}>
                    <span className="hq-rank-n hq-rank-org">
                      <span className="hq-dot" style={{ background: o.brand?.color ?? '#5d6f80' }} />
                      <b>{o.name}</b>
                    </span>
                    <Meter used={givenGb(o)} of={o.limitGb} small />
                    <span className="hq-rank-v">
                      {plural(n, 'teacher')}, {plural(l, 'learner')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No organisations yet. Make one in Organisations.</p>
          )}
        </Panel>
        <Panel title="Closest to their space limit" action={<button type="button" className="btn link small" onClick={() => go({ tab: 'teachers', f: 'near' })}>Teachers</button>}>
          <ul className="hq-rank">
            {spaceTop.map(({ t, n, of }) => (
              <li key={t.uid}>
                <button type="button" onClick={() => go({ tab: 'teachers', t: t.uid })}>
                  <span className="hq-rank-n hq-rank-who">
                    <Avatar k={t.avatar} name={t.name || t.email} size={24} />
                    <b>{t.name || t.email}</b>
                  </span>
                  <Meter used={n} of={of} small />
                  <span className="hq-rank-v">
                    {fmtBytes(n)} of {fmtGb(of / GB)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Newest teachers" className="wide">
          <ul className="hq-newest">
            {newest.map((t) => (
              <li key={t.uid}>
                <button type="button" onClick={() => go({ tab: 'teachers', t: t.uid })}>
                  <Avatar k={t.avatar} name={t.name || t.email} size={36} />
                  <span>
                    <b>{t.name || 'No name'}</b>
                    <span>{t.email}</span>
                    <span>{[dateStr(t.createdAt), orgName(accounts[t.uid]?.org)].filter(Boolean).join(', ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div></details>
    </div>
  );
}


import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, type Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { HUB_ACTIVITIES, HUB_COLLECTIONS } from './catalog';
import type { HubResourceEdition } from './hubEditorData';
import './resource-activity-metrics.css';

// Resource Hub insights, for super admins: what teachers open, print, copy, save, teach live and
// adapt; how that changes over time; by collection, level and organisation; what they search for
// (and find nothing for). Everything downloads as CSV with all the details each resource has.

const FIELDS = ['views', 'downloads', 'copies', 'saves', 'lives', 'adapts'] as const;
type Field = typeof FIELDS[number];
const LABEL: Record<Field, string> = { views: 'Opens', downloads: 'PDFs', copies: 'Class copies', saves: 'Saves', lives: 'Taught live', adapts: 'Adapted with AI' };
type Counts = Record<Field, number>;
type Metric = { id: string; all: Counts; unique: Counts; teachers: number; days: Record<string, Partial<Counts>>; orgs: Record<string, Partial<Counts>>; lastAt: number };
type Search = { id: string; term: string; count: number; empty: number; results: number; days: Record<string, number>; lastAt: number };
type Resource = { activityId: string; edition?: HubResourceEdition; builtIn?: (typeof HUB_ACTIVITIES)[number] };

const PERIODS = [{ k: '7', label: '7 days', days: 7 }, { k: '30', label: '30 days', days: 30 }, { k: '90', label: '90 days', days: 90 }, { k: '365', label: '12 months', days: 365 }, { k: 'all', label: 'All time', days: 0 }] as const;
type PeriodKey = typeof PERIODS[number]['k'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const zero = (): Counts => ({ views: 0, downloads: 0, copies: 0, saves: 0, lives: 0, adapts: 0 });
const ms = (v: unknown) => (v && typeof (v as Timestamp).toMillis === 'function' ? (v as Timestamp).toMillis() : num(v));
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const used = (c: Counts) => c.downloads + c.copies + c.lives + c.adapts;
const rate = (c: Counts) => (c.views ? Math.round((used(c) / c.views) * 100) : 0);
const fmt = (n: number) => n.toLocaleString('en-GB');
const dateText = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const activityIdOf = (e: HubResourceEdition) => (e.resourceType === 'lesson' ? `lesson-${e.id}` : `${e.collectionId}-${e.number.padStart(3, '0')}`);

// A spreadsheet cell; text that a spreadsheet would run as a formula starts with an apostrophe.
const cell = (v: string | number) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function downloadCsv(name: string, rows: (string | number)[][]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '.csv';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function sumDays(m: Metric, from: string): Counts {
  if (!from) return m.all;
  const c = zero();
  for (const [d, v] of Object.entries(m.days)) if (d >= from) for (const f of FIELDS) c[f] += num(v[f]);
  return c;
}

export function ResourceActivityMetrics({ published }: { published: HubResourceEdition[] | null }) {
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [sort, setSort] = useState<{ k: string; up: boolean }>({ k: 'views', up: false });
  const [find, setFind] = useState('');
  const [coll, setColl] = useState('');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setError('');
    Promise.all([
      getDocs(collection(db, 'resourceHubMetrics')),
      getDocs(collection(db, 'resourceHubSearches')).catch(() => null),
      getDocs(collection(db, 'orgs')).catch(() => null),
    ]).then(([m, s, o]) => {
      if (!live) return;
      setMetrics(m.docs.map((d) => {
        const x = d.data();
        const all = zero(), unique = zero();
        for (const f of FIELDS) { all[f] = num(x[f]); unique[f] = num(x['unique' + f[0].toUpperCase() + f.slice(1)]); }
        return { id: d.id, all, unique, teachers: num(x.teachers) || unique.views, days: (x.days ?? {}) as Metric['days'], orgs: (x.orgs ?? {}) as Metric['orgs'], lastAt: ms(x.lastAt ?? x.updatedAt) };
      }));
      setSearches((s?.docs ?? []).map((d) => { const x = d.data(); return { id: d.id, term: String(x.term ?? ''), count: num(x.count), empty: num(x.empty), results: num(x.results), days: (x.days ?? {}) as Record<string, number>, lastAt: ms(x.lastAt) }; }).filter((x) => x.term));
      setOrgNames(Object.fromEntries((o?.docs ?? []).map((d) => [d.id, String(d.get('name') ?? d.id)])));
    }).catch(() => { if (live) setError('We couldn’t load the figures just now. Check your connection and try again.'); });
    return () => { live = false; };
  }, [refresh]);

  const days = PERIODS.find((p) => p.k === period)!.days;
  const from = days ? dayKey(new Date(Date.now() - (days - 1) * 86400000)) : '';
  const resources = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const a of HUB_ACTIVITIES.filter((x) => x.id === 'otp-002')) map.set(a.id, { activityId: a.id, builtIn: a });
    for (const e of published ?? []) map.set(activityIdOf(e), { activityId: activityIdOf(e), edition: e });
    for (const m of metrics ?? []) if (!map.has(m.id)) map.set(m.id, { activityId: m.id });
    return map;
  }, [published, metrics]);
  const info = (id: string) => {
    const r = resources.get(id);
    const e = r?.edition, b = r?.builtIn;
    const collectionId = e?.collectionId ?? b?.collectionId ?? '';
    return {
      title: e?.title ?? b?.title ?? id, type: e?.resourceType === 'lesson' || id.startsWith('lesson-') ? 'Lesson' : 'Activity',
      collectionId, collection: HUB_COLLECTIONS.find((c) => c.id === collectionId)?.title ?? (collectionId || '—'),
      number: e?.number ?? b?.number ?? '', level: e?.level ?? b?.level ?? '', minutes: e?.minutes ?? b?.minutes ?? '', interaction: e?.interaction ?? b?.interaction ?? '',
      prep: e?.prep ?? b?.prep ?? '', mode: e?.mode ?? b?.mode ?? '', energy: e?.energy ?? b?.energy ?? '', focus: e?.focus ?? b?.focus ?? '', summary: e?.summary ?? b?.summary ?? '',
      sections: e?.sections.length ?? b?.editorSections?.length ?? b?.pages.length ?? '',
      learner: e ? e.sections.filter((s) => s.audience === 'learner').length : '', teacher: e ? e.sections.filter((s) => s.audience === 'teacher').length : '',
      versions: e ? new Set(e.sections.map((s) => s.versionGroup).filter(Boolean)).size : '', types: e ? [...new Set(e.sections.map((s) => s.identity?.name).filter(Boolean))].join('; ') : '',
      edition: e?.edition ?? '', publishedAt: e?.publishedAt ?? b?.publishedAt ?? 0, tags: b?.tags?.join('; ') ?? '',
    };
  };

  const rows = useMemo(() => (metrics ?? []).map((m) => ({ m, c: sumDays(m, from), i: info(m.id) })), [metrics, from, resources]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => rows.reduce((t, r) => { for (const f of FIELDS) t[f] += r.c[f]; return t; }, zero()), [rows]);

  // Opens by day (or by month over a year or more), for the chart.
  const series = useMemo(() => {
    const all = (metrics ?? []).flatMap((m) => Object.entries(m.days));
    const byMonth = !days || days > 90;
    const keys: string[] = [];
    if (byMonth) {
      const first = all.map(([d]) => d).sort()[0] ?? dayKey(new Date());
      const start = days ? new Date(Date.now() - (days - 1) * 86400000) : new Date(first);
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      while (d <= new Date()) { keys.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
    } else for (let i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(Date.now() - i * 86400000)));
    const at = new Map(keys.map((k) => [k, { opens: 0, used: 0 }]));
    for (const [d, v] of all) { const b = at.get(byMonth ? d.slice(0, 7) : d); if (b) { b.opens += num(v.views); b.used += num(v.downloads) + num(v.copies) + num(v.lives) + num(v.adapts); } }
    return { byMonth, points: keys.map((k) => ({ k, ...at.get(k)! })) };
  }, [metrics, days]);

  const groupBy = (key: (i: ReturnType<typeof info>) => string) => {
    const g = new Map<string, Counts>();
    for (const r of rows) { const k = key(r.i) || '—'; const c = g.get(k) ?? zero(); for (const f of FIELDS) c[f] += r.c[f]; g.set(k, c); }
    return [...g.entries()].sort((a, b) => b[1].views - a[1].views || used(b[1]) - used(a[1]));
  };
  const byCollection = useMemo(() => groupBy((i) => i.collection), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const byLevel = useMemo(() => groupBy((i) => i.level), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const byOrg = useMemo(() => {
    const g = new Map<string, Counts>();
    for (const m of metrics ?? []) for (const [o, v] of Object.entries(m.orgs)) { const c = g.get(o) ?? zero(); for (const f of FIELDS) c[f] += num(v[f]); g.set(o, c); }
    return [...g.entries()].map(([o, c]) => [o === 'none' ? 'No organisation' : orgNames[o] ?? o, c] as [string, Counts]).sort((a, b) => b[1].views - a[1].views);
  }, [metrics, orgNames]);
  const searchRows = useMemo(() => searches.map((s) => ({ ...s, n: from ? Object.entries(s.days).reduce((t, [d, v]) => t + (d >= from ? num(v) : 0), 0) : s.count })).filter((s) => s.n > 0), [searches, from]);
  const topSearches = useMemo(() => searchRows.slice().sort((a, b) => b.n - a.n).slice(0, 12), [searchRows]);
  const emptySearches = useMemo(() => searchRows.filter((s) => s.empty > 0 && s.results === 0).sort((a, b) => b.n - a.n).slice(0, 12), [searchRows]);

  const table = useMemo(() => {
    const q = find.trim().toLowerCase();
    const list = rows.filter((r) => (!coll || r.i.collectionId === coll) && (!q || `${r.i.title} ${r.i.focus} ${r.i.level} ${r.m.id}`.toLowerCase().includes(q)));
    const val = (r: typeof rows[number]): number | string => sort.k === 'title' ? r.i.title.toLowerCase() : sort.k === 'collection' ? r.i.collection : sort.k === 'level' ? r.i.level : sort.k === 'rate' ? rate(r.c) : sort.k === 'teachers' ? r.m.teachers : sort.k === 'lastAt' ? r.m.lastAt : r.c[sort.k as Field] ?? 0;
    return list.sort((a, b) => { const x = val(a), y = val(b); const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return sort.up ? d : -d; });
  }, [rows, find, coll, sort]);

  const periodName = PERIODS.find((p) => p.k === period)!.label.toLowerCase();
  const stamp = dayKey(new Date());
  const reportCsv = () => {
    const orgIds = [...new Set((metrics ?? []).flatMap((m) => Object.keys(m.orgs)))];
    const byId = new Map((metrics ?? []).map((m) => [m.id, m]));
    const ids = [...new Set([...resources.keys(), ...byId.keys()])];
    const head = ['Activity ID', 'Type', 'Collection', 'Collection ID', 'Number', 'Title', 'Language focus', 'Summary', 'Level', 'Minutes', 'Interaction', 'Preparation', 'Works in', 'Energy (1–3)', 'Sections', 'Learner sections', 'Teacher sections', 'A/B version sets', 'Activity types', 'Tags', 'Edition', 'Published',
      ...FIELDS.map((f) => `${LABEL[f]} (all time)`), ...FIELDS.map((f) => `${LABEL[f]}, teachers (all time)`), 'Teachers reached (all time)', 'Used after opening % (all time)',
      ...(from ? [...FIELDS.map((f) => `${LABEL[f]} (${periodName})`), `Used after opening % (${periodName})`] : []), 'Last used',
      ...orgIds.flatMap((o) => [`${o === 'none' ? 'No organisation' : orgNames[o] ?? o}: opens`, `${o === 'none' ? 'No organisation' : orgNames[o] ?? o}: used`])];
    const body = ids.map((id) => {
      const m = byId.get(id); const i = info(id); const all = m?.all ?? zero(); const p = m ? sumDays(m, from) : zero();
      return [id, i.type, i.collection, i.collectionId, i.number, i.title, i.focus, i.summary, i.level, i.minutes, i.interaction, i.prep, i.mode, i.energy, i.sections, i.learner, i.teacher, i.versions, i.types, i.tags, i.edition, i.publishedAt ? new Date(i.publishedAt).toISOString().slice(0, 10) : '',
        ...FIELDS.map((f) => all[f]), ...FIELDS.map((f) => m?.unique[f] ?? 0), m?.teachers ?? 0, rate(all),
        ...(from ? [...FIELDS.map((f) => p[f]), rate(p)] : []), m?.lastAt ? new Date(m.lastAt).toISOString().slice(0, 10) : '',
        ...orgIds.flatMap((o) => { const v = m?.orgs[o] ?? {}; return [num(v.views), num(v.downloads) + num(v.copies) + num(v.lives) + num(v.adapts)]; })];
    }).sort((a, b) => Number(b[22]) - Number(a[22]));
    downloadCsv(`Resource Hub report ${stamp}`, [head, ...body]);
  };
  const dailyCsv = () => {
    const ds = [...new Set((metrics ?? []).flatMap((m) => Object.keys(m.days)))].filter((d) => d >= from).sort();
    const body = ds.flatMap((d) => (metrics ?? []).filter((m) => m.days[d]).map((m) => [d, m.id, info(m.id).title, info(m.id).collection, ...FIELDS.map((f) => num(m.days[d][f]))]));
    downloadCsv(`Resource Hub by day ${stamp}`, [['Date', 'Activity ID', 'Title', 'Collection', ...FIELDS.map((f) => LABEL[f])], ...body]);
  };
  const searchCsv = () => downloadCsv(`Resource Hub searches ${stamp}`, [['Search', `Times (${periodName})`, 'Times (all time)', 'Times with no results', 'Results last time', 'Last searched'], ...searchRows.slice().sort((a, b) => b.n - a.n).map((s) => [s.term, s.n, s.count, s.empty, s.results, s.lastAt ? new Date(s.lastAt).toISOString().slice(0, 10) : ''])]);

  const max = Math.max(1, ...series.points.map((p) => p.opens));
  const barW = 100 / Math.max(1, series.points.length);
  const pointName = (k: string) => series.byMonth ? new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const head = (k: string, label: string, left = false) => (
    <th scope="col" className={left ? 'l' : ''} aria-sort={sort.k === k ? (sort.up ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ k, up: s.k === k ? !s.up : left }))}>{label}{sort.k === k ? (sort.up ? ' ↑' : ' ↓') : ''}</button>
    </th>
  );
  const bars = (title: string, list: [string, Counts][], empty: string) => {
    const top = Math.max(1, ...list.map(([, c]) => c.views));
    return (
      <div className="ram-card">
        <h3>{title}</h3>
        {list.length ? <ul className="ram-bars">{list.slice(0, 8).map(([k, c]) => (
          <li key={k}><span className="ram-bar-name">{k}</span><span className="ram-bar-track" aria-hidden="true"><i style={{ width: `${(c.views / top) * 100}%` }} /></span><span className="ram-bar-val">{fmt(c.views)} <small>opens · {rate(c)}% used</small></span></li>
        ))}</ul> : <p className="ram-empty">{empty}</p>}
      </div>
    );
  };

  return (
    <section className="ram" aria-labelledby="ram-title">
      <header className="ram-head">
        <div>
          <span className="rh-kicker">ACTIVITY INSIGHTS</span>
          <h2 id="ram-title">What teachers use most</h2>
          <p>An open is a teacher looking at a resource’s page. “Used” means they printed it, copied it to a Class, taught it live or adapted it. We keep no names or emails, only counts.</p>
        </div>
        <div className="ram-acts">
          <div className="ram-seg" role="group" aria-label="Period">{PERIODS.map((p) => <button key={p.k} type="button" aria-pressed={period === p.k} onClick={() => setPeriod(p.k)}>{p.label}</button>)}</div>
          <button type="button" className="rh-primary" disabled={!metrics} onClick={reportCsv}>Download report (CSV)</button>
          <button type="button" className="rhe-outline" disabled={!metrics} onClick={dailyCsv}>By day (CSV)</button>
          <button type="button" className="rhe-outline" disabled={!searchRows.length} onClick={searchCsv}>Searches (CSV)</button>
          <button type="button" className="rhe-outline" onClick={() => setRefresh((v) => v + 1)}>Refresh</button>
        </div>
      </header>
      {error && <p className="ram-error" role="alert">{error}</p>}
      <div className="ram-summary">
        {(['views', 'downloads', 'copies', 'saves', 'lives'] as Field[]).map((f) => <div key={f}><span>{LABEL[f]}</span><strong>{metrics ? fmt(totals[f]) : '…'}</strong></div>)}
        <div><span>Used after opening</span><strong>{metrics ? `${rate(totals)}%` : '…'}</strong></div>
      </div>
      {metrics === null ? <p className="ram-empty">One moment…</p> : !metrics.length ? <p className="ram-empty">No resource activity yet. Figures appear here as teachers open, print and copy resources.</p> : (
        <>
          <div className="ram-card ram-trend">
            <h3>Opens {series.byMonth ? 'by month' : 'by day'}, {periodName}</h3>
            <div className="ram-chart" onMouseLeave={() => setHover(null)}>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Opens ${series.byMonth ? 'by month' : 'by day'}. The table below has every figure.`}>
                {[0.5, 1].map((g) => <line key={g} x1="0" x2="100" y1={40 - g * 38} y2={40 - g * 38} className="ram-grid" vectorEffect="non-scaling-stroke" />)}
                {series.points.map((p, i) => {
                  const h = (p.opens / max) * 38;
                  return <rect key={p.k} x={i * barW + barW * 0.12} width={Math.max(0.2, barW * 0.76)} y={40 - h} height={h} rx="0.6" className={hover === i ? 'on' : ''} />;
                })}
              </svg>
              <div className="ram-hit">{series.points.map((p, i) => <span key={p.k} onMouseEnter={() => setHover(i)} />)}</div>
              {hover !== null && series.points[hover] && (
                <div className="ram-tip" style={{ left: `${Math.min(85, Math.max(5, (hover + 0.5) * barW))}%` }}>
                  <b>{pointName(series.points[hover].k)}</b><span>{fmt(series.points[hover].opens)} opens</span><span>{fmt(series.points[hover].used)} used</span>
                </div>
              )}
              <div className="ram-axis"><span>{pointName(series.points[0].k)}</span><span>{fmt(max)} at most</span><span>{pointName(series.points[series.points.length - 1].k)}</span></div>
            </div>
          </div>
          <div className="ram-grid3">
            {bars('By collection', byCollection, 'Nothing yet.')}
            {bars('By level', byLevel, 'Nothing yet.')}
            {bars('By organisation (all time)', byOrg, 'Figures by organisation start with this update.')}
          </div>
          <div className="ram-grid2">
            <div className="ram-card">
              <h3>What teachers search for</h3>
              {topSearches.length ? <ol className="ram-terms">{topSearches.map((s) => <li key={s.id}><span>{s.term}</span><b>{fmt(s.n)}</b></li>)}</ol> : <p className="ram-empty">No searches in this period.</p>}
            </div>
            <div className="ram-card">
              <h3>Searches with no results <small>ideas for new resources</small></h3>
              {emptySearches.length ? <ol className="ram-terms">{emptySearches.map((s) => <li key={s.id}><span>{s.term}</span><b>{fmt(s.n)}</b></li>)}</ol> : <p className="ram-empty">Every search in this period found something.</p>}
            </div>
          </div>
          <div className="ram-card">
            <div className="ram-table-head">
              <h3>Every resource, {periodName}</h3>
              <input type="search" className="ram-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a resource…" aria-label="Find a resource" />
              <select className="ram-find" value={coll} onChange={(e) => setColl(e.target.value)} aria-label="Collection"><option value="">All collections</option>{HUB_COLLECTIONS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            </div>
            <div className="ram-table-scroll">
              <table>
                <thead><tr>{head('title', 'Resource', true)}{head('collection', 'Collection', true)}{head('level', 'Level', true)}{FIELDS.map((f) => <Fragment key={f}>{head(f, LABEL[f])}</Fragment>)}{head('teachers', 'Teachers')}{head('rate', 'Used')}{head('lastAt', 'Last used')}</tr></thead>
                <tbody>{table.map((r) => (
                  <tr key={r.m.id}>
                    <th scope="row">{r.i.title}<small>{r.i.type}{r.i.number ? ` · ${r.i.number}` : ''}</small></th>
                    <td className="l">{r.i.collection}</td><td className="l">{r.i.level}</td>
                    {FIELDS.map((f) => <td key={f}>{fmt(r.c[f])}</td>)}
                    <td>{fmt(r.m.teachers)}</td><td>{rate(r.c)}%</td><td>{dateText(r.m.lastAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!table.length && <p className="ram-empty">No resource matches that.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

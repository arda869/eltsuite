import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { HUB_ACTIVITIES } from './catalog';
import type { HubResourceEdition } from './hubEditorData';
import './resource-activity-metrics.css';

type Counts = { id: string; views: number; downloads: number; copies: number; uniqueViews: number; uniqueDownloads: number; uniqueCopies: number };
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function ResourceActivityMetrics({ published }: { published: HubResourceEdition[] | null }) {
  const [rows, setRows] = useState<Counts[] | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    getDocs(collection(db, 'resourceHubMetrics')).then(snapshot => {
      if (!active) return;
      setRows(snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, views: amount(data.views), downloads: amount(data.downloads), copies: amount(data.copies), uniqueViews: amount(data.uniqueViews), uniqueDownloads: amount(data.uniqueDownloads), uniqueCopies: amount(data.uniqueCopies) };
      }));
      setError('');
    }).catch(() => { if (active) setError('Usage figures could not be loaded. Try again.'); });
    return () => { active = false; };
  }, [refresh]);
  const titles = useMemo(() => new Map([...(published ?? []).map(item => [item.resourceType === 'lesson' ? `lesson-${item.id}` : `${item.collectionId}-${item.number.padStart(3, '0')}`, item.title] as const), ...HUB_ACTIVITIES.filter(item => item.id === 'otp-002').map(item => [item.id, item.title] as const)]), [published]);
  const sorted = useMemo(() => (rows ?? []).slice().sort((a, b) => b.views - a.views), [rows]);
  const totals = useMemo(() => sorted.reduce((sum, item) => ({ views: sum.views + item.views, downloads: sum.downloads + item.downloads, copies: sum.copies + item.copies }), { views: 0, downloads: 0, copies: 0 }), [sorted]);
  const format = (value: number) => value.toLocaleString();
  return <section className="ram" aria-labelledby="ram-title">
    <header className="ram-head"><div><span className="rh-kicker">ACTIVITY INSIGHTS</span><h2 id="ram-title">How resources are used</h2><p>Counts begin when this feature is published. An access is an opened activity page; a PDF action is a download or an opened print PDF; a Class copy counts only after the lesson is created.</p></div><button type="button" className="rhe-outline" onClick={() => setRefresh(value => value + 1)}>Refresh figures</button></header>
    {error && <p className="ram-error" role="alert">{error}</p>}
    <div className="ram-summary"><div><span>Activity opens</span><strong>{format(totals.views)}</strong></div><div><span>PDF actions</span><strong>{format(totals.downloads)}</strong></div><div><span>Class copies</span><strong>{format(totals.copies)}</strong></div></div>
    {rows === null ? <p className="ram-empty">Loading usage figures…</p> : !sorted.length ? <p className="ram-empty">No resource activity has been recorded yet.</p> : <div className="ram-table-scroll"><table><thead><tr><th scope="col">Activity</th><th scope="col">Opens</th><th scope="col">Teachers</th><th scope="col">PDF actions</th><th scope="col">Teachers</th><th scope="col">Class copies</th><th scope="col">Teachers</th></tr></thead><tbody>{sorted.map(row => <tr key={row.id}><th scope="row">{titles.get(row.id) || row.id}</th><td>{format(row.views)}</td><td>{format(row.uniqueViews)}</td><td>{format(row.downloads)}</td><td>{format(row.uniqueDownloads)}</td><td>{format(row.copies)}</td><td>{format(row.uniqueCopies)}</td></tr>)}</tbody></table></div>}
  </section>;
}

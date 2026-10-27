import { useEffect } from 'react';
import { noteSpace, useSpaceLimit } from '../lib/admin';
import { useArchive } from '../lib/archive';
import { useMyDocs } from '../lib/sharedDocs';
import { formatBytes } from '../lib/archive';

// The space this account uses, out of the free plan's 1 GB.
export function StorageCard({ uid }: { uid: string }) {
  const space = useSpaceLimit();
  const items = useArchive(uid) ?? [];
  const { mine } = useMyDocs(uid);
  const media = (k: string) => items.filter((i) => i.kind === k).reduce((s, i) => s + (i.size || 0) * (1 + Object.keys(i.copies ?? {}).filter((c) => c !== i.home?.classId).length) + (i.thumb?.length ?? 0), 0);
  const parts: [string, number, string][] = [
    ['Pictures', media('image'), 'k-image'],
    ['Recordings', media('audio'), 'k-audio'],
    ['Videos', media('video'), 'k-video'],
    ['Collaborative files', (mine ?? []).reduce((s, d) => s + (d.size ?? 0), 0), 'k-docs'],
  ];
  const total = parts.reduce((s, p) => s + p[1], 0);
  const ready = useArchive(uid) !== null && mine !== null;
  useEffect(() => void (ready && noteSpace(uid, total)), [ready, uid, total]);
  return (
    <div className="ma-space st-card">
      <span className="ma-space-row">
        <b>{formatBytes(total)}</b>
        <span className="hint">used of {space.gb} GB</span>
      </span>
      <span className="ma-bar" aria-hidden="true">
        {parts.map(([l, b, k]) => (
          <span key={l} className={k} style={{ width: `${Math.max(b ? 0.8 : 0, (b / space.bytes) * 100)}%` }} />
        ))}
      </span>
      <span className="ma-legend">
        {parts.map(([l, b, k]) => (
          <span key={l}>
            <i className={k} />
            {l}
            <b>{b ? formatBytes(b) : '0'}</b>
          </span>
        ))}
      </span>
      <span className="hint small">{space.org ? `${space.org} gives you ${space.gb} GB.` : `Your plan has ${space.gb} GB for the whole app.`} Lessons and links take no space.</span>
    </div>
  );
}

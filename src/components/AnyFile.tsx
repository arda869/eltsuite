import { useState } from 'react';
import type { SharedDoc } from '../lib/sharedDocs';
import { downloadAnyFile, extOf, fileKindName, sizeText } from '../lib/fileStore';
import { FileIcon } from './FileIcon';
import { UiIcon } from './UiIcon';

// A file ELT Suite doesn't open itself: what it is, and a button to download it.
export function AnyFile({ d }: { d: SharedDoc }) {
  const f = d.file;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!f) return <div className="dp-msg">One moment…</div>;
  const x = extOf(f.name);
  const name = d.title.toLowerCase().endsWith('.' + x) || !x ? d.title : `${d.title}.${x}`;
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await downloadAnyFile(d.id, { ...f, name }, name);
    } catch {
      setErr('We couldn’t download the file just now. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="af">
      <div className="af-card">
        <FileIcon kind="file" size={72} sub={x || 'file'} />
        <h1 className="af-name">{name}</h1>
        <p className="af-meta">
          {fileKindName(f.name)} · {sizeText(f.bytes)} · from {d.ownerName}
        </p>
        <p className="af-about">ELT Suite can’t show this kind of file. Download it and open it in the app you use for it.</p>
        <button type="button" className="btn primary" onClick={() => void go()} disabled={busy}>
          <UiIcon name="import" size={16} /> {busy ? 'Downloading…' : 'Download'}
        </button>
        {err && <p className="af-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}

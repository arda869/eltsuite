import { useMemo, useState } from 'react';
import { formatBytes, inTree, leafOf, parentOf, useArchive, useFolders, type ArchiveItem } from '../lib/archive';
import { FolderIcon } from './FileIcon';
import { UiIcon } from './UiIcon';

// My Files inside an add window: folders to open, a path back up, search across everything, and the
// pictures or recordings in the folder. It opens in the folder you used last time for that kind of
// thing. Pick one, or several when the window allows it.

export type BrowseKind = ArchiveItem['kind'] | 'sound';
const KEY = (kind: BrowseKind) => `ll.addFolder.${kind}`;
const lastFolder = (kind: BrowseKind) => { try { return localStorage.getItem(KEY(kind)) ?? ''; } catch { return ''; } };
const keepFolder = (kind: BrowseKind, f: string) => { try { localStorage.setItem(KEY(kind), f); } catch { /* fine */ } };
const mins = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

export function FileBrowser({ uid, kind, multiple, onPick, busy, onUpload, addLabel }: {
  uid?: string; kind: BrowseKind; multiple?: boolean; onPick: (items: ArchiveItem[]) => void; busy?: boolean;
  // Shown beside the search: upload straight from here.
  onUpload?: () => void;
  addLabel?: (n: number) => string;
}) {
  const all = useArchive(uid);
  const made = useFolders(uid);
  const [q, setQ] = useState('');
  const [at, setAtState] = useState(() => lastFolder(kind));
  const [picked, setPicked] = useState<string[]>([]);
  const setAt = (f: string) => { setAtState(f); keepFolder(kind, f); };
  const fits = (i: ArchiveItem) => !i.deletedAt && (kind === 'sound' ? i.kind === 'audio' || i.kind === 'video' : i.kind === kind);
  const mine = useMemo(() => (all ?? []).filter(fits), [all, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every folder, with the ones above it, so a path can be walked.
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const f of [...made, ...(all ?? []).map((i) => i.folder)]) for (let x = f; x; x = parentOf(x)) set.add(x);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [made, all]);
  // A remembered folder that has gone opens My Files at the top.
  const here = at && !folders.includes(at) ? '' : at;
  const s = q.trim().toLowerCase();
  const sub = folders.filter((f) => parentOf(f) === here);
  const count = (f: string) => mine.filter((i) => inTree(i.folder, f)).length;
  const items = (s ? mine.filter((i) => (i.name + ' ' + i.tags.join(' ') + ' ' + i.folder).toLowerCase().includes(s)) : mine.filter((i) => i.folder === here))
    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  if (!uid) return <p className="hint">Sign in to use your files.</p>;
  if (all === null) return <p className="hint fb-wait">Opening My Files…</p>;
  const pics = kind === 'image';
  const choose = (it: ArchiveItem) => (multiple ? setPicked((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : [...p, it.id])) : onPick([it]));
  const path = here ? here.split('/') : [];
  return (
    <div className="fb">
      <div className="fb-bar">
        <nav className="fb-path" aria-label="Folder">
          <button type="button" className={!here ? 'on' : ''} onClick={() => setAt('')}><UiIcon name="folder" size={15} /> My Files</button>
          {path.map((p, i) => (
            <span key={i} className="fb-crumb">
              <span aria-hidden="true">›</span>
              <button type="button" className={i === path.length - 1 ? 'on' : ''} onClick={() => setAt(path.slice(0, i + 1).join('/'))}>{p}</button>
            </span>
          ))}
        </nav>
        <span className="fb-search">
          <UiIcon name="search" size={15} />
          <input type="search" aria-label="Search My Files" enterKeyHint="search" value={q} placeholder="Search My Files" onChange={(e) => setQ(e.target.value)} />
        </span>
        {onUpload && (
          <button type="button" className="fb-up" onClick={onUpload}><UiIcon name="upload" size={15} /> Upload</button>
        )}
      </div>
      <div className="fb-scroll">
        {!s && (here || sub.length > 0) && (
          <div className="fb-folders">
            {here && (
              <button type="button" className="fb-folder up" onClick={() => setAt(parentOf(here))}>
                <UiIcon name="prev" size={16} /> <span>Back to {parentOf(here) ? leafOf(parentOf(here)) : 'My Files'}</span>
              </button>
            )}
            {sub.map((f) => (
              <button key={f} type="button" className="fb-folder" onClick={() => setAt(f)}>
                <FolderIcon size={18} /> <span>{leafOf(f)}</span> <small>{count(f) || ''}</small>
              </button>
            ))}
          </div>
        )}
        {items.length === 0 ? (
          <div className="fb-empty">
            <b>{s ? `Nothing in My Files matches “${q.trim()}”.` : mine.length ? (pics ? 'No pictures in this folder.' : 'No recordings or videos in this folder.') : pics ? 'No pictures in My Files yet.' : 'No recordings or videos in My Files yet.'}</b>
            <span>{s ? 'Try another word, or a folder above.' : 'Upload one and it’s kept here, ready to use again.'}</span>
            {onUpload && !s && <button type="button" className="fb-up primary" onClick={onUpload}><UiIcon name="upload" size={15} /> Upload</button>}
          </div>
        ) : (
          <div className={'fb-items' + (pics ? ' pics' : ' list')}>
            {items.map((it) => {
              const on = picked.includes(it.id);
              return (
                <button key={it.id} type="button" className={'fb-item' + (on ? ' on' : '')} aria-pressed={multiple ? on : undefined} onClick={() => choose(it)} onDoubleClick={() => !multiple || onPick([it])} title={it.name}>
                  {pics ? (
                    <span className="fb-thumb">{it.thumb || it.link ? <img src={it.thumb || it.link} alt="" loading="lazy" /> : <UiIcon name="picture" size={22} />}{multiple && <i className="fb-tick" aria-hidden="true">{on ? <UiIcon name="check" size={14} /> : null}</i>}</span>
                  ) : (
                    <span className="fb-kind"><UiIcon name={it.kind === 'video' ? 'video' : 'music'} size={18} /></span>
                  )}
                  <span className="fb-name">{it.name}</span>
                  <span className="fb-meta">
                    {[s && it.folder ? it.folder.split('/').join(' › ') : '', mins(it.duration), it.size ? formatBytes(it.size) : it.link ? 'Link' : ''].filter(Boolean).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {multiple && items.length > 0 && (
        <div className="fb-foot">
          <span className="hint">{picked.length ? `${picked.length} chosen` : pics ? 'Click pictures to choose them. Double-click adds one straight away.' : 'Click to choose.'}</span>
          {picked.length > 0 && <button type="button" className="fb-up" onClick={() => setPicked([])}>Clear</button>}
          <button type="button" className="fb-add" disabled={!picked.length || busy} onClick={() => onPick(mine.filter((i) => picked.includes(i.id)))}>
            {addLabel ? addLabel(picked.length) : `Add ${picked.length > 1 ? picked.length : ''}`.trim()}
          </button>
        </div>
      )}
    </div>
  );
}

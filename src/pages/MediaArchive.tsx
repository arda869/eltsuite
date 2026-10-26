import { usePhone } from '../lib/useMedia';
import { useMemo, useRef, useState } from 'react';
import { ArchiveDocs, ArchiveShared, ArchiveTasks } from './ArchiveLibrary';
import { ShareDialog } from '../components/ShareDialog';
import { useDismiss } from '../lib/useDismiss';
import { Link, Navigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { useAuth } from '../lib/auth';
import { addFolder, archiveRemove, archiveUpdate, downloadItem, findUses, formatBytes, loadManifest, removeFolder, replaceSound, soundUrl, useArchive, useFolders, type ArchiveItem } from '../lib/archive';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { decodeSound } from '../lib/sound';
import { createPortal } from 'react-dom';
import { useImageSrc } from '../editor/PackNode';
import { MediaPlayer } from '../media/Player';
import { ScriptEditor } from '../media/ScriptEditor';
import { fmtTime } from '../lib/sound';
import { MediaDialog, type MediaTab } from '../media/MediaDialog';
import { PIC_QUALITY, uploadPicture, type PicQuality } from '../editor/PackNode';

// The media archive: every picture, sound and video the teacher has added, to use again in any
// lesson. Folders and tags to keep it in order, the space it takes, and karaoke scripts that are
// edited once here and change in every lesson that uses them.

const FREE = 1024 * 1024 * 1024;
const KINDS = [
  { k: 'image', label: 'Pictures', icon: 'picture' },
  { k: 'audio', label: 'Sounds', icon: 'music' },
  { k: 'video', label: 'Videos', icon: 'video' },
] as const;
type Sort = 'new' | 'name' | 'size';

// The space an item takes: its size in each class that has a copy.
const spaceOf = (i: ArchiveItem) => (i.size || 0) * (1 + Object.keys(i.copies ?? {}).filter((c) => c !== i.home?.classId).length) + (i.thumb?.length ?? 0);

type Section = 'media' | 'tasks' | 'docs' | 'shared' | 'colleagues';

export function MediaArchive() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [section, setSection] = useState<Section>(() => (new URLSearchParams(window.location.search).get('show') as Section) || 'media');
  const pick = (k: Section) => {
    setSection(k);
    window.history.replaceState(null, '', k === 'media' ? '/archive' : `/archive?show=${k}`);
  };
  const items = useArchive(uid);
  const folders = useFolders(uid);
  const [folder, setFolder] = useState<string | null>(null); // null: all, '': not in a folder
  const [kind, setKind] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addRef = useDismiss<HTMLSpanElement>(adding, () => setAdding(false));
  const [dialog, setDialog] = useState<{ tab: MediaTab; file?: File } | null>(null);
  const [upBusy, setUpBusy] = useState('');
  const [quality, setQuality] = useState<PicQuality>(() => {
    try {
      const q = localStorage.getItem('ll.picQuality');
      return q === 'high' || q === 'small' ? q : 'standard';
    } catch {
      return 'standard';
    }
  });
  const [over, setOver] = useState(false);
  const picInput = useRef<HTMLInputElement>(null);
  const space = uid ? 'user:' + uid : '';
  const into = folder ?? '';
  // Pictures go straight in; a sound opens the editor first.
  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const pics = files.filter((f) => f.type.startsWith('image/'));
    const sound = files.find((f) => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    if (pics.length && space) {
      setUpBusy(pics.length > 1 ? `Adding ${pics.length} pictures…` : 'Adding the picture…');
      try {
        for (const f of pics) await uploadPicture(space, f, quality, undefined, into);
        setUpBusy('');
      } catch {
        setUpBusy('A picture could not be added. Try a smaller one.');
      }
    }
    if (sound) setDialog({ tab: 'upload', file: sound });
  };

  const all = items ?? [];
  const allFolders = useMemo(() => [...new Set([...folders, ...all.map((i) => i.folder).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [folders, all]);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = all
      .filter((i) => folder === null || i.folder === folder)
      .filter((i) => !kind || i.kind === kind)
      .filter((i) => !tag || i.tags.includes(tag))
      .filter((i) => !s || `${i.name} ${i.tags.join(' ')} ${(i.script ?? []).map((l) => l.text).join(' ')}`.toLowerCase().includes(s));
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : sort === 'size' ? [...list].sort((a, b) => spaceOf(b) - spaceOf(a)) : list;
  }, [all, folder, kind, tag, q, sort]);
  const total = all.reduce((s, i) => s + spaceOf(i), 0);
  const byKind = KINDS.map((k) => ({ ...k, n: all.filter((i) => i.kind === k.k).length, bytes: all.filter((i) => i.kind === k.k).reduce((s, i) => s + spaceOf(i), 0) }));
  const open = all.find((i) => i.id === openId) ?? null;

  return (
    <div className="shell">
      <TopBar>
        <MainNav on="archive" />
      </TopBar>
      <div
        className={'ma' + (over ? ' dropping' : '')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {over && <div className="ma-drop">Drop pictures or sounds to add them{folder ? ` to ${folder}` : ''}</div>}
        <aside className="ma-side">
          <nav className="ma-nav ma-lib" aria-label="Archive">
            <button type="button" className={section === 'media' ? 'on' : ''} onClick={() => pick('media')}>
              <UiIcon name="picture" size={16} />
              Media <b>{all.length}</b>
            </button>
            <button type="button" className={section === 'tasks' ? 'on' : ''} onClick={() => pick('tasks')}>
              <UiIcon name="task" size={16} />
              Tasks
            </button>
            <button type="button" className={section === 'docs' ? 'on' : ''} onClick={() => pick('docs')}>
              <UiIcon name="discuss" size={16} />
              Shared documents
            </button>
            <span className="ma-h">With colleagues</span>
            <button type="button" className={section === 'shared' ? 'on' : ''} onClick={() => pick('shared')}>
              <UiIcon name="link" size={16} />
              Shared
            </button>
            <Link to="/colleagues" className="ma-nav-link">
              <UiIcon name="groups" size={16} />
              Colleagues
            </Link>
          </nav>
          {section === 'media' && (<>
          <div className="ma-space">
            <span className="ma-space-n">{formatBytes(total)}</span>
            <span className="hint">used by your media</span>
            <span className="ma-bar" aria-hidden="true">
              {byKind.map((k) => (
                <span key={k.k} className={'k-' + k.k} style={{ width: `${Math.max(k.bytes ? 0.6 : 0, (k.bytes / FREE) * 100)}%` }} />
              ))}
            </span>
            <span className="ma-legend">
              {byKind.map((k) => (
                <span key={k.k}>
                  <i className={'k-' + k.k} />
                  {k.label} {k.n ? formatBytes(k.bytes) : '0'}
                </span>
              ))}
            </span>
            <span className="hint small">The free plan has 1 GB for the whole app. Links to YouTube take no space.</span>
          </div>

          <nav className="ma-nav" aria-label="Folders">
            <span className="ma-h">Folders</span>
            <button type="button" className={folder === null ? 'on' : ''} onClick={() => setFolder(null)}>
              <UiIcon name="archive" size={16} />
              All media <b>{all.length}</b>
            </button>
            <button type="button" className={folder === '' ? 'on' : ''} onClick={() => setFolder('')}>
              <UiIcon name="folder" size={16} />
              Not in a folder <b>{all.filter((i) => !i.folder).length}</b>
            </button>
            {allFolders.map((f) => (
              <span key={f} className="ma-folder">
                <button type="button" className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>
                  <UiIcon name="folder" size={16} />
                  {f} <b>{all.filter((i) => i.folder === f).length}</b>
                </button>
                <button
                  type="button"
                  className="ma-x"
                  aria-label={`Delete the folder ${f}`}
                  data-tip="Delete the folder (its media stays)"
                  onClick={() => {
                    if (!uid) return;
                    removeFolder(uid, f, all).catch(() => {});
                    if (folder === f) setFolder(null);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {newFolder === null ? (
              <button type="button" className="ma-new" onClick={() => setNewFolder('')}>
                + New folder
              </button>
            ) : (
              <form
                className="ma-new-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = newFolder.trim();
                  if (n && uid) addFolder(uid, n).catch(() => {});
                  setNewFolder(null);
                  if (n) setFolder(n);
                }}
              >
                <input autoFocus value={newFolder} placeholder="Folder name" onChange={(e) => setNewFolder(e.target.value)} onBlur={(e) => !e.target.value.trim() && setNewFolder(null)} />
              </form>
            )}
          </nav>

          {tags.length > 0 && (
            <div className="ma-tags">
              <span className="ma-h">Tags</span>
              <span className="ma-tag-list">
                {tags.map(([t, n]) => (
                  <button key={t} type="button" className={'ap-chip' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? null : t)}>
                    {t} <span className="hint">{n}</span>
                  </button>
                ))}
              </span>
            </div>
          )}
          </>)}
        </aside>

        {section === 'tasks' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Tasks</h1>
                <span className="sub">Every task in all your classes. Open one, or copy it into another lesson.</span>
              </div>
            </div>
            <ArchiveTasks uid={uid} />
          </main>
        )}
        {section === 'docs' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Shared documents</h1>
                <span className="sub">The documents and slides your classes write together, and where each is used.</span>
              </div>
            </div>
            <ArchiveDocs uid={uid} />
          </main>
        )}
        {section === 'shared' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Shared</h1>
                <span className="sub">Lessons, tasks, documents and media colleagues share with you, as read-only copies, and what you share.</span>
              </div>
            </div>
            <ArchiveShared uid={uid} />
          </main>
        )}
        {section === 'colleagues' && <Navigate to="/colleagues" replace />}
        {section === 'media' && (
        <main className="ma-main">
          <div className="ma-head">
            <div className="ma-head-text">
              <h1 className="page-title">{folder === null ? 'Media archive' : folder === '' ? 'Not in a folder' : folder}</h1>
              <span className="sub">Everything you upload, record or link is kept here, ready to use in any lesson.</span>
            </div>
            <span className="ma-add" ref={addRef}>
              <button type="button" className="btn primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
                + Add media
              </button>
              {adding && (
                <span className="ma-add-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => (setAdding(false), picInput.current?.click())}>
                    <UiIcon name="picture" size={16} /> Pictures
                  </button>
                  <span className="ma-add-q">
                    <span className="hint">Quality</span>
                    <span className="seg small-seg">
                      {PIC_QUALITY.map((q) => (
                        <button
                          key={q.k}
                          type="button"
                          className={quality === q.k ? 'on' : ''}
                          onClick={() => {
                            setQuality(q.k);
                            try {
                              localStorage.setItem('ll.picQuality', q.k);
                            } catch {
                              /* fine */
                            }
                          }}
                        >
                          {q.label}
                        </button>
                      ))}
                    </span>
                  </span>
                  <button type="button" role="menuitem" onClick={() => (setAdding(false), setDialog({ tab: 'record' }))}>
                    <UiIcon name="mic" size={16} /> Record a sound
                  </button>
                  <button type="button" role="menuitem" onClick={() => (setAdding(false), setDialog({ tab: 'upload' }))}>
                    <UiIcon name="upload" size={16} /> Upload a sound
                  </button>
                  <button type="button" role="menuitem" onClick={() => (setAdding(false), setDialog({ tab: 'link' }))}>
                    <UiIcon name="link" size={16} /> YouTube or a link
                  </button>
                </span>
              )}
              <input ref={picInput} type="file" accept="image/*" multiple hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ''))} />
            </span>
          </div>
          {upBusy && <span className="hint">{upBusy}</span>}
          <div className="ma-bar-row">
            <input className="ma-search" type="search" value={q} placeholder="Search names, tags and scripts" onChange={(e) => setQ(e.target.value)} />
            <span className="seg small-seg" role="radiogroup" aria-label="Kind">
              <button type="button" role="radio" aria-checked={!kind} className={!kind ? 'on' : ''} onClick={() => setKind(null)}>
                All
              </button>
              {KINDS.map((k) => (
                <button key={k.k} type="button" role="radio" aria-checked={kind === k.k} className={kind === k.k ? 'on' : ''} onClick={() => setKind(k.k)}>
                  {k.label}
                </button>
              ))}
            </span>
            <select className="ma-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="new">Newest first</option>
              <option value="name">By name</option>
              <option value="size">Largest first</option>
            </select>
          </div>
          {items === null ? (
            <Loader label="Opening your media archive" />
          ) : shown.length === 0 ? (
            <div className="ma-empty">
              <UiIcon name="archive" size={28} />
              <strong>{all.length ? 'Nothing here' : 'Your media archive is empty'}</strong>
              <span className="hint">{all.length ? 'Try another folder, tag or search.' : 'Pictures, recordings and videos you add to a task appear here, so you can use them again without uploading them twice.'}</span>
            </div>
          ) : (
            <div className="ma-grid">
              {shown.map((i) => (
                <Card key={i.id} item={i} on={openId === i.id} onOpen={() => setOpenId(i.id)} />
              ))}
            </div>
          )}
        </main>
        )}

        {section === 'media' && open && uid && <Detail key={open.id} uid={uid} item={open} folders={allFolders} onClose={() => setOpenId(null)} />}
        {dialog && space && <MediaDialog classId={space} tab={dialog.tab} file={dialog.file} folder={into} noArchive onClose={() => setDialog(null)} onPick={() => setDialog(null)} />}
      </div>
    </div>
  );
}

function Card({ item, on, onOpen }: { item: ArchiveItem; on: boolean; onOpen: () => void }) {
  const places = new Set([item.home?.classId, ...Object.keys(item.copies ?? {})].filter((c) => c && !c.startsWith('user:'))).size;
  return (
    <button type="button" className={'ma-card' + (on ? ' on' : '')} onClick={onOpen}>
      <span className={'ma-thumb k-' + item.kind}>
        {item.kind === 'image' && (item.thumb || item.link) ? (
          <img src={item.thumb || item.link} alt="" />
        ) : item.link && item.kind === 'video' && /youtu/.test(item.link) ? (
          <img src={`https://img.youtube.com/vi/${/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(item.link)?.[1] ?? ''}/mqdefault.jpg`} alt="" />
        ) : (
          <UiIcon name={item.kind === 'video' ? 'video' : 'music'} size={26} />
        )}
        {item.duration ? <span className="ma-dur">{fmtTime(item.duration)}</span> : null}
        {(item.script?.length ?? 0) > 0 && (
          <span className="ma-badge" data-tip="Has a karaoke script">
            <UiIcon name="script" size={12} />
          </span>
        )}
      </span>
      <span className="ma-name">{item.name}</span>
      <span className="ma-meta">
        {item.link ? 'Link' : formatBytes(spaceOf(item))}
        {places > 1 ? ` · ${places} classes` : ''}
        {item.folder ? ` · ${item.folder}` : ''}
      </span>
      {item.tags.length > 0 && (
        <span className="ma-card-tags">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      )}
    </button>
  );
}

function BigPicture({ item }: { item: ArchiveItem }) {
  const url = useImageSrc(item.home?.classId ?? '', item.home ? 'media:' + item.home.mediaId : item.link ?? '');
  return url ? <img className="ma-big" src={url} alt="" /> : <span className="pic-wait" />;
}

function Detail({ uid, item, folders, onClose }: { uid: string; item: ArchiveItem; folders: string[]; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [tagText, setTagText] = useState('');
  const [script, setScript] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<SoundSource | 'loading' | null>(null);
  const [dl, setDl] = useState('');
  const [sharing, setSharing] = useState(false);
  const phone = usePhone();
  const openEditor = async () => {
    if (!item.home) return;
    setEditing('loading');
    try {
      const m = await loadManifest(item.home.classId, item.home.mediaId);
      if (!m) throw new Error('missing');
      const url = await soundUrl(item.home.classId, item.home.mediaId, m);
      const buffer = await decodeSound(await (await fetch(url)).blob());
      const lines = item.script ?? m.script ?? [];
      setEditing({ buffer, name: item.name, script: lines.map((l) => l.text), marks: lines.map((l) => (l.t === null ? NaN : l.t)) });
    } catch {
      setEditing(null);
      setDl('The sound could not be opened.');
    }
  };
  const save = (patch: Parameters<typeof archiveUpdate>[2]) => archiveUpdate(uid, item, patch).catch(() => {});
  const addTag = () => {
    const t = tagText.trim().replace(/^#/, '');
    if (t && !item.tags.includes(t)) save({ tags: [...item.tags, t] });
    setTagText('');
  };
  const classes = new Set([item.home?.classId, ...Object.keys(item.copies ?? {})].filter((c) => c && !c.startsWith('user:'))).size;
  return (
    <aside className="ma-detail" aria-label={item.name}>
      <div className="ma-detail-head">
        <span className="pop-type">{item.kind === 'image' ? 'Picture' : item.kind === 'video' ? 'Video' : 'Sound'}</span>
        <button type="button" className="ma-x big" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="ma-preview">{item.kind === 'image' ? <BigPicture item={item} /> : item.home ? <MediaPlayer classId={item.home.classId} mediaId={item.home.mediaId} title={item.name} teacher /> : null}</div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== item.name && save({ name: name.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      <label className="field">
        <span>Folder</span>
        <select value={item.folder} onChange={(e) => save({ folder: e.target.value })}>
          <option value="">Not in a folder</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Tags</span>
        <span className="ma-tag-edit">
          {item.tags.map((t) => (
            <span key={t} className="sed-chip">
              {t}
              <button type="button" aria-label={`Remove the tag ${t}`} onClick={() => save({ tags: item.tags.filter((x) => x !== t) })}>
                ×
              </button>
            </span>
          ))}
          <input
            value={tagText}
            placeholder={item.tags.length ? 'Add a tag' : 'Add tags: unit 4, food, B1…'}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              } else if (e.key === 'Backspace' && !tagText && item.tags.length) save({ tags: item.tags.slice(0, -1) });
            }}
            onBlur={addTag}
          />
        </span>
      </div>
      <span className="ma-detail-acts">
        <button
          type="button"
          className="btn small-btn"
          onClick={async () => {
            setDl('Getting the file…');
            await downloadItem(item).catch(() => setDl('It could not be downloaded.'));
            setDl('');
          }}
        >
          <UiIcon name={item.link ? 'link' : 'import'} size={14} /> {item.link ? 'Open the link' : 'Download'}
        </button>
        {item.kind === 'audio' && !item.link && item.home && !phone && (
          <button type="button" className="btn small-btn" onClick={openEditor} disabled={editing === 'loading'}>
            <UiIcon name="edit" size={14} /> {editing === 'loading' ? 'Opening…' : 'Edit the sound'}
          </button>
        )}
        <button type="button" className="btn small-btn" onClick={() => setSharing(true)}>
          <UiIcon name="link" size={14} /> Share…
        </button>
      </span>
      {sharing && (
        <ShareDialog
          what={{ kind: 'media', title: item.name, src: { archiveId: item.id }, archive: Object.fromEntries(Object.entries({ kind: item.kind, name: item.name, tags: item.tags, size: item.size, link: item.link, home: item.home, thumb: item.thumb, script: item.script, duration: item.duration }).filter(([, v]) => v !== undefined)) }}
          onClose={() => setSharing(false)}
        />
      )}
      {dl && <span className="hint">{dl}</span>}
      {item.kind !== 'image' && item.home && (
        <div className="field">
          <span>Karaoke script</span>
          <span className="hint">{item.script?.length ? `${item.script.length} lines${item.script.some((l) => l.t !== null) ? ', timed' : ', not timed yet'}. Changes reach every lesson that uses it.` : 'No script yet.'}</span>
          <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setScript(true)}>
            <UiIcon name="script" size={14} /> {item.script?.length ? 'Edit the script and timing' : 'Add a script'}
          </button>
        </div>
      )}
      <dl className="ma-facts">
        <dt>Space</dt>
        <dd>{item.link ? 'None (a link)' : formatBytes(spaceOf(item))}</dd>
        {item.duration ? (
          <>
            <dt>Length</dt>
            <dd>{fmtTime(item.duration)}</dd>
          </>
        ) : null}
        <dt>Used in</dt>
        <dd>{classes ? `${classes} ${classes === 1 ? 'class' : 'classes'}` : 'No class yet'}</dd>
        <dt>Added</dt>
        <dd>{new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        {item.link && (
          <>
            <dt>Address</dt>
            <dd className="ma-link">
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                {item.link.replace(/^https?:\/\//, '')}
              </a>
            </dd>
          </>
        )}
      </dl>
      {confirm ? (
        <span className="ma-confirm">
          <span className="hint">Remove it from the archive? Lessons that use it keep it.</span>
          <button type="button" className="btn small-btn" onClick={() => setConfirm(false)}>
            Keep
          </button>
          <button type="button" className="btn small-btn danger" onClick={() => (archiveRemove(uid, item.id).catch(() => {}), onClose())}>
            Remove
          </button>
        </span>
      ) : (
        <button type="button" className="btn link ma-remove" onClick={() => setConfirm(true)}>
          <UiIcon name="trash" size={14} /> Remove from the archive
        </button>
      )}
      {editing && editing !== 'loading' &&
        createPortal(
          <div className="scrim">
            <div className="dialog md-dialog" role="dialog" aria-label="Edit the sound" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <div className="pic-dialog-head">
                <h2 style={{ margin: 0 }}>Edit “{item.name}”</h2>
                <button type="button" className="btn link" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
              <SoundEditor
                source={editing}
                classId={'user:' + uid}
                folder={item.folder}
                backLabel="Close"
                onBack={() => setEditing(null)}
                onSaved={() => setEditing(null)}
                replace={{ name: item.name, uses: () => findUses(item), run: (blob, meta, p) => replaceSound(uid, item, blob, meta, p) }}
              />
            </div>
          </div>,
          document.body,
        )}
      {script && item.home && <ScriptEditor classId={item.home.classId} mediaId={item.home.mediaId} title={item.name} onClose={() => setScript(false)} onSave={(lines) => archiveUpdate(uid, item, { script: lines })} />}
    </aside>
  );
}

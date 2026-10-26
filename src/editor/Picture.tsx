import { zoomOf } from '../lib/zoom';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorClass } from './context';
import { PIC_QUALITY, uploadPicture, useImageSrc, type PicQuality } from './PackNode';
import { usePopPos } from './usePopPos';
import { listLabel } from '../lib/listLabel';
import { cropStyles, filterCss, PicCover, PictureEditor, type CoverMode, type CoverProps } from './PicEdit';
import { useAuth } from '../lib/auth';
import { formatBytes, mediaIn, useArchive, useFolders, type ArchiveItem } from '../lib/archive';
import { newId } from '../lib/tasks';
import { UiIcon } from '../components/UiIcon';

// A picture in a task: uploaded from the computer (or pasted), or from a web address. Pictures sit in
// the line, so several in a row line up side by side. Each can carry a label
// (1, 2, 3 · a, b, c · i, ii, iii) in the top-left corner that counts on from the pictures before it.

export type PicSize = 's' | 'm' | 'l' | 'full';
export type PicMark = '' | '1' | 'a' | 'A' | 'i' | 'I';
export const PIC_SIZES: { k: PicSize; label: string }[] = [
  { k: 's', label: 'Small' },
  { k: 'm', label: 'Medium' },
  { k: 'l', label: 'Large' },
  { k: 'full', label: 'Full width' },
];
export const PIC_MARKS: { k: PicMark; label: string }[] = [
  { k: '', label: 'None' },
  { k: '1', label: '1, 2, 3' },
  { k: 'a', label: 'a, b, c' },
  { k: 'A', label: 'A, B, C' },
  { k: 'i', label: 'i, ii, iii' },
];

// The label of the picture at pos: it counts the pictures with the same kind of label before it.
export function pictureLabel(doc: { descendants: (f: (n: { type: { name: string }; attrs: Record<string, unknown> }, p: number) => boolean | void) => void }, pos: number, mark: string) {
  if (!mark) return '';
  let n = 0;
  doc.descendants((node, p) => {
    if (p > pos) return false;
    if (node.type.name === 'picture' && node.attrs.mark === mark) n++;
    return true;
  });
  return listLabel(Math.max(1, n), mark);
}

export const COVERS: { k: CoverMode; label: string }[] = [
  { k: '', label: 'None' },
  { k: 'tap', label: 'Until clicked' },
  { k: 'grid', label: 'Boxes' },
];
export const GRIDS = [
  { k: '2', label: '2 × 2' },
  { k: '3', label: '3 × 3' },
  { k: '4', label: '4 × 4' },
];

type FrameProps = { w?: number; children?: React.ReactNode; src: string; alt?: string; size?: string; label?: string; classId: string; crop?: string; ar?: number; filter?: string; cover?: CoverProps; coverHint?: string };
export function PicFrame({ src, alt, size, label, classId, crop, ar, filter, cover, coverHint, w, children }: FrameProps) {
  const url = useImageSrc(classId, src);
  const cs = cropStyles(crop, ar);
  const img = url ? <img src={url} alt={alt ?? ''} draggable={false} style={{ ...cs.img, filter: filterCss(filter) }} /> : <span className="pic-wait" />;
  return (
    <span className={'pic pic-' + (w ? 'w' : size || 'm') + (cover ? ' has-cover' : '')} style={w ? { width: w } : undefined}>
      {cs.box ? (
        <span className="pic-crop" style={cs.box}>
          {img}
        </span>
      ) : (
        img
      )}
      {cover && <PicCover {...cover} />}
      {coverHint && <span className="pic-cover-hint">{coverHint}</span>}
      {label && <span className="pic-label">{label}</span>}
      {children}
    </span>
  );
}

function PictureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { classId } = useEditorClass();
  const a = node.attrs as { w: number; src: string; alt: string; size: PicSize; mark: PicMark; crop: string; ar: number; filter: string; cover: CoverMode; grid: number; coverBy: string; pid: string };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Corner dots: drag to make the picture bigger or smaller.
  const [dragW, setDragW] = useState<number | null>(null);
  const resize = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const pic = (e.currentTarget as HTMLElement).parentElement;
    if (!pic) return;
    const z = zoomOf(pic);
    const w0 = pic.getBoundingClientRect().width / z;
    const max = (ref.current?.closest('.ProseMirror') as HTMLElement | null)?.clientWidth ?? 900;
    const x0 = e.clientX;
    const dir = corner.endsWith('e') ? 1 : -1;
    let w = w0;
    const mv = (ev: PointerEvent) => {
      w = Math.round(Math.max(60, Math.min(max, w0 + (dir * (ev.clientX - x0)) / z)));
      setDragW(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing-pic');
      if (Math.abs(w - w0) > 2) updateAttributes({ w: w >= max - 4 ? 0 : w, size: w >= max - 4 ? 'full' : a.size });
      setDragW(null);
    };
    document.body.classList.add('is-resizing-pic');
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const popStyle = usePopPos(ref, open, 320);
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  const label = typeof pos === 'number' ? pictureLabel(editor.state.doc as never, pos, a.mark) : '';
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !editing && ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, editing]);
  const hint = a.cover === 'grid' ? `Covered by ${a.grid || 3} × ${a.grid || 3} boxes` : a.cover === 'tap' ? 'Covered until clicked' : '';
  const seg = <K extends string>(list: { k: K; label: string }[], cur: K, set: (k: K) => void, aria: string) => (
    <span className="seg small-seg" role="radiogroup" aria-label={aria}>
      {list.map((o) => (
        <button key={o.k || 'none'} type="button" role="radio" aria-checked={cur === o.k} className={cur === o.k ? 'on' : ''} onClick={() => set(o.k)}>
          {o.label}
        </button>
      ))}
    </span>
  );
  return (
    <NodeViewWrapper as="span" className={'pic-node' + (selected ? ' is-selected' : '')} ref={ref} contentEditable={false}>
      <span onClick={() => setOpen(true)} title="Picture settings">
        <PicFrame src={a.src} alt={a.alt} size={a.size} w={dragW ?? a.w} label={label} classId={classId} crop={a.crop} ar={a.ar} filter={a.filter} coverHint={hint}>
          {editor.isEditable && (['nw', 'ne', 'sw', 'se'] as const).map((c) => <i key={c} className={'pic-corner c-' + c} onPointerDown={(e) => resize(e, c)} onClick={(e) => e.stopPropagation()} aria-hidden="true" />)}
        </PicFrame>
      </span>
      {editing && (
        <PictureEditor
          classId={classId}
          src={a.src}
          crop={a.crop}
          filter={a.filter}
          onClose={() => setEditing(false)}
          onSave={(v) => {
            updateAttributes(v);
            setEditing(false);
          }}
        />
      )}
      {open && (
        <span className="gap-pop pic-pop" style={popStyle}>
          <span className="pop-type">Picture</span>
          <span className="pic-row">
            <span className="hint">Size</span>
            {seg(PIC_SIZES, a.w ? ('' as PicSize) : a.size || 'm', (k) => updateAttributes({ size: k, w: 0 }), 'Size')}
          </span>
          <span className="pic-row">
            <span className="hint">Label</span>
            {seg(PIC_MARKS, a.mark || '', (k) => updateAttributes({ mark: k }), 'Label')}
          </span>
          <span className="pic-row">
            <span className="hint">Cover</span>
            {seg(COVERS, a.cover || '', (k) => updateAttributes({ cover: k, pid: a.pid || newId() }), 'Cover')}
          </span>
          {a.cover === 'grid' && (
            <span className="pic-row">
              <span className="hint">Boxes</span>
              {seg(GRIDS, String(a.grid || 3), (k) => updateAttributes({ grid: Number(k) }), 'Boxes')}
            </span>
          )}
          {a.cover && (
            <span className="pic-row">
              <span className="hint">Who opens it</span>
              {seg(
                [
                  { k: 'teacher', label: 'You, on the teaching screen' },
                  { k: 'learner', label: 'Each learner' },
                ],
                a.coverBy || 'teacher',
                (k) => updateAttributes({ coverBy: k }),
                'Who opens it',
              )}
            </span>
          )}
          <label className="pic-row">
            <span className="hint">Description</span>
            <input value={a.alt ?? ''} placeholder="What the picture shows (for screen readers)" onChange={(e) => updateAttributes({ alt: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <span className="pic-row pic-actions">
            <button type="button" className="btn small-btn" onClick={() => setEditing(true)}>
              Crop and colour
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn link small" onClick={deleteNode}>
              Remove
            </button>
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Picture = Node.create({
  name: 'picture',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    src: { default: '' },
    alt: { default: '' },
    size: { default: 'm' },
    mark: { default: '' },
    crop: { default: '' }, // "x y w h" fractions
    ar: { default: 0 }, // the cropped shape, width ÷ height
    filter: { default: '' },
    cover: { default: '' }, // '' | 'tap' | 'grid'
    grid: { default: 3 },
    coverBy: { default: 'teacher' },
    pid: { default: '' }, // keeps the class's opened boxes together while teaching
    w: { default: 0 }, // a width set by dragging a corner, in pixels
  }),
  // Pictures pasted or dropped from anywhere become pictures you can edit.
  parseHTML: () => [{ tag: 'span[data-picture]' }, { tag: 'img[src]', priority: 60, getAttrs: (el: HTMLElement | string) => (typeof el === 'string' ? {} : { src: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '' }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-picture': '' })],
  addNodeView: () => ReactNodeViewRenderer(PictureView),
});

// Insert pictures at the cursor. Labels follow the picture before it in the task, if it has one.
export function insertPictures(editor: Editor, srcs: string[], opts: { size?: PicSize; mark?: PicMark; alt?: string } = {}) {
  let mark: PicMark = opts.mark ?? '';
  if (opts.mark === undefined)
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'picture') mark = (n.attrs.mark as PicMark) ?? '';
    });
  editor
    .chain()
    .focus()
    .insertContent(srcs.map((src) => ({ type: 'picture', attrs: { src, alt: opts.alt ?? '', size: opts.size ?? 'm', mark } })))
    .run();
}

// "Image" from + Add or /: upload pictures, choose them from the media archive, or use a web address.
const segOf = <K extends string>(list: { k: K; label: string }[], cur: K, set: (k: K) => void, aria: string) => (
  <span className="seg small-seg" role="radiogroup" aria-label={aria}>
    {list.map((o) => (
      <button key={o.k || 'none'} type="button" role="radio" aria-checked={cur === o.k} className={cur === o.k ? 'on' : ''} onClick={() => set(o.k)}>
        {o.label}
      </button>
    ))}
  </span>
);
const savedQuality = (): PicQuality => {
  try {
    const q = localStorage.getItem('ll.picQuality');
    return q === 'high' || q === 'small' ? q : 'standard';
  } catch {
    return 'standard';
  }
};

export function PictureDialog({ editor, classId, onClose }: { editor: Editor; classId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'new' | 'archive'>('new');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [size, setSize] = useState<PicSize>('m');
  const [quality, setQualityState] = useState<PicQuality>(savedQuality);
  const setQuality = (q: PicQuality) => {
    setQualityState(q);
    try {
      localStorage.setItem('ll.picQuality', q);
    } catch {
      /* fine */
    }
  };
  const [mark, setMark] = useState<PicMark>(() => {
    let m: PicMark = '';
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'picture') m = (n.attrs.mark as PicMark) ?? '';
    });
    return m;
  });
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    if (!classId) return setBusy('Pictures can be uploaded inside a class.');
    setBusy(list.length > 1 ? `Uploading ${list.length} pictures…` : 'Uploading…');
    try {
      const srcs: string[] = [];
      for (const f of list) srcs.push(await uploadPicture(classId, f, quality));
      insertPictures(editor, srcs, { size, mark, alt });
      onClose();
    } catch {
      setBusy('The picture could not be uploaded. Try a smaller one, or a smaller quality.');
    }
  };
  const fromArchive = async (items: ArchiveItem[]) => {
    if (!user || !items.length) return;
    setBusy(items.length > 1 ? `Adding ${items.length} pictures…` : 'Adding…');
    try {
      const srcs: string[] = [];
      for (const it of items) srcs.push(it.link ? it.link : 'media:' + (await mediaIn(user.uid, it, classId)));
      insertPictures(editor, srcs, { size, mark, alt });
      onClose();
    } catch {
      setBusy('That picture could not be added.');
    }
  };
  const look = (
    <>
      <div className="field" style={{ gap: 6 }}>
        <span>Size</span>
        {segOf(PIC_SIZES, size, setSize, 'Size')}
      </div>
      <div className="field" style={{ gap: 6 }}>
        <span>Label in the corner</span>
        {segOf(PIC_MARKS, mark, setMark, 'Label')}
        <span className="hint">Pictures with a label count on: a, b, c… Click a picture later to crop it, change its colour or cover it.</span>
      </div>
    </>
  );
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog pic-dialog" role="dialog" aria-label="Add pictures" onClick={(e) => e.stopPropagation()}>
        <div className="pic-dialog-head">
          <h2 style={{ margin: 0 }}>Add pictures</h2>
          <span className="seg" role="tablist" aria-label="Where from">
            <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>
              Upload
            </button>
            <button type="button" role="tab" aria-selected={tab === 'archive'} className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>
              Media archive
            </button>
          </span>
        </div>
        {tab === 'new' ? (
          <>
            <div
              className={'pic-drop' + (over ? ' over' : '')}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                upload(e.dataTransfer.files);
              }}
              onClick={() => file.current?.click()}
              role="button"
              tabIndex={0}
            >
              <strong>Choose pictures from your computer</strong>
              <span className="hint">or drop them here. You can choose several at once; they sit side by side. Each one is kept in your media archive.</span>
              <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
            </div>
            <div className="field" style={{ gap: 6 }}>
              <span>Quality</span>
              {segOf(
                PIC_QUALITY.map((q) => ({ k: q.k, label: q.label })),
                quality,
                setQuality,
                'Quality',
              )}
              <span className="hint">{PIC_QUALITY.find((q) => q.k === quality)?.about}. Smaller pictures leave more space for the rest of your media.</span>
            </div>
            <div className="pic-url">
              <input value={url} placeholder="Or paste a picture address: https://…" onChange={(e) => setUrl(e.target.value)} />
              <button
                type="button"
                className="btn"
                disabled={!/^https:\/\/\S+$/.test(url.trim())}
                onClick={() => {
                  insertPictures(editor, [url.trim()], { size, mark, alt });
                  onClose();
                }}
              >
                Add
              </button>
            </div>
            {look}
            <label className="field">
              <span>Description (optional)</span>
              <input value={alt} placeholder="What the picture shows, for learners who use a screen reader" onChange={(e) => setAlt(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <ArchivePicker uid={user?.uid} kind="image" multiple onPick={fromArchive} busy={!!busy} />
            {look}
          </>
        )}
        {busy && <span className="hint">{busy}</span>}
        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}

// Choose from the media archive: search, folders and tags, one or several at once.
export function ArchivePicker({ uid, kind, multiple, onPick, busy }: { uid?: string; kind: ArchiveItem['kind'] | 'sound'; multiple?: boolean; onPick: (items: ArchiveItem[]) => void; busy?: boolean }) {
  const all = useArchive(uid);
  const folders = useFolders(uid);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const items = useMemo(
    () =>
      (all ?? [])
        .filter((i) => (kind === 'sound' ? i.kind === 'audio' || i.kind === 'video' : i.kind === kind))
        .filter((i) => folder === null || i.folder === folder)
        .filter((i) => !q.trim() || (i.name + ' ' + i.tags.join(' ')).toLowerCase().includes(q.trim().toLowerCase())),
    [all, kind, folder, q],
  );
  const used = [...new Set([...(all ?? []).map((i) => i.folder).filter(Boolean), ...folders])].sort();
  if (!uid) return <p className="hint">Sign in to use your media archive.</p>;
  if (all === null) return <p className="hint">Opening your media archive…</p>;
  const toggle = (it: ArchiveItem) => (multiple ? setPicked((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : [...p, it.id])) : onPick([it]));
  return (
    <div className="ap">
      <div className="ap-bar">
        <input type="search" value={q} placeholder="Search by name or tag" onChange={(e) => setQ(e.target.value)} />
      </div>
      {used.length > 0 && (
        <div className="ap-folders">
          <button type="button" className={'ap-chip' + (folder === null ? ' on' : '')} onClick={() => setFolder(null)}>
            All
          </button>
          {used.map((f) => (
            <button key={f} type="button" className={'ap-chip' + (folder === f ? ' on' : '')} onClick={() => setFolder(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className="hint ap-empty">{(all ?? []).length ? 'Nothing matches.' : kind === 'image' ? 'Pictures you upload are kept here, ready to use again.' : 'Sounds and videos you add are kept here, ready to use again.'}</p>
      ) : (
        <div className={'ap-grid' + (kind === 'image' ? ' pics' : ' list')}>
          {items.map((it) => (
            <button key={it.id} type="button" className={'ap-item' + (picked.includes(it.id) ? ' on' : '')} onClick={() => toggle(it)} title={it.name}>
              {kind === 'image' ? (
                <span className="ap-thumb">{it.thumb ? <img src={it.thumb} alt="" /> : it.link ? <img src={it.link} alt="" /> : null}</span>
              ) : (
                <span className="ap-kind">
                  <UiIcon name={it.kind === 'video' ? 'video' : 'music'} size={16} />
                </span>
              )}
              <span className="ap-name">{it.name}</span>
              <span className="ap-meta">
                {it.size ? formatBytes(it.size) : it.link ? 'Link' : ''}
                {it.tags.length > 0 && ' · ' + it.tags.join(', ')}
              </span>
            </button>
          ))}
        </div>
      )}
      {multiple && (
        <span className="ap-foot">
          <span className="hint">{picked.length ? `${picked.length} chosen` : 'Click to choose'}</span>
          <button type="button" className="btn primary" disabled={!picked.length || busy} onClick={() => onPick((all ?? []).filter((i) => picked.includes(i.id)))}>
            Add {picked.length > 1 ? `${picked.length} pictures` : 'picture'}
          </button>
        </span>
      )}
    </div>
  );
}

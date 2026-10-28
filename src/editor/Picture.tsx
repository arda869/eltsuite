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
import { imageToData } from '../lib/flash';
import { audioUrl as mediaUrl } from '../lib/media';
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

// A word placed on (or just beside) a picture: a small label box, its centre at x, y (percent).
export type PicTag = { id: string; x: number; y: number; text: string };
type TagEdit = { onMove: (id: string, x: number, y: number) => void; onText: (id: string, text: string) => void; onDelete: (id: string) => void; focus?: string };

type FrameProps = { w?: number; children?: React.ReactNode; src: string; alt?: string; size?: string; label?: string; classId: string; crop?: string; ar?: number; filter?: string; cover?: CoverProps; coverHint?: string; tags?: PicTag[]; tagEdit?: TagEdit };
export function PicFrame({ src, alt, size, label, classId, crop, ar, filter, cover, coverHint, w, children, tags, tagEdit }: FrameProps) {
  const url = useImageSrc(classId, src);
  const cs = cropStyles(crop, ar);
  const img = url ? <img src={url} alt={alt ?? ''} draggable={false} style={{ ...cs.img, filter: filterCss(filter) }} /> : <span className="pic-wait" />;
  const inner = (
    <>
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
    </>
  );
  const tagged = !!(tags?.length || tagEdit);
  return (
    <span className={'pic pic-' + (w ? 'w' : size || 'm') + (cover ? ' has-cover' : '') + (tagged ? ' has-tags' : '')} style={w ? { width: w } : undefined}>
      {tagged ? <span className="pic-clip">{inner}</span> : inner}
      {(tags ?? []).map((t) => (tagEdit ? <EditTag key={t.id} t={t} edit={tagEdit} /> : <span key={t.id} className="pic-tag" style={{ left: `${t.x}%`, top: `${t.y}%` }}>{t.text}</span>))}
      {children}
    </span>
  );
}

// A label while editing: drag it to move it (it may sit a little outside the picture), type to change it.
function EditTag({ t, edit }: { t: PicTag; edit: TagEdit }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' && !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const pic = ref.current?.closest('.pic') as HTMLElement | null;
    if (!pic) return;
    const r = pic.getBoundingClientRect();
    let p = { x: t.x, y: t.y };
    const mv = (ev: PointerEvent) => {
      p = { x: Math.round(Math.max(-25, Math.min(125, ((ev.clientX - r.left) / r.width) * 100)) * 10) / 10, y: Math.round(Math.max(-25, Math.min(125, ((ev.clientY - r.top) / r.height) * 100)) * 10) / 10 };
      setAt(p);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setAt(null);
      if (p.x !== t.x || p.y !== t.y) edit.onMove(t.id, p.x, p.y);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const x = at?.x ?? t.x;
  const y = at?.y ?? t.y;
  return (
    <span ref={ref} className={'pic-tag editing' + (at ? ' moving' : '')} style={{ left: `${x}%`, top: `${y}%` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <span className="pic-tag-grip" onPointerDown={drag} title="Drag to move" aria-hidden="true" />
      <input
        value={t.text}
        size={Math.max(3, t.text.length + 1)}
        placeholder="Label"
        autoFocus={edit.focus === t.id}
        aria-label="Label on the picture"
        onChange={(e) => edit.onText(t.id, e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          if (e.key === 'Backspace' && !t.text) edit.onDelete(t.id);
        }}
        onBlur={() => !t.text.trim() && edit.onDelete(t.id)}
      />
      <button type="button" className="pic-tag-x" onClick={() => edit.onDelete(t.id)} aria-label="Remove this label">
        ×
      </button>
    </span>
  );
}

function PictureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { classId } = useEditorClass();
  const a = node.attrs as { w: number; src: string; alt: string; size: PicSize; mark: PicMark; crop: string; ar: number; filter: string; cover: CoverMode; grid: number; coverBy: string; pid: string; tags: PicTag[] };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Labels on the picture: "Add a label", then click where it goes.
  const [placing, setPlacing] = useState(false);
  const [newTag, setNewTag] = useState('');
  const tags: PicTag[] = Array.isArray(a.tags) ? a.tags : [];
  const setTags = (next: PicTag[]) => updateAttributes({ tags: next });
  const tagEdit: TagEdit | undefined = editor.isEditable
    ? {
        onMove: (id, x, y) => setTags(tags.map((t) => (t.id === id ? { ...t, x, y } : t))),
        onText: (id, text) => setTags(tags.map((t) => (t.id === id ? { ...t, text } : t))),
        onDelete: (id) => setTags(tags.filter((t) => t.id !== id)),
        focus: newTag,
      }
    : undefined;
  const place = (e: React.MouseEvent) => {
    const pic = (e.currentTarget as HTMLElement).querySelector('.pic') as HTMLElement | null;
    if (!placing || !pic) return false;
    const r = pic.getBoundingClientRect();
    const id = newId();
    setTags([...tags, { id, x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10, text: '' }]);
    setNewTag(id);
    setPlacing(false);
    return true;
  };
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
      <span className={placing ? 'pic-placing' : ''} onClick={(e) => place(e) || setOpen(true)} title={placing ? 'Click where the label goes' : 'Picture settings'}>
        <PicFrame src={a.src} alt={a.alt} size={a.size} w={dragW ?? a.w} label={label} classId={classId} crop={a.crop} ar={a.ar} filter={a.filter} coverHint={hint} tags={tags} tagEdit={tagEdit}>
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
            <span className="hint">Words on it</span>
            <button type="button" className="btn small-btn" onClick={() => (setPlacing(true), setOpen(false))}>
              + Add a label
            </button>
            {tags.length > 0 && <span className="hint">{tags.length} on the picture · drag one by its dot to move it</span>}
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
            <input aria-label="What the picture shows (for screen readers)" value={a.alt ?? ''} placeholder="What the picture shows (for screen readers)" onChange={(e) => updateAttributes({ alt: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
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
    tags: { default: [] }, // words placed on the picture: { id, x, y, text }
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

// "Image" from + Add or /: upload pictures, choose them from the resources library, or use a web address.
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
    setBusy(list.length > 1 ? `Uploading ${list.length} pictures…` : 'Uploading…');
    try {
      const srcs: string[] = [];
      // In a class the picture is stored with the class. Elsewhere (a document, notes) it sits in the
      // page itself; either way a copy is kept in My files.
      for (const f of list) {
        if (classId) srcs.push(await uploadPicture(classId, f, quality));
        else {
          srcs.push(await imageToData(f, 1100));
          if (user) void uploadPicture('user:' + user.uid, f, quality).catch(() => {});
        }
      }
      insertPictures(editor, srcs, { size, mark, alt });
      onClose();
    } catch {
      setBusy('We couldn’t upload the picture. Try a smaller one, or a lower quality.');
    }
  };
  const fromArchive = async (items: ArchiveItem[]) => {
    if (!user || !items.length) return;
    setBusy(items.length > 1 ? `Adding ${items.length} pictures…` : 'Adding…');
    try {
      const srcs: string[] = [];
      for (const it of items) {
        if (it.link) srcs.push(it.link);
        else if (classId) srcs.push('media:' + (await mediaIn(user.uid, it, classId)));
        else if (it.home) srcs.push(await imageToData(await (await fetch(await mediaUrl(it.home.classId, it.home.mediaId))).blob(), 1100));
      }
      insertPictures(editor, srcs, { size, mark, alt });
      onClose();
    } catch {
      setBusy('We couldn’t add that picture.');
    }
  };
  // A picture copied anywhere (a screenshot, a map, a page) can be pasted while this is open.
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void uploadRef.current(files);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, []);
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
      <div
        className="dialog pic-dialog"
        role="dialog"
        aria-label="Add pictures"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pic-dialog-head">
          <h2 style={{ margin: 0 }}>Add pictures</h2>
          <span className="seg" role="tablist" aria-label="Where from">
            <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>
              Upload
            </button>
            <button type="button" role="tab" aria-selected={tab === 'archive'} className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>
              My files
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
              <span className="hint">or drop them here, or paste one you copied. You can choose several at once; they sit side by side. Each one is kept in My files.</span>
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
              <input value={url} aria-label="Picture address" type="url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Or paste a picture address: https://…" onChange={(e) => setUrl(e.target.value)} />
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
              <input aria-label="What the picture shows, for learners who use a screen reader" value={alt} placeholder="What the picture shows, for learners who use a screen reader" onChange={(e) => setAlt(e.target.value)} />
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

// Choose from the resources library: search, folders and tags, one or several at once.
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
  if (!uid) return <p className="hint">Sign in to use your files.</p>;
  if (all === null) return <p className="hint">Opening your files…</p>;
  const toggle = (it: ArchiveItem) => (multiple ? setPicked((p) => (p.includes(it.id) ? p.filter((x) => x !== it.id) : [...p, it.id])) : onPick([it]));
  return (
    <div className="ap">
      <div className="ap-bar">
        <input type="search" aria-label="Search by name or tag" enterKeyHint="search" value={q} placeholder="Search by name or tag" onChange={(e) => setQ(e.target.value)} />
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

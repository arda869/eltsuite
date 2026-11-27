import {insideCommunicativeActivity} from '../communicative/pictureContext';
import {savePrivateActivityPicture,copyPrivateActivityPicture} from '../communicative/privatePictures';
import { InlineAiImage } from '../design/InlineAiImage';
import { DesignerImages, CommonsImages } from '../design/InlineImages';
import { zoomOf } from '../lib/zoom';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useEditorClass } from './context';
import { PIC_QUALITY, preparePicture, uploadPicture, useImageSrc, type PicQuality } from './PackNode';
import { usePopPos } from './usePopPos';
import { listLabel } from '../lib/listLabel';
import { cropStyles, filterCss, PicCover, PictureEditor, type CoverMode, type CoverProps } from './PicEdit';
import { useAuth } from '../lib/auth';
import { mediaIn, type ArchiveItem } from '../lib/archive';
import { newId } from '../lib/tasks';
import { imageToData } from '../lib/flash';
import { audioUrl as mediaUrl } from '../lib/media';
import { UiIcon } from '../components/UiIcon';
import { AddWindow } from '../components/AddWindow';
import { FileBrowser } from '../components/FileBrowser';

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

function designerSourceUrl(id: string) {
  const match = window.location.pathname.match(/^\/class\/[A-Za-z0-9_-]+\/lesson\/[A-Za-z0-9_-]+$/);
  const task = document.querySelector<HTMLElement>('[data-coach-task-id]')?.dataset.coachTaskId || '';
  const returnTo = match && /^[A-Za-z0-9_-]{1,100}$/.test(task) ? match[0] + '?task=' + encodeURIComponent(task) : '';
  return '/doc/' + id + (returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '');
}

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

type FrameProps = { w?: number; children?: React.ReactNode; src: string; alt?: string; size?: string; label?: string; classId: string; crop?: string; ar?: number; filter?: string; cover?: CoverProps; coverHint?: string; tags?: PicTag[]; tagEdit?: TagEdit; enlarge?: boolean };
export function PicFrame({ src, alt, size, label, classId, crop, ar, filter, cover, coverHint, w, children, tags, tagEdit, enlarge }: FrameProps) {
  const url = useImageSrc(classId, src);
  const [viewerOpen, setViewerOpen] = useState(false);
  const opener = useRef<HTMLSpanElement>(null);
  // Covered pictures must keep their hidden content hidden in teaching and learner views.
  const canEnlarge = !!enlarge && !!url && !cover && !tagEdit;
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
    <span ref={opener} className={'pic pic-' + (w ? 'w' : size || 'm') + (cover ? ' has-cover' : '') + (tagged ? ' has-tags' : '') + (canEnlarge ? ' can-enlarge' : '')} style={w ? { width: w } : undefined} role={canEnlarge ? 'button' : undefined} tabIndex={canEnlarge ? 0 : undefined} aria-label={canEnlarge ? `View ${alt || 'picture'} larger` : undefined} title={canEnlarge ? 'View picture larger' : undefined} onClick={canEnlarge ? (e) => { if ((e.target as HTMLElement).closest('a, button, input')) return; setViewerOpen(true); } : undefined} onKeyDown={canEnlarge ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setViewerOpen(true); } } : undefined}>
      {tagged ? <span className="pic-clip">{inner}</span> : inner}
      {(tags ?? []).map((t) => (tagEdit ? <EditTag key={t.id} t={t} edit={tagEdit} /> : <span key={t.id} className="pic-tag" style={{ left: `${t.x}%`, top: `${t.y}%` }}>{t.text}</span>))}
      {canEnlarge && <span className="pic-enlarge-cue" aria-hidden="true"><UiIcon name="zoomIn" size={17} /><span>View larger</span></span>}
      {children}
      {canEnlarge && viewerOpen && createPortal(<PictureViewer url={url} alt={alt || 'Picture'} crop={crop} ar={ar} filter={filter} tags={tags} label={label} onClose={() => { setViewerOpen(false); requestAnimationFrame(() => opener.current?.focus()); }} />, document.body)}
    </span>
  );
}

const PICTURE_ZOOMS = [1, 1.5, 2, 2.5, 3, 4];

function PictureViewer({ url, alt, crop, ar, filter, tags, label, onClose }: { url: string; alt: string; crop?: string; ar?: number; filter?: string; tags?: PicTag[]; label?: string; onClose: () => void }) {
  const [zoomIndex, setZoomIndex] = useState(() => window.innerWidth <= 640 ? 4 : 0);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const cs = cropStyles(crop, ar);
  const image = <img src={url} alt={alt} draggable={false} style={{ ...cs.img, filter: filterCss(filter) }} />;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);

  const zoomTo = (next: number) => {
    const area = stage.current;
    const x = area?.scrollWidth ? (area.scrollLeft + area.clientWidth / 2) / area.scrollWidth : .5;
    const y = area?.scrollHeight ? (area.scrollTop + area.clientHeight / 2) / area.scrollHeight : .5;
    setZoomIndex(next);
    requestAnimationFrame(() => {
      if (!area) return;
      area.scrollLeft = x * area.scrollWidth - area.clientWidth / 2;
      area.scrollTop = y * area.scrollHeight - area.clientHeight / 2;
    });
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || PICTURE_ZOOMS[zoomIndex] === 1) return;
    const area = stage.current;
    if (!area) return;
    drag.current = { x: e.clientX, y: e.clientY, left: area.scrollLeft, top: area.scrollTop };
    setDragging(true);
    area.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current, area = stage.current;
    if (!start || !area) return;
    area.scrollLeft = start.left + start.x - e.clientX;
    area.scrollTop = start.top + start.y - e.clientY;
  };
  const endDrag = () => { drag.current = null; setDragging(false); };
  return <div className="picture-viewer-backdrop" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialog} className="picture-viewer" role="dialog" aria-modal="true" aria-label={`Enlarged picture: ${alt}`} onClick={(e) => e.stopPropagation()}>
      <div className="picture-viewer-head"><strong title={alt}>{alt}</strong><button ref={close} type="button" className="icon-tool" aria-label="Close enlarged picture" onClick={onClose}><UiIcon name="videoClose" /></button></div>
      <div className="picture-viewer-tools" aria-label="Picture size">
        <button type="button" className="btn" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => zoomTo(zoomIndex - 1)}><UiIcon name="zoomOut" /></button>
        <span className="picture-viewer-percent" aria-live="polite">{Math.round(PICTURE_ZOOMS[zoomIndex] * 100)}%</span>
        <button type="button" className="btn" aria-label="Zoom in" disabled={zoomIndex === PICTURE_ZOOMS.length - 1} onClick={() => zoomTo(zoomIndex + 1)}><UiIcon name="zoomIn" /></button>
        <button type="button" className="btn picture-viewer-fit" onClick={() => zoomTo(0)}>Fit picture</button>
        <span className="picture-viewer-hint">Drag or scroll to see more</span>
      </div>
      <div ref={stage} className="picture-viewer-stage" data-dragging={dragging || undefined} data-zoomed={zoomIndex > 0 || undefined} tabIndex={0} aria-label="Enlarged picture; scroll to see more" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="picture-viewer-art" style={{ width: `${PICTURE_ZOOMS[zoomIndex] * 100}%` }}>
          {cs.box ? <span className="pic-crop" style={cs.box}>{image}</span> : image}
          {label && <span className="pic-label">{label}</span>}
          {(tags ?? []).map((t) => <span key={t.id} className="pic-tag" style={{ left: `${t.x}%`, top: `${t.y}%` }}>{t.text}</span>)}
        </div>
      </div>
    </section>
  </div>;
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
  const a = node.attrs as { w: number; src: string; alt: string; credit?:string; designerId?:string; size: PicSize; mark: PicMark; crop: string; ar: number; filter: string; cover: CoverMode; grid: number; coverBy: string; pid: string; tags: PicTag[]; bw?: string };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Side by side: a picture on a line of its own can join the picture before it, and a picture
  // sharing a line can go back to a line of its own.
  const where = () => {
    const pos = typeof getPos === 'function' ? getPos() : -1;
    if (pos == null || pos < 0) return null;
    const $p = editor.state.doc.resolve(pos);
    const d = $p.depth;
    const para = $p.parent;
    if (para.type.name !== 'paragraph' || d < 1) return null;
    // The picture before: in the nearest line above with something in it, past empty lines.
    const holder = $p.node(d - 1);
    const i = $p.index(d - 1);
    let k = i - 1;
    let at = $p.before(d);
    while (k >= 0 && holder.child(k).type.name === 'paragraph' && holder.child(k).childCount === 0) at -= holder.child(k).nodeSize, k--;
    const prev = k >= 0 ? holder.child(k) : null;
    return { pos, para, start: $p.before(d), end: $p.after(d), joinAt: at - 1, canJoin: para.childCount === 1 && prev?.type.name === 'paragraph' && prev.lastChild?.type.name === 'picture', canSplit: para.childCount > 1 };
  };
  const pl = open ? where() : null;
  const joinPrev = () => {
    const p = where();
    if (!p?.canJoin) return;
    const tr = editor.state.tr.delete(p.start, p.end).insert(p.joinAt, node);
    editor.view.dispatch(tr);
    setOpen(false);
  };
  const ownLine = () => {
    const p = where();
    if (!p?.canSplit) return;
    const para = editor.schema.nodes.paragraph.create(null, node);
    const tr = editor.state.tr.insert(p.end, para).delete(p.pos, p.pos + node.nodeSize);
    editor.view.dispatch(tr);
    setOpen(false);
  };
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
  const readLabel = () => { const at = getPos(); return typeof at === 'number' ? pictureLabel(editor.state.doc as never, at, a.mark) : ''; };
  const [label, setLabel] = useState(readLabel);
  useEffect(() => {
    const refresh = () => setLabel(readLabel());
    refresh();
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor, getPos, a.mark]);
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
    <NodeViewWrapper as="span" className={'pic-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span className={placing ? 'pic-placing' : ''} contentEditable={false} onClick={(e) => place(e) || setOpen(true)} title={placing ? 'Click where the label goes' : 'Picture settings'}>
        <PicFrame src={a.src} alt={a.alt} size={a.size} w={dragW ?? a.w} label={label} classId={classId} crop={a.crop} ar={a.ar} filter={a.filter} coverHint={hint} tags={tags} tagEdit={tagEdit}>
          {editor.isEditable && (['nw', 'ne', 'sw', 'se'] as const).map((c) => <i key={c} className={'pic-corner c-' + c} onPointerDown={(e) => resize(e, c)} onClick={(e) => e.stopPropagation()} aria-hidden="true" />)}
        </PicFrame>
      </span>
      <NodeViewContent as="span" contentEditable={editor.isEditable} role="textbox" aria-label="Picture description" className={'pic-caption' + (node.content.size ? ' has-text' : '')} data-placeholder={editor.isEditable ? 'Add description…' : undefined} />
      {a.credit&&<small className="pic-credit" contentEditable={false}>{a.credit}</small>}
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
        <span className="gap-pop pic-pop" style={popStyle} contentEditable={false}>
          <span className="pop-type">Picture</span>
          <span className="pic-row">
            <span className="hint">Size</span>
            {seg(PIC_SIZES, a.w ? ('' as PicSize) : a.size || 'm', (k) => updateAttributes({ size: k, w: 0 }), 'Size')}
          </span>
          {(pl?.canJoin || pl?.canSplit) && (
            <span className="pic-row">
              <span className="hint">Place</span>
              <span className="pic-place">
                {pl?.canJoin && (
                  <button type="button" className="btn small-btn" onClick={joinPrev}>
                    Next to the picture before
                  </button>
                )}
                {pl?.canSplit && (
                  <button type="button" className="btn small-btn" onClick={ownLine}>
                    On a line of its own
                  </button>
                )}
              </span>
            </span>
          )}
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
          <PrintVersionRow classId={classId} bw={String(a.bw ?? '')} activity={insideCommunicativeActivity(editor)} onChange={(bw) => updateAttributes({ bw })} />
          <span className="pic-row">
            <span className="hint">Description</span>
            <button type="button" className="btn small-btn" onClick={() => {
              const at = typeof getPos === 'function' ? getPos() : undefined;
              setOpen(false);
              if (typeof at === 'number') editor.chain().setTextSelection(at + 1 + node.content.size).focus().run();
            }}>Edit below the picture</button>
          </span>
          <label className="pic-row">
            <span className="hint">Screen reader description</span>
            <input aria-label="Screen reader description" value={a.alt ?? ''} placeholder="Describe the picture for screen readers" onChange={(e) => updateAttributes({ alt: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          {!!a.designerId && /^[A-Za-z0-9_-]{1,100}$/.test(a.designerId) && <span className="pic-row"><span className="hint">Original design</span><a className="btn small-btn" href={designerSourceUrl(a.designerId)} target="_blank" rel="noopener noreferrer">Edit source in Designer</a><small className="hint">Reinsert the picture to use later edits.</small></span>}
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

// A second picture for black-and-white printing: a line drawing or a high-contrast version that
// photocopies well. On screen and in colour prints the colour picture is used.
function PrintVersionRow({ classId, bw, activity, onChange }: { classId: string; bw: string; activity: boolean; onChange: (bw: string) => void }) {
  const url = useImageSrc(classId, bw);
  const [busy, setBusy] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const add = async (f?: File) => {
    if (!f) return;
    setBusy('Uploading…');
    try {
      const src = classId ? (activity ? await savePrivateActivityPicture(classId, await preparePicture(f, 'standard')) : await uploadPicture(classId, f, 'standard')) : await imageToData(f, 1100);
      onChange(src);
      setBusy('');
    } catch {
      setBusy('We couldn’t upload that picture. Try a smaller one. The colour picture is still here.');
    }
  };
  return (
    <span className="pic-row pic-bw-row">
      <span className="hint">Black-and-white print</span>
      {bw ? (
        <span className="pic-bw">
          {url ? <img src={url} alt="" /> : <span className="pic-bw-wait" />}
          <span className="pic-bw-text">Used when you print in black and white.</span>
          <button type="button" className="btn small-btn" onClick={() => file.current?.click()}>Change</button>
          <button type="button" className="btn link small" onClick={() => onChange('')}>Remove</button>
        </span>
      ) : (
        <span className="pic-bw">
          <button type="button" className="btn small-btn" onClick={() => file.current?.click()} disabled={!!busy && busy !== '' && busy.endsWith('…')}>Add a black-and-white version</button>
          <span className="pic-bw-text">Optional. Without one, black-and-white prints use this picture in grey.</span>
        </span>
      )}
      {busy && <span className={busy.endsWith('…') ? 'hint' : 'error small'} role="status">{busy}</span>}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (void add(e.target.files?.[0]), (e.target.value = ''))} />
    </span>
  );
}

export const Picture = Node.create({
  name: 'picture',
  group: 'inline',
  inline: true,
  content: 'inline*',
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    src: { default: '' },
    // Keep the checked source while the class uses its own copy of the bytes.
    // The reference is rechecked before a later SuiteScript copy/export.
    suiteRef: { default: '', renderHTML: () => ({}) },
    alt: { default: '' },
    credit: { default: '' },
    designerId: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-designer-id') || '', renderHTML: (attrs: Record<string, unknown>) => attrs.designerId ? { 'data-designer-id': attrs.designerId } : {} },
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
    bw: { default: '' }, // a black-and-white version, used when the worksheet prints in black and white
  }),
  // Pictures pasted or dropped from anywhere become pictures you can edit.
  parseHTML: () => [{ tag: 'span[data-picture]' }, { tag: 'img[src]', priority: 60, getAttrs: (el: HTMLElement | string) => (typeof el === 'string' ? {} : { src: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '' }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-picture': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(PictureView),
});

// Insert pictures at the cursor. Labels follow the picture before it in the task, if it has one.
export function insertPictures(editor: Editor, srcs: string[], opts: { size?: PicSize; mark?: PicMark; alt?: string; caption?: string; credit?: string; designerId?: string; designerIds?: string[] } = {}) {
  let mark: PicMark = opts.mark ?? '';
  if (opts.mark === undefined)
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'picture') mark = (n.attrs.mark as PicMark) ?? '';
    });
  editor
    .chain()
    .focus()
    .insertContent(srcs.map((src, i) => ({ type: 'picture', attrs: { src, alt: opts.alt ?? '', credit:opts.credit??'', size: opts.size ?? 'm', mark, designerId: opts.designerIds?.[i] ?? opts.designerId ?? '' }, ...(opts.caption?.trim() ? { content: [{ type: 'text', text: opts.caption.trim() }] } : {}) })))
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

export function PictureDialog({ editor, classId, onClose, initialDesignId = '', returnTo = '' }: { editor: Editor; classId: string; onClose: () => void; initialDesignId?: string; returnTo?: string }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'new' | 'archive' | 'designer' | 'commons' | 'ai'>(initialDesignId ? 'designer' : 'archive');
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
        if (classId) srcs.push(insideCommunicativeActivity(editor)?await savePrivateActivityPicture(classId,await preparePicture(f,quality)):await uploadPicture(classId,f,quality));
        else {
          srcs.push(await imageToData(f, 1100));
          if (user) void uploadPicture('user:' + user.uid, f, quality).catch(() => {});
        }
      }
      insertPictures(editor, srcs, { size, mark, alt, caption: alt });
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
      const designerIds: string[] = [];
      for (const it of items) {
        let src = '';
        if (it.link) src = it.link;
        else if (classId) src = insideCommunicativeActivity(editor)?await copyPrivateActivityPicture(classId,it):'media:'+(await mediaIn(user.uid,it,classId));
        else if (it.home) src = await imageToData(await (await fetch(await mediaUrl(it.home.classId, it.home.mediaId))).blob(), 1100);
        if (src) { srcs.push(src); designerIds.push(it.designerId || ''); }
      }
      insertPictures(editor, srcs, { size, mark, alt, caption: alt, designerIds });
      onClose();
    } catch {
      setBusy('We couldn’t add that picture.');
    }
  };
  const fromDesign = async (blob:Blob,title:string,credit='',designerId='') => {
    const src=classId?(insideCommunicativeActivity(editor)?await savePrivateActivityPicture(classId,await preparePicture(blob,quality)):await uploadPicture(classId,blob,quality,title,'',designerId)):await imageToData(blob,1100);
    insertPictures(editor,[src],{size,mark,alt:alt||title,caption:alt,credit,designerId});onClose();
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
      <div className="field">
        <span>Size</span>
        {segOf(PIC_SIZES, size, setSize, 'Size')}
      </div>
      <div className="field">
        <span>Label</span>
        {segOf(PIC_MARKS, mark, setMark, 'Label in the corner')}
      </div>
      <label className="field aw-desc">
        <span>Description</span>
        <input aria-label="Description shown below the picture" value={alt} placeholder="Optional, shown under the picture" onChange={(e) => setAlt(e.target.value)} />
      </label>
    </>
  );
  const SOURCES = [
    { k: 'archive' as const, label: 'My Files', icon: 'folder', about: 'Pictures you have used before, in your folders. Opens where you were last time.' },
    { k: 'new' as const, label: 'Upload', icon: 'upload', about: 'From your computer or phone. Each picture is kept in My Files too.' },
    { k: 'ai' as const, label: 'Create with AI', icon: 'ai', about: 'Describe the picture you need.' },
    { k: 'designer' as const, label: 'Designer', icon: 'design', about: 'Posters, flashcards and pictures you made in Designer.' },
    { k: 'commons' as const, label: 'Wikimedia Commons', icon: 'search', about: 'Free photos and drawings, with a credit line added for you.' },
  ];
  return (
    <AddWindow title="Add pictures" sources={SOURCES} source={tab} onSource={(k) => { setTab(k); setBusy(''); }} onClose={onClose} options={look} status={busy} onDropFiles={(f) => void upload(f)} wide={tab === 'archive'}>
      {tab === 'new' ? (
        <>
          <div
            className={'pic-drop' + (over ? ' over' : '')}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => file.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), file.current?.click())}
            role="button"
            tabIndex={0}
          >
            <UiIcon name="upload" size={26} />
            <strong>Choose pictures</strong>
            <span className="hint">or drop them here, or paste one you copied. Choose several and they sit side by side.</span>
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
        </>
      ) : tab === 'ai' ? <InlineAiImage onPick={fromDesign} />
        : tab === 'designer' ? <DesignerImages uid={user?.uid} initialSelectedId={initialDesignId} returnTo={returnTo} onPick={fromDesign} />
        : tab === 'commons' ? <CommonsImages onPick={fromDesign} />
        : <ArchivePicker uid={user?.uid} kind="image" multiple onPick={fromArchive} busy={!!busy} onUpload={() => setTab('new')} />}
    </AddWindow>
  );
}

// Choose from My Files: folders, search, one or several at once (see FileBrowser).
export function ArchivePicker({ uid, kind, multiple, onPick, busy, onUpload }: { uid?: string; kind: ArchiveItem['kind'] | 'sound'; multiple?: boolean; onPick: (items: ArchiveItem[]) => void; busy?: boolean; onUpload?: () => void }) {
  return <FileBrowser uid={uid} kind={kind} multiple={multiple} onPick={onPick} busy={busy} onUpload={onUpload} addLabel={(n) => (kind === 'image' ? (n > 1 ? `Add ${n} pictures` : 'Add picture') : 'Add')} />;
}

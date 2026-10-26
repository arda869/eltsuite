import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useEditorClass } from './context';
import { uploadPicture, useImageSrc } from './PackNode';
import { usePopPos } from './usePopPos';
import { listLabel } from '../lib/listLabel';

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

export function PicFrame({ src, alt, size, label, classId }: { src: string; alt?: string; size?: string; label?: string; classId: string }) {
  const url = useImageSrc(classId, src);
  return (
    <span className={'pic pic-' + (size || 'm')}>
      {url ? <img src={url} alt={alt ?? ''} draggable={false} /> : <span className="pic-wait" />}
      {label && <span className="pic-label">{label}</span>}
    </span>
  );
}

function PictureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { classId } = useEditorClass();
  const a = node.attrs as { src: string; alt: string; size: PicSize; mark: PicMark };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popStyle = usePopPos(ref, open, 320);
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  const label = typeof pos === 'number' ? pictureLabel(editor.state.doc as never, pos, a.mark) : '';
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
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
        <PicFrame src={a.src} alt={a.alt} size={a.size} label={label} classId={classId} />
      </span>
      {open && (
        <span className="gap-pop pic-pop" style={popStyle}>
          <span className="pop-type">Picture</span>
          <span className="pic-row">
            <span className="hint">Size</span>
            {seg(PIC_SIZES, a.size || 'm', (k) => updateAttributes({ size: k }), 'Size')}
          </span>
          <span className="pic-row">
            <span className="hint">Label</span>
            {seg(PIC_MARKS, a.mark || '', (k) => updateAttributes({ mark: k }), 'Label')}
          </span>
          <label className="pic-row">
            <span className="hint">Description</span>
            <input value={a.alt ?? ''} placeholder="What the picture shows (for screen readers)" onChange={(e) => updateAttributes({ alt: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <span className="pic-row" style={{ justifyContent: 'flex-end' }}>
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
  addAttributes: () => ({ src: { default: '' }, alt: { default: '' }, size: { default: 'm' }, mark: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-picture]' }],
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

// "Image" from + Add or /: upload one or more pictures, or use a web address.
export function PictureDialog({ editor, classId, onClose }: { editor: Editor; classId: string; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [size, setSize] = useState<PicSize>('m');
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
      for (const f of list) srcs.push(await uploadPicture(classId, f));
      insertPictures(editor, srcs, { size, mark, alt });
      onClose();
    } catch {
      setBusy('The picture could not be uploaded. Try a smaller one.');
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog pic-dialog" role="dialog" aria-label="Add pictures" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Add pictures</h2>
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
          <span className="hint">or drop them here. You can choose several at once; they sit side by side.</span>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
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
        <div className="field" style={{ gap: 6 }}>
          <span>Size</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Size">
            {PIC_SIZES.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={size === o.k} className={size === o.k ? 'on' : ''} onClick={() => setSize(o.k)}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <div className="field" style={{ gap: 6 }}>
          <span>Label in the corner</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Label">
            {PIC_MARKS.map((o) => (
              <button key={o.k || 'none'} type="button" role="radio" aria-checked={mark === o.k} className={mark === o.k ? 'on' : ''} onClick={() => setMark(o.k)}>
                {o.label}
              </button>
            ))}
          </span>
          <span className="hint">Pictures with a label count on: a, b, c… Change one later by clicking it.</span>
        </div>
        <label className="field">
          <span>Description (optional)</span>
          <input value={alt} placeholder="What the picture shows, for learners who use a screen reader" onChange={(e) => setAlt(e.target.value)} />
        </label>
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

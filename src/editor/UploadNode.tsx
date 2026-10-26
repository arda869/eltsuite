import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Grip } from './nodes';
import { newId } from '../lib/tasks';
import { auth } from '../lib/firebase';
import { formatBytes } from '../lib/archive';
import { acceptFor, allowed, canPreview, FILE_KINDS, fileUrl, kindOf, removeFile, sendFile, shrinkPhoto, SIZES, type FileKind, type SentFile } from '../lib/uploads';
import { UiIcon } from '../components/UiIcon';

// "File upload": learners hand in files (a photo of their notes, a Word document, a recording,
// a short video). The teacher chooses which kinds, how large and how many.

export type UploadAttrs = { id: string; kinds: FileKind[]; maxMB: number; maxFiles: number; shrink: boolean; note: string };
export type UploadAnswer = { files: SentFile[] };
const KIND_ICON: Record<ReturnType<typeof kindOf>, string> = { pdf: 'task', doc: 'task', slides: 'present', sheet: 'answers', picture: 'picture', sound: 'music', video: 'video', file: 'archive' };
const KIND_LABEL: Record<ReturnType<typeof kindOf>, string> = { pdf: 'PDF', doc: 'Document', slides: 'Slides', sheet: 'Spreadsheet', picture: 'Picture', sound: 'Sound', video: 'Video', file: 'File' };

function FileRow({ classId, f, onRemove }: { classId: string; f: SentFile; onRemove?: () => void }) {
  const k = kindOf(f);
  const [thumb, setThumb] = useState('');
  useEffect(() => {
    if (k === 'picture' && canPreview(f)) fileUrl(classId, f).then(setThumb, () => {});
  }, [classId, f, k]);
  const open = async (download: boolean) => {
    const w = !download && canPreview(f) ? window.open('', '_blank') : null;
    try {
      const url = await fileUrl(classId, f);
      if (w) w.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
      }
    } catch {
      w?.close();
      window.alert('The file could not be opened.');
    }
  };
  return (
    <li className="up-file">
      <span className={'up-icon k-' + k}>{thumb ? <img src={thumb} alt="" /> : <UiIcon name={KIND_ICON[k]} size={18} />}</span>
      <span className="up-text">
        <button type="button" className="up-name" onClick={() => open(false)} title={canPreview(f) ? 'Open' : 'Download'}>
          {f.name}
        </button>
        <span className="up-meta">
          {KIND_LABEL[k]} · {formatBytes(f.size)}
        </span>
      </span>
      <span className="up-actions">
        {canPreview(f) && (
          <button type="button" className="btn small-btn" onClick={() => open(false)}>
            Open
          </button>
        )}
        <button type="button" className="btn small-btn" onClick={() => open(true)}>
          Download
        </button>
        {onRemove && (
          <button type="button" className="up-x" onClick={onRemove} aria-label={`Remove ${f.name}`}>
            ×
          </button>
        )}
      </span>
    </li>
  );
}

export function UploadBox({ classId, a, value, onChange, disabled, sample }: { classId: string; a: UploadAttrs; value?: UploadAnswer; onChange?: (v: UploadAnswer) => void; disabled?: boolean; sample?: boolean }) {
  const files = value?.files ?? [];
  const [busy, setBusy] = useState<{ name: string; p: number }[]>([]);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const kinds = a.kinds?.length ? a.kinds : (['any'] as FileKind[]);
  const max = Math.max(1, a.maxFiles || 1);
  const maxB = (a.maxMB || 5) * 1024 * 1024;
  const room = max - files.length - busy.length;
  const can = !disabled && !!onChange && room > 0;
  const latest = useRef(files);
  latest.current = files;

  const add = async (list: FileList | File[]) => {
    setError('');
    const uid = auth.currentUser?.uid;
    if (!uid || !onChange) return setError('Sign in to hand in files.');
    const all = Array.from(list);
    const take = all.slice(0, Math.max(0, room));
    if (all.length > take.length) setError(`You can send ${max === 1 ? 'one file' : `up to ${max} files`}.`);
    for (const f0 of take) {
      if (!allowed(kinds, f0)) {
        setError(`${f0.name} is not a kind of file this task takes.`);
        continue;
      }
      const f = a.shrink ? await shrinkPhoto(f0) : f0;
      if (f.size > maxB) {
        setError(`${f.name} is ${formatBytes(f.size)}. Files can be up to ${a.maxMB} MB.`);
        continue;
      }
      setBusy((b) => [...b, { name: f.name, p: 0 }]);
      try {
        const sent = await sendFile(classId, uid, '', '', f, (p) => setBusy((b) => b.map((x) => (x.name === f.name ? { ...x, p } : x))));
        onChange({ files: [...latest.current, sent] });
        latest.current = [...latest.current, sent];
      } catch {
        setError(`${f.name} could not be sent. Check your connection and try again.`);
      }
      setBusy((b) => b.filter((x) => x.name !== f.name));
    }
  };
  const remove = (f: SentFile) => {
    onChange?.({ files: files.filter((x) => x.id !== f.id) });
    removeFile(classId, f).catch(() => {});
  };
  const pics = kinds.includes('pictures') || kinds.includes('any');
  const what = kinds.includes('any') ? 'Any file' : kinds.map((k) => FILE_KINDS.find((x) => x.k === k)?.label).join(', ');
  return (
    <div className={'up' + (disabled ? ' locked' : '')}>
      {a.note && <p className="up-note">{a.note}</p>}
      {(can || sample) && (
        <div
          className={'up-drop' + (over ? ' over' : '')}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (can) add(e.dataTransfer.files);
          }}
          onClick={() => can && pick.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && can && (e.preventDefault(), pick.current?.click())}
        >
          <span className="up-drop-icon">
            <UiIcon name="upload" size={20} />
          </span>
          <strong>{files.length ? 'Add another file' : 'Drop files here, or choose them'}</strong>
          <span className="hint">
            {what} · up to {a.maxMB || 5} MB each · {max === 1 ? 'one file' : `up to ${max} files`}
          </span>
          {pics && (
            <button type="button" className="btn small-btn up-camera" onClick={(e) => (e.stopPropagation(), can && camera.current?.click())}>
              <UiIcon name="picture" size={14} /> Take a photo
            </button>
          )}
          <input ref={pick} type="file" hidden multiple={max > 1} accept={acceptFor(kinds)} onChange={(e) => (e.target.files && add(e.target.files), (e.target.value = ''))} />
          <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => (e.target.files && add(e.target.files), (e.target.value = ''))} />
        </div>
      )}
      {(files.length > 0 || busy.length > 0) && (
        <ul className="up-list">
          {files.map((f) => (
            <FileRow key={f.id} classId={classId} f={f} onRemove={!disabled && onChange ? () => remove(f) : undefined} />
          ))}
          {busy.map((b) => (
            <li key={b.name} className="up-file sending">
              <span className="up-icon">
                <UiIcon name="upload" size={18} />
              </span>
              <span className="up-text">
                <span className="up-name">{b.name}</span>
                <span className="up-bar">
                  <span style={{ width: `${Math.round(b.p * 100)}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {disabled && !files.length && !sample && <p className="hint">No files handed in.</p>}
      {error && <p className="hint warn">{error}</p>}
    </div>
  );
}

function UploadView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const a = node.attrs as UploadAttrs;
  const kinds = a.kinds ?? [];
  const toggle = (k: FileKind) => {
    if (k === 'any') return updateAttributes({ kinds: kinds.includes('any') ? [] : ['any'] });
    const next = kinds.filter((x) => x !== 'any');
    updateAttributes({ kinds: next.includes(k) ? next.filter((x) => x !== k) : [...next, k] });
  };
  return (
    <NodeViewWrapper className={'block-node up-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">File upload</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="up-settings">
        <div className="md-set">
          <span>Learners can send</span>
          <span className="up-kinds">
            {FILE_KINDS.map((k) => (
              <button key={k.k} type="button" className={'ap-chip' + (kinds.includes(k.k) ? ' on' : '')} onClick={() => toggle(k.k)} title={k.about}>
                {k.label}
              </button>
            ))}
          </span>
        </div>
        <label className="md-set">
          <span>Largest file</span>
          <select value={a.maxMB} onChange={(e) => updateAttributes({ maxMB: Number(e.target.value) })}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} MB
              </option>
            ))}
          </select>
        </label>
        <label className="md-set">
          <span>Files per learner</span>
          <select value={a.maxFiles} onChange={(e) => updateAttributes({ maxFiles: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'One file' : `Up to ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row up-shrink">
          <input type="checkbox" checked={a.shrink} onChange={(e) => updateAttributes({ shrink: e.target.checked })} />
          Make photos smaller before sending
        </label>
        <label className="md-set up-note-set">
          <span>Note for learners</span>
          <input value={a.note} onChange={(e) => updateAttributes({ note: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="For example: Upload a photo of your mind map" />
        </label>
      </div>
      <span className="hint">{a.maxMB >= 10 ? 'Large files use up the free space quickly; most homework fits in 5 MB.' : 'On the free plan, files are kept in the database, so smaller is better. Photos shrink to under 1 MB.'}</span>
      <UploadBox classId="" a={a} sample disabled />
    </NodeViewWrapper>
  );
}

export const UploadBlock = Node.create({
  name: 'upload',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: '' },
    kinds: { default: ['documents', 'pictures'] },
    maxMB: { default: 5 },
    maxFiles: { default: 1 },
    shrink: { default: true },
    note: { default: '' },
  }),
  parseHTML: () => [{ tag: 'div[data-upload]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-upload': '' })],
  addNodeView: () => ReactNodeViewRenderer(UploadView),
});

export const newUpload = () => ({ type: 'upload', attrs: { id: newId(), kinds: ['documents', 'pictures'], maxMB: 5, maxFiles: 1, shrink: true, note: '' } });

import { UiIcon } from './UiIcon';

// One look for every kind of thing you keep: a small page with a folded corner, its own colour
// and symbol, and a label. Folders are folders. Used in the archive, in shares and in messages.

export type FileKind = 'lesson' | 'task' | 'doc' | 'slides' | 'flash' | 'pd' | 'pdf' | 'image' | 'audio' | 'video' | 'link' | 'media';

const LOOK: Record<FileKind, { icon: string; label: string }> = {
  lesson: { icon: 'classes', label: 'Lesson' },
  task: { icon: 'task', label: 'Task' },
  doc: { icon: 'discuss', label: 'Collab' },
  slides: { icon: 'present', label: 'Slides' },
  flash: { icon: 'pick', label: 'Cards' },
  pd: { icon: 'notebook', label: 'Reading' },
  pdf: { icon: 'annotate', label: 'PDF' },
  image: { icon: 'picture', label: 'Picture' },
  audio: { icon: 'music', label: 'Recording' },
  video: { icon: 'video', label: 'Video' },
  link: { icon: 'link', label: 'Link' },
  media: { icon: 'picture', label: 'Media' },
};

export function FileIcon({ kind, size = 40, label = true }: { kind: FileKind; size?: number; label?: boolean }) {
  const l = LOOK[kind] ?? LOOK.media;
  return (
    <span className={'file-ic fk-' + kind} style={{ ['--fs' as string]: size + 'px' }} aria-hidden="true">
      <svg className="file-ic-page" viewBox="0 0 40 48" width={size} height={size * 1.2}>
        <path className="fp" d="M6 1.5h20L38.5 14v30A2.5 2.5 0 0 1 36 46.5H6A2.5 2.5 0 0 1 3.5 44V4A2.5 2.5 0 0 1 6 1.5z" />
        <path className="ff" d="M26 1.5V11a3 3 0 0 0 3 3h9.5" />
      </svg>
      <span className="file-ic-g">
        <UiIcon name={l.icon} size={Math.round(size * 0.42)} />
      </span>
      {label && size >= 32 && <span className="file-ic-l">{l.label}</span>}
    </span>
  );
}

// A folder kept in step with your classes shows a padlock and a sync sign: it is changed there.
export function FolderIcon({ size = 40, open, locked }: { size?: number; open?: boolean; locked?: boolean }) {
  return (
    <span className={'folder-ic' + (open ? ' open' : '') + (locked ? ' locked' : '')} aria-hidden="true">
      <svg viewBox="0 0 48 40" width={size * 1.2} height={size}>
        <path className="fb" d="M3 7.5A3.5 3.5 0 0 1 6.5 4h11l4 4.5h20A3.5 3.5 0 0 1 45 12v22.5a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 34.5z" />
        <path className="ft" d="M3 14.5A3.5 3.5 0 0 1 6.5 11h35a3.5 3.5 0 0 1 3.5 3.5v20a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 34.5z" />
        {locked && size >= 24 && (
          <g className="fl">
            <path d="M14 24.5a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7" fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.2 2.4" />
            <rect x="19" y="23" width="10" height="8.5" rx="2" />
            <path d="M21.2 23v-2.3a2.8 2.8 0 0 1 5.6 0V23" fill="none" strokeWidth="1.7" />
          </g>
        )}
      </svg>
      {locked && <span className="folder-lock">{size < 24 ? <svg width="9" height="9" viewBox="0 0 12 12"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="currentColor" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg> : null}</span>}
    </span>
  );
}

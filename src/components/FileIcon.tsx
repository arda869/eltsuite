import { UiIcon } from './UiIcon';

// One look for every kind of thing you keep: a small page with a folded corner, its own colour
// and symbol, and a label. Folders are folders. Used in the archive, in shares and in messages.

export type FileKind = 'lesson' | 'task' | 'doc' | 'slides' | 'flash' | 'pd' | 'pdf' | 'image' | 'audio' | 'video' | 'link' | 'media';

const LOOK: Record<FileKind, { icon: string; label: string }> = {
  lesson: { icon: 'classes', label: 'Lesson' },
  task: { icon: 'task', label: 'Task' },
  doc: { icon: 'discuss', label: 'Doc' },
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

export function FolderIcon({ size = 40, open }: { size?: number; open?: boolean }) {
  return (
    <span className={'folder-ic' + (open ? ' open' : '')} aria-hidden="true">
      <svg viewBox="0 0 48 40" width={size * 1.2} height={size}>
        <path className="fb" d="M3 7.5A3.5 3.5 0 0 1 6.5 4h11l4 4.5h20A3.5 3.5 0 0 1 45 12v22.5a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 34.5z" />
        <path className="ft" d="M3 14.5A3.5 3.5 0 0 1 6.5 11h35a3.5 3.5 0 0 1 3.5 3.5v20a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 34.5z" />
      </svg>
    </span>
  );
}

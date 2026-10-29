import { UiIcon } from './UiIcon';

// One look for every kind of thing you keep: a small page with a folded corner, its own colour
// and symbol, and a label. Folders are folders. Used in the archive, in shares and in messages.

export type FileKind = 'lesson' | 'task' | 'doc' | 'slides' | 'flash' | 'pd' | 'pdf' | 'storyboard' | 'file' | 'image' | 'audio' | 'video' | 'link' | 'media';

const LOOK: Record<FileKind, { icon: string; label: string }> = {
  lesson: { icon: 'classes', label: 'Lesson' },
  task: { icon: 'task', label: 'Task' },
  doc: { icon: 'discuss', label: 'Collab' },
  slides: { icon: 'present', label: 'Slides' },
  flash: { icon: 'pick', label: 'Cards' },
  pd: { icon: 'notebook', label: 'Reading' },
  pdf: { icon: 'annotate', label: 'PDF' },
  storyboard: { icon: 'storyboard', label: 'Story' },
  file: { icon: 'archive', label: 'File' },
  image: { icon: 'picture', label: 'Picture' },
  audio: { icon: 'music', label: 'Recording' },
  video: { icon: 'video', label: 'Video' },
  link: { icon: 'link', label: 'Link' },
  media: { icon: 'picture', label: 'Media' },
};

// Lessons come in kinds, each with its own symbol on the same page.
const LESSON_SUB: Record<string, { icon: string; label: string }> = {
  homework: { icon: 'home', label: 'Homework' },
  exam: { icon: 'timer', label: 'Exam' },
  practice: { icon: 'pen', label: 'Practice' },
};
export function FileIcon({ kind, size = 40, label = true, sub }: { kind: FileKind; size?: number; label?: boolean; sub?: string }) {
  const l = (kind === 'lesson' && sub && LESSON_SUB[sub]) || (kind === 'file' && sub ? { icon: 'archive', label: sub.toUpperCase().slice(0, 5) } : null) || LOOK[kind] || LOOK.media;
  return (
    <span className={'file-ic fk-' + kind + (sub && kind === 'lesson' ? ' ls-' + sub : '')} style={{ ['--fs' as string]: size + 'px' }} aria-hidden="true">
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
          // A class folder: a small badge with the class book, as the folder follows the class.
          <g className="fl">
            <circle cx="36" cy="30" r="8.5" />
            <path d="M31.8 26.6h3.1c.6 0 1.1.5 1.1 1.1v6.1c0-.6-.5-1.1-1.1-1.1h-3.1zM40.2 26.6h-3.1c-.6 0-1.1.5-1.1 1.1v6.1c0-.6.5-1.1 1.1-1.1h3.1z" fill="none" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
        )}
      </svg>
      {locked && <span className="folder-lock">{size < 24 ? <svg width="9" height="9" viewBox="0 0 12 12"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="currentColor" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg> : null}</span>}
    </span>
  );
}

// The tab's icon, drawn like the file's icon in Files: the page in the kind's colour and its symbol.
const FK: Partial<Record<FileKind, string>> = { lesson: '#c8764a', task: '#8b6f4e', doc: '#7c6aa6', slides: '#b7791f', flash: '#8a4f9e', pd: '#3c7c8c', pdf: '#b64a3c', storyboard: '#4f7a55', file: '#5d6b7a', image: '#b8873a', audio: '#a3607f', video: '#4f7192', link: '#6b7480', media: '#b8873a' };
export function setFileFavicon(kind: FileKind) {
  const c = FK[kind] ?? '#c8764a';
  // The symbol comes from the same icon set, drawn off screen and copied in.
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;color:' + c;
  document.body.append(holder);
  void Promise.all([import('react-dom/client'), import('react-dom')]).then(([{ createRoot }, { flushSync }]) => {
    const root = createRoot(holder);
    flushSync(() => root.render(<UiIcon name={(LOOK[kind] ?? LOOK.media).icon} size={20} />));
    {
      const g = holder.querySelector('svg');
      const inner = g ? g.innerHTML.replace(/currentColor/g, c) : '';
      const vb = g?.getAttribute('viewBox') ?? '0 0 24 24';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48"><path d="M6 1.5h20L38.5 14v30A2.5 2.5 0 0 1 36 46.5H6A2.5 2.5 0 0 1 3.5 44V4A2.5 2.5 0 0 1 6 1.5z" fill="${c}1f" stroke="${c}" stroke-width="2.4"/><path d="M26 1.5V11a3 3 0 0 0 3 3h9.5" fill="${c}40" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/><svg x="7" y="15" width="26" height="26" viewBox="${vb}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg></svg>`;
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.append(link);
      }
      link.type = 'image/svg+xml';
      link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
      root.unmount();
      holder.remove();
    }
  });
}

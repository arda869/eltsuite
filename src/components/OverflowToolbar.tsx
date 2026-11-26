import { Children, type ReactNode } from 'react';

// The document toolbar: every tool always shows. When the window is narrow, whole tool groups
// move to a second row instead of hiding behind a “More” button.
export function OverflowToolbar({ children }: { children: ReactNode }) {
  const groups = Children.toArray(children);
  return (
    <div className="ne-bar cd-bar cd-pagebar single-toolbar" role="toolbar" aria-label="Formatting" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.sel-list')) e.stopPropagation(); }}>
      {groups.map((node, i) => <span className="overflow-group" key={i}>{node}</span>)}
    </div>
  );
}

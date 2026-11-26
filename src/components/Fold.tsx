import type { ReactNode } from 'react';

// One folding part of a settings panel, as in the lesson editor: one open at a time.
export function Fold({ id, title, open, setOpen, children, badge }: { id: string; title: string; open: string; setOpen: (v: string) => void; children: ReactNode; badge?: ReactNode }) {
  const on = open === id;
  return (
    <section className={'fold' + (on ? ' on' : '')}>
      <button type="button" className="fold-h" aria-expanded={on} onClick={() => setOpen(on ? '' : id)}>
        {title}
        {badge}
        <span className="fold-chev" aria-hidden="true">›</span>
      </button>
      {on && <div className="fold-b">{children}</div>}
    </section>
  );
}

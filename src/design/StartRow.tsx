import { TEMPLATES, type Tpl } from './templates';
import { Thumb } from './Start';

// The Designer's front page: start from a classroom template, or a blank canvas.
export function StartRow({ onPick, busy }: { onPick: (t: Tpl) => void; busy: boolean }) {
  const list = TEMPLATES.filter((t) => t.group === 'teach' || t.group === 'canvas');
  return (
    <section className="dz-row" aria-label="Start from a template">
      <div className="dz-row-scroll">
        {list.map((t) => (
          <button key={t.k} type="button" className="dz-row-card" disabled={busy} onClick={() => onPick(t)}>
            <span className="dz-row-f"><Thumb t={t} /></span>
            <strong>{t.name}</strong>
            <span>{t.about}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

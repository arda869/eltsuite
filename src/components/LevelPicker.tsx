import { currentOrg, levelsFor } from '../lib/admin';

// The class level as a row of small choices rather than a dropdown.
export function LevelPicker({ value, onChange, levels }: { value: string; onChange: (v: string) => void; levels?: string[] }) {
  // The organisation's levels when there is one; a level already set stays a choice.
  const list = levels ?? levelsFor(currentOrg());
  const all = value && !list.includes(value) ? [value, ...list] : list;
  return (
    <div className="field">
      Level
      <span className="level-pick" role="radiogroup" aria-label="Level">
        {all.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={value === l} className={value === l ? 'on' : ''} onClick={() => onChange(l)}>
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

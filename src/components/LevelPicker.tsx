import { LEVELS } from '../lib/classes';

// The class level as a row of small choices rather than a dropdown.
export function LevelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      Level
      <span className="level-pick" role="radiogroup" aria-label="Level">
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={value === l} className={value === l ? 'on' : ''} onClick={() => onChange(l)}>
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

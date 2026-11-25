import type { CollabCopy } from '../lib/copy';

// When a copied task has a shared document: what the copy opens.
export function CollabChoice({ value, onChange }: { value: CollabCopy; onChange: (v: CollabCopy) => void }) {
  const opts: [CollabCopy, string, string][] = [
    ['copy', 'A copy of it', 'The copy begins with everything written so far; the original stays as it is.'],
    ['empty', 'A new, empty one', 'Learners start again. The starting text comes along.'],
    ['same', 'The same one', 'Keep working on the same document: what anyone writes shows in both places.'],
  ];
  return (
    <fieldset className="cc">
      <legend>Shared documents in it</legend>
      {opts.map(([k, l, about]) => (
        <label key={k} className={'cc-opt' + (value === k ? ' on' : '')}>
          <input type="radio" name="collab-copy" checked={value === k} onChange={() => onChange(k)} />
          <span>
            <b>{l}</b>
            <span className="hint">{about}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

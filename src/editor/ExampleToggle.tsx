// "Example": the answer is shown, it is numbered 0 and it is not marked.
export function ExampleToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={'ex-toggle' + (on ? ' on' : '')} data-tip="Show the answer as an example: numbered 0, not marked">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Example
    </label>
  );
}

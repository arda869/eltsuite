// Opinion and discussion prompts can collect responses without an answer key or score.
export function NoCorrectAnswer({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check-row" title="Collect responses without marking them right or wrong">
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      No correct answer
    </label>
  );
}

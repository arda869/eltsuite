import { useState } from 'react';

// Hint (shown when a learner can try again) and feedback (shown with the correct answer).
export function NoteFields({ hint, feedback, onSave }: { hint: string; feedback: string; onSave: (patch: { hint?: string; feedback?: string }) => void }) {
  const [open, setOpen] = useState(!!(hint || feedback));
  const [h, setH] = useState(hint);
  const [f, setF] = useState(feedback);
  if (!open)
    return (
      <button type="button" className="btn link small note-toggle" onClick={() => setOpen(true)}>
        + Hint and feedback
      </button>
    );
  return (
    <span className="note-fields">
      <label>
        <span>Hint</span>
        <input value={h} placeholder="Shown when it’s wrong and they can try again" onChange={(e) => setH(e.target.value)} onBlur={() => onSave({ hint: h.trim() })} />
      </label>
      <label>
        <span>Feedback</span>
        <input value={f} placeholder="Shown with the correct answer when it’s wrong" onChange={(e) => setF(e.target.value)} onBlur={() => onSave({ feedback: f.trim() })} />
      </label>
    </span>
  );
}

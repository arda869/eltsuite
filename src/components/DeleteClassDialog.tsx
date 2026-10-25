import { useState } from 'react';
import type { ClassDoc } from '../lib/classes';
import { softDeleteClass } from '../lib/deletion';
import { classText, download } from '../lib/transfer';

// Deleting a class is deliberate: say what goes, ask for the class name, offer an export first.
export function DeleteClassDialog({ c, onClose, onDeleted }: { c: ClassDoc; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase() === c.name.trim().toLowerCase();
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Delete class" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Delete {c.name}?</h2>
        <p style={{ margin: 0 }}>
          This removes all lessons and work, <strong>{c.learnerCount ?? 0} learner accounts</strong>, their answers, feedback and board posts, and the class code.
        </p>
        <p className="hint" style={{ margin: 0 }}>
          The class goes to <strong>Recently deleted</strong> for 30 days and you can restore it there. After 30 days it is removed for good. If you only want to put it away, archive it instead.
        </p>
        <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => download(c.name, await classText(c.id, c.name, true))}>
          Export the lessons first
        </button>
        <label className="field">
          Type the class name to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.name} autoFocus />
        </label>
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              await softDeleteClass(c);
              onDeleted();
            }}
          >
            Delete class
          </button>
        </span>
      </div>
    </div>
  );
}

import { updateItem, type Item } from '../lib/classes';
import { setTaskFlags, type Task } from '../lib/tasks';
import { useRuns, examScope } from '../lib/exam';

// Task settings: exam mode, the time limit, and releasing the results.
export function ExamSettings({ classId, item, task }: { classId: string; item: Item; task: Task }) {
  const whole = item.type === 'exam';
  const scope = examScope(item, task);
  const runs = useRuns(classId, scope?.id);
  const done = runs.filter((r) => r.submittedMs).length;
  const minutes = whole ? item.exam?.minutes ?? null : task.exam?.minutes ?? null;
  const setMinutes = (m: number | null) => (whole ? updateItem(classId, item.id, { exam: { minutes: m } }) : setTaskFlags(classId, item.id, task.id, { exam: { ...(task.exam ?? {}), minutes: m } }));
  const released = !!scope?.released;
  const release = (v: boolean) => (whole ? updateItem(classId, item.id, { examReleased: v }) : setTaskFlags(classId, item.id, task.id, { examReleased: v }));
  return (
    <div className="exam-set">
      <h2>Exam</h2>
      {whole ? (
        <span className="hint">This whole lesson is an exam. Change it on the class page.</span>
      ) : (
        <label className="switch-row">
          <span>
            Exam mode for this task
            <span className="hint">A Start button and a timer, no checking, answers locked after submitting</span>
          </span>
          <input type="checkbox" checked={!!task.exam} onChange={() => setTaskFlags(classId, item.id, task.id, { exam: task.exam ? null : { minutes: 20 }, examReleased: false })} />
        </label>
      )}
      {scope && (
        <>
          <label className="check-row">
            Time limit
            <input inputMode="numeric" style={{ width: 52 }} value={minutes ?? ''} placeholder="none" onChange={(e) => setMinutes(e.target.value.trim() ? Math.max(1, Math.min(600, Number(e.target.value.replace(/\D/g, '')) || 1)) : null)} />
            minutes
          </label>
          <span className="hint">
            {runs.length} started · {done} submitted. Each learner has one attempt.
          </span>
          <button type="button" className={'btn small-btn' + (released ? '' : ' primary')} style={{ alignSelf: 'flex-start' }} onClick={() => release(!released)}>
            {released ? 'Results released · take back' : 'Release the results'}
          </button>
        </>
      )}
    </div>
  );
}

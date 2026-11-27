import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor, InstrView } from '../editor/InstrEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { IdentityMark } from '../components/Identity';
import { LocalActivityMode } from '../communicative/LocalActivity';
import { splitKey } from '../lib/questions';
import { DOTS } from '../editor/nodes';
import { UiIcon } from '../components/UiIcon';
import { Fold } from '../components/Fold';
import { ask } from '../lib/ask';
import { addLearnerVersion, newSection, reorderSections, type HubEditorSection, type HubResourceDraft } from './hubEditorData';

// The Resource Hub editor, laid out like a lesson in Classes: the tasks down the left (hover between
// two to add one there, drag one to move it), the task in the middle with its activity type, title,
// instruction and content, and its settings on the right. Teacher notes and the answer key are rows
// of their own, marked for teachers. In the paper view the printed page sits beside the task.

type Props = {
  draft: HubResourceDraft;
  editable: boolean;
  active: string;
  setActive: (id: string) => void;
  patch: (p: Partial<HubResourceDraft>) => void;
  patchSection: (id: string, p: Partial<HubEditorSection>) => void;
  onIdentity: () => void;
  generatedAnswers: string[];
  paper: boolean;
  preview: ReactNode; // kept mounted while switching views so PDF position is retained
  publishing: ReactNode; // the checklist and the publishing buttons
  checks: number;
};

function Insert({ label, open, onOpen, onPick, canVersion }: { label: string; open: boolean; onOpen: (o: boolean) => void; onPick: (k: 'learner' | 'teacher' | 'version') => void; canVersion: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpen(false); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [open, onOpen]);
  return (
    <details ref={ref} className="task-insert" open={open}>
      <summary aria-label={label} title={label} onClick={(e) => { e.preventDefault(); onOpen(!open); }}><span aria-hidden="true">+</span></summary>
      <div className="task-insert-menu" role="group" aria-label={label}>
        <button type="button" className="btn small-btn" data-tip="Learner task" onClick={() => onPick('learner')}><UiIcon name="plus" /><span className="task-insert-label">Learner task</span></button>
        <button type="button" className="btn small-btn" data-tip="Teacher notes" onClick={() => onPick('teacher')}><UiIcon name="notebook" /><span className="task-insert-label">Teacher notes</span></button>
        {canVersion && <button type="button" className="btn small-btn" data-tip="A/B version of the task above" onClick={() => onPick('version')}><UiIcon name="copyall" /><span className="task-insert-label">A/B version</span></button>}
      </div>
    </details>
  );
}

export function HubLessonEditor({ draft, editable, active, setActive, patch, patchSection, onIdentity, generatedAnswers, paper, preview, publishing, checks }: Props) {
  const sections = draft.sections;
  const section = sections.find((s) => s.id === active) ?? sections[0];
  const [insertAt, setInsertAt] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [fold, setFold] = useState('who');
  const isLesson = draft.resourceType === 'lesson';

  const insert = (k: 'learner' | 'teacher' | 'version', before: string | null) => {
    setInsertAt(null);
    if (k === 'version') {
      const at = before ? sections.findIndex((s) => s.id === before) : sections.length;
      const source = [...sections.slice(0, at)].reverse().find((s) => s.audience === 'learner');
      if (!source) return;
      const r = addLearnerVersion(sections, source.id);
      patch({ sections: r.sections });
      setActive(r.id);
      return;
    }
    const next = newSection(k);
    const at = before ? sections.findIndex((s) => s.id === before) : sections.length;
    patch({ sections: [...sections.slice(0, at), next, ...sections.slice(at)] });
    setActive(next.id);
  };
  const reorder = (id: string, to: number) => {
    const next = reorderSections(sections, id, to);
    if (next !== sections) patch({ sections: next });
  };
  const remove = async (s: HubEditorSection) => {
    if (sections.length < 2) return;
    if (!(await ask(`Remove “${s.title || 'this task'}”? You can’t undo this once the draft is saved.`, { ok: 'Remove', danger: true }))) return;
    const rest = sections.filter((x) => x.id !== s.id);
    if (s.versionGroup && rest.filter((x) => x.versionGroup === s.versionGroup).length === 1) {
      const i = rest.findIndex((x) => x.versionGroup === s.versionGroup);
      const { versionGroup: _g, versionLabel: _l, ...plain } = rest[i];
      void _g; void _l;
      rest[i] = plain;
    }
    patch({ sections: rest });
    setActive(rest[0]?.id ?? '');
  };

  let n = 0;
  const label = (s: HubEditorSection) => (s.versionLabel ? `${s.title} · ${s.versionLabel}` : s.title) || (s.audience === 'teacher' ? 'Teacher notes' : 'Task');
  const teacher = section?.audience === 'teacher';
  const frame = section && (
    <div className="frame-inner rhl-frame" data-spelling-editor="true">
      <div className={'frame-head' + (teacher ? ' rhl-teacher-head' : '')}>
        {teacher ? (
          <span className="rhl-for"><UiIcon name="lock" size={13} /> {section.kind === 'answer-key' ? 'Answer key' : 'Teacher notes'} · only teachers see this</span>
        ) : (
          <div className="aid-row">
            {section.identity ? <IdentityMark identity={section.identity} onClick={editable ? onIdentity : undefined} /> : editable && (
              <button type="button" className="aid-add" onClick={onIdentity}><span aria-hidden="true">+</span> Activity type</button>
            )}
            {section.versionLabel && <span className="rhl-version">{section.versionLabel}</span>}
          </div>
        )}
        <input className="task-title input" value={section.title} placeholder={teacher ? 'Title, for example: Before the lesson' : 'Task title'} aria-label="Task title" disabled={!editable} onChange={(e) => patchSection(section.id, { title: e.target.value })} />
        {editable ? (
          <InstrEditor key={section.id + '-screen'} doc={section.instrDoc} text={section.instructions} suiteScriptAudience="resourceHub" suiteScriptEnabled onChange={(instrDoc, instructions) => patchSection(section.id, { instrDoc, instructions })} placeholder={teacher ? 'Introduction, for example: Before the lesson (optional)' : undefined} />
        ) : <InstrView doc={section.instrDoc} text={section.instructions} />}
      </div>
      {section.kind === 'answer-key' && (
        <div className="rhe-answer-preview rhl-key">
          <strong>Answers from the learner tasks</strong>
          {generatedAnswers.length ? <pre>{generatedAnswers.join('\n')}</pre> : <p>Answers you give in the learner tasks appear here by themselves. Add suggested answers to open questions below.</p>}
        </div>
      )}
      <div className="frame-body">
        {editable ? (
          <TaskEditor key={section.id} compact content={section.content} onChange={(content) => patchSection(section.id, { content })} classId="" suiteScriptAudience="resourceHub" suiteScriptEnabled textOnly={teacher} label={section.title} taskTitle={section.title} taskContext={section.instructions} />
        ) : (
          <LocalActivityMode.Provider value={true}><TaskRenderer content={splitKey(section.content, true).content} responses={{}} disabled classId="" /></LocalActivityMode.Provider>
        )}
      </div>
    </div>
  );

  return (
    <div className="lesson-layout rhl">
      <nav className="task-list" aria-label="Tasks">
        <textarea
          className="lesson-title"
          rows={1}
          value={draft.title}
          placeholder={isLesson ? 'Lesson title' : 'Activity title'}
          aria-label={isLesson ? 'Lesson title' : 'Activity title'}
          readOnly={!editable}
          ref={(el) => { if (el) { el.style.height = '0'; el.style.height = el.scrollHeight + 'px'; } }}
          onChange={(e) => patch({ title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        />
        {sections.map((s, i) => (
          <Fragment key={s.id}>
            {editable && <Insert label={'Add before ' + label(s)} open={insertAt === s.id} onOpen={(o) => setInsertAt(o ? s.id : null)} onPick={(k) => insert(k, s.id)} canVersion={sections.slice(0, i).some((x) => x.audience === 'learner')} />}
            <div
              className={'task-row' + (s.versionGroup && sections.find((x) => x.versionGroup === s.versionGroup)?.id !== s.id ? ' variant-row' : '') + (s.id === section?.id ? ' on' : '') + (dragId === s.id ? ' dragging' : '') + (dropAt === i ? ' drop-before' : '') + (dropAt === sections.length && i === sections.length - 1 ? ' drop-after' : '') + (s.audience === 'teacher' ? ' rhl-t' : '')}
              draggable={editable}
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
              onDragOver={(e) => { if (!dragId) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dropAt !== null) reorder(dragId, dropAt); setDragId(null); setDropAt(null); }}
              onDragEnd={() => { setDragId(null); setDropAt(null); }}
            >
              {editable && <span className="drag-handle" aria-hidden="true" title="Drag to move">{DOTS}</span>}
              <button type="button" className="task-pick" onClick={() => setActive(s.id)}>
                {s.audience === 'learner' ? (!s.versionGroup || sections.find((x) => x.versionGroup === s.versionGroup)?.id === s.id ? <span className="n">{++n}</span> : <span className="n rhl-v">{(s.versionLabel || '').replace(/^Learner\s+/, '') || '·'}</span>) : <span className="n rhl-tn" aria-hidden="true"><UiIcon name="lock" size={12} /></span>}
                <span className="rhl-row-t">{label(s)}</span>
              </button>
            </div>
          </Fragment>
        ))}
        {editable && <Insert label="Add at the end" open={insertAt === 'end'} onOpen={(o) => setInsertAt(o ? 'end' : null)} onPick={(k) => insert(k, null)} canVersion={sections.some((x) => x.audience === 'learner')} />}
      </nav>
      <div className="center-col">
        <main className="task-frame rhl-main">
          <div className={'rhl-paper' + (paper ? '' : ' rhl-digital')}>
            <section className="rhl-paper-page" aria-label="The printed page" hidden={!paper}>{preview}</section>
            <section className="rhl-paper-edit" aria-label="Edit the task">{frame}</section>
          </div>
        </main>
      </div>
      {section && (
        <aside className="task-side folds" aria-label="Task settings">
          <Fold id="who" title="Who sees this" open={fold} setOpen={setFold}>
            <span className="seg" role="radiogroup" aria-label="Who sees this">
              {(['learner', 'teacher'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={section.audience === a} className={section.audience === a ? 'on' : ''} disabled={!editable || !!section.versionGroup} onClick={() => patchSection(section.id, { audience: a, kind: a === 'learner' ? 'task' : section.kind === 'task' ? 'notes' : section.kind })}>{a === 'learner' ? 'Learners' : 'Teachers only'}</button>
              ))}
            </span>
            {section.audience === 'teacher' && (
              <span className="seg" role="radiogroup" aria-label="Kind of teacher page">
                {([['notes', 'Notes'], ['answer-key', 'Answer key']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={section.kind === k} className={section.kind === k ? 'on' : ''} disabled={!editable} onClick={() => patchSection(section.id, { kind: k })}>{l}</button>
                ))}
              </span>
            )}
            <p className="hint">{section.audience === 'teacher' ? 'Printed with the teacher’s pages and copied to Classes as hidden notes.' : 'Printed for learners and copied to Classes as a task.'}</p>
          </Fold>
          {section.audience === 'learner' && (
            <Fold id="versions" title="Versions" open={fold} setOpen={setFold}>
              <p className="hint">Learner A and Learner B see different pages of the same task, for information gaps.</p>
              {section.versionGroup && (
                <label className="field"><span>This version’s name</span><input value={section.versionLabel ?? ''} disabled={!editable} placeholder="Learner A, Customer…" onChange={(e) => patchSection(section.id, { versionLabel: e.target.value })} /></label>
              )}
              {editable && <button type="button" className="btn small-btn" onClick={() => { const r = addLearnerVersion(sections, section.id); patch({ sections: r.sections }); setActive(r.id); }}>Make {section.versionGroup ? 'another version' : 'version B'}</button>}
            </Fold>
          )}
          {section.audience === 'learner' && (
            <Fold id="paper" title="On paper" open={fold} setOpen={setFold}>
              <p className="hint">A different instruction for the printed page. Leave it empty to print the one above.</p>
              {editable ? <InstrEditor key={section.id + '-paper'} doc={section.printInstrDoc} text={section.printInstructions ?? ''} suiteScriptAudience="resourceHub" suiteScriptEnabled onChange={(printInstrDoc, printInstructions) => patchSection(section.id, { printInstrDoc, printInstructions })} placeholder="Instruction on paper, for example: Write the answers on the lines." /> : <InstrView doc={section.printInstrDoc} text={section.printInstructions ?? ''} />}
            </Fold>
          )}
          <Fold id="publish" title="Readiness" open={fold} setOpen={setFold} badge={checks ? <span className="rhl-badge" aria-label={`${checks} to fix`}>{checks}</span> : undefined}>
            {publishing}
          </Fold>
          {editable && sections.length > 1 && (
            <button type="button" className="btn link small rhl-remove" onClick={() => void remove(section)}>Remove this {section.audience === 'teacher' ? 'page' : 'task'}</button>
          )}
        </aside>
      )}
    </div>
  );
}

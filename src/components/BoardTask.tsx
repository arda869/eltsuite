import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { onValue, ref, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { roomOf, useGroupSets } from '../lib/groups';
import { Whiteboard } from './Whiteboard';
import { UiIcon } from './UiIcon';
import type { BoardMe } from './Board';

// A drawing board in a task, set up like Collaborate: one board for the whole class, one for
// each group, or one for each learner. The teacher can lock it; it can fill the screen.

export type BoardAttrs2 = { id: string; prompt?: string; scope?: 'class' | 'group' | 'solo'; groupSet?: string; display?: 'inline' | 'expand' | 'full' };

export function BoardTask({ a, me, classmates }: { a: BoardAttrs2; me?: BoardMe; classmates?: { id: string; name: string }[] }) {
  const classId = me?.classId ?? '';
  const sets = useGroupSets(classId);
  const scope = a.scope ?? 'class';
  const set0 = sets.find((s) => s.id === a.groupSet) ?? (scope === 'group' ? sets[0] : undefined);
  const [pick, setPick] = useState('');
  if (!me || !a.id) return <div className="drawboard-empty hint">The board opens during the lesson.</div>;
  const teacher = !!me.teacher;
  let boardId = a.id;
  let head: ReactNode = null;
  if (scope !== 'class') {
    if (teacher) {
      const options = scope === 'group' ? (set0?.groups ?? []).map((g) => ({ id: g.id, name: g.name })) : classmates ?? [];
      const cur = pick || options[0]?.id || '';
      if (!options.length) return <p className="hint">{scope === 'group' ? 'Make groups for this class first.' : 'No learners in this class yet.'}</p>;
      boardId = `${a.id}~${scope === 'group' ? 'g' : 'l'}${cur}`;
      head = (
        <select className="cd-pick" value={cur} onChange={(e) => setPick(e.target.value)} aria-label={scope === 'group' ? 'Group' : 'Learner'}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    } else {
      const g = scope === 'group' ? roomOf(set0, me.selfId ?? '') : undefined;
      boardId = g ? `${a.id}~g${g.id}` : `${a.id}~l${me.selfId || me.uid}`;
      head = g ? <span className="cd-for">{g.name}</span> : <span className="cd-for">Your own board</span>;
    }
  }
  return <BoardShell key={boardId} classId={classId} boardId={boardId} title={a.prompt || 'Board'} me={me} teacher={teacher} free={scope !== 'class'} display={a.display ?? 'expand'} head={head} />;
}

function BoardShell({ classId, boardId, title, me, teacher, free, display, head }: { classId: string; boardId: string; title: string; me: BoardMe; teacher: boolean; free: boolean; display: 'inline' | 'expand' | 'full'; head: ReactNode }) {
  const [pen, setPen] = useState('teacher');
  const [big, setBig] = useState(false);
  const base = `sessions/${classId}/board/${boardId}`;
  useEffect(() => onValue(ref(rtdb, `${base}/pen`), (s) => setPen((s.val() as string) ?? (free ? 'all' : 'teacher')), () => {}), [base, free]);
  useEffect(() => {
    if (!big) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [big]);
  const locked = pen === 'locked';
  const toggleLock = () => set(ref(rtdb, `${base}/pen`), locked ? (free ? null : 'teacher') : 'locked').catch(() => {});
  const body = (
    <div className={'cd board-cd' + (big ? ' big' : '') + (locked && !teacher ? ' is-locked' : '')}>
      <div className="cd-top">
        <span className="cd-title">
          <UiIcon name="board" size={16} />
          {title}
        </span>
        {head}
        <span style={{ marginLeft: 'auto' }} />
        <span className="cd-mode" hidden={teacher}>
          {locked ? (
            <span className="cd-locked">
              <UiIcon name="lock" size={14} /> Locked
            </span>
          ) : (
            <span className="cd-mode-one">{teacher || free || pen === 'all' || pen === me.uid ? 'Drawing' : 'Watching'}</span>
          )}
        </span>
        {teacher && (
          <button type="button" className={'btn small-btn cd-lock' + (locked ? ' on' : '')} onClick={toggleLock} data-tip={locked ? 'Let learners draw again' : 'Stop learners drawing'}>
            <UiIcon name={locked ? 'lock' : 'unlock'} size={14} /> {locked ? 'Locked' : 'Lock'}
          </button>
        )}
        {(display !== 'inline' || big) && (
          <button type="button" className="cd-icon" onClick={() => setBig(!big)} aria-label={big ? 'Back to the task' : 'Full screen'} data-tip={big ? 'Back to the task (Esc)' : 'Full screen'}>
            <UiIcon name={big ? 'fullscreenOff' : 'fullscreen'} size={16} />
          </button>
        )}
      </div>
      {locked && (
        <div className={'cd-lockbar' + (teacher ? ' for-teacher' : '')} role="status">
          <UiIcon name="lock" size={16} />
          {teacher ? (
            <span>
              <b>Locked.</b> Learners can see it but cannot draw. You still can.
            </span>
          ) : (
            <span>
              <b>Your teacher has locked this board.</b> You can look, but not draw for now.
            </span>
          )}
        </div>
      )}
      <div className="board-cd-body">
        <Whiteboard classId={classId} boardId={boardId} uid={me.uid} teacher={teacher} people={me.penPeople} compact={!big} free={free} name={me.name} />
      </div>
    </div>
  );
  if (display === 'full' && !big)
    return (
      <button type="button" className="cd-open" onClick={() => setBig(true)}>
        <span className="cd-open-icon">
          <UiIcon name="board" size={22} />
        </span>
        <span className="cd-open-text">
          <strong>{title}</strong>
          <span className="hint">{locked ? 'Locked by your teacher' : 'Open the board'}</span>
        </span>
        <UiIcon name="fullscreen" size={18} />
      </button>
    );
  return big ? createPortal(<div className="cd-overlay">{body}</div>, document.body) : body;
}

import { NSelect } from './Select';
import { useState } from 'react';
import { familyOf, LEVELS, ROLE_NAMES, type Audience, type Dist, type GroupSet } from '../lib/groups';
import { setTaskFlags, type Task } from '../lib/tasks';

type Person = { id: string; name: string };

// Task settings: who sees the task, its versions, and how the versions are given out.
export function TaskAudience({
  classId,
  itemId,
  task,
  tasks,
  sets,
  roster,
  onMakeVersion,
  onOpen,
  onOpenGroups,
}: {
  classId: string;
  itemId: string;
  task: Task;
  tasks: Task[];
  sets: GroupSet[];
  roster: Person[];
  onMakeVersion: (label: string) => void;
  onOpen: (id: string) => void;
  onOpenGroups: () => void;
}) {
  const fam = familyOf(tasks, task);
  const main = fam[0];
  const a: Audience = main.audience ?? { mode: 'all' };
  const d: Dist = main.dist ?? { mode: 'same', sameId: main.id };
  const setA = (next: Audience) => setTaskFlags(classId, itemId, main.id, { audience: next });
  const setD = (next: Partial<Dist>) => setTaskFlags(classId, itemId, main.id, { dist: { ...d, ...next } });
  const levels = fam.some((f) => f.variant && LEVELS.includes(f.variant));
  const [learnerOpen, setLearnerOpen] = useState(false);
  const firstSet = sets[0]?.id;
  const labelOf = (f: Task) => f.variant || 'A';
  const nextLabel = () => {
    if (levels) return LEVELS.find((l) => !fam.some((f) => f.variant === l)) ?? `Level ${fam.length + 1}`;
    return String.fromCharCode(65 + fam.length);
  };
  const versionPick = (value: string | undefined, onPick: (id: string) => void, label: string) => (
    <NSelect value={value ?? main.id} aria-label={label} onChange={(e) => onPick(e.target.value)}>
      {fam.map((f) => (
        <option key={f.id} value={f.id}>
          {levels || !/^[A-Z]$/.test(labelOf(f)) ? labelOf(f) : `Version ${labelOf(f)}`}
        </option>
      ))}
    </NSelect>
  );
  const setPick = (value: string | undefined, onPick: (id: string) => void) =>
    sets.length ? (
      <NSelect value={value ?? ''} aria-label="Group set" onChange={(e) => onPick(e.target.value)}>
        <option value="" disabled>
          Choose a group set
        </option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </NSelect>
    ) : (
      <button type="button" className="btn small-btn" onClick={onOpenGroups}>
        Make groups first
      </button>
    );
  const set = sets.find((s) => s.id === (a.mode === 'groups' ? a.groupSetId : d.groupSetId));
  const dSet = sets.find((s) => s.id === d.groupSetId);

  return (
    <div className="aud">
      <h2>Who sees this</h2>
      <span className="seg small-seg" role="radiogroup" aria-label="Who sees this">
        {(
          [
            ['all', 'Everyone'],
            ['groups', 'Groups'],
            ['learners', 'Learners'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={a.mode === k} className={a.mode === k ? 'on' : ''} onClick={() => setA(k === 'groups' ? { mode: k, groupSetId: a.groupSetId ?? firstSet, groupIds: a.groupIds ?? [] } : k === 'learners' ? { mode: k, learnerIds: a.learnerIds ?? [] } : { mode: 'all' })}>
            {label}
          </button>
        ))}
      </span>
      {a.mode === 'groups' && (
        <div className="aud-pick">
          {setPick(a.groupSetId, (id) => setA({ ...a, groupSetId: id, groupIds: [] }))}
          {set?.groups.map((g) => (
            <label key={g.id} className="pop-check">
              <input type="checkbox" checked={(a.groupIds ?? []).includes(g.id)} onChange={() => setA({ ...a, groupIds: (a.groupIds ?? []).includes(g.id) ? (a.groupIds ?? []).filter((x) => x !== g.id) : [...(a.groupIds ?? []), g.id] })} />
              {g.name} <span className="hint">{g.members.length}</span>
            </label>
          ))}
        </div>
      )}
      {a.mode === 'learners' && (
        <div className="aud-pick">
          <button type="button" className="btn link small" onClick={() => setLearnerOpen((v) => !v)}>
            {(a.learnerIds ?? []).length} of {roster.length} learners {learnerOpen ? '▴' : '▾'}
          </button>
          {learnerOpen &&
            roster.map((r) => (
              <label key={r.id} className="pop-check">
                <input type="checkbox" checked={(a.learnerIds ?? []).includes(r.id)} onChange={() => setA({ ...a, learnerIds: (a.learnerIds ?? []).includes(r.id) ? (a.learnerIds ?? []).filter((x) => x !== r.id) : [...(a.learnerIds ?? []), r.id] })} />
                {r.name}
              </label>
            ))}
        </div>
      )}
      {a.mode !== 'all' && <span className="hint">Other learners don’t see this task at all.</span>}

      <h2>Versions</h2>
      {fam.length > 1 ? (
        <div className="aud-versions">
          {fam.map((f) => (
            <span key={f.id} className={'aud-version' + (f.id === task.id ? ' on' : '')}>
              <button type="button" className="aud-v-open" onClick={() => onOpen(f.id)} title="Open this version">
                {levels || !/^[A-Z]$/.test(labelOf(f)) ? labelOf(f) : `Version ${labelOf(f)}`}
              </button>
            </span>
          ))}
          <button type="button" className="btn dashed small-btn" onClick={() => onMakeVersion(nextLabel())}>
            + Another version
          </button>
          <label className="aud-rename">
            <span className="hint">Name of the open version</span>
            <input key={task.id} className="aud-v-label" defaultValue={labelOf(task)} aria-label="Version name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== labelOf(task) && setTaskFlags(classId, itemId, task.id, { variant: e.target.value.trim() })} />
          </label>
        </div>
      ) : (
        <div className="aud-versions">
          <span className="hint">Learners always see one task here, with the same title.</span>
          <button type="button" className="btn small-btn" onClick={() => onMakeVersion('B')}>
            Make version B
          </button>
          <button type="button" className="btn small-btn" onClick={() => onMakeVersion('Challenge')} title="Makes this task Standard and adds a Challenge version. Add Easier next.">
            Make level versions
          </button>
        </div>
      )}

      {fam.length > 1 && (
        <>
          <h2>Give out versions</h2>
          <NSelect className="aud-mode" value={d.mode} aria-label="How versions are given out" onChange={(e) => setD({ mode: e.target.value as Dist['mode'], groupSetId: d.groupSetId ?? firstSet, roleMap: d.roleMap?.length ? d.roleMap : fam.map((f) => f.id) })}>
            <option value="same">Same for everyone</option>
            <option value="room">Per room</option>
            <option value="role">Per person in each room (role cards)</option>
            <option value="choose">Learners choose{levels ? ' their level' : ''}</option>
          </NSelect>
          {d.mode === 'same' && <div className="aud-pick">Everyone gets {versionPick(d.sameId, (id) => setD({ sameId: id }), 'Version for everyone')}</div>}
          {(d.mode === 'room' || d.mode === 'role') && <div className="aud-pick">{setPick(d.groupSetId, (id) => setD({ groupSetId: id, roomMap: {} }))}</div>}
          {d.mode === 'room' && dSet && (
            <div className="aud-map">
              {dSet.groups.map((g) => (
                <label key={g.id} className="aud-map-row">
                  <span>{g.name}</span>
                  {versionPick(d.roomMap?.[g.id], (id) => setD({ roomMap: { ...(d.roomMap ?? {}), [g.id]: id } }), g.name)}
                </label>
              ))}
            </div>
          )}
          {d.mode === 'role' && dSet && (
            <div className="aud-map">
              {(d.roleMap?.length ? d.roleMap : fam.map((f) => f.id)).map((tid, i, arr) => (
                <label key={i} className="aud-map-row">
                  <span>Learner {ROLE_NAMES[i]}</span>
                  {versionPick(tid, (id) => setD({ roleMap: arr.map((x, k) => (k === i ? id : x)) }), `Learner ${ROLE_NAMES[i]}`)}
                </label>
              ))}
              <span className="aud-roles">
                <button type="button" className="btn link small" disabled={(d.roleMap?.length ?? fam.length) >= ROLE_NAMES.length} onClick={() => setD({ roleMap: [...(d.roleMap?.length ? d.roleMap : fam.map((f) => f.id)), main.id] })}>
                  + Role
                </button>
                <button type="button" className="btn link small" disabled={(d.roleMap?.length ?? fam.length) <= 2} onClick={() => setD({ roleMap: (d.roleMap?.length ? d.roleMap : fam.map((f) => f.id)).slice(0, -1) })}>
                  − Role
                </button>
              </span>
              <span className="hint">Roles go in turn in each room. In a room with an extra learner, they get role A too. Change roles by dragging learners in Groups.</span>
            </div>
          )}
          {d.mode === 'choose' && (
            <label className="pop-check">
              <input type="checkbox" checked={d.canChange !== false} onChange={() => setD({ canChange: d.canChange === false })} />
              Learners can change after they start
            </label>
          )}
          {(d.mode === 'room' || d.mode === 'role') && <span className="hint">Learners who aren’t in a group get {levels ? labelOf(main) : `Version ${labelOf(main)}`}.</span>}
        </>
      )}
    </div>
  );
}

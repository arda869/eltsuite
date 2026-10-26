import { useEffect, useState } from 'react';
import { addGroupSet, autoGroups, averageScores, deleteGroupSet, groupsByScore, newGroup, saveGroupSet, ROLE_NAMES, type Group, type GroupSet } from '../lib/groups';

type Person = { id: string; name: string };

// Group sets for a class: make them at random, by level or by hand, and drag learners between rooms.
// Inside a room, the order gives each learner's role (A, B, C…) for role cards.
export function GroupsDialog({ classId, roster, sets, activeId, onActivate, onClose }: { classId: string; roster: Person[]; sets: GroupSet[]; activeId?: string | null; onActivate?: (id: string | null) => void; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(activeId ?? sets[0]?.id ?? null);
  const [making, setMaking] = useState(!sets.length);
  const set = sets.find((s) => s.id === sel);
  useEffect(() => {
    if (!sel && sets.length) setSel(sets[0].id);
  }, [sets, sel]);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog groups-dialog" role="dialog" aria-label="Groups" onClick={(e) => e.stopPropagation()}>
        <div className="gd-head">
          <h2 style={{ margin: 0 }}>Groups</h2>
          <span className="hint">Saved ways to split the class. Name rooms to match your Zoom breakout rooms.</span>
          <button type="button" className="icon-btn gd-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="gd-body">
          <nav className="gd-sets" aria-label="Group sets">
            {sets.map((s) => (
              <button key={s.id} type="button" className={'gd-set' + (s.id === sel && !making ? ' on' : '')} onClick={() => (setSel(s.id), setMaking(false))}>
                <span>{s.name}</span>
                <span className="hint">
                  {s.groups.length} {s.groups.length === 1 ? 'group' : 'groups'}
                  {s.id === activeId ? ' · in use' : ''}
                </span>
              </button>
            ))}
            <button type="button" className={'btn dashed' + (making ? ' on' : '')} onClick={() => setMaking(true)}>
              + New set
            </button>
          </nav>
          <div className="gd-main">
            {making ? (
              <NewSet
                classId={classId}
                roster={roster}
                count={sets.length}
                onMade={(id) => {
                  setSel(id);
                  setMaking(false);
                }}
              />
            ) : set ? (
              <SetEditor key={set.id} classId={classId} set={set} roster={roster} active={set.id === activeId} onActivate={onActivate} onDeleted={() => setSel(null)} />
            ) : (
              <p className="hint">Make a group set to start.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewSet({ classId, roster, count, onMade }: { classId: string; roster: Person[]; count: number; onMade: (id: string) => void }) {
  const [name, setName] = useState(count ? `Groups ${count + 1}` : 'Pairs');
  const [how, setHow] = useState<'pairs' | 'size' | 'level' | 'empty'>('pairs');
  const [size, setSize] = useState(3);
  const [n, setN] = useState(2);
  const [busy, setBusy] = useState(false);
  const ids = roster.map((r) => r.id);
  async function make() {
    setBusy(true);
    try {
      let groups: Group[];
      if (how === 'pairs') groups = autoGroups(ids, 2);
      else if (how === 'size') groups = autoGroups(ids, size);
      else if (how === 'level') groups = groupsByScore(ids, await averageScores(classId).catch(() => ({})), n);
      else groups = [newGroup(1), newGroup(2)];
      const ref = await addGroupSet(classId, { name: name.trim() || 'Groups', groups });
      onMade(ref.id);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gd-new">
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: BOR today" />
      </label>
      <div className="gd-how" role="radiogroup" aria-label="How to make the groups">
        {(
          [
            ['pairs', 'Random pairs', 'Odd numbers make one group of three.'],
            ['size', 'Random groups', ''],
            ['level', 'Level groups', 'Learners with similar scores work together.'],
            ['empty', 'I’ll put learners in groups', 'Start with two empty rooms and drag learners in.'],
          ] as const
        ).map(([k, label, hint]) => (
          <label key={k} className={'gd-opt' + (how === k ? ' on' : '')}>
            <input type="radio" name="how" checked={how === k} onChange={() => setHow(k)} />
            <span>
              <strong>{label}</strong>
              {k === 'size' && (
                <span className="hint">
                  of{' '}
                  <select value={size} onChange={(e) => setSize(Number(e.target.value))} onClick={() => setHow('size')}>
                    {[3, 4, 5, 6].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </span>
              )}
              {k === 'level' && (
                <span className="hint">
                  {' '}
                  <select value={n} onChange={(e) => setN(Number(e.target.value))} onClick={() => setHow('level')}>
                    {[2, 3, 4].map((x) => (
                      <option key={x} value={x}>
                        {x} groups
                      </option>
                    ))}
                  </select>
                </span>
              )}
              {hint && <span className="hint gd-opt-hint">{hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {!roster.length && <span className="hint">Add learners to the class first.</span>}
      <button type="button" className="btn primary" disabled={busy || (!roster.length && how !== 'empty')} onClick={make} style={{ alignSelf: 'flex-start' }}>
        Make the groups
      </button>
    </div>
  );
}

function SetEditor({ classId, set, roster, active, onActivate, onDeleted }: { classId: string; set: GroupSet; roster: Person[]; active: boolean; onActivate?: (id: string | null) => void; onDeleted: () => void }) {
  const [groups, setGroups] = useState<Group[]>(set.groups);
  const [drag, setDrag] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setGroups(set.groups), [set.groups]);
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name ?? 'Learner';
  const placed = new Set(groups.flatMap((g) => g.members));
  const loose = roster.filter((r) => !placed.has(r.id)).map((r) => r.id);
  const save = (next: Group[]) => {
    setGroups(next);
    saveGroupSet(classId, set.id, { groups: next }).catch((e) => console.error(e));
  };
  // Move a learner into a group (or out of all groups), before another learner if given.
  const move = (lid: string, to: string | null, before?: string) => {
    const next = groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== lid) }));
    if (to) {
      const g = next.find((x) => x.id === to)!;
      const at = before ? g.members.indexOf(before) : -1;
      if (at >= 0) g.members.splice(at, 0, lid);
      else g.members.push(lid);
    }
    save(next);
    setPicked(null);
  };
  const chip = (lid: string, gid: string | null, i: number) => (
    <button
      key={lid}
      type="button"
      draggable
      className={'gd-chip' + (picked === lid ? ' picked' : '') + (drag === lid ? ' dragging' : '')}
      onDragStart={(e) => {
        setDrag(lid);
        e.dataTransfer.setData('text/plain', lid);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => (setDrag(null), setOver(null))}
      onDragOver={(e) => gid && e.preventDefault()}
      onDrop={(e) => {
        if (!gid) return;
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData('text/plain');
        if (id && id !== lid) move(id, gid, lid);
        setOver(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setPicked(picked === lid ? null : lid);
      }}
      title="Drag to another group, or click and then click a group"
    >
      {gid && <span className="gd-role">{ROLE_NAMES[i % ROLE_NAMES.length]}</span>}
      {nameOf(lid)}
    </button>
  );
  const zone = (gid: string | null, children: React.ReactNode, cls: string) => (
    <div
      key={gid ?? 'loose'}
      className={cls + (over === (gid ?? 'loose') ? ' over' : '') + (picked ? ' can-drop' : '')}
      onDragOver={(e) => (e.preventDefault(), setOver(gid ?? 'loose'))}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) move(id, gid);
        setOver(null);
      }}
      onClick={() => picked && move(picked, gid)}
    >
      {children}
    </div>
  );

  return (
    <div className="gd-edit">
      <div className="gd-edit-head">
        <input className="gd-name" defaultValue={set.name} aria-label="Group set name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== set.name && saveGroupSet(classId, set.id, { name: e.target.value.trim() })} />
        {onActivate && (
          <button type="button" className={'btn small-btn' + (active ? ' on-accent' : '')} onClick={() => onActivate(active ? null : set.id)}>
            {active ? 'In use · stop' : 'Use in this lesson'}
          </button>
        )}
        <button type="button" className="btn small-btn" title="Mix the learners into new random groups of the same sizes" onClick={() => {
          const all = groups.flatMap((g) => g.members).sort(() => Math.random() - 0.5);
          let k = 0;
          save(groups.map((g) => ({ ...g, members: g.members.map(() => all[k++]) })));
        }}>
          Shuffle
        </button>
        <button type="button" className="btn link small" onClick={() => window.confirm(`Delete “${set.name}”?`) && deleteGroupSet(classId, set.id).then(onDeleted)}>
          Delete set
        </button>
      </div>
      <span className="hint">Drag learners between groups. The order in a group gives the roles for role cards (A, B, C…).</span>
      <div className="gd-groups">
        {groups.map((g) =>
          zone(
            g.id,
            <>
              <span className="gd-group-head">
                <input
                  className="gd-group-name"
                  defaultValue={g.name}
                  aria-label="Group name"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.name && save(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value.trim() } : x)))}
                />
                <span className="hint">{g.members.length}</span>
                <button type="button" className="icon-btn" aria-label="Remove group" onClick={(e) => (e.stopPropagation(), save(groups.filter((x) => x.id !== g.id)))}>
                  ×
                </button>
              </span>
              <span className="gd-members">
                {g.members.map((m, i) => chip(m, g.id, i))}
                {!g.members.length && <span className="hint gd-empty">Drop learners here</span>}
              </span>
            </>,
            'gd-group',
          ),
        )}
        <button type="button" className="gd-add" onClick={() => save([...groups, newGroup(groups.length + 1)])}>
          + Group
        </button>
      </div>
      {zone(
        null,
        <>
          <span className="eyebrow">Not in a group · {loose.length}</span>
          <span className="gd-members">{loose.length ? loose.map((m, i) => chip(m, null, i)) : <span className="hint">Everyone is in a group.</span>}</span>
        </>,
        'gd-loose',
      )}
    </div>
  );
}

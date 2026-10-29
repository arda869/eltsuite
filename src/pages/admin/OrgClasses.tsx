import { copyText } from '../../lib/copyText';
import { useEffect, useState } from 'react';
import { LimitError } from '../../lib/limitError';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MultiSelect, Select } from '../../components/Select';
import { UiIcon } from '../../components/UiIcon';
import { LearnersTab } from '../../components/LearnersTab';
import type { Learner } from '../../lib/learners';
import { createClass, type ClassDoc } from '../../lib/classes';
import { classDefaults, levelsFor, type OrgClass } from '../../lib/admin';
import { BulkBar, Check, Empty, PageHead, Pills, Search, Sheet, Who, dateStr, millis, plural, useNote, useSelection } from './ui';
import { classEnded } from './attention';
import { saveOrgWorkbook } from './sheets';
import type { Go, OrgData } from './types';

const fmtDay = (s?: string | null) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function OrgClasses({ d, params, go }: { d: OrgData; params: URLSearchParams; go: Go }) {
  const { org, classes, pics } = d;
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [level, setLevel] = useState('');
  const [toast, say] = useNote();
  const f = params.get('f') || 'active';
  const open = params.get('c') || '';
  const making = params.get('new') === '1';
  const cur = classes.find((c) => c.id === open);
  const nameOf = (uid: string) => org.teachers[uid]?.name || org.teachers[uid]?.email || 'A teacher';
  const FILTERS: Record<string, (c: OrgClass) => boolean> = {
    active: (c) => c.status === 'active',
    empty: (c) => c.status === 'active' && !c.learnerCount,
    ended: classEnded,
    training: (c) => c.status === 'active' && c.kind === 'training',
    archived: (c) => c.status === 'archived',
    all: () => true,
  };
  const pills = [
    { v: 'active', label: 'Active' },
    { v: 'empty', label: 'Without learners' },
    { v: 'ended', label: 'Past their finish date' },
    ...(classes.some((c) => c.kind === 'training') ? [{ v: 'training', label: 'Teacher training' }] : []),
    { v: 'archived', label: 'Archived' },
    { v: 'all', label: 'All' },
  ].map((p) => ({ ...p, n: classes.filter(FILTERS[p.v]).length }));
  const s = q.trim().toLowerCase();
  const shown = classes.filter((c) => (FILTERS[f] ?? FILTERS.active)(c) && (!who || c.teacherId === who || c.coTeachers?.[who]?.role === 'co') && (!level || c.level === level) && (!s || `${c.name} ${c.classCode} ${nameOf(c.teacherId)} ${c.level}`.toLowerCase().includes(s)));
  const sel = useSelection(shown.map((c) => c.id));
  const chosen = classes.filter((c) => sel.has(c.id));
  const levels = [...new Set(classes.map((c) => c.level).filter(Boolean))].sort();
  const teacherOpts = Object.entries(org.teachers).filter(([uid]) => classes.some((c) => c.teacherId === uid || c.coTeachers?.[uid])).map(([uid, t]) => ({ v: uid, label: t.name || t.email }));
  if (cur) return <ClassView d={d} c={cur} onBack={() => go({ tab: 'classes', f: f === 'active' ? '' : f })} />;
  const copyCodes = () => {
    const txt = chosen.map((c) => `${c.name}: ${c.classCode}`).join('\n');
    void copyText(txt).then(() => say(`${plural(chosen.length, 'class code')} copied.`));
  };
  return (
    <div className="hq-page">
      <PageHead
        title="Classes"
        lede={org.policy?.createClasses === false ? `Your teachers don’t make their own classes. You make them here, for them.` : `Your teachers make their own classes. You can also make one for a teacher here.`}
        actions={
          <>
            <button type="button" className="btn" disabled={!classes.length} onClick={() => void saveOrgWorkbook(org, classes, d.accounts, d.invites, 'classes')}>
              <UiIcon name="export" size={15} /> Export
            </button>
            <button type="button" className="btn primary" onClick={() => go({ tab: 'classes', f: f === 'active' ? '' : f, new: '1' })}>
              <UiIcon name="plus" size={15} /> New class
            </button>
          </>
        }
      />
      <div className="hq-tools">
        <Search value={q} onChange={setQ} placeholder="Search by class, teacher or class code" label="Search classes" />
        <div className="hq-tools-r">
          {teacherOpts.length > 1 && <Select value={who} options={[{ v: '', label: 'Every teacher' }, ...teacherOpts]} onChange={setWho} label="Teacher" search />}
          {levels.length > 1 && <Select value={level} options={[{ v: '', label: 'Every level' }, ...levels.map((l) => ({ v: l, label: l }))]} onChange={setLevel} label="Level" />}
        </div>
        <Pills value={f} options={pills} onChange={(v) => go({ tab: 'classes', f: v === 'active' ? '' : v, replace: true })} label="Show" />
      </div>
      {d.loading ? (
        <p className="hint">Opening the classes…</p>
      ) : !classes.length ? (
        <Empty title="No classes yet" text={org.policy?.createClasses === false ? 'Make the first class for one of your teachers.' : 'Classes your teachers make show here, with their learners.'} action={<button type="button" className="btn primary" onClick={() => go({ tab: 'classes', new: '1' })}>New class</button>} />
      ) : !shown.length ? (
        <Empty title="No class here" text="No class matches. Try another filter or search." action={<button type="button" className="btn" onClick={() => (setQ(''), setWho(''), setLevel(''), go({ tab: 'classes', replace: true }))}>Show active classes</button>} />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th className="hq-c-check">
                  <Check checked={sel.every} mixed={sel.some && !sel.every} onChange={sel.all} label="Select every class shown" />
                </th>
                <th>Class</th>
                <th>Teacher</th>
                <th>Level</th>
                <th className="hq-n">Learners</th>
                <th>Dates</th>
                <th className="hq-c-go">
                  <span className="hq-sr">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const cos = Object.entries(c.coTeachers ?? {}).filter(([, x]) => x.role === 'co');
                return (
                  <tr key={c.id} className={sel.has(c.id) ? 'hq-picked' : ''} onClick={() => go({ tab: 'classes', f: f === 'active' ? '' : f, c: c.id })}>
                    <td className="hq-c-check" data-label="">
                      <Check checked={sel.has(c.id)} onChange={(v) => sel.toggle(c.id, v)} label={`Select ${c.name}`} />
                    </td>
                    <td data-label="Class">
                      <button type="button" className="hq-row-open hq-cname" onClick={(e) => (e.stopPropagation(), go({ tab: 'classes', f: f === 'active' ? '' : f, c: c.id }))}>
                        <b>{c.name}</b>
                        <span>Class code {c.classCode}</span>
                      </button>
                      <span className="hq-roles">
                        {c.status === 'archived' && <span className="hq-chip">Archived</span>}
                        {c.kind === 'training' && <span className="hq-chip">Teacher training</span>}
                        {classEnded(c) && <span className="hq-chip late">Finished {fmtDay(c.dates?.end)}</span>}
                      </span>
                    </td>
                    <td data-label="Teacher">
                      <Who name={nameOf(c.teacherId)} sub={cos.length ? `with ${cos.map(([, x]) => x.name).join(', ')}` : undefined} pic={pics[c.teacherId]} size={28} />
                    </td>
                    <td data-label="Level">{c.level}</td>
                    <td className="hq-n" data-label="Learners">
                      {c.learnerCount ? c.learnerCount : <span className="hq-late">None</span>}
                    </td>
                    <td data-label="Dates">{c.dates?.start || c.dates?.end ? <span className="hq-quiet">{[fmtDay(c.dates?.start), fmtDay(c.dates?.end)].filter(Boolean).join(' to ')}</span> : <span className="hq-quiet">Not set</span>}</td>
                    <td className="hq-c-go" aria-hidden="true">
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar n={chosen.length} what={['class', 'classes']} onClear={sel.clear}>
        <button type="button" className="btn small-btn" onClick={copyCodes}>
          Copy class codes
        </button>
        <button type="button" className="btn small-btn" onClick={() => void saveOrgWorkbook(org, classes, d.accounts, d.invites, 'classes', chosen.map((c) => c.id))}>
          Export
        </button>
      </BulkBar>
      {making && <NewClass d={d} onClose={() => go({ tab: 'classes', f: f === 'active' ? '' : f, replace: true })} onMade={(m, id) => (say(m), go({ tab: 'classes', c: id, replace: true }))} />}
      {toast}
    </div>
  );
}

function NewClass({ d, onClose, onMade }: { d: OrgData; onClose: () => void; onMade: (m: string, id: string) => void }) {
  const { org } = d;
  const training = !!org.allow?.trainers;
  const [kind, setKind] = useState<'language' | 'training'>('language');
  const [who, setWho] = useState('');
  const [co, setCo] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [level, setLevel] = useState(levelsFor(org).includes('B1') ? 'B1' : levelsFor(org)[0]);
  const [course, setCourse] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const teachers = Object.entries(org.teachers).filter(([, t]) => kind === 'language' || t.trainer);
  const make = async () => {
    if (!who || !name.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const cos = co.filter((u) => u !== who);
      const id = await createClass(who, {
        name: name.trim(),
        level: kind === 'training' ? course.trim() || 'Teacher training' : level,
        themeColor: 'flame',
        kind,
        org: org.id,
        extra: {
          ...classDefaults(org.policy),
          ...(start || end ? { dates: { start: start || null, end: end || null } } : {}),
          // Co-teachers teach it with the owner from the start: no invitation to answer.
          ...(cos.length ? { coTeachers: Object.fromEntries(cos.map((u) => [u, { role: 'co', email: org.teachers[u]?.email ?? '', name: org.teachers[u]?.name || org.teachers[u]?.email || 'Teacher' }])), teacherIds: cos } : {}),
        },
      });
      onMade(`${name.trim()} is ready for ${[who, ...cos].map((u) => org.teachers[u]?.name || 'a teacher').join(' and ')}.`, String(id ?? ''));
    } catch (e) {
      console.error(e);
      setErr(e instanceof LimitError ? e.message : 'We couldn’t make the class. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="New class" onClose={onClose} wide>
      {training && (
        <span className="seg hq-seg" role="radiogroup" aria-label="What kind of class">
          {(
            [
              ['language', 'A language class'],
              ['training', 'Teacher training'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => (setKind(k), setWho(''))}>
              {l}
            </button>
          ))}
        </span>
      )}
      <div className="hq-form">
        <label className="field">
          <span>Class name</span>
          <input className="hq-in" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'training' ? 'For example: CELTA October' : 'For example: Monday B1 evening'} maxLength={80} />
        </label>
        <div className="field">
          <span>{kind === 'training' ? 'Teacher trainer' : 'Teacher'}</span>
          <Select value={who} search options={teachers.map(([uid, t]) => ({ v: uid, label: t.name || t.email, hint: t.title }))} onChange={setWho} label={kind === 'training' ? 'Teacher trainer' : 'Teacher'} placeholder="Choose…" />
        </div>
        <div className="field">
          <span>Co-teachers</span>
          <MultiSelect value={co.filter((u) => u !== who)} options={Object.entries(org.teachers).filter(([u]) => u !== who).map(([uid, t]) => ({ v: uid, label: t.name || t.email }))} onChange={setCo} label="Co-teachers" none="Nobody else" foot="Co-teachers can do everything the teacher can, including teaching live." />
        </div>
        {kind === 'language' ? (
          <div className="field">
            <span>Level</span>
            <Select value={level} options={levelsFor(org).map((l) => ({ v: l, label: l }))} onChange={setLevel} label="Level" />
          </div>
        ) : (
          <label className="field">
            <span>Course</span>
            <input className="hq-in" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="CELTA, Delta, in-service" maxLength={60} />
          </label>
        )}
        <label className="field">
          <span>Starts</span>
          <input className="hq-in" type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Finishes</span>
          <input className="hq-in" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {kind === 'training' && !teachers.length && <p className="hint">Make a teacher a teacher trainer in Teachers first.</p>}
      {err && <p className="error">{err}</p>}
      <div className="hq-sheet-f">
        <span className="hint">The class starts with your rules for learners' emails and names.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!who || !name.trim() || busy} onClick={() => void make()}>
          Make the class
        </button>
      </div>
    </Sheet>
  );
}

// One class: who teaches it, and its learners, whom admins can add, and print sign-in cards for.
function ClassView({ d, c, onBack }: { d: OrgData; c: OrgClass; onBack: () => void }) {
  const { org } = d;
  const [learners, setLearners] = useState<Learner[]>([]);
  const [secrets, setSecrets] = useState<{ id: string; pin?: string; own?: boolean; kind?: string }[]>([]);
  useEffect(() => {
    const a = onSnapshot(collection(db, 'classes', c.id, 'learners'), (s) => setLearners(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Learner, 'id'>) }))), () => setLearners([]));
    const b = onSnapshot(collection(db, 'classes', c.id, 'secrets'), (s) => setSecrets(s.docs.map((x) => ({ id: x.id, ...(x.data() as { pin?: string; own?: boolean; kind?: string }) }))), () => setSecrets([]));
    return () => (a(), b());
  }, [c.id]);
  const pins = Object.fromEntries(secrets.filter((s) => !s.own).map((s) => [s.id, s.pin ?? '']));
  const own = Object.fromEntries(secrets.filter((s) => s.own).map((s) => [s.id, s.kind === 'password' ? 'password' : 'PIN']));
  const teacher = org.teachers[c.teacherId];
  const cos = Object.values(c.coTeachers ?? {}).filter((x) => x.role === 'co');
  const facts: [string, string][] = [
    ['Teacher', teacher?.name || teacher?.email || 'A teacher'],
    ...(cos.length ? ([['Co-teachers', cos.map((x) => x.name).join(', ')]] as [string, string][]) : []),
    [c.kind === 'training' ? 'Course' : 'Level', c.level],
    ['Class code', c.classCode],
    ['Learners', String(c.learnerCount ?? learners.length)],
    ['Dates', [fmtDay(c.dates?.start), fmtDay(c.dates?.end)].filter(Boolean).join(' to ') || 'Not set'],
    ['Created', dateStr(millis(c.createdAt)) || 'Not known'],
    ['Status', c.status === 'archived' ? 'Archived' : classEnded(c) ? 'Past its finish date' : 'Active'],
  ];
  return (
    <div className="hq-page">
      <PageHead
        crumb={
          <button type="button" className="hq-crumb-b" onClick={onBack}>
            ‹ Classes
          </button>
        }
        title={c.name}
        lede="You can add learners, give new PINs and print their sign-in cards. Lessons and answers stay with the teacher."
      />
      <dl className="hq-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="hq-learners">
        <LearnersTab c={c as unknown as ClassDoc} learners={learners} pins={pins} own={own} manage />
      </div>
    </div>
  );
}

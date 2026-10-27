import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { FolderIcon } from '../../components/FileIcon';
import { UiIcon } from '../../components/UiIcon';
import { ask } from '../../lib/ask';
import { DRIVE_ROLES, driveUse, libName, newDriveFolder, roleFor, saveDriveAccess, saveDrives, saveOrg, syncDrive, type DriveAccess, type DriveFolder, type DriveRole, type Org } from '../../lib/admin';
import { Empty, GbInput, PageHead, Panel, fmtBytes, plural } from './ui';
import type { OrgData } from './types';

// ------------------------------------------------------------------ the organisation library
// Sections hold folders; each says who can edit, comment, view or not see it: everyone, teachers
// with a tag, or one teacher. A folder follows its section unless it has its own say.
type Drive = { name: string; quotaGb: number; access?: DriveAccess };

export function OrgDrives({ d }: { d: OrgData }) {
  const { org, folders, me } = d;
  const drives = useMemo(() => ({ main: { name: 'General', quotaGb: 5 }, ...(org.drives ?? {}) }) as Record<string, Drive>, [org.drives]);
  const [newDrive, setNewDrive] = useState<string | null>(null);
  const [open, setOpen] = useState('');
  const [use, setUse] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const k of Object.keys(drives)) void driveUse(folders.filter((f) => (f.drive ?? 'main') === k).map((f) => f.id)).then((n) => setUse((u) => ({ ...u, [k]: n })));
  }, [folders, drives]);
  // Who is in each folder follows the teachers, their tags and the sections' settings.
  const sig = JSON.stringify([org.teachers, org.drives]);
  useEffect(() => {
    if (folders.length) void syncDrive(org, folders);
  }, [sig, folders.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveDrive = (k: string, x: Drive, what: string) => void saveDrives(org, { ...drives, [k]: x }).then(() => d.note('Changed the library', what));
  const addDrive = () => {
    const n = newDrive?.trim();
    if (!n) return;
    const id = 'd' + Date.now().toString(36);
    void saveDrives(org, { ...drives, [id]: { name: n, quotaGb: 5, access: { all: 'view', tags: {}, people: {} } } }).then(() => (setNewDrive(null), d.note('Added a library section', n)));
  };
  return (
    <div className="hq-page">
      <PageHead
        title="Library"
        lede={
          <>
            Lessons and files for the whole of {org.name}, which teachers copy into their classes. Add them in the{' '}
            <a href="/library">{libName(org)}</a> app; here you decide who sees what.
          </>
        }
      />
      <Panel title="Name">
        <LibNameRow d={d} />
      </Panel>
      {Object.entries(drives).map(([k, x]) => {
        const list = folders.filter((f) => (f.drive ?? 'main') === k);
        const access = x.access ?? { all: 'view', tags: {}, people: {} };
        const usedGb = (use[k] ?? 0) / 1024 ** 3;
        return (
          <section key={k} className="hq-panel lib-sec">
            <header className="lib-sec-h">
              <span className="lib-sec-ic" aria-hidden="true">
                <UiIcon name="archive" size={18} />
              </span>
              <DriveName value={x.name} onSave={(name) => saveDrive(k, { ...x, name }, `Renamed a section: ${name}`)} />
              <span style={{ flex: 1 }} />
              <span className="hq-libspace">
                <span className="hq-meter small" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (usedGb / Math.max(0.1, x.quotaGb)) * 100)}%` }} />
                </span>
                <span className="hint">{fmtBytes(use[k] ?? 0)} of</span>
                <GbInput value={x.quotaGb} onSave={(gb) => saveDrive(k, { ...x, quotaGb: gb }, `${x.name}: ${gb} GB`)} max={org.limitGb} label={`Space for ${x.name} in GB`} />
              </span>
            </header>
            <div className="lib-block">
              <h3>Who can see this section</h3>
              <AccessEditor org={org} access={access} onSave={(a) => saveDrive(k, { ...x, access: a }, `Who can see ${x.name}`)} />
            </div>
            <div className="lib-block">
              <h3>Folders</h3>
              {list.length ? (
                <div className="lib-folders">
                  {list.map((f) => (
                    <DriveFolderRow key={f.id} d={d} f={f} driveAccess={access} open={open === f.id} onToggle={() => setOpen(open === f.id ? '' : f.id)} />
                  ))}
                </div>
              ) : (
                <p className="hint">No folders yet. Add one, then put lessons in it from the {libName(org)} app.</p>
              )}
              <NewFolder onMake={(name) => void newDriveFolder({ ...org, drives }, { uid: me.uid }, name, 'drive', k).then(() => d.note('Added a library folder', `${name}, in ${x.name}`))} />
            </div>
          </section>
        );
      })}
      {newDrive === null ? (
        <button type="button" className="btn hq-addsec" onClick={() => setNewDrive('')}>
          <UiIcon name="plus" size={14} /> Add another section
        </button>
      ) : (
        <div className="hq-addrow">
          <input className="hq-in" autoFocus value={newDrive} onChange={(e) => setNewDrive(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? addDrive() : e.key === 'Escape' && setNewDrive(null))} placeholder="Name, for example: Exams team" aria-label="Name of the section" />
          <button type="button" className="btn primary" disabled={!newDrive.trim()} onClick={addDrive}>
            Add section
          </button>
          <button type="button" className="btn link small" onClick={() => setNewDrive(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// What the library is called in the apps menu and at the top of its pages.
function LibNameRow({ d }: { d: OrgData }) {
  const { org } = d;
  const [v, setV] = useState(org.libraryName ?? '');
  return (
    <div className="hq-set">
      <span className="hq-set-t">
        <b>What teachers see in the apps menu</b>
        <span>Leave it empty for “{org.name} library”.</span>
      </span>
      <span className="hq-set-c">
        <input className="hq-in" value={v} placeholder={`${org.name} library`} maxLength={40} aria-label="Name of the library" onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== (org.libraryName ?? '') && void saveOrg(org.id, { libraryName: v.trim() }).then(() => d.note('Renamed the library', v.trim() || `${org.name} library`))} />
      </span>
    </div>
  );
}

const ROLE_WORD: Record<DriveRole, string> = { edit: 'can edit', comment: 'can comment', view: 'can view', none: 'cannot see it' };
// Who can do what, as a few plain rows: everyone, then any tag or teacher who differs.
function AccessEditor({ org, access, onSave, inherit }: { org: Org; access: DriveAccess; onSave: (a: DriveAccess) => void; inherit?: { on: boolean; set: (on: boolean) => void } }) {
  const [adding, setAdding] = useState<'' | 'tag' | 'person'>('');
  const tags = Object.entries(org.tags ?? {});
  const people = Object.entries(org.teachers);
  const tagRows = Object.entries(access.tags ?? {}).filter(([id]) => org.tags?.[id]);
  const personRows = Object.entries(access.people ?? {}).filter(([uid]) => org.teachers[uid]);
  const counts = people.reduce<Record<DriveRole, number>>((m, [uid, t]) => ((m[roleFor(access, uid, t.tags)] += 1), m), { edit: 0, comment: 0, view: 0, none: 0 });
  const summary = (Object.keys(counts) as DriveRole[]).filter((r) => counts[r]).map((r) => `${counts[r]} ${ROLE_WORD[r]}`).join(', ');
  if (inherit?.on)
    return (
      <div className="lib-access">
        <span className="lib-follow">
          <span>Same as its section</span>
          <button type="button" className="btn link small" onClick={() => inherit.set(false)}>
            Set it on its own
          </button>
        </span>
      </div>
    );
  const setTag = (id: string, v: DriveRole | '') => {
    const n = { ...(access.tags ?? {}) };
    if (v) n[id] = v;
    else delete n[id];
    onSave({ ...access, tags: n });
  };
  const setPerson = (uid: string, v: DriveRole | '') => {
    const n = { ...(access.people ?? {}) };
    if (v) n[uid] = v;
    else delete n[uid];
    onSave({ ...access, people: n });
  };
  return (
    <div className="lib-access">
      <span className="lib-rule">
        <span className="lib-who">
          <UiIcon name="groups" size={15} /> Everyone in {org.name}
        </span>
        <Select value={access.all} options={DRIVE_ROLES} onChange={(v) => onSave({ ...access, all: v })} label="Everyone" />
      </span>
      {tagRows.map(([id, r]) => (
        <span key={id} className="lib-rule">
          <span className="lib-who">
            <span className="hq-tag">{org.tags?.[id]?.name}</span> teachers
          </span>
          <Select value={r} options={DRIVE_ROLES} onChange={(v) => setTag(id, v)} label={`Teachers tagged ${org.tags?.[id]?.name}`} />
          <button type="button" className="lib-x" aria-label="Back to everyone's setting" onClick={() => setTag(id, '')}>
            ×
          </button>
        </span>
      ))}
      {personRows.map(([uid, r]) => (
        <span key={uid} className="lib-rule">
          <span className="lib-who">
            <UiIcon name="person" size={15} /> {org.teachers[uid].name || org.teachers[uid].email}
          </span>
          <Select value={r} options={DRIVE_ROLES} onChange={(v) => setPerson(uid, v)} label={org.teachers[uid].name || org.teachers[uid].email} />
          <button type="button" className="lib-x" aria-label="Back to their tags and everyone's setting" onClick={() => setPerson(uid, '')}>
            ×
          </button>
        </span>
      ))}
      {adding === 'tag' && (
        <span className="lib-rule">
          <Select value="" placeholder="Choose a tag…" options={tags.filter(([id]) => !access.tags?.[id]).map(([id, t]) => ({ v: id, label: t.name }))} onChange={(v) => (setTag(v, access.all === 'edit' ? 'view' : 'edit'), setAdding(''))} label="Tag" />
          <button type="button" className="btn link small" onClick={() => setAdding('')}>
            Cancel
          </button>
        </span>
      )}
      {adding === 'person' && (
        <span className="lib-rule">
          <Select value="" placeholder="Choose a teacher…" options={people.filter(([uid]) => !access.people?.[uid]).map(([uid, t]) => ({ v: uid, label: t.name || t.email, hint: t.email }))} onChange={(v) => (setPerson(v, access.all === 'edit' ? 'view' : 'edit'), setAdding(''))} label="Teacher" />
          <button type="button" className="btn link small" onClick={() => setAdding('')}>
            Cancel
          </button>
        </span>
      )}
      <span className="lib-adds">
        {tags.length > 0 && tagRows.length < tags.length && (
          <button type="button" className="btn small-btn" onClick={() => setAdding('tag')}>
            + A different setting for a tag
          </button>
        )}
        <button type="button" className="btn small-btn" onClick={() => setAdding('person')}>
          + A different setting for one teacher
        </button>
        {inherit && (
          <button type="button" className="btn link small" onClick={() => inherit.set(true)}>
            Same as its section again
          </button>
        )}
      </span>
      <span className="hint lib-sum">
        {summary ? `So: ${summary}.` : ''}
        {!tags.length ? ' Tags in Teachers set a whole group at once.' : ''}
      </span>
    </div>
  );
}

function DriveName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input className="hq-drivename" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} aria-label="Name of the section" />;
}

function NewFolder({ onMake }: { onMake: (name: string) => void }) {
  const [name, setName] = useState<string | null>(null);
  const go = () => name?.trim() && (onMake(name.trim()), setName(null));
  return name === null ? (
    <button type="button" className="btn small-btn lib-newf" onClick={() => setName('')}>
      <UiIcon name="plus" size={13} /> New folder
    </button>
  ) : (
    <div className="hq-addrow">
      <input className="hq-in" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? go() : e.key === 'Escape' && setName(null))} placeholder="Folder name, for example: Exam papers" aria-label="Folder name" />
      <button type="button" className="btn small-btn primary" disabled={!name.trim()} onClick={go}>
        Add folder
      </button>
      <button type="button" className="btn link small" onClick={() => setName(null)}>
        Cancel
      </button>
    </div>
  );
}

function DriveFolderRow({ d, f, driveAccess, open, onToggle }: { d: OrgData; f: DriveFolder; driveAccess: DriveAccess; open: boolean; onToggle: () => void }) {
  const { org, me } = d;
  const own = !!f.own;
  const access = own ? f.access : driveAccess;
  return (
    <div className={'lib-folder' + (open ? ' open' : '')}>
      <span className="lib-folder-h">
        <FolderIcon size={20} />
        <b>{f.name}</b>
        <span className={'lib-pill' + (own ? ' own' : '')}>{own ? 'Its own settings' : 'Same as the section'}</span>
        <span className="hint">{plural(f.memberIds.length, 'teacher')} can see it</span>
        <span style={{ flex: 1 }} />
        <a className="btn link small" href={`/library?f=${f.id}`}>
          Open
        </a>
        <button type="button" className="btn small-btn" aria-expanded={open} onClick={onToggle}>
          {open ? 'Done' : 'Who can see it'}
        </button>
      </span>
      {open && (
        <div className="lib-folder-b">
          <AccessEditor
            org={org}
            access={access}
            onSave={(a) => void saveDriveAccess(org, f, { uid: me.uid }, { tags: {}, ...a }, true).then(() => d.note('Changed who can see a folder', f.name))}
            inherit={{ on: !own, set: (on) => void saveDriveAccess(org, f, { uid: me.uid }, on ? driveAccess : { tags: {}, ...driveAccess }, !on).then(() => d.note(on ? 'Set a folder to follow its section' : 'Gave a folder its own settings', f.name)) }}
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ teacher training forms
// The organisation's own forms: observation, feedback, planning. Trainers add them to lessons from
// "Your organisation's forms"; each lesson keeps a copy of the form as it was.
type FForm = NonNullable<Org['ttForms']>[string];
type FField = FForm['fields'][number];
const FIELD_KINDS: { v: FField['kind']; label: string }[] = [
  { v: 'short', label: 'Short answer' },
  { v: 'long', label: 'Long answer' },
  { v: 'rating', label: 'Rating: not yet, achieved, strong' },
  { v: 'check', label: 'Tick box' },
];
const STARTERS: Record<string, { name: string; about: string; fields: [string, FField['kind']][] }> = {
  observe: { name: 'Observation form', about: 'For observed lessons', fields: [['Lesson aims were clear', 'rating'], ['Instructions and checking', 'rating'], ['Learner talking time', 'rating'], ['Strengths', 'long'], ['Action points', 'long']] },
  feedback: { name: 'Feedback after teaching practice', about: 'The trainee reflects, then the trainer adds', fields: [['What went well', 'long'], ['What I would change', 'long'], ['Trainer comments', 'long'], ['Ready for the next stage', 'check']] },
  blank: { name: 'New form', about: '', fields: [['Question', 'short']] },
};
export function OrgForms({ d }: { d: OrgData }) {
  const { org } = d;
  const forms = Object.values(org.ttForms ?? {});
  const [open, setOpen] = useState(forms[0]?.id ?? '');
  const save = (f: FForm) => void saveOrg(org.id, { ttForms: { ...(org.ttForms ?? {}), [f.id]: f } });
  const add = (k: string) => {
    const st = STARTERS[k];
    const id = 'f' + Date.now().toString(36);
    save({ id, name: st.name, about: st.about, fields: st.fields.map(([label, kind], i) => ({ id: 'q' + i + Date.now().toString(36).slice(-3), label, kind })) });
    d.note('Added a training form', st.name);
    setOpen(id);
  };
  const remove = async (f: FForm) => {
    if (!(await ask(`Delete “${f.name}”? Lessons that already use it keep their copy.`, { ok: 'Delete' }))) return;
    const next = { ...(org.ttForms ?? {}) };
    delete next[f.id];
    await saveOrg(org.id, { ttForms: next });
    d.note('Deleted a training form', f.name);
  };
  const starters = (
    <span className="lib-adds">
      <button type="button" className="btn small-btn" onClick={() => add('observe')}>
        + Observation form
      </button>
      <button type="button" className="btn small-btn" onClick={() => add('feedback')}>
        + Feedback form
      </button>
      <button type="button" className="btn small-btn" onClick={() => add('blank')}>
        + Blank form
      </button>
    </span>
  );
  return (
    <div className="hq-page">
      <PageHead title="Training forms" lede="What trainers observe and how trainees reflect. Trainers add these to lessons from “Your organisation’s forms” in the Insert list. Changes apply to new copies; lessons keep the form they have." actions={forms.length ? starters : undefined} />
      {!forms.length ? (
        <Empty title="No forms yet" text="Start from an observation form, a feedback form or a blank one, then change the questions." action={starters} />
      ) : (
        forms.map((f) => (
          <section key={f.id} className={'hq-panel hq-form-card' + (open === f.id ? ' open' : '')}>
            <header className="hq-panel-h">
              <h2>{f.name}</h2>
              <span className="hint">
                {plural(f.fields.length, 'question')}
                {f.about ? `, ${f.about.toLowerCase()}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn small-btn" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? '' : f.id)}>
                {open === f.id ? 'Done' : 'Edit'}
              </button>
            </header>
            {open === f.id && <FormEditor f={f} onSave={save} onDelete={() => void remove(f)} />}
          </section>
        ))
      )}
    </div>
  );
}

function FormEditor({ f, onSave, onDelete }: { f: FForm; onSave: (f: FForm) => void; onDelete: () => void }) {
  const [x, setX] = useState(f);
  useEffect(() => setX(f), [f]);
  const put = (n: FForm) => (setX(n), onSave(n));
  const field = (i: number, p: Partial<FField>) => put({ ...x, fields: x.fields.map((y, j) => (j === i ? { ...y, ...p } : y)) });
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= x.fields.length) return;
    const fs = [...x.fields];
    [fs[i], fs[j]] = [fs[j], fs[i]];
    put({ ...x, fields: fs });
  };
  return (
    <div className="hq-ff">
      <div className="hq-form hq-two">
        <label className="field">
          <span>Name</span>
          <input className="hq-in" defaultValue={x.name} onBlur={(e) => e.target.value.trim() && e.target.value !== x.name && put({ ...x, name: e.target.value.trim().slice(0, 60) })} />
        </label>
        <label className="field">
          <span>What it is for</span>
          <input className="hq-in" defaultValue={x.about ?? ''} placeholder="For example: CELTA teaching practice" onBlur={(e) => e.target.value !== (x.about ?? '') && put({ ...x, about: e.target.value.trim().slice(0, 100) })} />
        </label>
      </div>
      <h3 className="hq-sub">Questions</h3>
      <ol className="hq-ff-list">
        {x.fields.map((y, i) => (
          <li key={y.id} className="hq-ff-row">
            <input className="hq-in" defaultValue={y.label} aria-label={`Question ${i + 1}`} onBlur={(e) => e.target.value.trim() && e.target.value !== y.label && field(i, { label: e.target.value.trim().slice(0, 120) })} />
            <Select value={y.kind} options={FIELD_KINDS} onChange={(v) => field(i, { kind: v })} label={`Answer for question ${i + 1}`} />
            <button type="button" className="lib-x" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="lib-x" aria-label={`Move question ${i + 1} down`} disabled={i === x.fields.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="lib-x" aria-label={`Remove question ${i + 1}`} onClick={() => put({ ...x, fields: x.fields.filter((_, j) => j !== i) })}>
              ×
            </button>
          </li>
        ))}
      </ol>
      <span className="lib-adds">
        <button type="button" className="btn small-btn" onClick={() => put({ ...x, fields: [...x.fields, { id: 'q' + Date.now().toString(36), label: 'New question', kind: 'short' }] })}>
          + Question
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn small-btn danger" onClick={onDelete}>
          Delete the form
        </button>
      </span>
    </div>
  );
}


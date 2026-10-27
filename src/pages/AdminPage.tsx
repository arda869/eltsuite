import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { MultiSelect, Select } from '../components/Select';
import { PROFILE_ICONS, ProfileIcon } from '../components/ProfileIcons';
import { ask } from '../lib/ask';
import { createClass, type ClassDoc } from '../lib/classes';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LearnersTab } from '../components/LearnersTab';
import type { Learner } from '../lib/learners';
import { formatBytes } from '../lib/archive';
import { SfxSettings } from '../components/SfxSettings';
import { SoundRecordings } from '../components/SoundRecordings';
import {
  APP_KEYS,
  PLANS,
  addOrgAdmin,
  classCount,
  driveUse,
  isOwnerEmail,
  newDriveFolder,
  newOrg,
  removeOrg,
  removeOrgAdmin,
  saveAccount,
  saveBrand,
  saveDriveAccess,
  syncDrive,
  DRIVE_ROLES,
  type DriveRole,
  type DriveFolder,
  saveDrives,
  saveOrg,
  saveOutside,
  savePerTeacher,
  savePolicy,
  setFeature,
  setJobTitle,
  setTeacherGb,
  setTeacherOrg,
  setTrainer,
  saveTags,
  setTeacherTags,
  profileFieldsOf,
  type ProfileField,
  classDefaults,
  NAME_CHOICES,
  EMAIL_CHOICES,
  nameChoicesOf,
  emailChoicesOf,
  inviteTeachers,
  useOrgInvites,
  cancelInvite,
  resendInvite,
  inviteLink,
  logoToData,
  useAccounts,
  useDrive,
  useFeatures,
  useOrgs,
  useTeachers,
  type Account,
  type DriveAccess,
  type Org,
  type Plan,
  type Teacher,
} from '../lib/admin';

// Super Admin: for the app's owner, every teacher, organisation and switch; for an organisation's
// admins, their organisation: its teachers, branding, rules, shared drives and classes.

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Tab = 'teachers' | 'orgs' | 'apps' | 'defaults';

// Super Admin (/admin) is the app's owner's alone: every teacher, organisation and switch.
// Organisation admin (/org-admin) is for an organisation's admins: their organisation only.
export function AdminPage({ mode = 'super' }: { mode?: 'super' | 'org' }) {
  const { user } = useAuth();
  const isOwner = isOwnerEmail(user?.email);
  const owner = mode === 'super' && isOwner;
  const orgs = useOrgs(owner, user?.email);
  const teachers = useTeachers(owner);
  const accounts = useAccounts(owner);
  const [tab, setTab] = useState<Tab>('teachers');
  const [orgId, setOrgId] = useState('');
  useEffect(() => {
    if (!owner && orgs?.length && !orgId) setOrgId(orgs[0].id);
  }, [owner, orgs, orgId]);
  const org = orgs?.find((o) => o.id === orgId) ?? null;
  if (user && mode === 'super' && !isOwner)
    return (
      <div className="shell">
        <TopBar>
          <MainNav on="" />
        </TopBar>
        <div className="adm-none">
          <strong>Super Admin is only for the owner of ELT Suite</strong>
        </div>
      </div>
    );
  if (!user || orgs === null) return <Loader full label={mode === 'super' ? 'Opening Super Admin' : 'Opening Organisation admin'} />;
  if (!owner && !orgs.length)
    return (
      <div className="shell">
        <TopBar>
          <MainNav on="" />
        </TopBar>
        <div className="adm-none">
          <strong>Organisation admin is for an organisation's admins</strong>
          <span className="hint">Ask the person who runs your organisation in ELT Suite to add you as an admin.</span>
        </div>
      </div>
    );
  const NAV: { k: Tab; label: string; icon: string }[] = [
    { k: 'teachers', label: 'Teachers', icon: 'person' },
    { k: 'orgs', label: 'Organisations', icon: 'groups' },
    { k: 'apps', label: 'Apps', icon: 'settings' },
    { k: 'defaults', label: 'Defaults for everyone', icon: 'music' },
  ];
  return (
    <div className="shell">
      <TopBar>
        <MainNav on="" />
      </TopBar>
      <div className="adm">
        <aside className="adm-nav" aria-label={owner ? 'Super Admin' : 'Organisation admin'}>
          {owner &&
            NAV.map((n) => (
              <button key={n.k} type="button" className={!org && tab === n.k ? 'on' : ''} onClick={() => (setTab(n.k), setOrgId(''))}>
                <UiIcon name={n.icon} size={15} />
                {n.label}
              </button>
            ))}
          {orgs.length > 0 && <span className="adm-nav-h">{owner ? 'Organisations' : 'Your organisations'}</span>}
          {orgs.map((o) => (
            <button key={o.id} type="button" className={orgId === o.id ? 'on' : ''} onClick={() => setOrgId(o.id)}>
              <span className="adm-dot" style={{ background: o.brand?.color ?? '#5d6f80' }} />
              {o.name}
            </button>
          ))}
        </aside>
        <main className="adm-main">
          {org ? (
            <OrgPanel key={org.id} org={org} owner={owner} teachers={teachers ?? []} accounts={accounts} orgs={orgs} />
          ) : tab === 'teachers' ? (
            <TeachersTab teachers={teachers} accounts={accounts} orgs={orgs} />
          ) : tab === 'orgs' ? (
            <OrgsTab orgs={orgs} onOpen={setOrgId} />
          ) : tab === 'apps' ? (
            <AppsTab />
          ) : (
            <section className="adm-sec">
              <h1 className="page-title">Defaults for everyone</h1>
              <span className="hint">What every teacher gets unless they add their own.</span>
              <div className="adm-card">
                <h2>Sound effects</h2>
                <SfxSettings />
              </div>
              <div className="adm-card">
                <h2>Sounds of English</h2>
                <SoundRecordings />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ teachers (owner)
function TeachersTab({ teachers, accounts, orgs }: { teachers: Teacher[] | null; accounts: Record<string, Account>; orgs: Org[] }) {
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, { classes: number; learners: number }>>({});
  useEffect(() => {
    for (const t of teachers ?? []) if (counts[t.uid] === undefined) void classCount(t.uid).then((n) => setCounts((c) => ({ ...c, [t.uid]: n })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers]);
  if (!teachers) return <Loader label="Opening the teachers" />;
  const s = q.trim().toLowerCase();
  const shown = teachers.filter((t) => !s || `${t.name} ${t.email}`.toLowerCase().includes(s));
  return (
    <section className="adm-sec">
      <span className="adm-head">
        <h1 className="page-title">Teachers</h1>
        <span className="hint">{plural(teachers.length, 'account')}</span>
        <span style={{ flex: 1 }} />
        <input className="adm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" />
      </span>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Classes</th>
              <th>Learners</th>
              <th>Organisation</th>
              <th>Plan</th>
              <th>Space</th>
              <th>Apps</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const a = accounts[t.uid] ?? {};
              const inOrg = orgs.find((o) => o.id === a.org) ?? null;
              return (
                <tr key={t.uid} className={a.suspended ? 'paused' : ''}>
                  <td>
                    <b>{t.name || 'No name'}</b>
                    <span className="hint">{t.email}</span>
                  </td>
                  <td>{counts[t.uid]?.classes ?? '…'}</td>
                  <td>{counts[t.uid]?.learners ?? '…'}</td>
                  <td>
                    <Select value={a.org ?? ''} options={[{ v: '', label: 'None' }, ...orgs.map((o) => ({ v: o.id, label: o.name }))]} onChange={(v) => void setTeacherOrg(t, orgs.find((o) => o.id === v) ?? null, inOrg)} label="Choose" />
                  </td>
                  <td>
                    {inOrg ? (
                      <span className="hint">From {inOrg.name}</span>
                    ) : (
                      <Select value={a.plan ?? 'free'} options={[...PLANS.map((p) => ({ v: p.k, label: p.label }))]} onChange={(v) => void saveAccount(t, { plan: v as Plan, limitGb: PLANS.find((p) => p.k === v)?.gb })} label="Choose" />
                    )}
                  </td>
                  <td>
                    {(() => {
                      const gb = inOrg ? inOrg.teachers[t.uid]?.gb ?? inOrg.perTeacherGb ?? 1 : a.limitGb ?? PLANS.find((p) => p.k === (a.plan ?? 'free'))?.gb ?? 1;
                      const used = a.usedBytes ?? t.usedBytes ?? 0;
                      const pct = Math.min(100, (used / (gb * 1024 ** 3)) * 100);
                      return (
                        <span className="adm-use">
                          <span className="adm-use-row">
                            <b>{a.usedBytes === undefined && t.usedBytes === undefined ? 'Not measured' : formatBytes(used)}</b>{a.over && <span className="adm-over">Full</span>}
                            {inOrg ? <span className="hint">of {gb} GB, set by {inOrg.name}</span> : <>of <GbInput value={gb} onSave={(v) => void saveAccount(t, { limitGb: v })} /></>}
                          </span>
                          <span className={'adm-meter small' + (pct > 90 ? ' over' : '')}>
                            <span style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    <span className="adm-chips">
                      {APP_KEYS.map((k) => {
                        const on = a.features?.[k.k] ?? true;
                        return (
                          <button key={k.k} type="button" className={'adm-chip' + (on ? ' on' : '')} onClick={() => void saveAccount(t, { features: { ...(a.features ?? {}), [k.k]: !on } })} title={on ? `${k.name} is on` : `${k.name} is off`}>
                            {k.name}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                  <td>
                    <button type="button" className={'btn small-btn' + (a.suspended ? ' primary' : '')} onClick={() => void ask(a.suspended ? `Let ${t.name || t.email} use ELT Suite again?` : `Pause ${t.name || t.email}'s account? They cannot open ELT Suite until you turn it back on. Nothing is deleted.`, { ok: a.suspended ? 'Turn back on' : 'Pause' }).then((ok) => ok && void saveAccount(t, { suspended: !a.suspended }))}>
                      {a.suspended ? 'Paused · turn on' : 'Pause'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GbInput({ value, onSave, max = 1000 }: { value: number; onSave: (gb: number) => void; max?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <span className="adm-gb">
      <input type="number" min={0} max={max} step={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => Number(v) !== value && Number(v) >= 0 && onSave(Math.min(max, Number(v)))} />
      GB
    </span>
  );
}

// ------------------------------------------------------------------ organisations (owner)
function OrgsTab({ orgs, onOpen }: { orgs: Org[]; onOpen: (id: string) => void }) {
  const [name, setName] = useState('');
  return (
    <section className="adm-sec">
      <span className="adm-head">
        <h1 className="page-title">Organisations</h1>
      </span>
      <span className="adm-new">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of a new organisation, for example: Sunrise Language School" onKeyDown={(e) => e.key === 'Enter' && name.trim() && void newOrg(name).then(() => setName(''))} />
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void newOrg(name).then(() => setName(''))}>
          Create
        </button>
      </span>
      <div className="adm-orgs">
        {orgs.map((o) => (
          <button key={o.id} type="button" className="adm-org" onClick={() => onOpen(o.id)} style={{ ['--org' as string]: o.brand?.color ?? '#5d6f80' }}>
            {o.brand?.logo ? <img src={o.brand.logo} alt="" /> : <span className="adm-org-ic">{o.name.slice(0, 1)}</span>}
            <b>{o.name}</b>
            <span className="hint">
              {plural(Object.keys(o.teachers).length, 'teacher')} · {plural(o.adminEmails.length, 'admin')} · {o.limitGb} GB
            </span>
          </button>
        ))}
        {!orgs.length && <span className="hint">No organisations yet. Create one, then add its admins and teachers.</span>}
      </div>
    </section>
  );
}

function AppsTab() {
  const f = useFeatures();
  return (
    <section className="adm-sec">
      <h1 className="page-title">Apps</h1>
      <span className="hint">Turn an app off for everyone. An organisation, or a teacher's own switch, can turn it back on for them.</span>
      <div className="adm-card">
        {APP_KEYS.map((k) => (
          <label key={k.k} className="adm-row">
            <b>{k.name}</b>
            <Switch on={f[k.k] ?? true} onChange={(v) => void setFeature(k.k, v)} label={k.name} />
          </label>
        ))}
      </div>
    </section>
  );
}

const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'set-toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} />;

// ------------------------------------------------------------------ one organisation
type OTab = 'teachers' | 'space' | 'brand' | 'rules' | 'drives' | 'classes' | 'admins';
function OrgPanel({ org, owner, teachers, accounts, orgs }: { org: Org; owner: boolean; teachers: Teacher[]; accounts: Record<string, Account>; orgs: Org[] }) {
  const [tab, setTab] = useState<OTab>('teachers');
  const TABS: [OTab, string][] = [
    ['teachers', 'Teachers'],
    ['classes', 'Classes'],
    ['drives', 'Shared drives'],
    ['rules', 'Rules'],
    ['brand', 'Branding'],
    ['space', 'Plan and space'],
    ['admins', 'Admins'],
  ];
  return (
    <section className="adm-sec" style={{ ['--org' as string]: org.brand?.color ?? '#5d6f80' }}>
      <span className="adm-head">
        {org.brand?.logo ? <img className="adm-logo" src={org.brand.logo} alt="" /> : <span className="adm-org-ic big">{org.name.slice(0, 1)}</span>}
        <span className="adm-head-t">
          {owner ? <OrgName org={org} /> : <h1 className="page-title">{org.name}</h1>}
          <span className="hint">
            {plural(Object.keys(org.teachers).length, 'teacher')} · {plural(org.adminEmails.length, 'admin')}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        {owner && (
          <button type="button" className="btn link small set-danger" onClick={() => void ask(`Delete ${org.name}? Its teachers keep their accounts and files, on the free plan.`).then((ok) => ok && void removeOrg(org))}>
            Delete the organisation
          </button>
        )}
      </span>
      <span className="seg adm-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </span>
      {tab === 'teachers' && <OrgTeachers org={org} owner={owner} teachers={teachers} accounts={accounts} orgs={orgs} />}
      {tab === 'classes' && <OrgClasses org={org} />}
      {tab === 'drives' && <OrgDrives org={org} />}
      {tab === 'rules' && <OrgRules org={org} />}
      {tab === 'brand' && <OrgBrand org={org} />}
      {tab === 'space' && <OrgSpace org={org} owner={owner} />}
      {tab === 'admins' && <OrgAdmins org={org} owner={owner} />}
    </section>
  );
}

function OrgName({ org }: { org: Org }) {
  const [v, setV] = useState(org.name);
  return <input className="adm-orgname" size={Math.max(6, Math.ceil(v.length * 1.15) + 2)} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== org.name && void saveOrg(org.id, { name: v.trim() })} aria-label="Name of the organisation" />;
}

function OrgTeachers({ org, owner, teachers, accounts, orgs }: { org: Org; owner: boolean; teachers: Teacher[]; accounts: Record<string, Account>; orgs: Org[] }) {
  const [add, setAdd] = useState('');
  const list = Object.entries(org.teachers).sort((a, b) => (a[1].name || a[1].email).localeCompare(b[1].name || b[1].email));
  const free = teachers.filter((t) => !org.teachers[t.uid]);
  return (
    <div className="adm-card">
      <span className="hint">Teachers here are colleagues of each other, always, and see each other's job titles and profiles.{org.allow?.trainers ? ' A teacher trainer creates teacher training classes for the others.' : ''}</span>
      <InviteTeachers org={org} owner={owner} />
      <OrgTags org={org} />
      {owner && (
        <span className="adm-new">
          <Select value={add} placeholder="Add a teacher who already has an account…" options={free.map((t) => ({ v: t.uid, label: t.name || t.email, hint: t.email + (accounts[t.uid]?.org ? ` · now in ${orgs.find((o) => o.id === accounts[t.uid]?.org)?.name ?? 'another organisation'}` : '') }))} onChange={(v) => setAdd(v)} label="Teacher to add" className="grow" />
          <button type="button" className="btn primary" disabled={!add} onClick={() => { const t = teachers.find((x) => x.uid === add); if (t) void setTeacherOrg(t, org, orgs.find((o) => o.id === accounts[t.uid]?.org) ?? null).then(() => setAdd('')); }}>
            Add
          </button>
        </span>
      )}
      <table className="adm-table">
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Job title</th>
            <th>Tags</th>
            {owner && <th>Admin</th>}
            {org.allow?.trainers && <th title="Teacher trainers create teacher training classes for the teachers here">Teacher trainer</th>}
            <th>Space</th>
            {owner && <th />}
          </tr>
        </thead>
        <tbody>
          {list.map(([uid, t]) => (
            <tr key={uid}>
              <td>
                <b>{t.name || 'No name'}</b>
                <span className="hint">{t.email}</span>
              </td>
              <td>
                <TitleInput value={t.title ?? ''} onSave={(v) => void setJobTitle(org, uid, v)} />
              </td>
              <td>
                <MultiSelect value={t.tags ?? []} options={Object.entries(org.tags ?? {}).map(([id, x]) => ({ v: id, label: x.name }))} onChange={(v) => void setTeacherTags(org, uid, v)} label={`Tags for ${t.name || t.email}`} none={Object.keys(org.tags ?? {}).length ? 'No tags' : 'Add tags above'} foot="" />
              </td>
              {owner && (
                <td>
                  <Switch on={org.adminEmails.includes(t.email.toLowerCase())} onChange={(v) => void (v ? addOrgAdmin(org, t.email) : removeOrgAdmin(org, t.email.toLowerCase()))} label={`${t.name || t.email} is an admin`} />
                </td>
              )}
              {org.allow?.trainers && (
                <td>
                  <Switch on={!!t.trainer} onChange={(v) => void setTrainer(org, uid, v)} label={`${t.name || t.email} is a teacher trainer`} />
                </td>
              )}
              <td>
                <GbInput value={t.gb ?? org.perTeacherGb ?? 1} onSave={(gb) => void setTeacherGb(org, uid, gb)} max={org.limitGb} />
              </td>
              {owner && (
                <td>
                  <button type="button" className="btn link small" onClick={() => { const tt = teachers.find((x) => x.uid === uid) ?? { uid, name: t.name, email: t.email }; void setTeacherOrg(tt, null, org); }}>
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={5 + (org.allow?.trainers ? 1 : 0) + (owner ? 1 : 0)} className="hint">
                {owner ? 'Add the teachers of this organisation.' : 'The owner of ELT Suite adds your teachers.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TitleInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="adm-in" value={v} placeholder="For example: Senior teacher" onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} maxLength={60} />;
}

function OrgClasses({ org }: { org: Org }) {
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [done, setDone] = useState('');
  const teachers = Object.entries(org.teachers);
  const make = async () => {
    if (!who || !name.trim()) return;
    try {
      const pol = org.policy;
      await createClass(who, { name: name.trim(), level, themeColor: 'flame', org: org.id, extra: classDefaults(pol) });
      setDone(`${name.trim()} is ready for ${org.teachers[who]?.name || 'the teacher'}.`);
      setName('');
    } catch {
      setDone('The class could not be made. Try again.');
    }
  };
  return (
    <div className="adm-card">
      <span className="hint">{org.policy?.createClasses === false ? 'Your teachers do not create their own classes. Create them here.' : 'Your teachers create their own classes. You can also create one for a teacher here.'}</span>
      <div className="adm-form">
        <label className="field">
          <span>Teacher</span>
          <Select value={who} options={[{ v: '', label: 'Choose…' }, ...teachers.map(([uid, t]) => ({ v: uid, label: t.name || t.email }))]} onChange={(v) => setWho(v)} label="Choose" />
        </label>
        <label className="field">
          <span>Class name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Monday B1 evening" maxLength={80} />
        </label>
        <label className="field">
          <span>Level</span>
          <Select value={level} options={[...['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => ({ v: l, label: l }))]} onChange={(v) => setLevel(v)} label="Choose" />
        </label>
        <button type="button" className="btn primary" disabled={!who || !name.trim()} onClick={() => void make()}>
          Create the class
        </button>
      </div>
      {done && <span className="hint">{done}</span>}
      <OrgClassList org={org} />
    </div>
  );
}

// Every class in the organisation; open one to add its learners and print their sign-in cards.
function OrgClassList({ org }: { org: Org }) {
  const [list, setList] = useState<ClassDoc[] | null>(null);
  const [open, setOpen] = useState('');
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'classes'), where('org', '==', org.id)),
        (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) })).filter((c) => c.status !== 'deleted').sort((a, b) => a.name.localeCompare(b.name))),
        () => setList([]),
      ),
    [org.id],
  );
  const cur = list?.find((c) => c.id === open);
  if (cur) return <ClassLearners c={cur} teacher={org.teachers[cur.teacherId]?.name ?? ''} onBack={() => setOpen('')} />;
  return (
    <div className="adm-classes">
      <span className="adm-sub">Classes in {org.name}</span>
      {list === null ? (
        <span className="hint">Opening the classes…</span>
      ) : !list.length ? (
        <span className="hint">No classes yet.</span>
      ) : (
        list.map((c) => (
          <button key={c.id} type="button" className="adm-class" onClick={() => setOpen(c.id)}>
            <span>
              <b>{c.name}</b>
              <span className="hint">
                {org.teachers[c.teacherId]?.name || 'A teacher'} · {c.level} · {c.classCode}
              </span>
            </span>
            <span className="hint">{plural(c.learnerCount ?? 0, 'learner')}</span>
            <span className="adm-ch" aria-hidden="true">›</span>
          </button>
        ))
      )}
    </div>
  );
}

function ClassLearners({ c, teacher, onBack }: { c: ClassDoc; teacher: string; onBack: () => void }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [secrets, setSecrets] = useState<{ id: string; pin?: string; own?: boolean; kind?: string }[]>([]);
  useEffect(() => {
    const a = onSnapshot(collection(db, 'classes', c.id, 'learners'), (s) => setLearners(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Learner, 'id'>) }))), () => setLearners([]));
    const b = onSnapshot(collection(db, 'classes', c.id, 'secrets'), (s) => setSecrets(s.docs.map((d) => ({ id: d.id, ...(d.data() as { pin?: string; own?: boolean; kind?: string }) }))), () => setSecrets([]));
    return () => (a(), b());
  }, [c.id]);
  const pins = Object.fromEntries(secrets.filter((s) => !s.own).map((s) => [s.id, s.pin ?? '']));
  const own = Object.fromEntries(secrets.filter((s) => s.own).map((s) => [s.id, s.kind === 'password' ? 'password' : 'PIN']));
  return (
    <div className="adm-classes">
      <span className="adm-head">
        <button type="button" className="btn link small" onClick={onBack}>
          ‹ All classes
        </button>
      </span>
      <span className="adm-head-t">
        <b className="adm-class-t">{c.name}</b>
        <span className="hint">
          {teacher || 'A teacher'} · {c.level} · class code {c.classCode}
        </span>
      </span>
      <LearnersTab c={c} learners={learners} pins={pins} own={own} manage />
    </div>
  );
}

function OrgRules({ org }: { org: Org }) {
  const p = org.policy ?? {};
  const set = (x: Parameters<typeof savePolicy>[1]) => void savePolicy(org, x);
  const Row = ({ title, about, children }: { title: string; about: string; children: React.ReactNode }) => (
    <label className="adm-row">
      <span>
        <b>{title}</b>
        <span className="hint">{about}</span>
      </span>
      {children}
    </label>
  );
  const ABOUT: Record<string, string> = {
    classes: 'Classes, lessons, homework and live teaching',
    files: 'Their library: lessons, documents, flashcards, PD reading',
    messages: 'Chats with learners and other teachers',
    colleagues: 'Sharing lessons and files with other teachers',
  };
  return (
    <div className="adm-card">
      <span className="adm-sub">Classes</span>
      <Row title="Teachers create their own classes" about="When this is off, only admins create classes, from the Classes tab here.">
        <Switch on={p.createClasses !== false} onChange={(v) => set({ createClasses: v })} label="Teachers create their own classes" />
      </Row>
      <span className="adm-sub">Learners</span>
      <Row title="Learner email addresses" about="Tick the settings teachers can choose from. Learners always sign in with the class code and their PIN.">
        <MultiSelect value={emailChoicesOf(p)} options={EMAIL_CHOICES} onChange={(v) => set({ emailChoices: v, learnerEmails: undefined })} label="Learner email addresses" all="Each teacher decides" />
      </Row>
      <Row title="Teachers can see learner emails" about="Learners never see each other's email addresses.">
        <Switch on={p.seeEmails !== false} onChange={(v) => set({ seeEmails: v })} label="Teachers can see learner emails" />
      </Row>
      <Row title="How learners see each other's names" about="Tick the ways teachers can choose from. Teachers always see full names.">
        <MultiSelect value={nameChoicesOf(p)} options={NAME_CHOICES} onChange={(v) => set({ nameChoices: v, names: undefined })} label="How learners see each other's names" all="Each teacher decides" />
      </Row>
      <span className="adm-sub">Teachers</span>
      <Row title="Colleagues outside the organisation" about={`Teachers in ${org.name} are always colleagues of each other.`}>
        <Select value={org.outside ?? 'anyone'} options={[{ v: 'anyone', label: 'Allowed' }, { v: 'org', label: 'Not allowed' }]} onChange={(v) => void saveOutside(org, v as 'anyone' | 'org')} label="Choose" />
      </Row>
      <Row title="Ask teachers for a profile" about={`Teachers introduce themselves: a short bio, hobbies and languages. Only teachers in ${org.name} can see it.`}>
        <Switch on={!!p.profiles} onChange={(v) => set({ profiles: v })} label="Ask teachers for a profile" />
      </Row>
      {p.profiles && <ProfileFields org={org} />}
      {org.allow?.trainers && (
        <Row title="Trainers can add teachers from outside" about={`Teacher trainers can always add teachers from ${org.name}. When this is on, they can also add others by name.`}>
          <Switch on={!!p.externalTrainees} onChange={(v) => set({ externalTrainees: v })} label="Trainers can add teachers from outside" />
        </Row>
      )}
      <span className="adm-sub">Apps</span>
      {APP_KEYS.map((k) => (
        <Row key={k.k} title={k.name} about={org.allow?.apps?.[k.k] === false ? 'Not part of your organisation’s plan' : ABOUT[k.k] ?? ''}>
          <Switch on={org.allow?.apps?.[k.k] !== false && (p.apps?.[k.k] ?? true)} disabled={org.allow?.apps?.[k.k] === false} onChange={(v) => set({ apps: { ...(p.apps ?? {}), [k.k]: v } })} label={k.name} />
        </Row>
      ))}
    </div>
  );
}

const COLOURS = ['#c8764a', '#3667a6', '#2f7f6f', '#7a4fa3', '#b64a3c', '#a8701f', '#4f6b7a', '#2f2e2d'];
function OrgBrand({ org }: { org: Org }) {
  const b = org.brand ?? {};
  const [busy, setBusy] = useState<'' | 'logo' | 'wide'>('');
  const [err, setErr] = useState('');
  const pick = (k: 'logo' | 'wide') => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/svg+xml,image/jpeg,image/webp';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      setBusy(k);
      setErr('');
      try {
        await saveBrand(org, { ...b, [k]: await logoToData(f, k === 'wide' ? 720 : 320) });
      } catch {
        setErr('That picture could not be used. Try a PNG.');
      } finally {
        setBusy('');
      }
    };
    inp.click();
  };
  const slot = (k: 'logo' | 'wide', title: string, about: string) => (
    <div className={'adm-logo-slot ' + k}>
      <span className="adm-logo-box">{b[k] ? <img src={b[k]} alt="" /> : k === 'logo' ? <span className="adm-org-ic big">{org.name.slice(0, 1)}</span> : <span className="hint">No long logo yet</span>}</span>
      <span className="adm-logo-t">
        <b>{title}</b>
        <span className="hint">{about}</span>
        <span className="adm-logo-acts">
          <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => pick(k)}>
            {busy === k ? 'Adding…' : b[k] ? 'Change' : 'Upload'}
          </button>
          {b[k] && (
            <button type="button" className="btn link small" onClick={() => void saveBrand(org, { ...b, [k]: '' })}>
              Remove
            </button>
          )}
        </span>
      </span>
    </div>
  );
  return (
    <div className="adm-card">
      <span className="adm-sub">Theme colour</span>
      <span className="adm-swatches">
        {COLOURS.map((c) => (
          <button key={c} type="button" className={'adm-sw' + (b.color === c ? ' on' : '')} style={{ background: c }} onClick={() => void saveBrand(org, { ...b, color: c })} aria-label={c} />
        ))}
        <input type="color" value={b.color ?? '#5d6f80'} onChange={(e) => void saveBrand(org, { ...b, color: e.target.value })} aria-label="Another colour" />
      </span>
      <span className="adm-sub">Logos</span>
      <div className="adm-logos">
        {slot('logo', 'Square logo', 'The mark on its own, for small places: next to ELT Suite at the top of the screen. A square PNG, at least 256 px.')}
        {slot('wide', 'Long logo', 'The mark with the name beside it, for worksheets, tests and invitations. A wide PNG with a clear background, at least 600 px across.')}
      </div>
      {err && <span className="error">{err}</span>}
      <span className="adm-sub">On a worksheet</span>
      <div className="adm-preview" style={{ ['--org' as string]: b.color ?? '#5d6f80' }}>
        <span>
          <b>Unit 4 · Present perfect</b>
          <span className="hint">Name ______________ · Class ________</span>
        </span>
        <span style={{ flex: 1 }} />
        {b.wide || b.logo ? <img src={b.wide || b.logo} alt="" /> : <span className="hint">ELT Suite</span>}
      </div>
    </div>
  );
}

function OrgSpace({ org, owner }: { org: Org; owner: boolean }) {
  const given = Object.values(org.teachers).reduce((n, t) => n + (t.gb ?? org.perTeacherGb ?? 1), 0) + Object.values(org.drives ?? {}).reduce((n, d) => n + d.quotaGb, 0);
  return (
    <div className="adm-card">
      <label className="adm-row">
        <span>
          <b>Space for the organisation</b>
          <span className="hint">{owner ? 'Set by you, the owner of ELT Suite' : 'Set by ELT Suite'}</span>
        </span>
        {owner ? <GbInput value={org.limitGb} onSave={(gb) => void saveOrg(org.id, { limitGb: gb })} max={100000} /> : <b>{org.limitGb} GB</b>}
      </label>
      {owner && (
        <label className="adm-row">
          <b>Plan</b>
          <Select value={org.plan} options={[...PLANS.map((p) => ({ v: p.k, label: p.label }))]} onChange={(v) => void saveOrg(org.id, { plan: v as Plan })} label="Choose" />
        </label>
      )}
      {owner && (
        <>
          <span className="adm-sub">Apps for {org.name}</span>
          <span className="hint">Its admins can turn these off for their teachers, but not turn on what you leave off.</span>
          {APP_KEYS.map((k) => (
            <label key={k.k} className="adm-row">
              <b>{k.name}</b>
              <Switch on={org.allow?.apps?.[k.k] !== false} onChange={(v) => void saveOrg(org.id, { allow: { ...(org.allow ?? {}), apps: { ...(org.allow?.apps ?? {}), [k.k]: v } } })} label={`${k.name} for ${org.name}`} />
            </label>
          ))}
          <span className="adm-sub">Features</span>
        </>
      )}
      <label className="adm-row">
        <span>
          <b>Teacher trainers</b>
          <span className="hint">{owner ? 'On: its admins can make teachers trainers, who create and run teacher training classes' : org.allow?.trainers ? 'On for your organisation. Choose the trainers in Teachers' : 'Not part of your plan. Ask ELT Suite to turn it on'}</span>
        </span>
        <Switch on={!!org.allow?.trainers} disabled={!owner} onChange={(v) => void saveOrg(org.id, { allow: { ...(org.allow ?? {}), trainers: v } })} label="Teacher trainers" />
      </label>
      <label className="adm-row">
        <span>
          <b>Space for each teacher</b>
          <span className="hint">Unless you give a teacher more or less in Teachers</span>
        </span>
        <GbInput value={org.perTeacherGb ?? 1} onSave={(gb) => void savePerTeacher(org, gb)} max={org.limitGb} />
      </label>
      <div className={'adm-meter' + (given > org.limitGb ? ' over' : '')}>
        <span style={{ width: `${Math.min(100, (given / Math.max(1, org.limitGb)) * 100)}%` }} />
      </div>
      <span className={'hint' + (given > org.limitGb ? ' warn' : '')}>
        {given} GB given out of {org.limitGb} GB: teachers and shared drives together.{given > org.limitGb ? ' That is more than the organisation has.' : ''}
      </span>
    </div>
  );
}

function OrgAdmins({ org, owner }: { org: Org; owner: boolean }) {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const teacherOf = (e: string) => Object.values(org.teachers).find((t) => t.email.toLowerCase() === e.toLowerCase());
  // A teacher here becomes an admin at once; anyone else is invited to join as a teacher and admin.
  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(e) || !user) return;
    if (teacherOf(e)) {
      await addOrgAdmin(org, e);
      setNote(`${teacherOf(e)?.name || e} is an admin now.`);
    } else {
      await inviteTeachers(org, [{ name: '', email: e, admin: true }], { uid: user.uid, name: profile?.displayName || user.displayName || 'ELT Suite' });
      setNote(`${e} is invited to join ${org.name} as a teacher and admin.`);
    }
    setEmail('');
  };
  return (
    <div className="adm-card">
      <span className="hint">Admins are teachers in {org.name} with one more app, Organisation admin, for its teachers, classes, rules, branding and shared drives.</span>
      {org.adminEmails.map((e) => (
        <span key={e} className="adm-row">
          <span>
            <b>{teacherOf(e)?.name || e}</b>
            <span className="hint">{teacherOf(e) ? e : `${e} · not a teacher here yet`}</span>
          </span>
          {owner && (
            <button type="button" className="btn link small" onClick={() => void removeOrgAdmin(org, e)}>
              Remove as admin
            </button>
          )}
        </span>
      ))}
      {!org.adminEmails.length && <span className="hint">No admins yet.</span>}
      {owner && (
        <span className="adm-new">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email of a teacher here, or someone to invite" onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <button type="button" className="btn primary" disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => void add()}>
            Add admin
          </button>
        </span>
      )}
      {note && <span className="hint">{note}</span>}
    </div>
  );
}

// Shared drives: each says who can edit, comment, view or not see it, for everyone, for teachers
// with a tag and for one teacher; its folders follow it unless a folder has its own say.
function OrgDrives({ org }: { org: Org }) {
  const { user } = useAuth();
  const folders = useDrive(org);
  const drives = useMemo(() => ({ main: { name: 'Shared drive', quotaGb: 5 }, ...(org.drives ?? {}) }) as Record<string, { name: string; quotaGb: number; access?: DriveAccess }>, [org.drives]);
  const [newDrive, setNewDrive] = useState('');
  const [open, setOpen] = useState('');
  const [use, setUse] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!folders) return;
    for (const k of Object.keys(drives)) void driveUse(folders.filter((f) => (f.drive ?? 'main') === k).map((f) => f.id)).then((n) => setUse((u) => ({ ...u, [k]: n })));
  }, [folders, drives]);
  // Who is in each folder follows the teachers, their tags and the drives' settings.
  const sig = JSON.stringify([org.teachers, org.drives]);
  useEffect(() => {
    if (folders?.length) void syncDrive(org, folders);
  }, [sig, folders?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;
  const saveDrive = (k: string, d: { name: string; quotaGb: number; access?: DriveAccess }) => saveDrives(org, { ...drives, [k]: d });
  const addDrive = () => {
    const id = 'd' + Date.now().toString(36);
    void saveDrives(org, { ...drives, [id]: { name: newDrive.trim(), quotaGb: 5, access: { all: 'view', tags: {}, people: {} } } }).then(() => setNewDrive(''));
  };
  return (
    <div className="adm-drives">
      <span className="hint">Teachers in {org.name} find these in Files, under Shared folders. Hidden drives and folders do not show for them at all.</span>
      {Object.entries(drives).map(([k, d]) => {
        const list = (folders ?? []).filter((f) => (f.drive ?? 'main') === k);
        const access = d.access ?? { all: 'view', tags: {}, people: {} };
        return (
          <div key={k} className="adm-card adm-drive">
            <span className="adm-drive-h">
              <UiIcon name="archive" size={18} />
              <DriveName value={d.name} onSave={(name) => void saveDrive(k, { ...d, name })} />
              <span style={{ flex: 1 }} />
              <span className="hint">{formatBytes(use[k] ?? 0)} of</span>
              <GbInput value={d.quotaGb} onSave={(gb) => void saveDrive(k, { ...d, quotaGb: gb })} max={org.limitGb} />
            </span>
            <AccessEditor org={org} access={access} onSave={(a) => void saveDrive(k, { ...d, access: a })} />
            <span className="adm-sub">Folders</span>
            {list.map((f) => (
              <DriveFolderRow key={f.id} org={org} f={f} driveAccess={access} me={user.uid} open={open === f.id} onToggle={() => setOpen(open === f.id ? '' : f.id)} />
            ))}
            {!list.length && <span className="hint">No folders yet.</span>}
            <NewFolder onMake={(name, all) => void newDriveFolder({ ...org, drives }, { uid: user.uid }, name, all, k)} />
          </div>
        );
      })}
      <span className="adm-new">
        <input value={newDrive} onChange={(e) => setNewDrive(e.target.value)} placeholder="Another drive, for example: Exams team" />
        <button type="button" className="btn" disabled={!newDrive.trim()} onClick={addDrive}>
          + Add a drive
        </button>
      </span>
    </div>
  );
}

// Who can do what: everyone, each tag, and exceptions for one teacher.
function AccessEditor({ org, access, onSave, inherit }: { org: Org; access: DriveAccess; onSave: (a: DriveAccess) => void; inherit?: { on: boolean; set: (on: boolean) => void } }) {
  const [more, setMore] = useState(false);
  const tags = Object.entries(org.tags ?? {});
  const people = Object.entries(org.teachers);
  const roles = (extra?: string) => [...(extra ? [{ v: '', label: extra }] : []), ...DRIVE_ROLES];
  const exceptions = Object.keys(access.people ?? {}).length;
  if (inherit?.on)
    return (
      <div className="adm-access">
        <span className="adm-row sub">
          <span className="hint">Follows the drive</span>
          <button type="button" className="btn link small" onClick={() => inherit.set(false)}>
            Give it its own settings
          </button>
        </span>
      </div>
    );
  return (
    <div className="adm-access">
      <span className="adm-row sub">
        <b>Everyone in {org.name}</b>
        <Select value={access.all} options={DRIVE_ROLES} onChange={(v) => onSave({ ...access, all: v })} label="Everyone" />
      </span>
      {tags.map(([id, t]) => (
        <span key={id} className="adm-row sub">
          <span className="adm-tag">{t.name}</span>
          <Select value={access.tags?.[id] ?? ''} options={roles('Like everyone')} onChange={(v) => { const n = { ...(access.tags ?? {}) }; if (v) n[id] = v as DriveRole; else delete n[id]; onSave({ ...access, tags: n }); }} label={`Teachers tagged ${t.name}`} />
        </span>
      ))}
      <span className="adm-row sub">
        <button type="button" className="btn link small" onClick={() => setMore((m) => !m)}>
          {more ? 'Hide one-by-one settings' : `One teacher at a time${exceptions ? ` (${exceptions})` : ''}`}
        </button>
        {inherit && (
          <button type="button" className="btn link small" onClick={() => inherit.set(true)}>
            Follow the drive again
          </button>
        )}
      </span>
      {more &&
        people.map(([uid, t]) => (
          <span key={uid} className="adm-row sub indent">
            <span>
              {t.name || t.email}
              {t.tags?.length ? <span className="hint"> · {t.tags.map((x) => org.tags?.[x]?.name).filter(Boolean).join(', ')}</span> : null}
            </span>
            <Select value={access.people?.[uid] ?? ''} options={roles('Like their tags')} onChange={(v) => { const n = { ...(access.people ?? {}) }; if (v) n[uid] = v as DriveRole; else delete n[uid]; onSave({ ...access, people: n }); }} label={`${t.name || t.email}`} />
          </span>
        ))}
      {!tags.length && <span className="hint">Add tags in Teachers to set a group of teachers at once.</span>}
    </div>
  );
}

function DriveName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input className="adm-drivename" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} />;
}

function NewFolder({ onMake }: { onMake: (name: string, all: DriveRole | 'drive') => void }) {
  const [name, setName] = useState('');
  const [all, setAll] = useState<DriveRole | 'drive'>('drive');
  return (
    <span className="adm-new">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder, for example: Exam papers" />
      <Select value={all} options={[{ v: 'drive', label: 'Like the drive' }, ...DRIVE_ROLES.map((r) => ({ v: r.v, label: `Everyone: ${r.label.toLowerCase()}` }))]} onChange={(v) => setAll(v)} label="Who can use it" />
      <button type="button" className="btn small-btn primary" disabled={!name.trim()} onClick={() => (onMake(name, all), setName(''))}>
        Add folder
      </button>
    </span>
  );
}

function DriveFolderRow({ org, f, driveAccess, me, open, onToggle }: { org: Org; f: DriveFolder & { owner?: string }; driveAccess: DriveAccess; me: string; open: boolean; onToggle: () => void }) {
  const own = !!f.own;
  const access = own ? f.access : driveAccess;
  const label = own ? `Own settings · everyone ${DRIVE_ROLES.find((r) => r.v === access.all)?.label.toLowerCase()}` : 'Like the drive';
  return (
    <div className={'adm-folder' + (open ? ' open' : '')}>
      <button type="button" className="adm-folder-h" onClick={onToggle}>
        <span className="adm-ch" aria-hidden="true">›</span>
        <b>{f.name}</b>
        <span className="hint">
          {label} · {plural(f.memberIds.length, 'teacher')}
        </span>
      </button>
      {open && (
        <div className="adm-folder-b">
          <AccessEditor org={org} access={access} onSave={(a) => void saveDriveAccess(org, f, { uid: me }, { tags: {}, ...a }, true)} inherit={{ on: !own, set: (on) => void saveDriveAccess(org, f, { uid: me }, on ? driveAccess : { tags: {}, ...driveAccess }, !on) }} />
        </div>
      )}
    </div>
  );
}

// Inviting teachers by email: a new teacher gets a link to finish their account; a teacher with an
// account gets an invitation to say yes or no to, with what the admins can set and see.
function InviteTeachers({ org, owner }: { org: Org; owner: boolean }) {
  const { user, profile } = useAuth();
  const invites = useOrgInvites(org);
  const blank = { name: '', email: '', title: '', admin: false };
  const [rows, setRows] = useState([blank]);
  const [pasteAdmin, setPasteAdmin] = useState(false);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const pending = invites.filter((i) => i.status === 'pending');
  const answered = invites.filter((i) => i.status !== 'pending').slice(0, 6);
  const fromText = () =>
    text
      .split('\n')
      .map((l) => l.split(/\t|,|;/).map((x) => x.trim()))
      .map((c) => {
        const e = c.findIndex((x) => /@/.test(x));
        return { email: e >= 0 ? c[e] : '', name: c.filter((_, i) => i !== e)[0] ?? '', title: c.filter((_, i) => i !== e)[1] ?? '', admin: pasteAdmin };
      })
      .filter((r) => r.email);
  const list = paste ? fromText() : rows.filter((r) => /\S+@\S+\.\S+/.test(r.email));
  const send = async () => {
    if (!user || !list.length) return;
    const n = await inviteTeachers(org, list, { uid: user.uid, name: profile?.displayName || user.displayName || 'An admin' });
    setNote(`${n} ${n === 1 ? 'invitation' : 'invitations'} on the way. Emails go out within 15 minutes.`);
    setRows([blank]);
    setText('');
  };
  const set = (i: number, k: 'name' | 'email' | 'title' | 'admin', v: string | boolean) => setRows((r) => { const n = r.map((x, j) => (j === i ? { ...x, [k]: v } : x)); return i === n.length - 1 && typeof v === 'string' && v ? [...n, blank] : n; });
  return (
    <div className="adm-invite">
      <span className="adm-head">
        <span className="adm-sub">Invite teachers</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn link small" onClick={() => setPaste((p) => !p)}>
          {paste ? 'Type them one by one' : 'Paste a list'}
        </button>
      </span>
      <span className="hint">New teachers get a link to finish their account. Teachers who already have one are asked if they would like to join, with what you can set and see.</span>
      {paste ? (
        <>
          <textarea className="adm-paste" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name, email, job title: one teacher a line\nSofia Rossi, sofia@school.org, Senior teacher\nTariq Aziz, tariq@school.org'} />
          {owner && (
            <label className="adm-inv-admin">
              <input type="checkbox" checked={pasteAdmin} onChange={(e) => setPasteAdmin(e.target.checked)} />
              Invite them all as admins
            </label>
          )}
        </>
      ) : (
        <div className="adm-inv-rows">
          {rows.map((r, i) => (
            <span key={i} className="adm-inv-row">
              <input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Name" aria-label="Name" />
              <input type="email" value={r.email} onChange={(e) => set(i, 'email', e.target.value)} placeholder="Email" aria-label="Email" />
              <input value={r.title} onChange={(e) => set(i, 'title', e.target.value)} placeholder="Job title (optional)" aria-label="Job title" />
              {owner && (
                <label className="adm-inv-admin" data-tip="Admins are teachers too, with the Organisation admin app">
                  <input type="checkbox" checked={r.admin} onChange={(e) => set(i, 'admin', e.target.checked)} />
                  Admin
                </label>
              )}
            </span>
          ))}
        </div>
      )}
      <span className="adm-new">
        <span className="hint">{note}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" disabled={!list.length} onClick={() => void send()}>
          {list.length > 1 ? `Invite ${list.length} teachers` : 'Invite'}
        </button>
      </span>
      {pending.length > 0 && (
        <div className="adm-inv-list">
          <span className="adm-sub">Waiting for an answer</span>
          {pending.map((i) => (
            <span key={i.id} className="adm-row sub">
              <span>
                <b>{i.name || i.email}</b>
                <span className="hint">
                  {' '}
                  · {i.email}
                  {i.title ? ` · ${i.title}` : ''}
                  {i.admin ? ' · Admin' : ''} · {i.mailed ? (i.existing ? 'Asked to join' : 'Finishing their account') : 'Email on the way'}
                </span>
              </span>
              <span className="adm-inv-acts">
                <button type="button" className="btn link small" onClick={() => void navigator.clipboard?.writeText(inviteLink(i.id)).then(() => setNote(`The link for ${i.name || i.email} is copied.`))}>
                  Copy link
                </button>
                {i.mailed && (
                  <button type="button" className="btn link small" onClick={() => void resendInvite(i.id).then(() => setNote(`Sending to ${i.email} again.`))}>
                    Send again
                  </button>
                )}
                <button type="button" className="btn link small set-danger" onClick={() => void cancelInvite(i.id)}>
                  Take back
                </button>
              </span>
            </span>
          ))}
        </div>
      )}
      {answered.length > 0 && (
        <div className="adm-inv-list">
          <span className="adm-sub">Answered</span>
          {answered.map((i) => (
            <span key={i.id} className="adm-row sub">
              <span>
                <b>{i.name || i.email}</b>
                <span className="hint"> · {i.email}</span>
              </span>
              <span className={'adm-ans ' + i.status}>{i.status === 'accepted' ? 'Joined' : 'Said no'}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Tags: groups of teachers (a team, a site, a level), for setting drive access in one go.
function OrgTags({ org }: { org: Org }) {
  const [name, setName] = useState('');
  const [edit, setEdit] = useState('');
  const tags = Object.entries(org.tags ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const count = (id: string) => Object.values(org.teachers).filter((t) => t.tags?.includes(id)).length;
  const add = () => {
    const n = name.trim();
    if (!n || tags.some(([, t]) => t.name.toLowerCase() === n.toLowerCase())) return;
    void saveTags(org, { ...(org.tags ?? {}), ['t' + Date.now().toString(36)]: { name: n.slice(0, 40) } }).then(() => setName(''));
  };
  const remove = async (id: string) => {
    if (!(await ask(`Delete the tag ${org.tags?.[id]?.name}? Teachers keep everything else, and drives stop using it.`, { ok: 'Delete' }))) return;
    const next = { ...(org.tags ?? {}) };
    delete next[id];
    await saveTags(org, next);
    await Promise.all(Object.entries(org.teachers).filter(([, t]) => t.tags?.includes(id)).map(([uid, t]) => setTeacherTags(org, uid, (t.tags ?? []).filter((x) => x !== id))));
  };
  return (
    <div className="adm-tags">
      <span className="adm-sub">Tags</span>
      <span className="hint">Group teachers, for example by team, site or level, then decide in Shared drives what each tag can do.</span>
      <span className="adm-tag-list">
        {tags.map(([id, t]) =>
          edit === id ? (
            <input key={id} className="adm-tag-in" autoFocus defaultValue={t.name} onBlur={(e) => (e.target.value.trim() && e.target.value !== t.name && void saveTags(org, { ...(org.tags ?? {}), [id]: { name: e.target.value.trim().slice(0, 40) } }), setEdit(''))} onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()} />
          ) : (
            <span key={id} className="adm-tag big">
              <button type="button" onClick={() => setEdit(id)} data-tip="Rename">
                {t.name} <span className="hint">{count(id)}</span>
              </button>
              <button type="button" className="adm-tag-x" onClick={() => void remove(id)} aria-label={`Delete ${t.name}`}>
                ×
              </button>
            </span>
          ),
        )}
        <span className="adm-tag-add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" onKeyDown={(e) => e.key === 'Enter' && add()} maxLength={40} />
          <button type="button" className="btn small-btn" disabled={!name.trim()} onClick={add}>
            Add
          </button>
        </span>
      </span>
    </div>
  );
}

// The fields of a teacher's profile: switch them on or off, rename them, pick an icon, add more.
function ProfileFields({ org }: { org: Org }) {
  const fields = profileFieldsOf(org.policy);
  const [pick, setPick] = useState<{ id: string; r: DOMRect } | null>(null);
  const save = (next: ProfileField[]) => void savePolicy(org, { profileFields: next });
  const set = (id: string, patch: Partial<ProfileField>) => save(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const n = [...fields];
    [n[i], n[j]] = [n[j], n[i]];
    save(n);
  };
  const KINDS: { v: ProfileField['kind']; label: string; hint: string }[] = [
    { v: 'short', label: 'Short answer', hint: 'A line' },
    { v: 'long', label: 'Paragraph', hint: 'A few sentences' },
    { v: 'list', label: 'List', hint: 'Several items, shown as tags' },
  ];
  return (
    <div className="adm-pf">
      <span className="hint">Teachers see these in Settings, in this order. Colleagues see the answers on their profile.</span>
      {fields.map((f, i) => (
        <span key={f.id} className={'adm-pf-row' + (f.on ? '' : ' off')}>
          <button type="button" className="adm-pf-ic" onClick={(e) => setPick({ id: f.id, r: e.currentTarget.getBoundingClientRect() })} aria-label={`Icon for ${f.label}`} data-tip="Choose an icon">
            <ProfileIcon name={f.icon} size={18} />
          </button>
          <FieldLabel value={f.label} onSave={(label) => set(f.id, { label })} />
          <Select value={f.kind} options={KINDS} onChange={(kind) => set(f.id, { kind })} label={`Kind of answer for ${f.label}`} />
          <span className="adm-pf-move">
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              ↑
            </button>
            <button type="button" className="icon-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              ↓
            </button>
          </span>
          <Switch on={f.on} onChange={(on) => set(f.id, { on })} label={`Ask for ${f.label}`} />
          {f.custom ? (
            <button type="button" className="icon-btn" onClick={() => save(fields.filter((x) => x.id !== f.id))} aria-label={`Delete ${f.label}`} data-tip="Delete the field">
              ×
            </button>
          ) : (
            <span className="adm-pf-gap" />
          )}
        </span>
      ))}
      <button type="button" className="btn small-btn adm-pf-add" onClick={() => save([...fields, { id: 'c' + Date.now().toString(36), label: 'New field', icon: 'star', kind: 'short', on: true, custom: true }])}>
        + Add a field
      </button>
      {pick && <IconPicker at={pick.r} value={fields.find((f) => f.id === pick.id)?.icon ?? ''} onPick={(icon) => (set(pick.id, { icon }), setPick(null))} onClose={() => setPick(null)} />}
    </div>
  );
}

function FieldLabel({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="adm-pf-label" value={v} maxLength={50} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Field name" />;
}

function IconPicker({ at, value, onPick, onClose }: { at: DOMRect; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', esc));
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="adm-icons" role="listbox" aria-label="Icons" style={{ left: Math.min(at.left, window.innerWidth - 300), top: at.bottom + 6 }}>
      {PROFILE_ICONS.map((k) => (
        <button key={k} type="button" role="option" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onPick(k)} aria-label={k}>
          <ProfileIcon name={k} size={18} />
        </button>
      ))}
    </div>,
    document.body,
  );
}

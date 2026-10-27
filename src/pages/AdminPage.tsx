import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { ask } from '../lib/ask';
import { imageToData } from '../lib/flash';
import { createClass } from '../lib/classes';
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
  inviteTeachers,
  useOrgInvites,
  cancelInvite,
  resendInvite,
  inviteLink,
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

// Admin: for the app's owner, every teacher, organisation and switch; for an organisation's
// admins, their organisation: its teachers, branding, rules, shared drives and classes.

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Tab = 'teachers' | 'orgs' | 'apps' | 'defaults';

export function AdminPage() {
  const { user } = useAuth();
  const owner = isOwnerEmail(user?.email);
  const orgs = useOrgs(owner, user?.email);
  const teachers = useTeachers(owner);
  const accounts = useAccounts(owner);
  const [tab, setTab] = useState<Tab>('teachers');
  const [orgId, setOrgId] = useState('');
  useEffect(() => {
    if (!owner && orgs?.length && !orgId) setOrgId(orgs[0].id);
  }, [owner, orgs, orgId]);
  const org = orgs?.find((o) => o.id === orgId) ?? null;
  if (!user || orgs === null) return <Loader full label="Opening Admin" />;
  if (!owner && !orgs.length)
    return (
      <div className="shell">
        <TopBar>
          <MainNav on="" />
        </TopBar>
        <div className="adm-none">
          <strong>Admin is for organisation admins</strong>
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
        <aside className="adm-nav" aria-label="Admin">
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
  const [counts, setCounts] = useState<Record<string, number>>({});
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
        <span className="hint">{teachers.length} accounts</span>
        <span style={{ flex: 1 }} />
        <input className="adm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" />
      </span>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Classes</th>
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
                  <td>{counts[t.uid] ?? '…'}</td>
                  <td>
                    <select value={a.org ?? ''} onChange={(e) => void setTeacherOrg(t, orgs.find((o) => o.id === e.target.value) ?? null, inOrg)}>
                      <option value="">None</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {inOrg ? (
                      <span className="hint">From {inOrg.name}</span>
                    ) : (
                      <select value={a.plan ?? 'free'} onChange={(e) => void saveAccount(t, { plan: e.target.value as Plan, limitGb: PLANS.find((p) => p.k === e.target.value)?.gb })}>
                        {PLANS.map((p) => (
                          <option key={p.k} value={p.k}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {inOrg ? (
                      <span className="hint">Set by {inOrg.name}</span>
                    ) : (
                      <GbInput value={a.limitGb ?? PLANS.find((p) => p.k === (a.plan ?? 'free'))?.gb ?? 1} onSave={(gb) => void saveAccount(t, { limitGb: gb })} />
                    )}
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
    ['space', 'Space'],
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
      <span className="hint">Teachers here are colleagues of each other, always, and see each other's job titles and profiles. A teacher trainer makes teacher training classes for the others.</span>
      <InviteTeachers org={org} />
      {owner && (
        <span className="adm-new">
          <select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Teacher to add">
            <option value="">Add a teacher…</option>
            {free.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name || t.email} · {t.email}
                {accounts[t.uid]?.org ? ` (now in ${orgs.find((o) => o.id === accounts[t.uid]?.org)?.name ?? 'another'})` : ''}
              </option>
            ))}
          </select>
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
            <th title="Teacher trainers make teacher training classes for the teachers here">Teacher trainer</th>
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
                <Switch on={!!t.trainer} onChange={(v) => void setTrainer(org, uid, v)} label={`${t.name || t.email} is a teacher trainer`} />
              </td>
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
              <td colSpan={5} className="hint">
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
      await createClass(who, { name: name.trim(), level, themeColor: 'flame', org: org.id, extra: { ...(pol?.names ? { profile: { names: pol.names } } : {}), ...(pol?.learnerEmails ? { accounts: { email: pol.learnerEmails === 'none' ? 'off' : pol.learnerEmails } } : {}) } });
      setDone(`${name.trim()} is ready for ${org.teachers[who]?.name || 'the teacher'}.`);
      setName('');
    } catch {
      setDone('The class could not be made. Try again.');
    }
  };
  return (
    <div className="adm-card">
      <span className="hint">{org.policy?.createClasses === false ? 'Your teachers cannot make classes themselves: make them here.' : 'Teachers make their own classes. You can also make one for a teacher here.'}</span>
      <div className="adm-form">
        <label className="field">
          <span>Teacher</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose…</option>
            {teachers.map(([uid, t]) => (
              <option key={uid} value={uid}>
                {t.name || t.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Class name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Monday B1 evening" maxLength={80} />
        </label>
        <label className="field">
          <span>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn primary" disabled={!who || !name.trim()} onClick={() => void make()}>
          Make the class
        </button>
      </div>
      {done && <span className="hint">{done}</span>}
    </div>
  );
}

function OrgRules({ org }: { org: Org }) {
  const p = org.policy ?? {};
  const set = (x: Parameters<typeof savePolicy>[1]) => void savePolicy(org, x);
  return (
    <div className="adm-card">
      <label className="adm-row">
        <span>
          <b>Teachers make their own classes</b>
          <span className="hint">Off: admins make the classes, in Classes here</span>
        </span>
        <Switch on={p.createClasses !== false} onChange={(v) => set({ createClasses: v })} label="Teachers make their own classes" />
      </label>
      <label className="adm-row">
        <span>
          <b>Colleagues outside {org.name}</b>
          <span className="hint">Teachers here are always colleagues of each other</span>
        </span>
        <select value={org.outside ?? 'anyone'} onChange={(e) => void saveOutside(org, e.target.value as 'anyone' | 'org')}>
          <option value="anyone">Teachers can add any colleague</option>
          <option value="org">Only colleagues in {org.name}</option>
        </select>
      </label>
      <label className="adm-row">
        <span>
          <b>Learners' email addresses</b>
          <span className="hint">For every class of these teachers. Learners always sign in with the class code and a PIN</span>
        </span>
        <select value={p.learnerEmails ?? ''} onChange={(e) => set({ learnerEmails: (e.target.value || undefined) as never })}>
          <option value="">The teacher decides</option>
          <option value="none">No emails</option>
          <option value="optional">Learners can add one</option>
          <option value="required">Every learner adds one</option>
        </select>
      </label>
      <label className="adm-row">
        <span>
          <b>Teachers see learners' emails</b>
          <span className="hint">Learners never see each other's emails</span>
        </span>
        <Switch on={p.seeEmails !== false} onChange={(v) => set({ seeEmails: v })} label="Teachers see learners' emails" />
      </label>
      <label className="adm-row">
        <span>
          <b>Learners' names to each other</b>
          <span className="hint">Teachers always see full names</span>
        </span>
        <select value={p.names ?? ''} onChange={(e) => set({ names: (e.target.value || undefined) as never })}>
          <option value="">The teacher decides</option>
          <option value="first">First name only</option>
          <option value="initial">First name and initial</option>
          <option value="full">Full name</option>
        </select>
      </label>
      <label className="adm-row">
        <span>
          <b>Teacher profiles</b>
          <span className="hint">Teachers are asked to introduce themselves: about them, hobbies, languages. Only teachers here see them</span>
        </span>
        <Switch on={!!p.profiles} onChange={(v) => set({ profiles: v })} label="Teacher profiles" />
      </label>
      <label className="adm-row">
        <span>
          <b>Trainers add teachers from outside {org.name}</b>
          <span className="hint">Teacher trainers always add teachers from here to their training classes. On: they can also add others by name</span>
        </span>
        <Switch on={!!p.externalTrainees} onChange={(v) => set({ externalTrainees: v })} label="Trainers add teachers from outside" />
      </label>
      <span className="adm-sub">Apps for these teachers</span>
      {APP_KEYS.map((k) => (
        <label key={k.k} className="adm-row">
          <b>{k.name}</b>
          <Switch on={p.apps?.[k.k] ?? true} onChange={(v) => set({ apps: { ...(p.apps ?? {}), [k.k]: v } })} label={k.name} />
        </label>
      ))}
    </div>
  );
}

const COLOURS = ['#c8764a', '#3667a6', '#2f7f6f', '#7a4fa3', '#b64a3c', '#a8701f', '#4f6b7a', '#2f2e2d'];
function OrgBrand({ org }: { org: Org }) {
  const b = org.brand ?? {};
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        await saveBrand(org, { ...b, logo: await imageToData(f, 360) });
      } finally {
        setBusy(false);
      }
    };
    inp.click();
  };
  return (
    <div className="adm-card">
      <span className="adm-sub">Theme colour</span>
      <span className="adm-swatches">
        {COLOURS.map((c) => (
          <button key={c} type="button" className={'adm-sw' + (b.color === c ? ' on' : '')} style={{ background: c }} onClick={() => void saveBrand(org, { ...b, color: c })} aria-label={c} />
        ))}
        <input type="color" value={b.color ?? '#5d6f80'} onChange={(e) => void saveBrand(org, { ...b, color: e.target.value })} aria-label="Another colour" />
      </span>
      <span className="adm-sub">Logo</span>
      <span className="adm-logo-row">
        {b.logo ? <img className="adm-logo big" src={b.logo} alt="" /> : <span className="adm-org-ic big">{org.name.slice(0, 1)}</span>}
        <button type="button" className="btn small-btn" disabled={busy} onClick={pick}>
          {busy ? 'Adding…' : b.logo ? 'Change the logo' : 'Upload a logo'}
        </button>
        {b.logo && (
          <button type="button" className="btn link small" onClick={() => void saveBrand(org, { ...b, logo: '' })}>
            Remove
          </button>
        )}
      </span>
      <span className="hint">The logo and colour go on the worksheets your teachers print or download, and next to ELT Suite at the top of their screens.</span>
      <div className="adm-preview" style={{ ['--org' as string]: b.color ?? '#5d6f80' }}>
        {b.logo && <img src={b.logo} alt="" />}
        <span>
          <b>Unit 4 · Present perfect</b>
          <span className="hint">Name ______________ · Class ________</span>
        </span>
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
          <select value={org.plan} onChange={(e) => void saveOrg(org.id, { plan: e.target.value as Plan })}>
            {PLANS.map((p) => (
              <option key={p.k} value={p.k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
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
  const [email, setEmail] = useState('');
  return (
    <div className="adm-card">
      <span className="hint">Admins run this organisation in Admin: its teachers' classes, rules, branding and shared drives. They sign in with these emails.</span>
      {org.adminEmails.map((e) => (
        <span key={e} className="adm-row">
          <b>{e}</b>
          {owner && (
            <button type="button" className="btn link small" onClick={() => void removeOrgAdmin(org, e)}>
              Remove
            </button>
          )}
        </span>
      ))}
      {!org.adminEmails.length && <span className="hint">No admins yet.</span>}
      {owner && (
        <span className="adm-new">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.org" onKeyDown={(e) => e.key === 'Enter' && /\S+@\S+/.test(email) && void addOrgAdmin(org, email).then(() => setEmail(''))} />
          <button type="button" className="btn primary" disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => void addOrgAdmin(org, email).then(() => setEmail(''))}>
            Add admin
          </button>
        </span>
      )}
    </div>
  );
}

// Shared drives: each holds folders; each folder is open to all teachers to view or edit, or to
// none, with exceptions for chosen teachers.
function OrgDrives({ org }: { org: Org }) {
  const { user } = useAuth();
  const folders = useDrive(org);
  const drives = useMemo(() => ({ main: { name: 'Shared drive', quotaGb: 5 }, ...(org.drives ?? {}) }), [org.drives]);
  const [newDrive, setNewDrive] = useState('');
  const [open, setOpen] = useState('');
  const [use, setUse] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!folders) return;
    for (const k of Object.keys(drives)) void driveUse(folders.filter((f) => (f.drive ?? 'main') === k).map((f) => f.id)).then((n) => setUse((u) => ({ ...u, [k]: n })));
  }, [folders, drives]);
  if (!user) return null;
  const addDrive = () => {
    const id = 'd' + Date.now().toString(36);
    void saveDrives(org, { ...(org.drives ?? {}), main: drives.main, [id]: { name: newDrive.trim(), quotaGb: 5 } }).then(() => setNewDrive(''));
  };
  return (
    <div className="adm-drives">
      <span className="hint">Every teacher in {org.name} finds these folders in Files, under Shared folders. You decide who can open and change each one. Files in them use the drive's space.</span>
      {Object.entries(drives).map(([k, d]) => {
        const list = (folders ?? []).filter((f) => (f.drive ?? 'main') === k);
        return (
          <div key={k} className="adm-card adm-drive">
            <span className="adm-drive-h">
              <UiIcon name="archive" size={18} />
              <DriveName value={d.name} onSave={(name) => void saveDrives(org, { ...drives, [k]: { ...d, name } })} />
              <span style={{ flex: 1 }} />
              <span className="hint">{formatBytes(use[k] ?? 0)} of</span>
              <GbInput value={d.quotaGb} onSave={(gb) => void saveDrives(org, { ...drives, [k]: { ...d, quotaGb: gb } })} max={org.limitGb} />
            </span>
            {list.map((f) => (
              <DriveFolderRow key={f.id} org={org} f={f} me={user.uid} open={open === f.id} onToggle={() => setOpen(open === f.id ? '' : f.id)} />
            ))}
            <NewFolder onMake={(name, all) => void newDriveFolder(org, { uid: user.uid }, name, all, k)} />
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

function DriveName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return <input className="adm-drivename" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} />;
}

function NewFolder({ onMake }: { onMake: (name: string, all: DriveAccess['all']) => void }) {
  const [name, setName] = useState('');
  const [all, setAll] = useState<DriveAccess['all']>('view');
  return (
    <span className="adm-new">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder, for example: Exam papers" />
      <select value={all} onChange={(e) => setAll(e.target.value as DriveAccess['all'])} aria-label="Everyone can">
        <option value="view">Everyone can view</option>
        <option value="edit">Everyone can edit</option>
        <option value="none">Only chosen teachers</option>
      </select>
      <button type="button" className="btn small-btn primary" disabled={!name.trim()} onClick={() => (onMake(name, all), setName(''))}>
        Add folder
      </button>
    </span>
  );
}

function DriveFolderRow({ org, f, me, open, onToggle }: { org: Org; f: { id: string; name: string; access: DriveAccess; memberIds: string[]; org: string; drive?: string }; me: string; open: boolean; onToggle: () => void }) {
  const save = (a: DriveAccess) => void saveDriveAccess(org, f as never, { uid: me }, a);
  const label = { view: 'Everyone can view', edit: 'Everyone can edit', none: 'Only chosen teachers' }[f.access.all];
  const exceptions = Object.keys(f.access.people).length;
  return (
    <div className={'adm-folder' + (open ? ' open' : '')}>
      <button type="button" className="adm-folder-h" onClick={onToggle}>
        <span className="adm-ch" aria-hidden="true">›</span>
        <b>{f.name}</b>
        <span className="hint">
          {label}
          {exceptions ? ` · ${exceptions} ${exceptions === 1 ? 'exception' : 'exceptions'}` : ''}
        </span>
      </button>
      {open && (
        <div className="adm-folder-b">
          <label className="adm-row">
            <b>Everyone in {org.name}</b>
            <select value={f.access.all} onChange={(e) => save({ ...f.access, all: e.target.value as DriveAccess['all'] })}>
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
              <option value="none">No access</option>
            </select>
          </label>
          {Object.entries(org.teachers).map(([uid, t]) => {
            const r = f.access.people[uid];
            return (
              <label key={uid} className="adm-row sub">
                <span>
                  {t.name || t.email}
                  {t.title && <span className="hint"> · {t.title}</span>}
                </span>
                <select
                  value={r ?? ''}
                  onChange={(e) => {
                    const people = { ...f.access.people };
                    if (e.target.value) people[uid] = e.target.value as 'view' | 'edit' | 'none';
                    else delete people[uid];
                    save({ ...f.access, people });
                  }}
                >
                  <option value="">Like everyone</option>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                  <option value="none">No access</option>
                </select>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inviting teachers by email: a new teacher gets a link to finish their account; a teacher with an
// account gets an invitation to say yes or no to, with what the admins can set and see.
function InviteTeachers({ org }: { org: Org }) {
  const { user, profile } = useAuth();
  const invites = useOrgInvites(org);
  const [rows, setRows] = useState([{ name: '', email: '', title: '' }]);
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
        return { email: e >= 0 ? c[e] : '', name: c.filter((_, i) => i !== e)[0] ?? '', title: c.filter((_, i) => i !== e)[1] ?? '' };
      })
      .filter((r) => r.email);
  const list = paste ? fromText() : rows.filter((r) => /\S+@\S+\.\S+/.test(r.email));
  const send = async () => {
    if (!user || !list.length) return;
    const n = await inviteTeachers(org, list, { uid: user.uid, name: profile?.displayName || user.displayName || 'An admin' });
    setNote(`${n} ${n === 1 ? 'invitation' : 'invitations'} on the way. Emails go out within 15 minutes.`);
    setRows([{ name: '', email: '', title: '' }]);
    setText('');
  };
  const set = (i: number, k: 'name' | 'email' | 'title', v: string) => setRows((r) => { const n = r.map((x, j) => (j === i ? { ...x, [k]: v } : x)); return i === n.length - 1 && v ? [...n, { name: '', email: '', title: '' }] : n; });
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
        <textarea className="adm-paste" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name, email, job title: one teacher a line\nSofia Rossi, sofia@school.org, Senior teacher\nTariq Aziz, tariq@school.org'} />
      ) : (
        <div className="adm-inv-rows">
          {rows.map((r, i) => (
            <span key={i} className="adm-inv-row">
              <input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Name" aria-label="Name" />
              <input type="email" value={r.email} onChange={(e) => set(i, 'email', e.target.value)} placeholder="Email" aria-label="Email" />
              <input value={r.title} onChange={(e) => set(i, 'title', e.target.value)} placeholder="Job title (optional)" aria-label="Job title" />
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
                  {i.title ? ` · ${i.title}` : ''} · {i.mailed ? (i.existing ? 'Asked to join' : 'Finishing their account') : 'Email on the way'}
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

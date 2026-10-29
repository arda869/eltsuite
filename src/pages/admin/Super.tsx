import { useEffect, useState } from 'react';
import { Select } from '../../components/Select';
import { UiIcon } from '../../components/UiIcon';
import { Avatar } from '../../components/avatars';
import { SfxSettings } from '../../components/SfxSettings';
import { SoundRecordings } from '../../components/SoundRecordings';
import { ask, tell } from '../../lib/ask';
import { openAsUser } from '../../lib/proxy';
import { APP_LIST, PLANS, addSuperAdmin, newOrg, removeSuperAdmin, saveAccount, saveAccountNote, setFeature, setTeacherOrg, useFeatures, useSuperAdmins, type Plan, type Teacher } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { OWNER_EMAIL } from '../../lib/phonAudio';
import { GB, BulkBar, Check, Drawer, DrawerPart, Empty, GbInput, Meter, PageHead, Panel, Pills, Search, Setting, Sheet, Switch, Who, ago, dateStr, daysSince, fmtBytes, fmtGb, plural, useNote, useSelection } from './ui';
import { WAIT_DAYS, givenGb, limitGbOf, teachesIn, usedOf } from './attention';
import { saveSuperWorkbook } from './sheets';
import type { Go, SuperData } from './types';

// ------------------------------------------------------------------ every teacher
export function SuperTeachers({ d, go, params }: { d: SuperData; go: Go; params: URLSearchParams }) {
  const { teachers, accounts, orgs, classes } = d;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [sheet, setSheet] = useState<'' | 'plan' | 'org'>('');
  const [toast, say] = useNote();
  const f = params.get('f') || 'all';
  const open = params.get('t') || '';
  const active = classes.filter((c) => c.status === 'active');
  const stats = (t: Teacher) => {
    const mine = active.filter((c) => teachesIn(c, t.uid));
    const a = accounts[t.uid];
    const used = usedOf(a, t);
    const of = limitGbOf(a, orgs, t.uid) * GB;
    return { classes: mine.length, learners: mine.reduce((n, c) => n + (c.learnerCount ?? 0), 0), used, of, measured: a?.usedBytes !== undefined || t.usedBytes !== undefined };
  };
  const FILTERS: Record<string, (t: Teacher) => boolean> = {
    all: () => true,
    alone: (t) => !accounts[t.uid]?.org,
    org: (t) => !!accounts[t.uid]?.org,
    noclass: (t) => !stats(t).classes,
    full: (t) => !!accounts[t.uid]?.over,
    near: (t) => { const s = stats(t); return !accounts[t.uid]?.over && s.used >= s.of * 0.9; },
    paused: (t) => !!accounts[t.uid]?.suspended,
  };
  const pills = [
    { v: 'all', label: 'Everyone' },
    { v: 'alone', label: 'On their own' },
    { v: 'org', label: 'In an organisation' },
    { v: 'noclass', label: 'Without a class' },
    { v: 'near', label: 'Nearly full' },
    { v: 'full', label: 'Full' },
    { v: 'paused', label: 'Paused' },
  ].map((p) => ({ ...p, n: teachers.filter(FILTERS[p.v]).length }));
  const SORTS: Record<string, (a: Teacher, b: Teacher) => number> = {
    new: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email),
    learners: (a, b) => stats(b).learners - stats(a).learners,
    space: (a, b) => stats(b).used - stats(a).used,
  };
  const s = q.trim().toLowerCase();
  const shown = teachers.filter((t) => (FILTERS[f] ?? FILTERS.all)(t) && (!s || `${t.name} ${t.email}`.toLowerCase().includes(s))).sort(SORTS[sort]);
  const sel = useSelection(shown.map((t) => t.uid));
  const chosen = teachers.filter((t) => sel.has(t.uid));
  const orgOf = (t: Teacher) => orgs.find((o) => o.id === accounts[t.uid]?.org) ?? null;
  const pause = async (on: boolean) => {
    const list = chosen.filter((t) => !!accounts[t.uid]?.suspended !== on);
    if (!list.length) return say(on ? 'They’re already paused.' : 'None of them is paused.');
    if (!(await ask(on ? `Pause ${plural(list.length, 'account')}? They can’t open ELT Suite until you turn them back on. Nothing is deleted.` : `Let ${plural(list.length, 'teacher')} use ELT Suite again?`, { ok: on ? 'Pause' : 'Turn back on' }))) return;
    await Promise.all(list.map((t) => saveAccount(t, { suspended: on })));
    say(on ? `${plural(list.length, 'account')} paused.` : `${plural(list.length, 'account')} on again.`);
  };
  const cur = teachers.find((t) => t.uid === open);
  return (
    <div className="hq-page">
      <PageHead
        title="Teachers"
        lede={`${plural(teachers.length, 'account')} in ELT Suite, ${teachers.filter((t) => daysSince(t.createdAt) < 7 && t.createdAt).length} new this week.`}
        actions={
          <>
            <button type="button" className="btn primary" onClick={() => go({ tab: 'codes' })}>
              <UiIcon name="plus" size={15} /> Invite teachers
            </button>
            <button type="button" className="btn" disabled={!teachers.length} onClick={() => void saveSuperWorkbook(teachers, accounts, orgs, classes, d.invites)}>
              <UiIcon name="export" size={15} /> Export
            </button>
          </>
        }
      />
      <div className="hq-tools">
        <Search value={q} onChange={setQ} placeholder="Search by name or email" label="Search teachers" />
        <div className="hq-tools-r">
          <Select value={sort} options={[{ v: 'new', label: 'Newest first' }, { v: 'name', label: 'By name' }, { v: 'learners', label: 'Most learners' }, { v: 'space', label: 'Most space' }]} onChange={setSort} label="Order" />
        </div>
        <Pills value={f} options={pills} onChange={(v) => go({ tab: 'teachers', f: v === 'all' ? '' : v, replace: true })} label="Show" />
      </div>
      {d.loading ? (
        <p className="hint">Opening the teachers…</p>
      ) : !shown.length ? (
        <Empty title={teachers.length ? 'Nobody here' : 'No teachers yet'} text={teachers.length ? 'No teacher matches. Try another filter or search.' : 'Teachers show here when they sign up.'} action={teachers.length ? <button type="button" className="btn" onClick={() => (setQ(''), go({ tab: 'teachers', replace: true }))}>Show everyone</button> : undefined} />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th className="hq-c-check">
                  <Check checked={sel.every} mixed={sel.some && !sel.every} onChange={sel.all} label="Select every teacher shown" />
                </th>
                <th>Teacher</th>
                <th>Organisation and plan</th>
                <th className="hq-n">Classes</th>
                <th className="hq-n">Learners</th>
                <th>Space</th>
                <th className="hq-c-go">
                  <span className="hq-sr">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const a = accounts[t.uid] ?? {};
                const st = stats(t);
                const o = orgOf(t);
                return (
                  <tr key={t.uid} className={(sel.has(t.uid) ? 'hq-picked ' : '') + (a.suspended ? 'paused' : '')} onClick={() => go({ tab: 'teachers', f: f === 'all' ? '' : f, t: t.uid })}>
                    <td className="hq-c-check" data-label="">
                      <Check checked={sel.has(t.uid)} onChange={(v) => sel.toggle(t.uid, v)} label={`Select ${t.name || t.email}`} />
                    </td>
                    <td data-label="Teacher">
                      <button type="button" className="hq-row-open" onClick={(e) => (e.stopPropagation(), go({ tab: 'teachers', f: f === 'all' ? '' : f, t: t.uid }))}>
                        <Who name={t.name || 'No name'} sub={t.email} pic={t.avatar} />
                      </button>
                      <span className="hq-roles">
                        {a.suspended && <span className="hq-chip">Paused</span>}
                        {a.over && <span className="hq-chip late">Full</span>}
                        {t.createdAt && daysSince(t.createdAt) < 7 && <span className="hq-chip">New</span>}
                      </span>
                    </td>
                    <td data-label="Organisation">
                      {o ? (
                        <span className="hq-orgcell">
                          <span className="hq-dot" style={{ background: o.brand?.color ?? '#5d6f80' }} />
                          {o.name}
                        </span>
                      ) : (
                        <span>{PLANS.find((p) => p.k === (a.plan ?? 'free'))?.label ?? 'Free'} plan</span>
                      )}
                    </td>
                    <td className="hq-n" data-label="Classes">
                      {st.classes || <span className="hq-quiet">None</span>}
                    </td>
                    <td className="hq-n" data-label="Learners">
                      {st.learners}
                    </td>
                    <td data-label="Space">
                      <span className="hq-space">
                        <Meter used={st.used} of={st.of} small />
                        <span>{st.measured ? `${fmtBytes(st.used)} of ${fmtGb(st.of / GB)}` : `Not measured, ${fmtGb(st.of / GB)}`}</span>
                      </span>
                    </td>
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
      <BulkBar n={chosen.length} what={['teacher', 'teachers']} onClear={sel.clear}>
        <button type="button" className="btn small-btn" onClick={() => setSheet('org')}>
          Organisation
        </button>
        <button type="button" className="btn small-btn" onClick={() => setSheet('plan')}>
          Plan
        </button>
        <button type="button" className="btn small-btn" onClick={() => void pause(true)}>
          Pause
        </button>
        <button type="button" className="btn small-btn" onClick={() => void pause(false)}>
          Turn back on
        </button>
        <button type="button" className="btn small-btn" onClick={() => void saveSuperWorkbook(teachers, accounts, orgs, classes, d.invites, chosen.map((t) => t.uid))}>
          Export
        </button>
      </BulkBar>
      {cur && <SuperTeacher d={d} t={cur} go={go} onClose={() => go({ tab: 'teachers', f: f === 'all' ? '' : f, replace: true })} />}
      {sheet === 'plan' && <BulkPlan d={d} list={chosen} onClose={() => setSheet('')} onDone={(m) => (say(m), setSheet(''), sel.clear())} />}
      {sheet === 'org' && <BulkOrg d={d} list={chosen} onClose={() => setSheet('')} onDone={(m) => (say(m), setSheet(''), sel.clear())} />}
      {toast}
    </div>
  );
}

function BulkPlan({ d, list, onClose, onDone }: { d: SuperData; list: Teacher[]; onClose: () => void; onDone: (m: string) => void }) {
  const [plan, setPlan] = useState<Plan>('teacher');
  const alone = list.filter((t) => !d.accounts[t.uid]?.org);
  return (
    <Sheet title={`Plan for ${plural(alone.length, 'teacher')}`} onClose={onClose}>
      {alone.length < list.length && <p className="hint">{plural(list.length - alone.length, 'teacher')} in an organisation keep the organisation's plan.</p>}
      <Select value={plan} options={PLANS.map((p) => ({ v: p.k, label: p.label, hint: p.about }))} onChange={setPlan} label="Plan" />
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!alone.length} onClick={() => void Promise.all(alone.map((t) => saveAccount(t, { plan, limitGb: PLANS.find((p) => p.k === plan)?.gb }))).then(() => onDone(`${plural(alone.length, 'teacher')} on the ${PLANS.find((p) => p.k === plan)?.label} plan.`))}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function BulkOrg({ d, list, onClose, onDone }: { d: SuperData; list: Teacher[]; onClose: () => void; onDone: (m: string) => void }) {
  const [to, setTo] = useState('');
  const org = d.orgs.find((o) => o.id === to) ?? null;
  const save = async () => {
    for (const t of list) await setTeacherOrg(t, org, d.orgs.find((o) => o.id === d.accounts[t.uid]?.org) ?? null);
    onDone(org ? `${plural(list.length, 'teacher')} in ${org.name} now.` : `${plural(list.length, 'teacher')} on their own now.`);
  };
  return (
    <Sheet title={`Organisation for ${plural(list.length, 'teacher')}`} onClose={onClose}>
      <p className="hint">They take the organisation's plan and space at once, without being asked. To ask them first, invite them from the organisation instead.</p>
      <Select value={to} options={[{ v: '', label: 'None: on their own' }, ...d.orgs.map((o) => ({ v: o.id, label: o.name }))]} onChange={setTo} label="Organisation" search />
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => void save()}>
          {org ? `Move to ${org.name}` : 'Take them out'}
        </button>
      </div>
    </Sheet>
  );
}

// Making a teacher a super admin, or no longer one, from their side panel (the same list as Super admins).
function SuperSwitch({ t }: { t: Teacher }) {
  const { user, profile } = useAuth();
  const list = useSuperAdmins(true);
  const email = (t.email ?? '').trim().toLowerCase();
  if (!email || list === null) return null;
  const owner = email === OWNER_EMAIL;
  const on = owner || list.some((s) => s.email === email);
  const name = t.name || email;
  const me = { uid: user?.uid ?? '', name: (profile?.role === 'teacher' ? profile.displayName : '') || user?.displayName || user?.email || 'A super admin' };
  const flip = async () => {
    if (on) {
      const self = email === (user?.email ?? '').toLowerCase();
      if (!(await ask(self ? 'Stop being a super admin yourself? You’ll lose Super Admin straight away.' : `Stop ${name} being a super admin?`, { ok: 'Remove', danger: true }))) return;
      await removeSuperAdmin(email);
    } else {
      if (!(await ask(`Make ${name} a super admin? They’ll see and change everything in ELT Suite: every teacher, organisation, ticket and switch, and they can make other super admins. They need a verified email (Google, or a confirmed one).`, { ok: 'Make them a super admin' }))) return;
      await addSuperAdmin(email, t.name ?? '', me);
    }
  };
  return (
    <DrawerPart title="Super admin">
      <Setting title={on ? 'A super admin' : 'Not a super admin'} about={owner ? 'The owner of ELT Suite is always one.' : on ? 'They run all of ELT Suite with you.' : 'Super admins run all of ELT Suite: every teacher, organisation, ticket and switch.'}>
        {!owner && <Switch on={on} onChange={() => void flip()} label={`${name} is a super admin`} />}
      </Setting>
    </DrawerPart>
  );
}

function SuperTeacher({ d, t, go, onClose }: { d: SuperData; t: Teacher; go: Go; onClose: () => void }) {
  const a = d.accounts[t.uid] ?? {};
  const org = d.orgs.find((o) => o.id === a.org) ?? null;
  const mine = d.classes.filter((c) => teachesIn(c, t.uid));
  const used = usedOf(a, t);
  const of = limitGbOf(a, d.orgs, t.uid);
  const [note, setNote] = useState(a.note ?? '');
  useEffect(() => setNote(a.note ?? ''), [a.note]);
  const name = t.name || t.email;
  const moveTo = async (id: string) => {
    const next = d.orgs.find((o) => o.id === id) ?? null;
    if (!(await ask(next ? `Move ${name} to ${next.name}? They take its plan and space at once.` : `Take ${name} out of ${org?.name}? They go back to the free plan.`, { ok: next ? 'Move' : 'Take out' }))) return;
    await setTeacherOrg(t, next, org);
  };
  return (
    <Drawer
      title={name}
      sub={t.email}
      pic={<Avatar k={t.avatar} name={name} size={46} />}
      onClose={onClose}
      foot={
        <>
        <button type="button" className="btn small-btn" onClick={() => void openAsUser({ uid: t.uid, name }).then((m) => m && void tell(m))} data-tip="A new tab, signed in as them, to see ELT Suite as they do">
          Sign in as {name.split(' ')[0]}
        </button>
        <button type="button" className={'btn small-btn' + (a.suspended ? ' primary' : ' danger')} onClick={() => void ask(a.suspended ? `Let ${name} use ELT Suite again?` : `Pause ${name}'s account? They can’t open ELT Suite until you turn it back on. Nothing is deleted.`, { ok: a.suspended ? 'Turn back on' : 'Pause' }).then((ok) => ok && void saveAccount(t, { suspended: !a.suspended }))}>
          {a.suspended ? 'Turn the account back on' : 'Pause the account'}
        </button>
        </>
      }
    >
      <div className="hq-dfacts">
        {a.suspended && <span className="hq-chip">Paused</span>}
        {a.over && <span className="hq-chip late">Full</span>}
        <span className="hint">Signed up {t.createdAt ? `${dateStr(t.createdAt)}, ${ago(t.createdAt)}` : 'at a time not recorded'}</span>
      </div>
      <DrawerPart title="Account">
        <div className="field">
          <span>Organisation</span>
          <Select value={a.org ?? ''} options={[{ v: '', label: 'None: on their own' }, ...d.orgs.map((o) => ({ v: o.id, label: o.name }))]} onChange={(v) => void moveTo(v)} label="Organisation" search />
        </div>
        {org ? (
          <p className="hint">
            Plan and space come from {org.name}.{' '}
            <button type="button" className="btn link small" onClick={() => go({ org: org.id, tab: 'teachers', t: t.uid })}>
              Open them in {org.name}
            </button>
          </p>
        ) : (
          <>
            <div className="field">
              <span>Plan</span>
              <Select value={a.plan ?? 'free'} options={PLANS.map((p) => ({ v: p.k, label: p.label, hint: p.about }))} onChange={(v) => void saveAccount(t, { plan: v as Plan, limitGb: PLANS.find((p) => p.k === v)?.gb })} label="Plan" />
            </div>
            <Setting title="Space limit" about="The plan's amount, unless you change it here.">
              <GbInput value={of} onSave={(v) => void saveAccount(t, { limitGb: v })} label={`Space for ${name} in GB`} />
            </Setting>
          </>
        )}
      </DrawerPart>
      <SuperSwitch t={t} />
      <DrawerPart title="Space used">
        <div className="hq-dspace">
          <Meter used={used} of={of * GB} />
          <span>{a.usedBytes === undefined && t.usedBytes === undefined ? `Not measured yet, of ${fmtGb(of)}` : <><b>{fmtBytes(used)}</b> used of {fmtGb(of)}</>}</span>
        </div>
      </DrawerPart>
      <DrawerPart title="Apps">
        <p className="hint">Their own switch comes before their organisation's and everyone's.</p>
        {APP_LIST.map((k) => {
          const on = a.features?.[k.k] ?? true;
          return (
            <Setting key={k.k} title={k.name} sub>
              <Switch on={on} onChange={(v) => void saveAccount(t, { features: { ...(a.features ?? {}), [k.k]: v } })} label={`${k.name} for ${name}`} />
            </Setting>
          );
        })}
      </DrawerPart>
      <DrawerPart title={mine.length ? `Classes (${mine.length})` : 'Classes'}>
        {mine.length ? (
          <ul className="hq-dlist">
            {mine.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b>
                  <span>
                    {c.level}, {plural(c.learnerCount ?? 0, 'learner')}
                    {c.status === 'archived' ? ', archived' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No classes yet.</p>
        )}
      </DrawerPart>
      <DrawerPart title="Your note">
        <textarea className="hq-in hq-note" rows={3} value={note} placeholder="Only you see this. For example: met at the IATEFL stand" aria-label={`Your note on ${name}`} onChange={(e) => setNote(e.target.value)} onBlur={() => note.trim() !== (a.note ?? '') && void saveAccountNote(t, note)} />
      </DrawerPart>
    </Drawer>
  );
}

// ------------------------------------------------------------------ organisations
export function SuperOrgs({ d, go, params }: { d: SuperData; go: Go; params: URLSearchParams }) {
  const { orgs, classes, invites } = d;
  const [making, setMaking] = useState(false);
  const [q, setQ] = useState('');
  const f = params.get('f') || 'all';
  const FILTERS: Record<string, (o: (typeof orgs)[number]) => boolean> = { all: () => true, noadmin: (o) => !o.adminEmails.length, over: (o) => givenGb(o) > o.limitGb };
  const pills = [
    { v: 'all', label: 'All' },
    { v: 'noadmin', label: 'Without an admin' },
    { v: 'over', label: 'Giving out too much space' },
  ].map((p) => ({ ...p, n: orgs.filter(FILTERS[p.v]).length }));
  const s = q.trim().toLowerCase();
  const shown = orgs.filter((o) => (FILTERS[f] ?? FILTERS.all)(o) && (!s || o.name.toLowerCase().includes(s)));
  return (
    <div className="hq-page">
      <PageHead
        title="Organisations"
        lede="Schools and centres with their own admins, plan and space. Open one to run it as its admins do."
        actions={
          <>
            <button type="button" className="btn" disabled={!orgs.length} onClick={() => void saveSuperWorkbook(d.teachers, d.accounts, orgs, classes, invites)}>
              <UiIcon name="export" size={15} /> Export
            </button>
            <button type="button" className="btn primary" onClick={() => setMaking(true)}>
              <UiIcon name="plus" size={15} /> New organisation
            </button>
          </>
        }
      />
      <div className="hq-tools">
        <Search value={q} onChange={setQ} placeholder="Search by name" label="Search organisations" />
        <Pills value={f} options={pills} onChange={(v) => go({ tab: 'orgs', f: v === 'all' ? '' : v, replace: true })} label="Show" />
      </div>
      {!orgs.length ? (
        <Empty title="No organisations yet" text="Make one, then add its admins and teachers." action={<button type="button" className="btn primary" onClick={() => setMaking(true)}>New organisation</button>} />
      ) : !shown.length ? (
        <Empty title="None here" text="No organisation matches." />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th className="hq-n">Teachers</th>
                <th className="hq-n">Classes</th>
                <th className="hq-n">Learners</th>
                <th>Space given out</th>
                <th className="hq-n">Waiting</th>
                <th className="hq-c-go">
                  <span className="hq-sr">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const cls = classes.filter((c) => c.org === o.id && c.status === 'active');
                const g = givenGb(o);
                const wait = invites.filter((i) => i.org === o.id && i.status === 'pending');
                return (
                  <tr key={o.id} onClick={() => go({ org: o.id, tab: 'overview' })}>
                    <td data-label="Organisation">
                      <button type="button" className="hq-row-open hq-orgname" onClick={(e) => (e.stopPropagation(), go({ org: o.id, tab: 'overview' }))}>
                        {o.brand?.logo ? <img src={o.brand.logo} alt="" /> : <span className="hq-side-mark org" style={{ background: o.brand?.color ?? '#5d6f80' }} aria-hidden="true">{o.name.slice(0, 1)}</span>}
                        <span>
                          <b>{o.name}</b>
                          <span>
                            {PLANS.find((p) => p.k === o.plan)?.label ?? o.plan} plan, {plural(o.adminEmails.length, 'admin')}
                          </span>
                        </span>
                      </button>
                      <span className="hq-roles">{!o.adminEmails.length && <span className="hq-chip late">No admin</span>}</span>
                    </td>
                    <td className="hq-n" data-label="Teachers">
                      {Object.keys(o.teachers).length}
                    </td>
                    <td className="hq-n" data-label="Classes">
                      {cls.length}
                    </td>
                    <td className="hq-n" data-label="Learners">
                      {cls.reduce((n, c) => n + (c.learnerCount ?? 0), 0)}
                    </td>
                    <td data-label="Space given out">
                      <span className="hq-space">
                        <Meter used={g} of={o.limitGb} small />
                        <span>
                          {fmtGb(g)} of {fmtGb(o.limitGb)}
                        </span>
                      </span>
                    </td>
                    <td className="hq-n" data-label="Invitations waiting">
                      {wait.length ? <span className={wait.some((i) => daysSince(i.at) >= WAIT_DAYS) ? 'hq-late' : ''}>{wait.length}</span> : <span className="hq-quiet">None</span>}
                    </td>
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
      {making && <NewOrg onClose={() => setMaking(false)} onMade={(id) => (setMaking(false), go({ org: id, tab: 'admins' }))} />}
    </div>
  );
}

function NewOrg({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [name, setName] = useState('');
  const make = () => name.trim() && void newOrg(name).then((r) => onMade(r.id));
  return (
    <Sheet title="New organisation" onClose={onClose}>
      <label className="field">
        <span>Name</span>
        <input className="hq-in" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} placeholder="For example: Sunrise Language School" maxLength={80} />
      </label>
      <p className="hint">It starts on the School plan with 50 GB. Next, add the person who runs it as an admin.</p>
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={make}>
          Make the organisation
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ apps for everyone
export function SuperApps({ d }: { d: SuperData }) {
  const f = useFeatures();
  return (
    <div className="hq-page">
      <PageHead title="Apps" lede="Turn an app off for everyone. An organisation's plan, or a teacher's own switch, can turn it back on for them." />
      <Panel>
        {APP_LIST.map((k) => {
          const own = Object.values(d.accounts).filter((a) => a.features?.[k.k] !== undefined).length;
          const offIn = d.orgs.filter((o) => o.allow?.apps?.[k.k] === false || o.policy?.apps?.[k.k] === false);
          const notes = [own ? `${plural(own, 'teacher')} with their own switch` : '', offIn.length ? `off in ${offIn.map((o) => o.name).join(', ')}` : ''].filter(Boolean).join('; ');
          return (
            <Setting key={k.k} title={k.name} about={notes ? `${k.about}. ${notes.charAt(0).toUpperCase() + notes.slice(1)}.` : k.about}>
              <Switch on={f[k.k] ?? true} onChange={(v) => void setFeature(k.k, v)} label={`${k.name} for everyone`} />
            </Setting>
          );
        })}
      </Panel>
    </div>
  );
}

export function SuperDefaults() {
  return (
    <div className="hq-page">
      <PageHead title="Sounds for everyone" lede="The sound effects and recordings every teacher gets, unless they add their own." />
      <Panel title="Sound effects">
        <SfxSettings />
      </Panel>
      <Panel title="Sounds of English">
        <SoundRecordings />
      </Panel>
    </div>
  );
}

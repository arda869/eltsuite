import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { MultiSelect, Select } from '../../components/Select';
import { ProfileIcon } from '../../components/ProfileIcons';
import { UiIcon } from '../../components/UiIcon';
import { Avatar } from '../../components/avatars';
import { ask } from '../../lib/ask';
import {
  ADMIN_CAN,
  ADMIN_SEE,
  addOrgAdmin,
  answerOf,
  cancelInvite,
  inviteLink,
  inviteTeachers,
  profileFieldsOf,
  removeOrgAdmin,
  resendInvite,
  saveTags,
  setJobTitle,
  setTeacherGb,
  setTeacherOrg,
  setTeacherTags,
  setTrainer,
  useTeacherProfile,
  type OrgInvite,
} from '../../lib/admin';
import { GB, BulkBar, Check, Drawer, DrawerPart, Empty, GbInput, Meter, PageHead, Panel, Pills, Search, Sheet, Switch, TextInput, Who, ago, daysSince, fmtBytes, fmtGb, plural, useNote, useSelection } from './ui';
import { WAIT_DAYS, orgGbOf, teachesIn } from './attention';
import { saveOrgWorkbook } from './sheets';
import type { Go, OrgData } from './types';

const isAdmin = (d: OrgData, email: string) => d.org.adminEmails.includes(email.toLowerCase());

// ------------------------------------------------------------------ teachers
export function OrgTeachers({ d, params, go }: { d: OrgData; params: URLSearchParams; go: Go }) {
  const { org, classes, accounts, pics, owner } = d;
  const [q, setQ] = useState('');
  const [toast, say] = useNote();
  const [sheet, setSheet] = useState<'' | 'space' | 'add'>('');
  const f = params.get('f') || 'all';
  const open = params.get('t') || '';
  const active = classes.filter((c) => c.status === 'active');
  const rows = useMemo(
    () =>
      Object.entries(org.teachers)
        .map(([uid, t]) => {
          const mine = active.filter((c) => teachesIn(c, uid));
          const gb = orgGbOf(org, uid);
          const used = accounts[uid]?.usedBytes ?? 0;
          return { uid, t, classes: mine.length, learners: mine.reduce((n, c) => n + (c.learnerCount ?? 0), 0), gb, used, full: !!accounts[uid]?.over || used >= gb * GB * 0.9, admin: isAdmin(d, t.email) };
        })
        .sort((a, b) => (a.t.name || a.t.email).localeCompare(b.t.name || b.t.email)),
    [org, classes, accounts], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tags = Object.entries(org.tags ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const FILTERS: Record<string, (r: (typeof rows)[number]) => boolean> = {
    all: () => true,
    noclass: (r) => !r.classes,
    space: (r) => r.full,
    ...(org.allow?.trainers ? { trainers: (r) => !!r.t.trainer } : {}),
    admins: (r) => r.admin,
    ...Object.fromEntries(tags.map(([id]) => [`tag:${id}`, (r: (typeof rows)[number]) => !!r.t.tags?.includes(id)])),
  };
  const pills = [
    { v: 'all', label: 'Everyone' },
    { v: 'noclass', label: 'Without a class' },
    { v: 'space', label: 'Nearly out of space' },
    ...(org.allow?.trainers ? [{ v: 'trainers', label: 'Teacher trainers' }] : []),
    { v: 'admins', label: 'Admins' },
    ...tags.map(([id, t]) => ({ v: `tag:${id}`, label: t.name })),
  ].map((p) => ({ ...p, n: rows.filter(FILTERS[p.v] ?? (() => true)).length }));
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => (FILTERS[f] ?? FILTERS.all)(r) && (!s || `${r.t.name} ${r.t.email} ${r.t.title ?? ''}`.toLowerCase().includes(s)));
  const sel = useSelection(shown.map((r) => r.uid));
  const chosen = [...sel.sel];
  const setFilter = (v: string) => go({ tab: 'teachers', f: v === 'all' ? '' : v, replace: true });
  const nameOf = (uid: string) => org.teachers[uid]?.name || org.teachers[uid]?.email || 'A teacher';
  const bulkTag = async (id: string, on: boolean) => {
    await Promise.all(chosen.map((uid) => { const now = org.teachers[uid]?.tags ?? []; return setTeacherTags(org, uid, on ? [...new Set([...now, id])] : now.filter((x) => x !== id)); }));
    d.note(`${on ? 'Tagged' : 'Took the tag off'} ${plural(chosen.length, 'teacher')}`, org.tags?.[id]?.name ?? '');
    say(`${org.tags?.[id]?.name ?? 'The tag'}: ${on ? 'added to' : 'taken off'} ${plural(chosen.length, 'teacher')}.`);
  };
  const bulkTrainer = async (on: boolean) => {
    await Promise.all(chosen.map((uid) => setTrainer(org, uid, on)));
    d.note(on ? `Made ${plural(chosen.length, 'teacher')} teacher trainers` : `Took the trainer role from ${plural(chosen.length, 'teacher')}`, chosen.map(nameOf).join(', '));
    say(on ? `${plural(chosen.length, 'teacher trainer')} now.` : 'Done.');
  };
  const bulkRemove = async () => {
    if (!(await ask(`Remove ${plural(chosen.length, 'teacher')} from ${org.name}? They keep their accounts and files, on the free plan.`, { ok: 'Remove' }))) return;
    for (const uid of chosen) await setTeacherOrg(d.allTeachers.find((x) => x.uid === uid) ?? { uid, name: org.teachers[uid]?.name ?? '', email: org.teachers[uid]?.email ?? '' }, null, org);
    d.note(`Removed ${plural(chosen.length, 'teacher')}`, chosen.map(nameOf).join(', '));
    sel.clear();
  };
  return (
    <div className="hq-page">
      <PageHead
        title="Teachers"
        lede={`${plural(rows.length, 'teacher')} in ${org.name}. Teachers here are colleagues of each other, always, and see each other's job titles${org.policy?.profiles ? ' and profiles' : ''}.`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => void saveOrgWorkbook(org, classes, accounts, d.invites, 'teachers')}>
              <UiIcon name="export" size={15} /> Export
            </button>
            {owner && (
              <button type="button" className="btn" onClick={() => setSheet('add')}>
                Add with an account
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => go({ tab: 'invites', new: '1' })}>
              <UiIcon name="plus" size={15} /> Invite teachers
            </button>
          </>
        }
      />
      <div className="hq-tools">
        <Search value={q} onChange={setQ} placeholder="Search by name, email or job title" label="Search teachers" />
        <Pills value={f} options={pills} onChange={setFilter} label="Show" />
      </div>
      {!rows.length ? (
        <Empty title="No teachers yet" text={`Invite the teachers of ${org.name}. They get an email with a link to join.`} action={<button type="button" className="btn primary" onClick={() => go({ tab: 'invites', new: '1' })}>Invite teachers</button>} />
      ) : !shown.length ? (
        <Empty title="Nobody here" text="No teacher matches. Try another filter or search." action={<button type="button" className="btn" onClick={() => (setQ(''), setFilter('all'))}>Show everyone</button>} />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th className="hq-c-check">
                  <Check checked={sel.every} mixed={sel.some && !sel.every} onChange={sel.all} label="Select every teacher shown" />
                </th>
                <th>Teacher</th>
                <th>Tags</th>
                <th className="hq-n">Classes</th>
                <th className="hq-n">Learners</th>
                <th>Space</th>
                <th className="hq-c-go">
                  <span className="hq-sr">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.uid} className={sel.has(r.uid) ? 'hq-picked' : ''} onClick={() => go({ tab: 'teachers', f: f === 'all' ? '' : f, t: r.uid })}>
                  <td className="hq-c-check" data-label="">
                    <Check checked={sel.has(r.uid)} onChange={(v) => sel.toggle(r.uid, v)} label={`Select ${r.t.name || r.t.email}`} />
                  </td>
                  <td data-label="Teacher">
                    <button type="button" className="hq-row-open" onClick={(e) => (e.stopPropagation(), go({ tab: 'teachers', f: f === 'all' ? '' : f, t: r.uid }))}>
                      <Who name={r.t.name || r.t.email} sub={r.t.title || r.t.email} pic={pics[r.uid]} />
                    </button>
                    <span className="hq-roles">
                      {r.admin && <span className="hq-chip">Admin</span>}
                      {r.t.trainer && org.allow?.trainers && <span className="hq-chip">Teacher trainer</span>}
                    </span>
                  </td>
                  <td data-label="Tags">
                    <span className="hq-tags">{(r.t.tags ?? []).map((x) => org.tags?.[x] && <span key={x} className="hq-tag">{org.tags[x].name}</span>)}</span>
                  </td>
                  <td className="hq-n" data-label="Classes">
                    {r.classes || <span className="hq-quiet">None</span>}
                  </td>
                  <td className="hq-n" data-label="Learners">
                    {r.learners}
                  </td>
                  <td data-label="Space">
                    <span className="hq-space">
                      <Meter used={r.used} of={r.gb * GB} small />
                      <span>
                        {fmtBytes(r.used)} of {fmtGb(r.gb)}
                      </span>
                    </span>
                  </td>
                  <td className="hq-c-go" aria-hidden="true">
                    ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar n={chosen.length} what={['teacher', 'teachers']} onClear={sel.clear}>
        {tags.length > 0 && <Select value="" placeholder="Add a tag" options={tags.map(([id, t]) => ({ v: id, label: t.name }))} onChange={(v) => void bulkTag(v, true)} label="Add a tag to the selected teachers" />}
        {tags.length > 0 && <Select value="" placeholder="Take a tag off" options={tags.map(([id, t]) => ({ v: id, label: t.name }))} onChange={(v) => void bulkTag(v, false)} label="Take a tag off the selected teachers" />}
        <button type="button" className="btn small-btn" onClick={() => setSheet('space')}>
          Space
        </button>
        {org.allow?.trainers && (
          <>
            <button type="button" className="btn small-btn" onClick={() => void bulkTrainer(true)}>
              Make teacher trainers
            </button>
            <button type="button" className="btn small-btn" onClick={() => void bulkTrainer(false)}>
              Not trainers
            </button>
          </>
        )}
        <button type="button" className="btn small-btn" onClick={() => void saveOrgWorkbook(org, classes, accounts, d.invites, 'teachers', chosen)}>
          Export
        </button>
        {owner && (
          <button type="button" className="btn small-btn danger" onClick={() => void bulkRemove()}>
            Remove
          </button>
        )}
      </BulkBar>
      <TagsPanel d={d} />
      {open && org.teachers[open] && <TeacherDrawer d={d} uid={open} onClose={() => go({ tab: 'teachers', f: f === 'all' ? '' : f, replace: true })} go={go} />}
      {sheet === 'space' && <BulkSpace d={d} uids={chosen} onClose={() => setSheet('')} onDone={(m) => (say(m), setSheet(''))} />}
      {sheet === 'add' && <AddExisting d={d} onClose={() => setSheet('')} />}
      {toast}
    </div>
  );
}

function BulkSpace({ d, uids, onClose, onDone }: { d: OrgData; uids: string[]; onClose: () => void; onDone: (m: string) => void }) {
  const [gb, setGb] = useState(String(d.org.perTeacherGb ?? 1));
  const n = Number(gb);
  const ok = gb.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= d.org.limitGb;
  const save = async (v: number | null) => {
    await Promise.all(uids.map((uid) => setTeacherGb(d.org, uid, v)));
    d.note(v === null ? `Set the space back to the default for ${plural(uids.length, 'teacher')}` : `Set the space for ${plural(uids.length, 'teacher')} to ${v} GB`);
    onDone(v === null ? `${plural(uids.length, 'teacher')} back to ${fmtGb(d.org.perTeacherGb ?? 1)}, the default.` : `${plural(uids.length, 'teacher')} have ${v} GB each now.`);
  };
  return (
    <Sheet title={`Space for ${plural(uids.length, 'teacher')}`} onClose={onClose}>
      <label className="field">
        <span>GB for each</span>
        <input type="number" min={0} max={d.org.limitGb} value={gb} onChange={(e) => setGb(e.target.value)} />
      </label>
      <span className="hint">The default for everyone is {fmtGb(d.org.perTeacherGb ?? 1)}. {d.org.name} has {fmtGb(d.org.limitGb)} in all.</span>
      <div className="hq-sheet-f">
        <button type="button" className="btn link small" onClick={() => void save(null)}>
          Back to the default
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ok} onClick={() => void save(n)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

// The owner adds a teacher who already has an account, at once.
function AddExisting({ d, onClose }: { d: OrgData; onClose: () => void }) {
  const [add, setAdd] = useState('');
  const free = d.allTeachers.filter((t) => !d.org.teachers[t.uid]);
  const go = async () => {
    const t = d.allTeachers.find((x) => x.uid === add);
    if (!t) return;
    await setTeacherOrg(t, d.org, d.orgs.find((o) => o.id === d.allAccounts[t.uid]?.org) ?? null);
    d.note('Added a teacher', t.name || t.email);
    onClose();
  };
  return (
    <Sheet title="Add a teacher who has an account" onClose={onClose}>
      <span className="hint">They join {d.org.name} at once, with its plan and space, and leave any organisation they are in now. To ask them first, invite them instead.</span>
      <Select value={add} search placeholder="Choose a teacher…" options={free.map((t) => ({ v: t.uid, label: t.name || t.email, hint: t.email + (d.allAccounts[t.uid]?.org ? ` · now in ${d.orgs.find((o) => o.id === d.allAccounts[t.uid]?.org)?.name ?? 'another organisation'}` : '') }))} onChange={setAdd} label="Teacher to add" className="grow" />
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!add} onClick={() => void go()}>
          Add to {d.org.name}
        </button>
      </div>
    </Sheet>
  );
}

function TeacherDrawer({ d, uid, onClose, go }: { d: OrgData; uid: string; onClose: () => void; go: Go }) {
  const { org, owner } = d;
  const t = org.teachers[uid];
  const prof = useTeacherProfile(uid);
  const mine = d.classes.filter((c) => teachesIn(c, uid));
  const gb = orgGbOf(org, uid);
  const used = d.accounts[uid]?.usedBytes ?? 0;
  const inv = d.invites.find((i) => i.id === t.invite) ?? d.invites.find((i) => i.uid === uid && i.status === 'accepted');
  const fields = profileFieldsOf(org.policy).filter((x) => x.on);
  const name = t.name || t.email;
  const tagOptions = Object.entries(org.tags ?? {}).map(([id, x]) => ({ v: id, label: x.name }));
  return (
    <Drawer
      title={name}
      sub={t.email}
      pic={<Avatar k={d.pics[uid]} name={name} size={46} />}
      onClose={onClose}
      foot={
        owner ? (
          <button type="button" className="btn small-btn danger" onClick={() => void ask(`Remove ${name} from ${org.name}? They keep their account and files, on the free plan.`, { ok: 'Remove' }).then(async (ok) => { if (!ok) return; await setTeacherOrg(d.allTeachers.find((x) => x.uid === uid) ?? { uid, name: t.name, email: t.email }, null, org); d.note('Removed a teacher', name); onClose(); })}>
            Remove from {org.name}
          </button>
        ) : (
          <span className="hint">Only ELT Suite can remove a teacher from {org.name}.</span>
        )
      }
    >
      <div className="hq-dfacts">
        {isAdmin(d, t.email) && <span className="hq-chip">Admin</span>}
        {t.trainer && org.allow?.trainers && <span className="hq-chip">Teacher trainer</span>}
        <span className="hint">{inv?.answeredAt ? `Joined ${ago(inv.answeredAt)}` : 'Added by ELT Suite'}</span>
      </div>
      <DrawerPart title="Job and groups">
        <label className="field">
          <span>Job title</span>
          <TextInput value={t.title ?? ''} placeholder="For example: Senior teacher" label="Job title" onSave={(v) => void setJobTitle(org, uid, v).then(() => d.note('Changed a job title', `${name}: ${v || 'none'}`))} />
        </label>
        <div className="field">
          <span>Tags</span>
          <MultiSelect value={t.tags ?? []} options={tagOptions} onChange={(v) => void setTeacherTags(org, uid, v).then(() => d.note('Changed tags', `${name}: ${v.map((x) => org.tags?.[x]?.name).filter(Boolean).join(', ') || 'none'}`))} label={`Tags for ${name}`} none="No tags" foot="Tags set who can see parts of the library." createLabel="New tag…" onCreate={async (n) => { const id = 't' + Date.now().toString(36); await saveTags(org, { ...(org.tags ?? {}), [id]: { name: n.slice(0, 40) } }); d.note('Made a tag', n); return id; }} />
        </div>
        {org.allow?.trainers && (
          <div className="hq-set">
            <span className="hq-set-t">
              <b>Teacher trainer</b>
              <span>Creates teacher training classes for the others.</span>
            </span>
            <Switch on={!!t.trainer} onChange={(v) => void setTrainer(org, uid, v).then(() => d.note(v ? 'Made a teacher trainer' : 'Took the trainer role from a teacher', name))} label={`${name} is a teacher trainer`} />
          </div>
        )}
        {owner && (
          <div className="hq-set">
            <span className="hq-set-t">
              <b>Admin</b>
              <span>Runs {org.name} here, in Organisation admin.</span>
            </span>
            <Switch on={isAdmin(d, t.email)} onChange={(v) => void (v ? addOrgAdmin(org, t.email) : removeOrgAdmin(org, t.email.toLowerCase())).then(() => d.note(v ? 'Made an admin' : 'Removed an admin', name))} label={`${name} is an admin`} />
          </div>
        )}
      </DrawerPart>
      <DrawerPart title="Space">
        <div className="hq-dspace">
          <Meter used={used} of={gb * GB} />
          <span>
            <b>{fmtBytes(used)}</b> used of {fmtGb(gb)}
            {d.accounts[uid]?.over ? ' · full' : ''}
          </span>
        </div>
        <div className="hq-set">
          <span className="hq-set-t">
            <b>Space for {t.name?.split(' ')[0] || 'them'}</b>
            <span>{t.gb === undefined ? `The default, ${fmtGb(org.perTeacherGb ?? 1)}` : `Their own amount. The default is ${fmtGb(org.perTeacherGb ?? 1)}.`}</span>
          </span>
          <GbInput value={gb} max={org.limitGb} label={`Space for ${name} in GB`} onSave={(v) => void setTeacherGb(org, uid, v).then(() => d.note('Changed a teacher’s space', `${name}: ${v} GB`))} />
        </div>
        {t.gb !== undefined && (
          <button type="button" className="btn link small" onClick={() => void setTeacherGb(org, uid, null).then(() => d.note('Set a teacher’s space back to the default', name))}>
            Back to the default
          </button>
        )}
      </DrawerPart>
      <DrawerPart title={mine.length ? `Classes (${mine.length})` : 'Classes'}>
        {mine.length ? (
          <ul className="hq-dlist">
            {mine.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => go({ tab: 'classes', c: c.id })}>
                  <b>{c.name}</b>
                  <span>
                    {c.level} · {plural(c.learnerCount ?? 0, 'learner')}
                    {c.teacherId !== uid ? ' · co-teacher' : ''}
                    {c.status === 'archived' ? ' · archived' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No classes yet.{d.org.policy?.createClasses === false ? ' Create one for them in Classes.' : ''}</p>
        )}
      </DrawerPart>
      {org.policy?.profiles && (
        <DrawerPart title="Profile">
          {prof === undefined ? (
            <p className="hint">Opening…</p>
          ) : fields.some((x) => answerOf(prof, x.id)) ? (
            <dl className="hq-dprof">
              {fields
                .filter((x) => answerOf(prof, x.id))
                .map((x) => (
                  <div key={x.id}>
                    <dt>
                      <ProfileIcon name={x.icon} size={15} /> {x.label}
                    </dt>
                    <dd>{answerOf(prof, x.id)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="hint">Not filled in yet. Teachers write it in Settings.</p>
          )}
        </DrawerPart>
      )}
    </Drawer>
  );
}

// Tags: groups of teachers (a team, a site, a level), for setting library access in one go.
function TagsPanel({ d }: { d: OrgData }) {
  const { org } = d;
  const [edit, setEdit] = useState('');
  const [add, setAdd] = useState('');
  const tags = Object.entries(org.tags ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const count = (id: string) => Object.values(org.teachers).filter((t) => t.tags?.includes(id)).length;
  const remove = async (id: string) => {
    const name = org.tags?.[id]?.name ?? '';
    if (!(await ask(`Delete the tag ${name}? Teachers keep everything else, and the library stops using it.`, { ok: 'Delete' }))) return;
    const next = { ...(org.tags ?? {}) };
    delete next[id];
    await saveTags(org, next);
    await Promise.all(Object.entries(org.teachers).filter(([, t]) => t.tags?.includes(id)).map(([uid, t]) => setTeacherTags(org, uid, (t.tags ?? []).filter((x) => x !== id))));
    d.note('Deleted a tag', name);
  };
  const make = () => {
    const n = add.trim().slice(0, 40);
    if (!n) return;
    void saveTags(org, { ...(org.tags ?? {}), ['t' + Date.now().toString(36)]: { name: n } }).then(() => d.note('Made a tag', n));
    setAdd('');
  };
  return (
    <Panel title="Tags" className="hq-tagpanel">
      <p className="hint">Groups of teachers, for example by team, site or level. The library can be opened to a whole tag at once. Select teachers above to tag several together.</p>
      <div className="hq-taglist">
        {tags.map(([id, t]) =>
          edit === id ? (
            <input key={id} className="hq-in hq-tag-in" autoFocus defaultValue={t.name} aria-label={`New name for ${t.name}`} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void saveTags(org, { ...(org.tags ?? {}), [id]: { name: v.slice(0, 40) } }).then(() => d.note('Renamed a tag', `${t.name} to ${v}`)); setEdit(''); }} onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()} />
          ) : (
            <span key={id} className="hq-tagbig">
              <button type="button" onClick={() => setEdit(id)} aria-label={`Rename ${t.name}`}>
                {t.name} <span className="hq-tag-n">{count(id)}</span>
              </button>
              <button type="button" className="hq-tag-x" onClick={() => void remove(id)} aria-label={`Delete ${t.name}`}>
                ×
              </button>
            </span>
          ),
        )}
        <input className="hq-in hq-tag-in" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} onBlur={make} placeholder="+ New tag" aria-label="New tag" maxLength={40} />
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ invitations
const statusOf = (i: OrgInvite) => (i.status === 'accepted' ? 'Joined' : i.status === 'declined' ? 'Said no' : !i.mailed ? 'Email on the way' : i.existing ? 'Asked to join' : 'Finishing their account');

export function OrgInvites({ d, params, go }: { d: OrgData; params: URLSearchParams; go: Go }) {
  const { org, invites } = d;
  const [toast, say] = useNote();
  const f = params.get('f') || 'waiting';
  const inviting = params.get('new') === '1';
  const groups: Record<string, (i: OrgInvite) => boolean> = {
    waiting: (i) => i.status === 'pending',
    old: (i) => i.status === 'pending' && daysSince(i.at) >= WAIT_DAYS,
    answered: (i) => i.status !== 'pending',
    all: () => true,
  };
  const pills = [
    { v: 'waiting', label: 'Waiting' },
    { v: 'old', label: 'Waiting more than a week' },
    { v: 'answered', label: 'Answered' },
    { v: 'all', label: 'All' },
  ].map((p) => ({ ...p, n: invites.filter(groups[p.v]).length }));
  const shown = invites.filter(groups[f] ?? groups.waiting);
  const sel = useSelection(shown.filter((i) => i.status === 'pending').map((i) => i.id));
  const chosen = invites.filter((i) => sel.has(i.id));
  const again = async (list: OrgInvite[]) => {
    const mailed = list.filter((i) => i.mailed && i.status === 'pending');
    await Promise.all(mailed.map((i) => resendInvite(i.id)));
    if (mailed.length) d.note(`Sent ${plural(mailed.length, 'invitation')} again`, mailed.map((i) => i.name || i.email).join(', '));
    say(mailed.length ? `Sending ${plural(mailed.length, 'invitation')} again, within 15 minutes.` : 'Those emails have not gone out yet. They go within 15 minutes.');
    sel.clear();
  };
  const takeBack = async (list: OrgInvite[]) => {
    if (!(await ask(list.length === 1 ? `Take back the invitation to ${list[0].name || list[0].email}? Their link stops working.` : `Take back ${plural(list.length, 'invitation')}? Their links stop working.`, { ok: 'Take back', danger: true }))) return;
    await Promise.all(list.map((i) => cancelInvite(i.id)));
    d.note(`Took back ${plural(list.length, 'invitation')}`, list.map((i) => i.name || i.email).join(', '));
    sel.clear();
  };
  return (
    <div className="hq-page">
      <PageHead
        title="Invitations"
        lede="New teachers get a link to finish their account. Teachers who already have one are asked if they would like to join. Emails go out within 15 minutes."
        actions={
          <>
            <button type="button" className="btn" disabled={!invites.length} onClick={() => void saveOrgWorkbook(org, d.classes, d.accounts, invites, 'invites')}>
              <UiIcon name="export" size={15} /> Export
            </button>
            <button type="button" className="btn primary" onClick={() => go({ tab: 'invites', f: f === 'waiting' ? '' : f, new: '1' })}>
              <UiIcon name="plus" size={15} /> Invite teachers
            </button>
          </>
        }
      />
      <div className="hq-tools">
        <Pills value={f} options={pills} onChange={(v) => go({ tab: 'invites', f: v === 'waiting' ? '' : v, replace: true })} label="Show" />
      </div>
      {!shown.length ? (
        <Empty
          title={invites.length ? (f === 'old' ? 'Nobody has waited more than a week' : f === 'answered' ? 'No answers yet' : 'Nobody is waiting') : 'No invitations yet'}
          text={invites.length ? 'Every invitation is answered or on its way.' : `Invite the teachers of ${org.name} by email, one by one or from a list.`}
          action={<button type="button" className="btn primary" onClick={() => go({ tab: 'invites', new: '1' })}>Invite teachers</button>}
        />
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th className="hq-c-check">{sel.some || shown.some((i) => i.status === 'pending') ? <Check checked={sel.every} mixed={sel.some && !sel.every} onChange={sel.all} label="Select every waiting invitation shown" /> : <span className="hq-sr">Select</span>}</th>
                <th>Teacher</th>
                <th>Sent</th>
                <th>Where it is</th>
                <th>
                  <span className="hq-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const waitDays = daysSince(i.at);
                return (
                  <tr key={i.id} className={(sel.has(i.id) ? 'hq-picked ' : '') + 'still'}>
                    <td className="hq-c-check" data-label="">
                      {i.status === 'pending' && <Check checked={sel.has(i.id)} onChange={(v) => sel.toggle(i.id, v)} label={`Select ${i.name || i.email}`} />}
                    </td>
                    <td data-label="Teacher">
                      <Who name={i.name || i.email} sub={[i.name ? i.email : '', i.title].filter(Boolean).join(' · ') || undefined} />
                      {i.admin && <span className="hq-roles"><span className="hq-chip">Admin</span></span>}
                    </td>
                    <td data-label="Sent">
                      <span className={i.status === 'pending' && waitDays >= WAIT_DAYS ? 'hq-late' : ''}>{ago(i.at)}</span>
                      <span className="hq-quiet"> by {i.byName}</span>
                    </td>
                    <td data-label="Where it is">
                      <span className={'hq-status ' + i.status}>{statusOf(i)}</span>
                      {i.answeredAt && <span className="hq-quiet"> {ago(i.answeredAt)}</span>}
                    </td>
                    <td className="hq-acts" data-label="">
                      {i.status === 'pending' && (
                        <>
                          <button type="button" className="btn link small" onClick={() => void navigator.clipboard?.writeText(inviteLink(i.id)).then(() => say(`The link for ${i.name || i.email} is copied.`))}>
                            Copy link
                          </button>
                          {i.mailed && (
                            <button type="button" className="btn link small" onClick={() => void again([i])}>
                              Send again
                            </button>
                          )}
                          <button type="button" className="btn link small" onClick={() => void takeBack([i])}>
                            Take back
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <BulkBar n={chosen.length} what={['invitation', 'invitations']} onClear={sel.clear}>
        <button type="button" className="btn small-btn" onClick={() => void again(chosen)}>
          Send again
        </button>
        <button type="button" className="btn small-btn danger" onClick={() => void takeBack(chosen)}>
          Take back
        </button>
      </BulkBar>
      <details className="hq-told">
        <summary>What invited teachers are told</summary>
        <p>That the admins of {org.name} can set:</p>
        <ul>
          {ADMIN_CAN.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p>And that the admins can see: {ADMIN_SEE}</p>
      </details>
      {inviting && <InviteSheet d={d} onClose={() => go({ tab: 'invites', f: f === 'waiting' ? '' : f, replace: true })} onSent={(n) => say(`${plural(n, 'invitation')} on the way. Emails go out within 15 minutes.`)} />}
      {toast}
    </div>
  );
}

type Row = { name: string; email: string; title: string; admin: boolean };
type Checked = Row & { why: string };
// Name, email and job title from each line, in any order, split by commas, semicolons or tabs.
function fromText(text: string, admin: boolean): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/\t|,|;/).map((x) => x.trim().replace(/^"|"$/g, '')))
    .filter((c) => c.some(Boolean))
    .map((c) => {
      const e = c.findIndex((x) => /@/.test(x));
      const rest = c.filter((_, i) => i !== e);
      return { email: e >= 0 ? c[e].toLowerCase() : '', name: rest[0] ?? '', title: rest[1] ?? '', admin };
    })
    .filter((r) => !/^(e-?mail|name)$/i.test(r.email) && !/^name$/i.test(r.name));
}

function InviteSheet({ d, onClose, onSent }: { d: OrgData; onClose: () => void; onSent: (n: number) => void }) {
  const { user } = useAuth();
  const { org, owner } = d;
  const blank: Row = { name: '', email: '', title: '', admin: false };
  const [mode, setMode] = useState<'one' | 'list'>('one');
  const [rows, setRows] = useState<Row[]>([blank]);
  const [text, setText] = useState('');
  const [listAdmin, setListAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const raw = mode === 'list' ? fromText(text, listAdmin) : rows.filter((r) => r.email.trim());
  // Each line checked before anything is sent: who is already here, already invited, or twice in the list.
  const checked: Checked[] = (() => {
    const seen = new Set<string>();
    const here = new Set(Object.values(org.teachers).map((t) => t.email.toLowerCase()));
    const waiting = new Set(d.invites.filter((i) => i.status === 'pending').map((i) => i.email.toLowerCase()));
    return raw.map((r) => {
      const e = r.email.trim().toLowerCase();
      const why = !/^\S+@\S+\.\S+$/.test(e) ? 'Not an email address' : here.has(e) ? 'Already a teacher here' : waiting.has(e) ? 'Already invited' : seen.has(e) ? 'In the list twice' : '';
      seen.add(e);
      return { ...r, email: e, why };
    });
  })();
  const ready = checked.filter((r) => !r.why);
  const set = (i: number, k: keyof Row, v: string | boolean) =>
    setRows((r) => {
      const n = r.map((x, j) => (j === i ? { ...x, [k]: v } : x));
      return i === n.length - 1 && typeof v === 'string' && v ? [...n, blank] : n;
    });
  const read = async (f?: File) => {
    if (!f) return;
    const got = await f.text();
    setText((t) => (t.trim() ? t.trim() + '\n' : '') + got);
  };
  const send = async () => {
    if (!user || !ready.length) return;
    setBusy(true);
    try {
      const n = await inviteTeachers(org, ready, { uid: user.uid, name: d.me.name });
      onSent(n);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Invite teachers" onClose={onClose} wide>
      <span className="seg hq-seg" role="radiogroup" aria-label="How to add them">
        {(
          [
            ['one', 'One by one'],
            ['list', 'From a list'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
      </span>
      {mode === 'one' ? (
        <div className="hq-inv-rows">
          {rows.map((r, i) => (
            <div key={i} className={'hq-inv-row' + (owner ? ' admin' : '')}>
              <input className="hq-in" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Name" aria-label={`Name ${i + 1}`} />
              <input className="hq-in" type="email" value={r.email} onChange={(e) => set(i, 'email', e.target.value)} placeholder="Email" aria-label={`Email ${i + 1}`} />
              <input className="hq-in" value={r.title} onChange={(e) => set(i, 'title', e.target.value)} placeholder="Job title (optional)" aria-label={`Job title ${i + 1}`} />
              {owner && (
                <label className="hq-inv-admin">
                  <input type="checkbox" checked={r.admin} onChange={(e) => set(i, 'admin', e.target.checked)} />
                  Admin
                </label>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="hq-inv-list">
          <textarea className="hq-in hq-paste" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Teachers to invite, one a line" placeholder={'One teacher a line: name, email, job title\nSofia Rossi, sofia@school.org, Senior teacher\nTariq Aziz, tariq@school.org'} />
          <span className="hq-inv-tools">
            <button type="button" className="btn small-btn" onClick={() => file.current?.click()}>
              <UiIcon name="upload" size={14} /> Add from a CSV file
            </button>
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => void read(e.target.files?.[0]).then(() => (e.target.value = ''))} />
            <span className="hint">A spreadsheet saved as CSV works: one row a teacher.</span>
            {owner && (
              <label className="hq-inv-admin">
                <input type="checkbox" checked={listAdmin} onChange={(e) => setListAdmin(e.target.checked)} />
                Invite them all as admins
              </label>
            )}
          </span>
        </div>
      )}
      {checked.length > 0 && (
        <div className="hq-inv-check">
          <b>
            {plural(ready.length, 'teacher')} ready{checked.length > ready.length ? `, ${checked.length - ready.length} left out` : ''}
          </b>
          {checked.some((r) => r.why) && (
            <ul>
              {checked
                .filter((r) => r.why)
                .map((r, i) => (
                  <li key={i}>
                    {r.name || r.email || 'A line'}
                    {r.name && r.email ? ` (${r.email})` : ''}: {r.why}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div className="hq-sheet-f">
        <span className="hint">They see what you can set and see before they say yes.</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ready.length || busy} onClick={() => void send()}>
          {ready.length > 1 ? `Invite ${ready.length} teachers` : 'Invite'}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ admins
export function OrgAdmins({ d }: { d: OrgData }) {
  const { org, owner, pics } = d;
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [toast, say] = useNote();
  const teacherOf = (e: string) => Object.entries(org.teachers).find(([, t]) => t.email.toLowerCase() === e.toLowerCase());
  const add = async () => {
    const e = email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(e) || !user) return;
    const t = teacherOf(e);
    if (t) {
      await addOrgAdmin(org, e);
      d.note('Made an admin', t[1].name || e);
      say(`${t[1].name || e} is an admin now.`);
    } else {
      await inviteTeachers(org, [{ name: '', email: e, admin: true }], { uid: user.uid, name: d.me.name });
      say(`${e} is invited to join ${org.name} as a teacher and admin.`);
    }
    setEmail('');
  };
  return (
    <div className="hq-page">
      <PageHead title="Admins" lede={`Admins are teachers in ${org.name} with one more app, Organisation admin: its teachers, classes, rules, branding and library.`} />
      <Panel>
        <ul className="hq-people">
          {org.adminEmails.map((e) => {
            const t = teacherOf(e);
            return (
              <li key={e}>
                <Who name={t?.[1].name || e} sub={t ? e : 'Not a teacher here yet'} pic={t ? pics[t[0]] : undefined} />
                {e === user?.email?.toLowerCase() && <span className="hq-chip">You</span>}
                <span style={{ flex: 1 }} />
                {owner && (
                  <button type="button" className="btn link small" onClick={() => void ask(`Remove ${t?.[1].name || e} as an admin? They stay a teacher here.`, { ok: 'Remove' }).then((ok) => ok && void removeOrgAdmin(org, e).then(() => d.note('Removed an admin', t?.[1].name || e)))}>
                    Remove as admin
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!org.adminEmails.length && <Empty title="No admins yet" text={owner ? 'Add the person who runs this organisation.' : ''} />}
        {owner ? (
          <div className="hq-addrow">
            <input className="hq-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email of a teacher here, or someone to invite" aria-label="Email of the new admin" onKeyDown={(e) => e.key === 'Enter' && void add()} />
            <button type="button" className="btn primary" disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => void add()}>
              Add admin
            </button>
          </div>
        ) : (
          <p className="hint">To add or remove an admin, ask ELT Suite.</p>
        )}
      </Panel>
      {toast}
    </div>
  );
}

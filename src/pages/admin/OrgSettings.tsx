import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrgLimitsPanel } from './OrgLimits';
import { MultiSelect, Select } from '../../components/Select';
import { PROFILE_ICONS, ProfileIcon } from '../../components/ProfileIcons';
import { ask } from '../../lib/ask';
import {
  APP_LIST,
  CEFR,
  EMAIL_CHOICES,
  NAME_CHOICES,
  PLANS,
  emailChoicesOf,
  logoToData,
  nameChoicesOf,
  profileFieldsOf,
  removeOrg,
  saveBrand,
  saveOrg,
  saveOutside,
  savePerTeacher,
  savePolicy,
  type OrgPolicy,
  type Plan,
  type ProfileField,
} from '../../lib/admin';
import { GB, GbInput, Meter, PageHead, Panel, Setting, Switch, fmtBytes, fmtGb, plural } from './ui';
import { givenGb, orgGbOf } from './attention';
import type { Go, OrgData } from './types';

// ------------------------------------------------------------------ rules
export function OrgRules({ d }: { d: OrgData }) {
  const { org } = d;
  const p = org.policy ?? {};
  const set = (x: OrgPolicy, what: string) => void savePolicy(org, x).then(() => d.note('Changed a rule', what));
  const on = (v: boolean) => (v ? 'on' : 'off');
  return (
    <div className="hq-page">
      <PageHead title="Rules" lede={`What teachers in ${org.name} can do, and the settings their new classes start with. Classes keep the settings they already have.`} />
      <Panel title="Classes">
        <Setting title="Teachers create their own classes" about="When this is off, only admins create classes, from Classes.">
          <Switch on={p.createClasses !== false} onChange={(v) => set({ createClasses: v }, `Teachers create their own classes: ${on(v)}`)} label="Teachers create their own classes" />
        </Setting>
        <Levels d={d} />
      </Panel>
      <Panel title="Learners">
        <Setting title="Learner email addresses" about="The settings teachers can choose from. Learners always sign in with the class code and their PIN.">
          <MultiSelect value={emailChoicesOf(p)} options={EMAIL_CHOICES} onChange={(v) => set({ emailChoices: v, learnerEmails: undefined }, `Learner emails: ${v.map((x) => EMAIL_CHOICES.find((c) => c.v === x)?.label).join(', ') || 'any'}`)} label="Learner email addresses" all="Each teacher decides" />
        </Setting>
        <Setting title="Teachers can see learner emails" about="Learners never see each other's email addresses.">
          <Switch on={p.seeEmails !== false} onChange={(v) => set({ seeEmails: v }, `Teachers see learner emails: ${on(v)}`)} label="Teachers can see learner emails" />
        </Setting>
        <Setting title="How learners see each other's names" about="The ways teachers can choose from. Teachers always see full names.">
          <MultiSelect value={nameChoicesOf(p)} options={NAME_CHOICES} onChange={(v) => set({ nameChoices: v, names: undefined }, `Learners' names: ${v.map((x) => NAME_CHOICES.find((c) => c.v === x)?.label).join(', ') || 'any'}`)} label="How learners see each other's names" all="Each teacher decides" />
        </Setting>
      </Panel>
      <Panel title="Teachers">
        <Setting title="Colleagues outside the organisation" about={`Teachers in ${org.name} are always colleagues of each other. This decides whether they can also add others.`}>
          <Select value={org.outside ?? 'anyone'} options={[{ v: 'anyone', label: 'Allowed' }, { v: 'org', label: 'Not allowed' }]} onChange={(v) => void saveOutside(org, v as 'anyone' | 'org').then(() => d.note('Changed a rule', `Colleagues outside: ${v === 'org' ? 'not allowed' : 'allowed'}`))} label="Colleagues outside the organisation" />
        </Setting>
        <Setting title="Ask teachers for a profile" about={`Teachers introduce themselves to each other. Only teachers in ${org.name} can see it.`}>
          <Switch on={!!p.profiles} onChange={(v) => set({ profiles: v }, `Teacher profiles: ${on(v)}`)} label="Ask teachers for a profile" />
        </Setting>
        {p.profiles && <ProfileFields d={d} />}
        {org.allow?.trainers && (
          <Setting title="Trainers can add teachers from outside" about={`Teacher trainers can always add teachers from ${org.name} to training classes. When this is on, they can add others by name too.`}>
            <Switch on={!!p.externalTrainees} onChange={(v) => set({ externalTrainees: v }, `Trainers add teachers from outside: ${on(v)}`)} label="Trainers can add teachers from outside" />
          </Setting>
        )}
      </Panel>
      <Panel title="Calls">
        <Setting title="Keep microphone and camera records in call attendance" about="When off, calls still record who joined and when, but not microphone or camera.">
          <Switch on={p.recordCallMedia !== false} onChange={(v) => set({ recordCallMedia: v }, `Microphone and camera records: ${on(v)}`)} label="Keep microphone and camera records in call attendance" />
        </Setting>
      </Panel>
      <Panel title="Apps">
        <p className="hint">The apps your teachers have. What is not part of your plan is shown off.</p>
        {APP_LIST.map((k) => {
          const blocked = org.allow?.apps?.[k.k] === false;
          return (
            <Setting key={k.k} title={k.name} about={blocked ? 'Not part of your plan' : k.about}>
              <Switch on={!blocked && (p.apps?.[k.k] ?? true)} disabled={blocked} onChange={(v) => set({ apps: { ...(p.apps ?? {}), [k.k]: v } }, `${k.name}: ${on(v)}`)} label={k.name} />
            </Setting>
          );
        })}
      </Panel>
    </div>
  );
}

// The levels classes can have: CEFR, the organisation's own names, or both.
function Levels({ d }: { d: OrgData }) {
  const { org } = d;
  const l = org.policy?.levels ?? {};
  const custom = l.custom ?? [];
  const [add, setAdd] = useState('');
  const save = (x: { cefr?: boolean; custom?: string[] }, what: string) => void savePolicy(org, { levels: { cefr: l.cefr !== false, custom, ...x } }).then(() => d.note('Changed the levels', what));
  const put = () => {
    const v = add.trim();
    setAdd('');
    if (!v || custom.includes(v) || CEFR.includes(v)) return;
    save({ custom: [...custom, v] }, `Added ${v}`);
  };
  return (
    <div className="hq-levels">
      <Setting title="Levels" about="What teachers choose from when they create a class.">
        <span className="hq-inline">
          <span className="hint">CEFR</span>
          <Switch on={l.cefr !== false} onChange={(v) => save({ cefr: v }, `CEFR levels ${v ? 'on' : 'off'}`)} label="CEFR levels" disabled={l.cefr !== false && !custom.length} />
        </span>
      </Setting>
      <div className="hq-levelchips">
        {l.cefr !== false && CEFR.map((c) => <span key={c} className="hq-tag quiet">{c}</span>)}
        {custom.map((c, i) => (
          <span key={c} className="hq-tagbig">
            {i > 0 && (
              <button type="button" className="hq-tag-x" aria-label={`Move ${c} earlier`} onClick={() => save({ custom: custom.map((x, j) => (j === i - 1 ? c : j === i ? custom[i - 1] : x)) }, `Moved ${c}`)}>
                ‹
              </button>
            )}
            <span className="hq-tag-label">{c}</span>
            <button type="button" className="hq-tag-x" aria-label={`Remove ${c}`} onClick={() => save({ custom: custom.filter((x) => x !== c), ...(custom.length === 1 ? { cefr: true } : {}) }, `Removed ${c}`)}>
              ×
            </button>
          </span>
        ))}
        <input className="hq-in hq-tag-in" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), put())} onBlur={put} placeholder="+ Your own, for example: Beginner 1" aria-label="Add a level" />
      </div>
      {l.cefr !== false && !custom.length && <p className="hint">Add a level of your own before switching CEFR off.</p>}
    </div>
  );
}

// The fields of a teacher's profile: switch them on or off, rename them, pick an icon, add more.
function ProfileFields({ d }: { d: OrgData }) {
  const { org } = d;
  const fields = profileFieldsOf(org.policy);
  const [pick, setPick] = useState<{ id: string; r: DOMRect } | null>(null);
  const save = (next: ProfileField[], what: string) => void savePolicy(org, { profileFields: next }).then(() => d.note('Changed the profile questions', what));
  const set = (id: string, patch: Partial<ProfileField>, what: string) => save(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)), what);
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= fields.length) return;
    const n = [...fields];
    [n[i], n[j]] = [n[j], n[i]];
    save(n, `Moved ${fields[i].label}`);
  };
  const KINDS: { v: ProfileField['kind']; label: string; hint: string }[] = [
    { v: 'short', label: 'Short answer', hint: 'A line' },
    { v: 'long', label: 'Paragraph', hint: 'A few sentences' },
    { v: 'list', label: 'List', hint: 'Several items, shown as tags' },
  ];
  return (
    <div className="hq-pf">
      <p className="hint">Teachers answer these in Settings, in this order. Colleagues see the answers on their profile.</p>
      {fields.map((f, i) => (
        <div key={f.id} className={'hq-pf-row' + (f.on ? '' : ' off')}>
          <button type="button" className="hq-pf-ic" onClick={(e) => setPick({ id: f.id, r: e.currentTarget.getBoundingClientRect() })} aria-label={`Icon for ${f.label}`}>
            <ProfileIcon name={f.icon} size={18} />
          </button>
          <FieldLabel value={f.label} onSave={(label) => set(f.id, { label }, `Renamed ${f.label} to ${label}`)} />
          <Select value={f.kind} options={KINDS} onChange={(kind) => set(f.id, { kind }, `${f.label}: ${KINDS.find((k) => k.v === kind)?.label}`)} label={`Kind of answer for ${f.label}`} />
          <span className="hq-pf-move">
            <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f.label} up`}>
              ↑
            </button>
            <button type="button" className="icon-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f.label} down`}>
              ↓
            </button>
          </span>
          <Switch on={f.on} onChange={(on) => set(f.id, { on }, `${f.label}: ${on ? 'asked' : 'not asked'}`)} label={`Ask for ${f.label}`} />
          {f.custom ? (
            <button type="button" className="icon-btn" onClick={() => save(fields.filter((x) => x.id !== f.id), `Deleted ${f.label}`)} aria-label={`Delete ${f.label}`}>
              ×
            </button>
          ) : (
            <span className="hq-pf-gap" />
          )}
        </div>
      ))}
      <button type="button" className="btn small-btn hq-pf-add" onClick={() => save([...fields, { id: 'c' + Date.now().toString(36), label: 'New question', icon: 'star', kind: 'short', on: true, custom: true }], 'Added a question')}>
        + Add a question
      </button>
      {pick && <IconPicker at={pick.r} value={fields.find((f) => f.id === pick.id)?.icon ?? ''} onPick={(icon) => (set(pick.id, { icon }, 'Changed an icon'), setPick(null))} onClose={() => setPick(null)} />}
    </div>
  );
}

function FieldLabel({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="hq-in hq-pf-label" value={v} maxLength={50} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Question" />;
}

function IconPicker({ at, value, onPick, onClose }: { at: DOMRect; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('[aria-selected=true], button')?.focus();
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', esc));
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="hq-icons" role="listbox" aria-label="Icons" style={{ left: Math.max(8, Math.min(at.left, window.innerWidth - 300)), top: at.bottom + 6 }}>
      {PROFILE_ICONS.map((k) => (
        <button key={k} type="button" role="option" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => onPick(k)} aria-label={k}>
          <ProfileIcon name={k} size={18} />
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ branding
const COLOURS = ['#c8764a', '#3667a6', '#2f7f6f', '#7a4fa3', '#b64a3c', '#a8701f', '#4f6b7a', '#2f2e2d'];
const COLOUR_NAMES: Record<string, string> = { '#c8764a': 'Clay', '#3667a6': 'Blue', '#2f7f6f': 'Teal', '#7a4fa3': 'Violet', '#b64a3c': 'Brick', '#a8701f': 'Ochre', '#4f6b7a': 'Slate', '#2f2e2d': 'Charcoal' };
export function OrgBrand({ d }: { d: OrgData }) {
  const { org } = d;
  const b = org.brand ?? {};
  const color = b.color ?? '#5d6f80';
  const [busy, setBusy] = useState<'' | 'logo' | 'wide'>('');
  const [err, setErr] = useState('');
  const save = (x: Partial<typeof b>, what: string) => void saveBrand(org, { ...b, ...x }).then(() => d.note('Changed the branding', what));
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
        d.note('Changed the branding', k === 'wide' ? 'New long logo' : 'New square logo');
      } catch {
        setErr('That picture could not be used. Try a PNG.');
      } finally {
        setBusy('');
      }
    };
    inp.click();
  };
  const slot = (k: 'logo' | 'wide', title: string, about: string) => (
    <div className={'hq-logo-slot ' + k}>
      <span className="hq-logo-box">{b[k] ? <img src={b[k]} alt={`${title} of ${org.name}`} /> : k === 'logo' ? <span className="hq-side-mark org big" aria-hidden="true">{org.name.slice(0, 1)}</span> : <span className="hint">No long logo yet</span>}</span>
      <span className="hq-logo-t">
        <b>{title}</b>
        <span className="hint">{about}</span>
        <span className="hq-logo-acts">
          <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => pick(k)}>
            {busy === k ? 'Adding…' : b[k] ? 'Change' : 'Upload'}
          </button>
          {b[k] && (
            <button type="button" className="btn link small" onClick={() => save({ [k]: '' }, k === 'wide' ? 'Removed the long logo' : 'Removed the square logo')}>
              Remove
            </button>
          )}
        </span>
      </span>
    </div>
  );
  return (
    <div className="hq-page" style={{ ['--org' as string]: color }}>
      <PageHead title="Branding" lede={`Your colour and logo, for every teacher in ${org.name}: at the top of each page, and on worksheets, tests and invitations. Classes keep their own colours.`} />
      <Panel title="Colour">
        <div className="hq-swatches" role="radiogroup" aria-label="Colour">
          {COLOURS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={b.color === c} className={'hq-sw' + (b.color === c ? ' on' : '')} style={{ background: c }} onClick={() => save({ color: c }, COLOUR_NAMES[c])} aria-label={COLOUR_NAMES[c]} />
          ))}
          <label className="hq-sw-own">
            <OwnColour value={color} onSave={(c) => save({ color: c }, c)} />
            <span>Your own</span>
          </label>
        </div>
      </Panel>
      <Panel title="Logos">
        <div className="hq-logos">
          {slot('logo', 'Square logo', 'The mark on its own, for small places: next to ELT Suite at the top of the screen. A square PNG, at least 256 px.')}
          {slot('wide', 'Long logo', 'The mark with the name beside it, for worksheets, tests and invitations. A wide PNG with a clear background, at least 600 px across.')}
        </div>
        {err && <p className="error">{err}</p>}
      </Panel>
      <Panel title="How it looks">
        <div className="hq-previews">
          <figure className="hq-pv">
            <div className="hq-pv-bar">
              {b.logo ? <img src={b.logo} alt="" /> : <span className="hq-side-mark org" aria-hidden="true">{org.name.slice(0, 1)}</span>}
              <span>
                <small>ELT Suite</small>
                <b>Classes</b>
              </span>
              <i className="hq-pv-btn">Start teaching</i>
            </div>
            <figcaption>The top of each page</figcaption>
          </figure>
          <figure className="hq-pv">
            <div className="hq-pv-sheet">
              <span>
                <b>Unit 4: Present perfect</b>
                <small>Name ______________ Class ________</small>
              </span>
              {b.wide || b.logo ? <img src={b.wide || b.logo} alt="" /> : <small>{org.name}</small>}
            </div>
            <figcaption>A worksheet</figcaption>
          </figure>
          <figure className="hq-pv">
            <div className="hq-pv-inv">
              {b.wide || b.logo ? <img src={b.wide || b.logo} alt="" /> : <b>{org.name}</b>}
              <span>Join {org.name} in ELT Suite</span>
              <i className="hq-pv-btn">Say yes</i>
            </div>
            <figcaption>An invitation</figcaption>
          </figure>
        </div>
      </Panel>
    </div>
  );
}

// A colour of their own: saved once they stop moving the picker, not at every step.
function OwnColour({ value, onSave }: { value: string; onSave: (c: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onSave(v), 500);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="color" value={v} onChange={(e) => setV(e.target.value)} aria-label="Your own colour" />;
}

// ------------------------------------------------------------------ plan and space
export function OrgSpace({ d, go }: { d: OrgData; go: Go }) {
  const { org, owner, accounts } = d;
  const bought = org.limitGb;
  const toTeachers = Object.keys(org.teachers).reduce((n, uid) => n + orgGbOf(org, uid), 0);
  const toLibrary = Object.values(org.drives ?? {}).reduce((n, x) => n + (x.quotaGb ?? 0), 0);
  const given = givenGb(org);
  const used = Object.keys(org.teachers).reduce((n, uid) => n + (accounts[uid]?.usedBytes ?? 0), 0);
  const free = Math.max(0, bought - given);
  const pct = (gb: number) => `${Math.min(100, (gb / Math.max(bought, given, 1)) * 100)}%`;
  const plan = PLANS.find((p) => p.k === org.plan);
  const custom = Object.entries(org.teachers).filter(([, t]) => t.gb !== undefined);
  const top = Object.entries(org.teachers)
    .map(([uid, t]) => ({ uid, t, used: accounts[uid]?.usedBytes ?? 0, gb: orgGbOf(org, uid) }))
    .sort((a, b) => b.used / (b.gb || 1) - a.used / (a.gb || 1))
    .slice(0, 6);
  const allowed = APP_LIST.filter((a) => org.allow?.apps?.[a.k] !== false);
  return (
    <div className="hq-page">
      <PageHead title="Plan and limits" lede={`What ${org.name} has from ELT Suite, what it uses, and how its space is shared out.`} />
      <OrgLimitsPanel org={org} owner={owner} usedBytes={used} note={d.note} />
      <Panel title="Space">
        <div className="hq-stack" role="img" aria-label={`${bought} GB in all: ${toTeachers} GB given to teachers, ${toLibrary} GB to the library, ${free} GB not given out. ${fmtBytes(used)} used by teachers.`}>
          <i className="t" style={{ width: pct(toTeachers) }}>
            <i className="u" style={{ width: `${Math.min(100, (used / GB / Math.max(toTeachers, 0.001)) * 100)}%` }} />
          </i>
          <i className="l" style={{ width: pct(toLibrary) }} />
          {given > bought && <i className="x" style={{ width: pct(given - bought) }} />}
        </div>
        <dl className="hq-legend">
          <div>
            <dt>
              <i className="u" /> Used by teachers
            </dt>
            <dd>{fmtBytes(used)}</dd>
          </div>
          <div>
            <dt>
              <i className="t" /> Given to teachers
            </dt>
            <dd>{fmtGb(toTeachers)}</dd>
          </div>
          <div>
            <dt>
              <i className="l" /> Given to the library
            </dt>
            <dd>{fmtGb(toLibrary)}</dd>
          </div>
          <div>
            <dt>
              <i className="f" /> Not given out
            </dt>
            <dd>{given > bought ? <span className="hq-late">{fmtGb(given - bought)} too much</span> : fmtGb(free)}</dd>
          </div>
          <div>
            <dt>In all</dt>
            <dd>
              <b>{fmtGb(bought)}</b>
            </dd>
          </div>
        </dl>
        <Setting title="Space for each teacher" about={custom.length ? `Unless you give a teacher their own amount: ${custom.map(([, t]) => `${t.name || t.email} has ${fmtGb(t.gb ?? 0)}`).join(', ')}.` : 'Unless you give a teacher their own amount, in Teachers.'}>
          <GbInput value={org.perTeacherGb ?? 1} onSave={(gb) => void savePerTeacher(org, gb).then(() => d.note('Changed the space for each teacher', `${gb} GB`))} max={org.limitGb} label="Space for each teacher in GB" />
        </Setting>
        <Setting title="Space for the library" about="Each library section has its own amount.">
          <button type="button" className="btn small-btn" onClick={() => go({ tab: 'library' })}>
            Library
          </button>
        </Setting>
      </Panel>
      {top.length > 0 && (
        <Panel title="Closest to their limit">
          <ul className="hq-rank">
            {top.map((r) => (
              <li key={r.uid}>
                <button type="button" onClick={() => go({ tab: 'teachers', t: r.uid })}>
                  <span className="hq-rank-n">{r.t.name || r.t.email}</span>
                  <Meter used={r.used} of={r.gb * GB} small />
                  <span className="hq-rank-v">
                    {fmtBytes(r.used)} of {fmtGb(r.gb)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Your plan">
        <dl className="hq-facts">
          <div>
            <dt>Plan</dt>
            <dd>{plan?.label ?? org.plan}</dd>
          </div>
          <div>
            <dt>Space</dt>
            <dd>{fmtGb(bought)}</dd>
          </div>
          <div>
            <dt>Teachers</dt>
            <dd>{Object.keys(org.teachers).length}</dd>
          </div>
          <div>
            <dt>Teacher training</dt>
            <dd>{org.allow?.trainers ? 'Included' : 'Not included'}</dd>
          </div>
        </dl>
        <p className="hint">
          Apps included: {allowed.map((a) => a.name).join(', ')}.{allowed.length < APP_LIST.length ? ` Not included: ${APP_LIST.filter((a) => !allowed.includes(a)).map((a) => a.name).join(', ')}.` : ''} {owner ? '' : 'For more space or apps, ask ELT Suite.'}
        </p>
      </Panel>
      {owner && <OwnerSettings d={d} />}
    </div>
  );
}

// What only the owner of ELT Suite sets for an organisation.
function OwnerSettings({ d }: { d: OrgData }) {
  const { org } = d;
  const [name, setName] = useState(org.name);
  useEffect(() => setName(org.name), [org.name]);
  const allow = (x: NonNullable<typeof org.allow>, what: string) => void saveOrg(org.id, { allow: { ...(org.allow ?? {}), ...x } }).then(() => d.note('Changed the plan', what));
  return (
    <Panel title="Set by you, the owner" className="hq-owner">
      <Setting title="Name of the organisation">
        <input className="hq-in" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== org.name && void saveOrg(org.id, { name: name.trim() }).then(() => d.note('Renamed the organisation', name.trim()))} aria-label="Name of the organisation" maxLength={80} />
      </Setting>
      <Setting title="Plan">
        <Select value={org.plan} options={PLANS.map((p) => ({ v: p.k, label: p.label, hint: p.about }))} onChange={(v) => void saveOrg(org.id, { plan: v as Plan }).then(() => d.note('Changed the plan', PLANS.find((p) => p.k === v)?.label ?? v))} label="Plan" />
      </Setting>
      <Setting title="Space for the organisation">
        <GbInput value={org.limitGb} max={100000} onSave={(gb) => void saveOrg(org.id, { limitGb: gb }).then(() => d.note('Changed the space for the organisation', `${gb} GB`))} label="Space for the organisation in GB" />
      </Setting>
      <Setting title="Teacher training" about="Its admins can make teachers trainers, who create and run teacher training classes.">
        <Switch on={!!org.allow?.trainers} onChange={(v) => allow({ trainers: v }, `Teacher training ${v ? 'on' : 'off'}`)} label="Teacher training" />
      </Setting>
      <h3 className="hq-sub">Apps in the plan</h3>
      <p className="hint">Its admins can turn these off for their teachers, but not turn on what you leave off.</p>
      {APP_LIST.map((k) => (
        <Setting key={k.k} title={k.name} sub>
          <Switch on={org.allow?.apps?.[k.k] !== false} onChange={(v) => allow({ apps: { ...(org.allow?.apps ?? {}), [k.k]: v } }, `${k.name} ${v ? 'in' : 'out of'} the plan`)} label={`${k.name} for ${org.name}`} />
        </Setting>
      ))}
      <div className="hq-danger">
        <span className="hq-set-t">
          <b>Delete the organisation</b>
          <span>Its {plural(Object.keys(org.teachers).length, 'teacher')} keep their accounts and files, on the free plan.</span>
        </span>
        <button type="button" className="btn small-btn danger" onClick={() => void ask(`Delete ${org.name}? Its teachers keep their accounts and files, on the free plan.`, { ok: 'Delete' }).then((ok) => ok && void removeOrg(org))}>
          Delete
        </button>
      </div>
    </Panel>
  );
}

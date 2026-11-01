import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { SuperUsage } from './admin/Usage';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { Select } from '../components/Select';
import { OrgOverview, SuperOverview } from './AdminOverview';
import { useSuper, logOrg, useAccounts, useAllClasses, useAllInvites, useDrive, useOrgAccounts, useOrgClasses, useOrgInvites, useOrgLog, useOrgPictures, useOrgs, useTeachers, type Org } from '../lib/admin';
import { OrgAdmins, OrgInvites, OrgTeachers } from './admin/OrgPeople';
import { OrgClasses } from './admin/OrgClasses';
import { OrgBrand, OrgRules, OrgSpace } from './admin/OrgSettings';
import { OrgDrives, OrgForms } from './admin/OrgLibrary';
import { OrgActivity } from './admin/OrgActivity';
import { SuperApps, SuperDefaults, SuperOrgs, SuperTeachers } from './admin/Super';
import { SuperAi } from './admin/SuperAi';
import { SuperAdmins } from './admin/SuperAdmins';
import { InviteCodes } from './admin/InviteCodes';
import { BrandKit } from './admin/BrandKit';
import { codeState, useCodes } from '../lib/codes';
import { WAIT_DAYS } from './admin/attention';
import { daysSince, plural } from './admin/ui';
import type { OrgData, Go, SuperData } from './admin/types';
import './admin.css';

// Super Admin (/admin) is for super admins (the owner, and whoever they make one): every teacher,
// organisation and switch.
// Organisation admin (/org-admin) is for an organisation's admins: their organisation only.
// Where you are lives in the address (?org=…&tab=…), so every page can be linked to and Back works.

type NavItem = { k: string; label: string; icon: string; n?: number; badge?: number };
const OLD: Record<string, string> = { drives: 'library' };

export function AdminPage({ mode = 'super' }: { mode?: 'super' | 'org' }) {
  const { user } = useAuth();
  const isSuper = useSuper();
  const isOwner = isSuper === true;
  const owner = mode === 'super' && isOwner;
  const orgs = useOrgs(owner, user?.email);
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'overview';
  const tab = OLD[rawTab] ?? rawTab;
  const orgId = params.get('org') || (!owner && orgs?.length ? orgs[0].id : '');
  const org = orgs?.find((o) => o.id === orgId) ?? null;
  const go: Go = useCallback(
    (to) => {
      const n = new URLSearchParams();
      const o = to.org === undefined ? orgId : to.org;
      if (o && (owner || (orgs?.length ?? 0) > 1 || to.org)) n.set('org', o);
      if (to.tab && to.tab !== 'overview') n.set('tab', to.tab);
      for (const [k, v] of Object.entries(to)) if (!['org', 'tab'].includes(k) && v) n.set(k, String(v));
      setParams(n, { replace: !!to.replace });
    },
    [orgId, owner, orgs?.length, setParams],
  );
  const mainRef = useRef<HTMLElement>(null);
  // A new page starts at its top.
  useEffect(() => void window.scrollTo({ top: 0 }), [tab, orgId, params.get('c')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user && isSuper === null) return <Loader full label={mode === 'super' ? 'Opening Super Admin' : 'Opening Organisation admin'} />;
  if (user && mode === 'super' && !isOwner)
    return (
      <Frame>
        <div className="hq-closed">
          <strong>Super Admin is only for the super admins of ELT Suite</strong>
          <span className="hint">You can run your own organisation from Organisation admin, if you’re one of its admins.</span>
        </div>
      </Frame>
    );
  if (!user || orgs === null) return <Loader full label={mode === 'super' ? 'Opening Super Admin' : 'Opening Organisation admin'} />;
  if (!owner && !orgs.length)
    return (
      <Frame>
        <div className="hq-closed">
          <strong>Organisation admin is for an organisation's admins</strong>
          <span className="hint">Ask the person who runs your organisation in ELT Suite to add you as an admin.</span>
        </div>
      </Frame>
    );
  if (org) return <OrgArea key={org.id} org={org} orgs={orgs} owner={owner} tab={tab} params={params} go={go} mainRef={mainRef} />;
  return <SuperArea orgs={orgs} tab={tab} params={params} go={go} mainRef={mainRef} />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <TopBar />
      {children}
    </div>
  );
}

function Nav({ label, items, groups, tab, go, top }: { label: string; items?: NavItem[]; groups: [string, NavItem[]][]; tab: string; go: Go; top?: ReactNode }) {
  const link = (i: NavItem) => (
    <Link key={i.k} to={{ search: hrefFor(i.k) }} className={'hq-nav-i' + (tab === i.k ? ' on' : '')} aria-current={tab === i.k ? 'page' : undefined} onClick={(e) => (e.preventDefault(), go({ tab: i.k }))}>
      <UiIcon name={i.icon} size={16} />
      <span className="hq-nav-l">{i.label}</span>
      {i.badge ? (
        <span className="hq-nav-b">
          {i.badge}
          <span className="hq-sr"> waiting more than a week</span>
        </span>
      ) : i.n !== undefined ? (
        <span className="hq-nav-n">{i.n}</span>
      ) : null}
    </Link>
  );
  const ref = useRef<HTMLElement>(null);
  // On a phone the menu is a row that scrolls: keep the page you are on in view.
  useEffect(() => {
    const nav = ref.current;
    const on = nav?.querySelector<HTMLElement>('.hq-nav-i.on');
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - 24);
  }, [tab]);
  return (
    <aside className="hq-side">
      {top}
      <label className="hq-mobile-nav">Admin section<select aria-label="Admin section" value={tab} onChange={e=>go({tab:e.target.value})}>{items?.map(i=><option key={i.k} value={i.k}>{i.label}</option>)}{groups.map(([g,list])=>g?<optgroup key={g} label={g}>{list.map(i=><option key={i.k} value={i.k}>{i.label}</option>)}</optgroup>:list.map(i=><option key={i.k} value={i.k}>{i.label}</option>))}</select></label>
      <nav className="hq-nav" aria-label={label} ref={ref}>
        {items?.map(link)}
        {groups.map(([g, list]) => (
          <div key={g || 'main'} className="hq-nav-g">
            {g && <span className="hq-nav-h">{g}</span>}
            {list.map(link)}
          </div>
        ))}
      </nav>
    </aside>
  );
}
// The address a menu item goes to, for opening it in a new tab.
const hrefFor = (tab: string) => {
  const p = new URLSearchParams(window.location.search);
  const o = p.get('org');
  const n = new URLSearchParams();
  if (o) n.set('org', o);
  if (tab !== 'overview') n.set('tab', tab);
  const s = n.toString();
  return s ? '?' + s : '';
};

// ------------------------------------------------------------------ the whole of ELT Suite
function SuperArea({ orgs, tab, params, go, mainRef }: { orgs: Org[]; tab: string; params: URLSearchParams; go: Go; mainRef: React.RefObject<HTMLElement> }) {
  const teachers = useTeachers(true);
  const accounts = useAccounts(true);
  const classes = useAllClasses(true);
  const invites = useAllInvites(true);
  const codes = useCodes(true);
  const d: SuperData = { teachers: teachers ?? [], accounts, orgs, classes: classes ?? [], invites, loading: teachers === null || classes === null };
  const items: NavItem[] = [
    { k: 'overview', label: 'Overview', icon: 'poll' },
    { k: 'teachers', label: 'Teachers', icon: 'person', n: teachers?.length },
    { k: 'codes', label: 'Invitation codes', icon: 'plus', n: codes?.filter((c) => codeState(c) === 'open').length || undefined },
    { k: 'orgs', label: 'Organisations', icon: 'groups', n: orgs.length },
    { k: 'ai', label: 'AI usage and access', icon: 'board' },
    { k: 'apps', label: 'Apps', icon: 'board' },
    { k: 'defaults', label: 'Sounds for everyone', icon: 'music' },
    { k: 'activity', label: 'Activity', icon: 'timer' },
    { k: 'supers', label: 'Super admins', icon: 'lock' },
    { k: 'brand', label: 'Brand kit', icon: 'picture' },
  ];
  const groupKeys: [string,string[]][] = [['People and access',['teachers','orgs','codes','supers']],['Usage and limits',['ai','activity']],['Product and appearance',['apps','defaults','brand']]];
  const groups: [string,NavItem[]][] = groupKeys.map(([label,keys])=>[label,keys.map(k=>items.find(i=>i.k===k)!)]);
  const known = items.some((i) => i.k === tab) ? tab : 'overview';
  return (
    <Frame>
      <div className="hq">
        <Nav
          label="Super Admin"
          items={items.filter(i=>i.k==='overview')}
          groups={groups}
          tab={known}
          go={go}
          top={
            <>
              <div className="hq-side-id">
                <span className="hq-side-mark" aria-hidden="true">
                  <UiIcon name="lock" size={18} />
                </span>
                <span>
                  <b>Super Admin</b>
                  <span>All of ELT Suite</span>
                </span>
              </div>
              {orgs.length > 0 && <div className="hq-side-switch"><label className="hq-nav-h">Open an organisation</label><Select value="" options={[{v:'',label:'Choose organisation…'},...orgs.map(o=>({v:o.id,label:o.name}))]} onChange={v=>v&&go({org:v,tab:'overview'})} label="Open an organisation" search /></div>}

            </>
          }
        />
        <main className="hq-main" ref={mainRef}>
          {known === 'overview' && <SuperOverview d={d} go={go} />}
          {known === 'teachers' && <SuperTeachers d={d} go={go} params={params} />}
          {known === 'codes' && <InviteCodes orgs={orgs} />}
          {known === 'orgs' && <SuperOrgs d={d} go={go} params={params} />}
          {known === 'ai' && <SuperAi teachers={teachers ?? []} loading={teachers === null} />}
          {known === 'apps' && <SuperApps d={d} />}
          {known === 'defaults' && <SuperDefaults />}
          {known === 'activity' && <SuperUsage teachers={teachers ?? []} />}
          {known === 'supers' && <SuperAdmins />}
          {known === 'brand' && <BrandKit />}
        </main>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ one organisation
function OrgArea({ org, orgs, owner, tab, params, go, mainRef }: { org: Org; orgs: Org[]; owner: boolean; tab: string; params: URLSearchParams; go: Go; mainRef: React.RefObject<HTMLElement> }) {
  const { user, profile } = useAuth();
  const classes = useOrgClasses(org);
  const accounts = useOrgAccounts(org);
  const invites = useOrgInvites(org);
  const log = useOrgLog(org);
  const folders = useDrive(org);
  const pics = useOrgPictures(org);
  // The owner, inside an organisation, also sees every teacher, to add one who has an account.
  const allTeachers = useTeachers(owner);
  const allAccounts = useAccounts(owner);
  const me = { uid: user?.uid ?? '', name: profile?.displayName || user?.displayName || user?.email || 'An admin' };
  const note = useCallback((what: string, detail = '') => void logOrg(org.id, me, what, detail), [org.id, me.uid, me.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const d: OrgData = { org, orgs, owner, classes: classes ?? [], accounts, invites, log: log ?? [], folders: folders ?? [], pics, me, note, allTeachers: allTeachers ?? [], allAccounts, loading: classes === null };
  const active = (classes ?? []).filter((c) => c.status === 'active');
  const waiting = invites.filter((i) => i.status === 'pending');
  const old = waiting.filter((i) => daysSince(i.at) >= WAIT_DAYS).length;
  const groups: [string, NavItem[]][] = [
    [
      '',
      [
        { k: 'overview', label: 'Overview', icon: 'poll' },
        { k: 'activity', label: 'Activity', icon: 'bell' },
      ],
    ],
    [
      'People',
      [
        { k: 'teachers', label: 'Teachers', icon: 'person', n: Object.keys(org.teachers).length },
        { k: 'invites', label: 'Invitations', icon: 'message', n: waiting.length, badge: old },
        { k: 'codes', label: 'Invitation codes', icon: 'plus' },
        { k: 'admins', label: 'Admins', icon: 'lock', n: org.adminEmails.length },
      ],
    ],
    [
      'Teaching',
      [
        { k: 'classes', label: 'Classes', icon: 'classes', n: active.length },
        { k: 'library', label: 'Library', icon: 'folder' },
        ...(org.allow?.trainers ? [{ k: 'forms', label: 'Training forms', icon: 'task', n: Object.keys(org.ttForms ?? {}).length }] : []),
      ],
    ],
    [
      'Settings',
      [
        { k: 'rules', label: 'Rules', icon: 'settings' },
        { k: 'brand', label: 'Branding', icon: 'picture' },
        { k: 'space', label: 'Plan and limits', icon: 'archive' },
      ],
    ],
  ];
  const known = groups.some(([, l]) => l.some((i) => i.k === tab)) ? tab : 'overview';
  const color = org.brand?.color && /^#[0-9a-f]{6}$/i.test(org.brand.color) ? org.brand.color : '';
  const style = color ? ({ '--accent': color, '--accent-text': `color-mix(in srgb, ${color} 66%, #000)` } as React.CSSProperties) : undefined;
  return (
    <Frame>
      <div className="hq" style={style}>
        <Nav
          label={`${org.name} admin`}
          groups={groups}
          tab={known}
          go={go}
          top={
            <>
              {owner && (
                <Link to={{ search: '' }} className="hq-back" onClick={(e) => (e.preventDefault(), go({ org: '', tab: 'orgs' }))}>
                  <span aria-hidden="true">‹</span> Super Admin
                </Link>
              )}
              <div className="hq-side-id">
                {org.brand?.logo ? <img className="hq-side-logo" src={org.brand.logo} alt="" /> : <span className="hq-side-mark org" aria-hidden="true">{org.name.slice(0, 1)}</span>}
                <span>
                  <b>{org.name}</b>
                  <span>{plural(Object.keys(org.teachers).length, 'teacher')}</span>
                </span>
              </div>
              {!owner && orgs.length > 1 && (
                <div className="hq-side-switch">
                  <Select value={org.id} options={orgs.map((o) => ({ v: o.id, label: o.name }))} onChange={(v) => go({ org: v, tab: 'overview' })} label="Organisation" />
                </div>
              )}
            </>
          }
        />
        <main className="hq-main" ref={mainRef}>
          {known === 'overview' && <OrgOverview d={d} go={go} />}
          {known === 'activity' && <OrgActivity d={d} params={params} go={go} />}
          {known === 'teachers' && <OrgTeachers d={d} params={params} go={go} />}
          {known === 'invites' && <OrgInvites d={d} params={params} go={go} />}
          {known === 'codes' && <InviteCodes org={org} />}
          {known === 'admins' && <OrgAdmins d={d} />}
          {known === 'classes' && <OrgClasses d={d} params={params} go={go} />}
          {known === 'library' && <OrgDrives d={d} />}
          {known === 'forms' && <OrgForms d={d} />}
          {known === 'rules' && <OrgRules d={d} />}
          {known === 'brand' && <OrgBrand d={d} />}
          {known === 'space' && <OrgSpace d={d} go={go} />}
        </main>
      </div>
    </Frame>
  );
}

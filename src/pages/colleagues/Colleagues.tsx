import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { TopBar } from '../../components/TopBar';
import { UiIcon } from '../../components/UiIcon';
import { useOrgColleagues, useTeacherProfile } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { useChats, type Chat, type Person as ChatPerson } from '../../lib/chat';
import { useTeacherClasses } from '../../lib/coteach';
import { unshare, useFolders, useMyDocs } from '../../lib/sharedDocs';
import { setShareAccess, useColleagues, useMyLinks, useMyShares, useSharedWithMe } from '../../lib/sharing';
import { useStatus } from '../../lib/status';
import { useMedia } from '../../lib/useMedia';
import { answersOf, between, isAround, lately, matchOf, shortStatus, since, useBook, useOrgProfiles, type Mate, type Sources } from './book';
import { Empty, Invite, InvitePane, Overview, AroundNow } from './Overview';
import { Face, Marked, Reach } from './parts';
import { Person } from './Person';
import './colleagues.css';

// Colleagues: every teacher you work with, in your organisation and beyond. Find anyone, see who
// they are and what passes between you, and message or call them in one click.

const NARROW = '(max-width: 860px)';

export default function Colleagues() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const myName = user?.displayName || profile?.displayName || user?.email?.split('@')[0] || 'Teacher';
  const me: ChatPerson = useMemo(() => ({ key: uid, name: myName, role: 'teacher' }), [uid, myName]);
  const org = useOrgColleagues();
  const list = useColleagues(uid || undefined);
  const profiles = useOrgProfiles(org, uid);
  const book = useBook(uid, list, org, profiles);
  const ids = useMemo(() => (book ?? []).map((m) => m.id), [book]);
  const st = useStatus(ids);
  const chats = useChats(uid || undefined);
  const dms = useMemo(() => new Map((chats ?? []).filter((c) => c.kind === 'dm').map((c) => [c.id, c])), [chats]);
  const chatOf = (id: string): Chat | undefined => dms.get('dm_' + [uid, id].sort().join('_'));
  const src: Sources = {
    mine: useMyShares(uid || undefined),
    withMe: useSharedWithMe(uid || undefined),
    docs: useMyDocs(uid || undefined),
    folders: useFolders(uid || undefined),
    classes: useTeacherClasses(uid || undefined).classes,
  };
  const links = useMyLinks(uid || undefined);
  const myProfile = useTeacherProfile(org?.policy?.profiles ? uid : undefined);
  const nudge = !!org?.policy?.profiles && myProfile !== undefined && !answersOf(org, myProfile).length;
  const canInvite = org?.outside !== 'org';
  const admin = !!org && !!user?.email && org.adminEmails.includes(user.email.toLowerCase());

  // Who is open: ?p=<uid>, or ?invite. On a phone each is its own screen, and Back returns.
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const narrow = useMedia(NARROW);
  const sel = params.get('p') ?? '';
  const inviting = params.has('invite');
  const cur = book?.find((m) => m.id === sel);
  const go = (p: Record<string, string>) => setParams(p, { replace: !narrow, state: narrow ? { clg: true } : undefined });
  const open = (id: string) => go({ p: id });
  const invite = () => go({ invite: '' });
  const back = () => ((loc.state as { clg?: boolean } | null)?.clg ? nav(-1) : setParams({}, { replace: true }));

  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
    if (narrow) window.scrollTo({ top: 0 });
  }, [sel, inviting]); // eslint-disable-line react-hooks/exhaustive-deps
  // "/" goes to the search, as in Files and Messages.
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || t?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      if (narrow && (sel || inviting)) setParams({}, { replace: true });
      search.current?.focus();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [narrow, sel, inviting, setParams]);

  const people = useMemo(() => new Map((book ?? []).map((m) => [m.id, m])), [book]);
  const found = useMemo(() => (q.trim() && book ? book.map((m) => ({ m, r: matchOf(m, q, org, profiles[m.id]) })).filter((x) => x.r.hit) : null), [q, book, org, profiles]);
  const groups = book
    ? [
        ...(org ? [{ id: 'org', label: org.name, people: book.filter((m) => m.inOrg) }] : []),
        { id: 'others', label: org ? 'Other colleagues' : 'Your colleagues', people: book.filter((m) => !m.inOrg) },
      ].filter((g) => g.people.length)
    : [];
  const around = book ? book.filter((m) => isAround(st[m.id])).length : 0;
  const empty = book !== null && !book.length;
  const pane = !!cur || inviting;

  // Up and down move between people in the list.
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.clg-row-main')];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = all[i < 0 ? 0 : Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) (e.preventDefault(), next.focus());
  };
  const row = (m: Mate, note?: { label: string; text: string }) => {
    const s = shortStatus(st[m.id]);
    const sub = m.title || (m.inOrg ? 'Teacher' : m.since ? `Colleague since ${since(m.since)}` : 'Colleague');
    return (
      <li key={m.id} className={'clg-row' + (cur?.id === m.id ? ' on' : '')}>
        <button type="button" className="clg-row-main" aria-current={cur?.id === m.id ? 'true' : undefined} onClick={() => open(m.id)}>
          <Face m={m} size={40} st={st[m.id]} />
          <span className="clg-row-t">
            <b>
              <Marked text={m.name} q={q} />
            </b>
            <span className="clg-row-sub">
              {note ? (
                <>
                  {note.label}: <Marked text={note.text.length > 90 ? note.text.slice(0, 90) + '…' : note.text} q={q} />
                </>
              ) : (
                <>
                  <Marked text={sub} q={q} />
                  {s && s !== 'Online' && <span className="clg-row-st"> · {s}</span>}
                </>
              )}
            </span>
          </span>
        </button>
        <span className="clg-row-acts" role="group" aria-label={m.name}>
          <Reach m={m} me={me} chat={chatOf(m.id)} look="row" />
        </span>
      </li>
    );
  };

  const inviteBox = <Invite uid={uid} me={{ name: myName, email: user?.email ?? '' }} org={org} links={links} admin={admin} />;
  return (
    <div className="shell clg-shell">
      <TopBar />
      <main className={'clg' + (pane ? ' has-pane' : '') + (empty ? ' is-empty' : '')}>
        <section className="clg-side" aria-label="Directory">
          <div className="clg-side-top">
            <h1 className="page-title">Colleagues</h1>
            {canInvite && !empty && (
              <button type="button" className={'btn small-btn clg-invite-btn' + (inviting ? ' on' : '')} onClick={invite} aria-pressed={inviting}>
                <UiIcon name="plus" size={14} />
                Invite
              </button>
            )}
          </div>
          {book && !empty && (
            <span className="clg-count">
              {book.length} {book.length === 1 ? 'colleague' : 'colleagues'}
              {around ? ` · ${around} around now` : ''}
            </span>
          )}
          {!empty && (
            <label className="clg-search">
              <UiIcon name="search" size={16} />
              <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, job title, language, interest" aria-label="Search colleagues" onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
              {q ? (
                <button type="button" className="clg-clear" aria-label="Clear the search" data-tip="Clear" onClick={() => (setQ(''), search.current?.focus())}>
                  <UiIcon name="plus" size={16} />
                </button>
              ) : (
                <kbd aria-hidden="true">/</kbd>
              )}
            </label>
          )}
          {book && !q && !empty && <AroundNow strip mates={book} st={st} chatOf={chatOf} me={me} onOpen={open} />}
          <div className="clg-list" onKeyDown={keys}>
            {book === null ? (
              <ul className="clg-rows" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="clg-row clg-skel-person">
                    <span className="clg-skel clg-skel-face" />
                    <span className="clg-skel clg-skel-line" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                  </li>
                ))}
              </ul>
            ) : found ? (
              <div className="clg-group">
                <span className="clg-group-h" aria-live="polite">
                  {found.length ? `${found.length} found` : 'No one found'}
                </span>
                {found.length ? <ul className="clg-rows">{found.map(({ m, r }) => row(m, r.note))}</ul> : <p className="hint clg-none">Try part of a name, a job title, or a language they speak.</p>}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="clg-group" role="group" aria-labelledby={'clg-g-' + g.id}>
                  <span className="clg-group-h" id={'clg-g-' + g.id}>
                    {g.label} · {g.people.length}
                  </span>
                  <ul className="clg-rows">{g.people.map((m) => row(m))}</ul>
                </div>
              ))
            )}
            {book && !q && canInvite && !!links.length && (
              <div className="clg-group" role="group" aria-labelledby="clg-g-inv">
                <span className="clg-group-h" id="clg-g-inv">
                  Invitations · {links.length}
                </span>
                <ul className="clg-rows">
                  <li className={'clg-row' + (inviting ? ' on' : '')}>
                    <button type="button" className="clg-row-main" aria-current={inviting ? 'true' : undefined} onClick={invite}>
                      <span className="clg-link-ic" aria-hidden="true">
                        <UiIcon name="link" size={18} />
                      </span>
                      <span className="clg-row-t">
                        <b>{links.length === 1 ? 'An invitation link is open' : `${links.length} invitation links are open`}</b>
                        <span className="clg-row-sub">Whoever opens it can become your colleague</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="clg-main" ref={main} aria-label={cur ? cur.name : inviting ? 'Invite a colleague' : 'Overview'}>
          {empty ? (
            <Empty org={org} invite={canInvite ? inviteBox : null} />
          ) : inviting ? (
            <InvitePane uid={uid} me={{ name: myName, email: user?.email ?? '' }} org={org} links={links} admin={admin} onBack={back} />
          ) : cur ? (
            <Person key={cur.id} m={cur} st={st[cur.id]} chat={chatOf(cur.id)} me={me} org={org} uid={uid} between={between(src, uid, cur, (s) => setShareAccess(s.id, s.mode, (s.people ?? []).filter((p) => p !== cur.id)), (d) => unshare(d, cur.id))} onBack={back} onGone={() => setParams({}, { replace: true })} />
          ) : book ? (
            <Overview mates={book} org={org} st={st} chatOf={chatOf} me={me} lately={lately(src, uid, people)} onOpen={open} onInvite={invite} canInvite={canInvite} nudge={nudge} />
          ) : null}
        </section>
      </main>
    </div>
  );
}

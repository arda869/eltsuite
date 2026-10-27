import { answerOf, profileFieldsOf, useMyOrg, useTeacherProfile } from '../lib/admin';
import { ProfileIcon } from '../components/ProfileIcons';
import { ask } from '../lib/ask';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { removeColleague, setShareAccess, useColleagues, useMyShares, useSharedWithMe, type Share } from '../lib/sharing';
import { TopBar } from '../components/TopBar';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { ArchiveColleagues } from './ArchiveLibrary';

// Colleagues: each one, with what you share with them and what they share with you.

const KIND: Record<string, { label: string; icon: string }> = { lesson: { label: 'Lesson', icon: 'task' }, task: { label: 'Task', icon: 'edit' }, doc: { label: 'Shared document', icon: 'discuss' }, media: { label: 'Media', icon: 'picture' } };
const when = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

// No tab bar: the apps button in the top bar leads everywhere, on a phone too. Pages still say
// which place they are, for later.
export function MainNav(_: { on: 'home' | 'classes' | 'colleagues' | 'archive' | 'messages' | '' }) {
  void _;
  return null;
}

// The learner's main places, the same way: in the top bar on a computer, at the bottom on a phone.
export function LearnerNav({ on, unreadMsgs = 0, unreadThreads = 0, phoneOnly }: { on: 'home' | 'notebook' | 'messages' | 'discuss'; unreadMsgs?: number; unreadThreads?: number; phoneOnly?: boolean }) {
  const tab = (to: string, key: typeof on, icon: string, label: string, badge?: number) => (
    <Link to={to} className={'mn-tab' + (on === key ? ' on' : '')} aria-current={on === key ? 'page' : undefined}>
      <span className="mn-ic">
        <UiIcon name={icon} size={18} />
        {!!badge && <span className="nav-badge">{badge}</span>}
      </span>
      <span className="mn-l">{label}</span>
      <span className="mn-s">{label}</span>
    </Link>
  );
  return (
    <nav aria-label="Main" className={'main-nav' + (phoneOnly ? ' mn-phone' : '')}>
      {tab('/', 'home', 'home', 'Home')}
      {tab('/notebook', 'notebook', 'notebook', 'Notebook')}
      {tab('/messages', 'messages', 'message', 'Messages', unreadMsgs)}
      {tab('/discuss', 'discuss', 'discuss', 'Discussion', unreadThreads)}
    </nav>
  );
}

function Item({ s, extra }: { s: Partial<Share> & { id: string }; extra?: React.ReactNode }) {
  const k = KIND[s.kind ?? 'lesson'];
  return (
    <div className="cp-item">
      <span className="al-ic" style={{ ['--cc' as string]: 'var(--accent)' }}>
        <UiIcon name={k.icon} size={15} />
      </span>
      <span className="cp-item-t">
        <Link to={`/s/${s.id}`}>{s.title}</Link>
        <span className="hint">
          {k.label}
          {s.mode === 'link' ? ' · anyone with the link' : ''} · {when(s.updated ?? s.at)}
        </span>
      </span>
      {extra}
    </div>
  );
}

export function ColleaguesPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const colleagues = useColleagues(uid);
  const mine = useMyShares(uid);
  const withMe = useSharedWithMe(uid);
  const [pick, setPick] = useState('');
  const [inviting, setInviting] = useState(false);
  const cur = colleagues?.find((c) => c.id === pick) ?? colleagues?.[0];
  const toThem = (id: string) => (mine ?? []).filter((s) => s.people?.includes(id));
  const fromThem = (id: string) => (withMe ?? []).filter((s) => s.owner === id);
  const byLink = (mine ?? []).filter((s) => s.mode === 'link');

  return (
    <div className="shell">
      <TopBar>
        <MainNav on="colleagues" />
      </TopBar>
      <div className="cp">
        <div className="ma-head">
          <div className="ma-head-text">
            <h1 className="page-title">Colleagues</h1>
            <span className="sub">Teachers you share lessons, tasks, documents and media with. You connect through a link you send them.</span>
          </div>
          <button type="button" className="btn primary" onClick={() => setInviting((v) => !v)}>
            + Invite a colleague
          </button>
        </div>
        {inviting && user && (
          <div className="cp-invite">
            <ArchiveColleagues uid={uid} me={{ name: user.displayName || user.email?.split('@')[0] || 'A colleague', email: user.email ?? '' }} inviteOnly />
          </div>
        )}
        {colleagues === null ? (
          <Loader label="Opening your colleagues" />
        ) : colleagues.length === 0 ? (
          <div className="ma-empty">
            <UiIcon name="groups" size={28} />
            <strong>No colleagues yet</strong>
            <span className="hint">Invite a colleague with a link. When they accept, you can share with each other.</span>
            {!inviting && (
              <button type="button" className="btn primary" onClick={() => setInviting(true)}>
                Invite a colleague
              </button>
            )}
          </div>
        ) : (
          <div className="cp-body">
            <nav className="cp-list" aria-label="Colleagues">
              {colleagues.map((c) => {
                const a = toThem(c.id).length;
                const b = fromThem(c.id).length;
                return (
                  <button key={c.id} type="button" className={'cp-person' + (cur?.id === c.id ? ' on' : '')} onClick={() => setPick(c.id)}>
                    <span className="sh-av">{c.name.trim().slice(0, 1).toUpperCase()}</span>
                    <span className="sh-pt">
                      <b>{c.name}</b>
                      <span className="hint">
                        {a} shared by you · {b} shared with you
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            {cur && (
              <section className="cp-detail" aria-label={cur.name}>
                <header className="cp-head">
                  <span className="sp-av">{cur.name.trim().slice(0, 1).toUpperCase()}</span>
                  <span className="sh-pt">
                    <h2>{cur.name}</h2>
                    <span className="hint">
                      {cur.title || 'Colleague'}
                      {cur.org ? ` · ${cur.orgName ?? ''}` : ''}
                      {!cur.org && cur.at ? ` · since ${new Date(cur.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
                    </span>
                  </span>
                  {cur.org ? <span className="hint">In {cur.orgName || 'your organisation'}: colleagues always</span> : <button type="button" className="btn link small" onClick={() => void ask(`Stop being colleagues with ${cur.name}? What you have shared stays shared until you stop sharing it.`).then((ok) => { if (ok) (removeColleague(uid, cur.id), setPick('')); })}>
                    Remove colleague
                  </button>}
                </header>
                {cur.org && <ColleagueProfile uid={cur.id} />}
                <div className="cp-cols">
                  <div className="cp-col">
                    <span className="eyebrow">You shared with {cur.name.split(' ')[0]}</span>
                    {mine === null ? (
                      <span className="hint">Loading…</span>
                    ) : toThem(cur.id).length === 0 ? (
                      <span className="hint">Nothing yet. Share a lesson from its menu on the class page, or a task, document or media from the resources library.</span>
                    ) : (
                      toThem(cur.id).map((s) => (
                        <Item
                          key={s.id}
                          s={s}
                          extra={
                            <button type="button" className="btn link small" onClick={() => setShareAccess(s.id, s.mode, (s.people ?? []).filter((p) => p !== cur.id))} data-tip={`${cur.name.split(' ')[0]} no longer sees it`}>
                              Stop
                            </button>
                          }
                        />
                      ))
                    )}
                    {byLink.length > 0 && <span className="hint cp-note">{byLink.length} more shared with anyone who has the link. See them in the resources library, under Shared.</span>}
                  </div>
                  <div className="cp-col">
                    <span className="eyebrow">{cur.name.split(' ')[0]} shared with you</span>
                    {withMe === null ? (
                      <span className="hint">Loading…</span>
                    ) : fromThem(cur.id).length === 0 ? (
                      <span className="hint">Nothing yet.</span>
                    ) : (
                      fromThem(cur.id).map((s) => (
                        <Item
                          key={s.id}
                          s={s}
                          extra={
                            <Link className="btn small-btn" to={`/s/${s.id}`}>
                              Open
                            </Link>
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A colleague's profile, as their organisation asks for it.
function ColleagueProfile({ uid }: { uid: string }) {
  const org = useMyOrg();
  const p = useTeacherProfile(uid);
  if (!org?.policy?.profiles || !p) return null;
  const fields = profileFieldsOf(org.policy).filter((f) => f.on && answerOf(p, f.id).trim());
  if (!fields.length) return null;
  return (
    <div className="cp-profile">
      {fields.map((f) => {
        const v = answerOf(p, f.id);
        return (
          <div key={f.id} className={'cp-pf' + (f.kind === 'long' ? ' long' : '')}>
            <ProfileIcon name={f.icon} size={18} />
            <span>
              <b>{f.label}</b>
              {f.kind === 'list' ? (
                <span className="cp-pf-tags">
                  {v.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </span>
              ) : (
                <p>{v}</p>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

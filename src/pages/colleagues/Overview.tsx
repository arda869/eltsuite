import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/avatars';
import { UiIcon } from '../../components/UiIcon';
import type { Org } from '../../lib/admin';
import type { Chat, Person } from '../../lib/chat';
import { colleagueLink, dropLink, makeColleagueLink } from '../../lib/sharing';
import { statusOf, type Status } from '../../lib/status';
import { AROUND_ORDER, isAround, when, type Mate, type Thing } from './book';
import { Face, Reach, ThingRow } from './parts';

// Who is around now, as cards to reach them from.
export function AroundNow({ mates, st, chatOf, me, onOpen, strip }: { mates: Mate[]; st: Record<string, Status>; chatOf: (id: string) => Chat | undefined; me: Person; onOpen: (id: string) => void; strip?: boolean }) {
  const around = mates.filter((m) => isAround(st[m.id])).sort((a, b) => AROUND_ORDER.indexOf(statusOf(st[a.id]).dot) - AROUND_ORDER.indexOf(statusOf(st[b.id]).dot) || a.name.localeCompare(b.name));
  if (strip)
    return around.length ? (
      <div className="clg-strip" aria-label="Around now" role="group">
        <span className="clg-group-h">Around now · {around.length}</span>
        <ul>
          {around.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpen(m.id)} aria-label={`${m.name}, ${statusOf(st[m.id]).label}`}>
                <Face m={m} size={48} st={st[m.id]} />
                <span>{m.first}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return around.length ? (
    <ul className="clg-around">
      {around.map((m) => (
        <li key={m.id} className="clg-card">
          <button type="button" className="clg-card-main" onClick={() => onOpen(m.id)}>
            <Face m={m} size={48} st={st[m.id]} />
            <span className="clg-card-t">
              <b>{m.name}</b>
              <span className="clg-card-st">{statusOf(st[m.id]).label}</span>
              {m.title && <span className="clg-card-sub">{m.title}</span>}
            </span>
          </button>
          <span className="clg-card-acts" role="group" aria-label={m.name}>
            <Reach m={m} me={me} chat={chatOf(m.id)} look="row" />
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="hint clg-none">No one else is around just now. Messages wait for them, and you’ll see here when they’re back.</p>
  );
}

// The page before anyone is chosen: who is around, and what colleagues shared lately.
export function Overview({ mates, org, st, chatOf, me, lately, onOpen, onInvite, canInvite, nudge }: { mates: Mate[]; org: Org | null; st: Record<string, Status>; chatOf: (id: string) => Chat | undefined; me: Person; lately: Thing[]; onOpen: (id: string) => void; onInvite: () => void; canInvite: boolean; nudge: boolean }) {
  const around = mates.filter((m) => isAround(st[m.id])).length;
  const inOrg = mates.filter((m) => m.inOrg).length;
  const byId = new Map(mates.map((m) => [m.id, m]));
  const logo = org?.brand?.logo;
  return (
    <div className="clg-over">
      <header className="clg-over-hero">
        <span className="clg-hero-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="clg-over-text">
          <span className="clg-kicker">
            {logo && <img src={logo} alt="" className="clg-org-logo" />}
            {org ? org.name : 'Your colleagues'}
          </span>
          <h2>{around ? `${around} ${around === 1 ? 'colleague is' : 'colleagues are'} around` : 'Your colleagues'}</h2>
          <p>
            {mates.length} {mates.length === 1 ? 'colleague' : 'colleagues'}
            {org && inOrg ? ` · ${inOrg} in ${org.name}` : ''}
            {org && mates.length - inOrg ? ` · ${mates.length - inOrg} from elsewhere` : ''}. Message or call anyone in one click.
          </p>
        </span>
        <span className="clg-over-stack" aria-hidden="true">
          {mates.slice(0, 5).map((m) => (
            <Face key={m.id} m={m} size={40} dot={false} />
          ))}
        </span>
      </header>

      {nudge && org && (
        <Link to="/settings" className="clg-nudge">
          <span className="clg-nudge-ic" aria-hidden="true">
            <UiIcon name="person" size={18} />
          </span>
          <span>
            <b>Write your profile for {org.name}</b>
            <span className="hint">Your colleagues see it here: a few lines about you, the languages you speak, what you love teaching.</span>
          </span>
          <span className="clg-nudge-go">
            Open Settings
            <UiIcon name="next" size={14} />
          </span>
        </Link>
      )}

      <section className="clg-sec" aria-labelledby="clg-around-h">
        <h3 id="clg-around-h">Around now</h3>
        <AroundNow mates={mates} st={st} chatOf={chatOf} me={me} onOpen={onOpen} />
      </section>

      <section className="clg-sec" aria-labelledby="clg-lately-h">
        <h3 id="clg-lately-h">Lately shared with you</h3>
        {lately.length ? (
          <ul className="clg-things">
            {lately.map((t) => {
              const m = t.owner ? byId.get(t.owner) : undefined;
              return <ThingRow key={t.key} t={{ ...t, meta: [m?.name, t.meta].filter(Boolean).join(' · ') }} face={m ? <Face m={m} size={20} dot={false} /> : undefined} />;
            })}
          </ul>
        ) : (
          <p className="hint clg-none">Lessons, tasks and files your colleagues share with you show here.</p>
        )}
      </section>

      {canInvite && (
        <section className="clg-sec clg-over-invite">
          <span>
            <b>Working with someone from another school?</b>
            <span className="hint">Send them an invitation link. Once they say yes, you can share, message and call each other.</span>
          </span>
          <button type="button" className="btn" onClick={onInvite}>
            <UiIcon name="link" size={15} />
            Invite a colleague
          </button>
        </section>
      )}
    </div>
  );
}

// "Made 3 days ago", "Made today", "Made on 12 Oct".
const made = (t: number) => {
  const w = when(t);
  return 'Made ' + (/^(Today|Yesterday|\d+ days ago)$/.test(w) ? w.toLowerCase() : 'on ' + w);
};

// Inviting a colleague: a link they open to say yes.
export function Invite({ uid, me, org, links, admin }: { uid: string; me: { name: string; email: string }; org: Org | null; links: { id: string; at: number }[]; admin: boolean }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const copy = (t: string) =>
    void navigator.clipboard
      ?.writeText(colleagueLink(t))
      .then(() => (setCopied(t), window.setTimeout(() => setCopied(''), 1800)))
      .catch(() => {});
  const make = async () => {
    setBusy(true);
    setErr('');
    try {
      copy(await makeColleagueLink({ uid, ...me }));
    } catch {
      setErr('We couldn’t make the link. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (org?.outside === 'org')
    return (
      <div className="clg-invite">
        <p className="hint">{org.name} keeps colleagues inside the organisation, so teachers from outside can’t join through a link. Everyone in {org.name} is already here.</p>
        {admin && <AdminNote org={org} />}
      </div>
    );
  const [fresh, ...older] = links;
  return (
    <div className="clg-invite">
      <ol className="clg-steps">
        <li>
          <b>Make a link</b>
          <span className="hint">One link for one colleague, or for a few.</span>
        </li>
        <li>
          <b>Send it to them</b>
          <span className="hint">By email or in a chat outside ELT Suite.</span>
        </li>
        <li>
          <b>They say yes</b>
          <span className="hint">Then you can share, message and call each other. Nobody can find you by searching.</span>
        </li>
      </ol>
      {fresh ? (
        <div className="clg-link">
          <input readOnly value={colleagueLink(fresh.id)} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn primary" onClick={() => copy(fresh.id)}>
            {copied === fresh.id ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="btn" onClick={() => void dropLink(fresh.id)} data-tip="The link stops working">
            End link
          </button>
        </div>
      ) : (
        <button type="button" className="btn primary clg-make" disabled={busy} onClick={() => void make()}>
          <UiIcon name="link" size={15} />
          {busy ? 'Making a link…' : 'Make an invitation link'}
        </button>
      )}
      {fresh && (
        <span className="hint clg-link-note">
          {made(fresh.at)}.{' '}
          <button type="button" className="btn link small" disabled={busy} onClick={() => void make()}>
            Make another link
          </button>
        </span>
      )}
      {err && <span className="error">{err}</span>}
      {!!older.length && (
        <div className="clg-older">
          <span className="clg-group-h">Older links that still work · {older.length}</span>
          <ul>
            {older.map((l) => (
              <li key={l.id}>
                <span className="hint">{made(l.at)}</span>
                <button type="button" className="btn link small" onClick={() => copy(l.id)}>
                  {copied === l.id ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn link small" onClick={() => void dropLink(l.id)}>
                  End
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {admin && org && <AdminNote org={org} />}
    </div>
  );
}
function AdminNote({ org }: { org: Org }) {
  return (
    <p className="hint clg-admin-note">
      To add teachers to {org.name} itself, use <Link to="/org-admin">Organisation admin</Link>. They become everyone’s colleagues there.
    </p>
  );
}

// The invitation, as the page's main pane.
export function InvitePane(props: Parameters<typeof Invite>[0] & { onBack: () => void }) {
  const { onBack, ...rest } = props;
  return (
    <article className="clg-person clg-invite-pane" aria-labelledby="clg-inv-h">
      <button type="button" className="clg-back" onClick={onBack}>
        <UiIcon name="prev" size={16} />
        Colleagues
      </button>
      <header className="clg-inv-head">
        <h2 id="clg-inv-h">Invite a colleague</h2>
        <p>Teachers from other schools join you with a link you send them.</p>
      </header>
      <Invite {...rest} />
    </article>
  );
}

// No colleagues yet.
const FACES = ['owl', 'fox', 'whale', 'bird', 'panda'];
export function Empty({ org, invite }: { org: Org | null; invite: React.ReactNode }) {
  return (
    <div className="clg-empty">
      <span className="clg-empty-art" aria-hidden="true">
        <i />
        <i />
        {FACES.map((k) => (
          <span key={k} className={'clg-empty-f f-' + k}>
            <Avatar k={k} size={k === 'fox' ? 72 : 52} />
          </span>
        ))}
      </span>
      <h2>{org ? `You’re the first teacher from ${org.name} here` : 'Your colleagues, in one place'}</h2>
      <p>{org ? `Teachers your admins add to ${org.name} appear here on their own, with their profiles. You can also invite teachers from other schools.` : 'Invite a teacher with a link. When they say yes, you can share lessons and files, message and call each other, and see when they’re around.'}</p>
      {invite}
    </div>
  );
}

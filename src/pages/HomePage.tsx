import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { useTeacherClasses } from '../lib/coteach';
import { useClassDetails } from './TeacherHome';
import { theme } from '../lib/themes';
import { classDates, classPhase } from '../lib/classes';
import { isLive } from '../lib/live';
import { useMyDocs, newSharedDoc, KIND_LABEL, type DocKind } from '../lib/sharedDocs';
import { useChats, unreadIn } from '../lib/chat';
import { useHandIns } from '../lib/classFiles';
import { libName, useAccount, useMyOrg, useSpaceLimit } from '../lib/admin';
import { formatBytes } from '../lib/archive';

// The first screen of ELT Suite: today, the classes, what is new, and a way into everything.

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return same(d, today) ? `Today, ${t}` : same(d, tomorrow) ? `Tomorrow, ${t}` : `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`;
};
const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

const CREATE: { k: DocKind; label: string; about: string }[] = [
  { k: 'lesson', label: 'Lesson', about: 'Tasks to teach, then add to a class' },
  { k: 'doc', label: 'Collab document', about: 'Written together, live' },
  { k: 'flash', label: 'Flashcards', about: 'A set to study and play' },
  { k: 'pd', label: 'PD reading', about: 'Sources and notes' },
];

export function HomePage() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? '';
  const name = (profile?.displayName || user?.displayName || '').split(' ')[0];
  const org = useMyOrg();
  const { classes } = useTeacherClasses(uid);
  const active = useMemo(() => (classes ?? []).filter((c) => c.status === 'active'), [classes]);
  const { items, live } = useClassDetails(active.map((c) => c.id));
  const docs = useMyDocs(uid);
  const chats = useChats(uid);
  const hand = useHandIns(uid);
  const acc = useAccount(uid);
  const space = useSpaceLimit();

  const learners = active.reduce((n, c) => n + (c.learnerCount ?? 0), 0);
  const unread = (chats ?? []).filter((c) => unreadIn(c, uid));
  const lessons = Object.values(items).reduce((n, l) => n + l.length, 0);
  const coming = useMemo(
    () =>
      active
        .flatMap((c) => (items[c.id] ?? []).filter((i) => i.schedule?.at && i.schedule.at > Date.now() - 3600e3).map((i) => ({ c, i, at: i.schedule!.at })))
        .sort((a, b) => a.at - b.at)
        .slice(0, 4),
    [active, items],
  );
  const due = useMemo(
    () =>
      active
        .flatMap((c) => (items[c.id] ?? []).filter((i) => i.due && i.due > Date.now() - 864e5 && !i.hidden).map((i) => ({ c, i, at: i.due! })))
        .sort((a, b) => a.at - b.at)
        .slice(0, 3),
    [active, items],
  );
  const recent = useMemo(() => [...(docs.mine ?? []), ...(docs.withMe ?? [])].sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)).slice(0, 6), [docs.mine, docs.withMe]);
  const handIns = useMemo(() => [...(hand ?? [])].sort((a, b) => b.at - a.at).slice(0, 4), [hand]);
  const liveNow = active.filter((c) => isLive(live[c.id] ?? null));
  const used = acc?.usedBytes ?? 0;
  const pct = space.bytes ? Math.min(100, used > 0 ? Math.max(1, Math.round((used / space.bytes) * 100)) : 0) : 0;
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const make = async (k: DocKind) => {
    if (!user) return;
    const w = window.open('about:blank', '_blank');
    const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, k);
    if (w) w.location.href = `/doc/${id}`;
    else window.location.href = `/doc/${id}`;
  };

  return (
    <div className="shell hm-shell">
      <TopBar>
        <MainNav on="home" />
      </TopBar>
      <main className="hm">
        <section className="hm-hero" aria-label="Today">
          <div className="hm-hero-art" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="hm-hero-text">
            <span className="hm-date">{date}{org ? ` · ${org.name}` : ''}</span>
            <h1>
              {greeting()}
              {name ? `, ${name}` : ''}
            </h1>
            <p>
              {liveNow.length
                ? `${liveNow.map((c) => c.name).join(' and ')} ${liveNow.length === 1 ? 'is' : 'are'} live now.`
                : coming[0]
                  ? `Next: ${coming[0].i.title} with ${coming[0].c.name}, ${when(coming[0].at).replace(/^Today, /, 'today at ').replace(/^Tomorrow, /, 'tomorrow at ')}.`
                  : unread.length
                    ? `${unread.length} unread ${unread.length === 1 ? 'conversation' : 'conversations'} waiting.`
                    : 'Everything is quiet. A good moment to plan.'}
            </p>
          </div>
          <div className="hm-stats">
            <Stat n={active.length} label={active.length === 1 ? 'class' : 'classes'} to="/classes" />
            <Stat n={learners} label={learners === 1 ? 'learner' : 'learners'} to="/classes" />
            <Stat n={lessons} label={lessons === 1 ? 'lesson' : 'lessons'} to="/archive" />
            <Stat n={unread.length} label="unread" to="/messages" hot={unread.length > 0} />
          </div>
        </section>

        <div className="hm-grid">
          <div className="hm-col">
            {liveNow.length > 0 && (
              <section className="hm-card hm-live" aria-label="Live now">
                {liveNow.map((c) => (
                  <Link key={c.id} to={`/class/${c.id}`} className="hm-live-row" style={{ ['--cc' as string]: theme(c.themeColor).accent }}>
                    <span className="hm-pulse" aria-hidden="true" />
                    <b>{c.name}</b>
                    <span className="hint">is live now</span>
                    <span className="hm-go">Join</span>
                  </Link>
                ))}
              </section>
            )}

            <section className="hm-card" aria-labelledby="hm-coming">
              <header>
                <h2 id="hm-coming">Coming up</h2>
                <Link to="/classes" className="hm-more">All classes</Link>
              </header>
              {coming.length || due.length ? (
                <ol className="hm-agenda">
                  {coming.map(({ c, i, at }) => (
                    <li key={c.id + i.id} style={{ ['--cc' as string]: theme(c.themeColor).accent }}>
                      <span className="hm-time">{when(at)}</span>
                      <span className="hm-what">
                        <b>{i.title}</b>
                        <span className="hint">{c.name}</span>
                      </span>
                      <Link to={`/class/${c.id}/lesson/${i.id}`} className="btn small-btn">Open</Link>
                    </li>
                  ))}
                  {due.map(({ c, i, at }) => (
                    <li key={'d' + c.id + i.id} className="due" style={{ ['--cc' as string]: theme(c.themeColor).accent }}>
                      <span className="hm-time">Due {when(at).replace(/, .*$/, '')}</span>
                      <span className="hm-what">
                        <b>{i.title}</b>
                        <span className="hint">{c.name} · homework</span>
                      </span>
                      <Link to={`/class/${c.id}/lesson/${i.id}`} className="btn small-btn">Open</Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="hm-empty">Nothing scheduled. Set a time on a lesson and it shows here.</p>
              )}
            </section>

            <section className="hm-card" aria-labelledby="hm-classes">
              <header>
                <h2 id="hm-classes">Your classes</h2>
                <Link to="/classes" className="hm-more">Manage</Link>
              </header>
              {active.length ? (
                <div className="hm-classes">
                  {active.slice(0, 6).map((c) => (
                    <Link key={c.id} to={`/class/${c.id}`} className="hm-class" style={{ ['--cc' as string]: theme(c.themeColor).accent }}>
                      <span className="hm-class-band" aria-hidden="true" />
                      <b>{c.name}</b>
                      <span className="hint">
                        {c.level} · {c.learnerCount ?? 0} {(c.learnerCount ?? 0) === 1 ? 'learner' : 'learners'} · {(items[c.id] ?? []).length} {(items[c.id] ?? []).length === 1 ? 'lesson' : 'lessons'}
                      </span>
                      {classDates(c) && <span className={'hm-dates ph-' + classPhase(c)}>{classPhase(c) === 'soon' ? 'Starts soon · ' : classPhase(c) === 'done' ? 'Finished · ' : ''}{classDates(c)}</span>}
                      {isLive(live[c.id] ?? null) && <span className="hm-live-pill">Live</span>}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="hm-empty">
                  No classes yet. <Link to="/classes">Create your first class</Link>.
                </p>
              )}
            </section>

            <section className="hm-card" aria-labelledby="hm-files">
              <header>
                <h2 id="hm-files">Recent files</h2>
                <Link to="/archive" className="hm-more">Files</Link>
              </header>
              {recent.length ? (
                <div className="hm-files">
                  {recent.map((d) => (
                    <a key={d.id} href={`/doc/${d.id}`} target="_blank" rel="noopener" className="hm-file">
                      <FileIcon kind={d.kind as FileKind} sub={d.ltype} size={30} label={false} />
                      <span>
                        <b>{d.title}</b>
                        <span className="hint">
                          {KIND_LABEL[d.kind]} · {d.updatedAt?.toMillis ? ago(d.updatedAt.toMillis()) : ''}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="hm-empty">Documents, flashcards and lessons you make show here.</p>
              )}
            </section>
          </div>

          <aside className="hm-col">
            <section className="hm-card" aria-labelledby="hm-new">
              <header>
                <h2 id="hm-new">Make something</h2>
              </header>
              <div className="hm-make">
                {CREATE.map((c) => (
                  <button key={c.k} type="button" className="hm-make-it" onClick={() => void make(c.k)}>
                    <FileIcon kind={c.k as FileKind} size={26} label={false} />
                    <span>
                      <b>{c.label}</b>
                      <span className="hint">{c.about}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="hm-card" aria-labelledby="hm-msgs">
              <header>
                <h2 id="hm-msgs">Messages</h2>
                <Link to="/messages" className="hm-more">Open</Link>
              </header>
              {(chats ?? []).length ? (
                <ul className="hm-chats">
                  {(chats ?? []).slice(0, 4).map((c) => {
                    const other = c.title || c.members.filter((m) => m !== uid).map((m) => c.names[m]).join(', ') || 'Notes to self';
                    return (
                      <li key={c.id}>
                        <Link to={`/messages?c=${c.id}`} className={unreadIn(c, uid) ? 'unread' : ''}>
                          <span className="hm-av" aria-hidden="true">{other.trim().slice(0, 1).toUpperCase()}</span>
                          <span>
                            <b>{other}</b>
                            <span className="hint">{c.last ? `${c.last.by === uid ? 'You' : c.last.name.split(' ')[0]}: ${c.last.text}` : 'No messages yet'}</span>
                          </span>
                          <span className="hm-ago">{c.lastAt ? ago(c.lastAt) : ''}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="hm-empty">Chats with learners and colleagues show here.</p>
              )}
            </section>

            {handIns.length > 0 && (
              <section className="hm-card" aria-labelledby="hm-hand">
                <header>
                  <h2 id="hm-hand">Handed in</h2>
                  <Link to="/archive" className="hm-more">Files</Link>
                </header>
                <ul className="hm-hand">
                  {handIns.map((h) => (
                    <li key={h.classId + h.id}>
                      <UiIcon name="upload" size={15} />
                      <span>
                        <b>{h.learner}</b>
                        <span className="hint">
                          {h.name} · {h.className}
                        </span>
                      </span>
                      <span className="hm-ago">{h.at ? ago(h.at) : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="hm-card hm-space" aria-labelledby="hm-space">
              <header>
                <h2 id="hm-space">Space</h2>
                <Link to="/archive" className="hm-more">Details</Link>
              </header>
              <div className="hm-ring" style={{ ['--p' as string]: pct }} role="img" aria-label={`${pct}% of your space used`}>
                <span>{pct}%</span>
              </div>
              <span className="hint">
                {formatBytes(used)} of {space.gb} GB{space.org ? ` from ${space.org}` : ''}
              </span>
            </section>

            {org && (
              <Link to="/library" className="hm-card hm-lib">
                <UiIcon name="archive" size={18} />
                <span>
                  <b>{libName(org)}</b>
                  <span className="hint">{org.name}’s lessons and materials, ready to copy into your classes</span>
                </span>
              </Link>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stat({ n, label, to, hot }: { n: number; label: string; to: string; hot?: boolean }) {
  return (
    <Link to={to} className={'hm-stat' + (hot ? ' hot' : '')}>
      <b>{n}</b>
      <span>{label}</span>
    </Link>
  );
}

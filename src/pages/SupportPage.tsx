import { useCallback, useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { useOrgs, useSuper, type Org } from '../lib/admin';
import { composing } from '../lib/keys';
import { KINDS, STATUSES, URGENCIES, addNote, kindLabel, openTicket, statusLabel, useTicketParts, useTickets, type NewShot, type Ticket, type TicketKind, type TicketStatus, type TicketUrgency } from '../lib/tickets';
import { STATE_LABEL, startThread, useThread } from '../lib/claude';
import { Drawer, DrawerPart, Empty, PageHead, Pills, Search, Sheet, ago, dateStr, useNote } from './admin/ui';
import { ShotPicker, Shots } from './admin/shots';
import './admin.css';

// Support tickets: an organisation's admins (at /support) tell the super admins what is wrong or
// what they would like, with screenshots pasted straight in. Super admins see every ticket in
// Super Admin → Support tickets, answer it, move it along, and can hand it to Claude.
// Where you are lives in the address (?f=…&t=…), so a ticket can be linked to.

export function SupportPage() {
  const { user } = useAuth();
  const isSuper = useSuper();
  const orgs = useOrgs(false, isSuper === false ? user?.email : null);
  const [params] = useSearchParams();
  if (isSuper) {
    const n = new URLSearchParams(params);
    n.set('tab', 'tickets');
    return <Navigate to={`/admin?${n}`} replace />;
  }
  if (!user || isSuper === null || orgs === null) return <Loader full label="Opening Support tickets" />;
  if (!orgs.length)
    return (
      <Frame>
        <div className="hq-closed">
          <strong>Support tickets are for an organisation's admins</strong>
          <span className="hint">Ask the person who runs your organisation in ELT Suite to add you as an admin, or tell them what you need.</span>
        </div>
      </Frame>
    );
  return (
    <Frame>
      <div className="hq hq-solo">
        <main className="hq-main">
          <SupportTickets owner={false} orgs={orgs} />
        </main>
      </div>
    </Frame>
  );
}

// The tickets themselves: every ticket for a super admin (owner), an organisation's for its admins.
// local: in the floating Support window, which keeps its filter and open ticket to itself rather
// than in the page's address.
export function SupportTickets({ owner, orgs, local }: { owner: boolean; orgs: Org[]; local?: boolean }) {
  const { user, profile } = useAuth();
  // A super admin opens tickets as themselves; an admin, for one of their organisations.
  const mine = owner ? orgs.filter((o) => o.adminEmails.includes((user?.email ?? '').toLowerCase())) : orgs;
  const tickets = useTickets(owner, owner ? null : orgs.map((o) => o.id));
  const [params, setParams] = useSearchParams();
  const [here, setHere] = useState<{ f: string; t: string }>({ f: 'active', t: '' });
  const f = (local ? here.f : params.get('f')) || 'active';
  const open = (local ? here.t : params.get('t')) || '';
  const [q, setQ] = useState('');
  const [making, setMaking] = useState(false);
  const [toast, say] = useNote();
  const go = useCallback(
    (to: { f?: string; t?: string }) => {
      if (local) return setHere((h) => ({ f: to.f === undefined ? h.f : to.f || 'active', t: to.t === undefined ? h.t : to.t }));
      const n = new URLSearchParams(params);
      for (const [k, v] of Object.entries(to)) if (v) n.set(k, v); else n.delete(k);
      if (n.get('f') === 'active') n.delete('f');
      setParams(n, { replace: true });
    },
    [params, setParams, local],
  );
  if (!user) return null;

  const list = tickets ?? [];
  const FILTERS: Record<string, (t: Ticket) => boolean> = {
    active: (t) => t.status !== 'done',
    open: (t) => t.status === 'open',
    doing: (t) => t.status === 'doing',
    done: (t) => t.status === 'done',
    all: () => true,
  };
  const pills = [
    { v: 'active', label: 'Not done yet' },
    { v: 'open', label: 'Open' },
    { v: 'doing', label: 'Being worked on' },
    { v: 'done', label: 'Done' },
    { v: 'all', label: 'All' },
  ].map((p) => ({ ...p, n: list.filter(FILTERS[p.v]).length }));
  const s = q.trim().toLowerCase();
  const shown = list.filter((t) => (FILTERS[f] ?? FILTERS.active)(t) && (!s || `${t.id} ${t.title} ${t.body} ${t.byName} ${t.orgName}`.toLowerCase().includes(s)));
  const cur = list.find((t) => t.id === open);
  const name = (profile?.role === 'teacher' ? profile.displayName : '') || user.displayName || user.email || 'Admin';
  return (
    <>
          <div className="hq-page">
            <PageHead
              title="Support tickets"
              lede={owner ? 'Every ticket from every organisation. Answer it here, or hand it to Claude to work on.' : 'Tell us what’s wrong or what you’d like changed. Paste screenshots straight in, and we’ll answer here.'}
              actions={
                <button type="button" className="btn primary" onClick={() => setMaking(true)}>
                  <UiIcon name="plus" size={15} /> New ticket
                </button>
              }
            />
            <div className="hq-tools">
              <Pills value={f} options={pills} onChange={(v) => go({ f: v })} label="Show" />
              <Search value={q} onChange={setQ} placeholder="Search tickets" label="Search tickets" />
            </div>
            {tickets === null ? (
              <Loader label="Loading tickets" />
            ) : !shown.length ? (
              <Empty
                title={list.length ? 'No tickets here' : 'No tickets yet'}
                text={list.length ? 'Try another filter.' : 'When something’s wrong, or you’d like something changed, open a ticket and paste in a screenshot.'}
                action={
                  !list.length && (
                    <button type="button" className="btn" onClick={() => setMaking(true)}>
                      New ticket
                    </button>
                  )
                }
              />
            ) : (
              <div className="hq-table-wrap">
                <table className="hq-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>From</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th className="hq-c-go">
                        <span className="hq-sr">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id} onClick={() => go({ t: t.id })}>
                        <td data-label="Ticket">
                          <button type="button" className="hq-row-open hq-tk-name" onClick={(e) => (e.stopPropagation(), go({ t: t.id }))}>
                            <b>{t.title}</b>
                            <span>
                              {kindLabel(t.kind)}
                              {t.urgency === 'urgent' && <span className="hq-chip late">Urgent</span>}
                              {t.shots > 0 && (
                                <span className="hq-tk-n">
                                  <UiIcon name="picture" size={13} /> {t.shots}
                                </span>
                              )}
                              {t.notes > 0 && (
                                <span className="hq-tk-n">
                                  <UiIcon name="message" size={13} /> {t.notes}
                                </span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td data-label="From">
                          <span className="hq-tk-from">
                            <b>{t.byName}</b>
                            {t.orgName && <span>{t.orgName}</span>}
                          </span>
                        </td>
                        <td data-label="Status">
                          <StatusTag s={t.status} />
                        </td>
                        <td data-label="Updated">{ago(t.updatedAt)}</td>
                        <td className="hq-c-go" aria-hidden="true">
                          ›
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      {making && (
        <NewTicket
          orgs={mine ?? []}
          owner={owner}
          onClose={() => setMaking(false)}
          onSend={async (t, shots) => {
            const id = await openTicket({ ...t, by: user.uid, byName: name, byEmail: user.email ?? '' }, shots);
            setMaking(false);
            say('Ticket sent. We’ll answer here.');
            go({ t: id, f: '' });
          }}
        />
      )}
      {cur && <TicketDrawer key={cur.id} t={cur} owner={owner} me={{ uid: user.uid, name: owner ? `${name} (ELT Suite)` : name }} onClose={() => go({ t: '' })} />}
      {open && tickets !== null && !cur && <MissingTicket onClose={() => go({ t: '' })} />}
      {toast}
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <TopBar />
      {children}
    </div>
  );
}

function MissingTicket({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="This ticket isn’t here" onClose={onClose}>
      <span className="hint">It may have been removed, or it belongs to an organisation you’re not an admin of.</span>
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

const StatusTag = ({ s }: { s: TicketStatus }) => <span className={'hq-tk-st ' + s}>{statusLabel(s)}</span>;

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { k: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="seg hq-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.k} type="button" role="radio" aria-checked={value === o.k} className={value === o.k ? 'on' : ''} onClick={() => onChange(o.k)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ a new ticket
const WHERE = ['Home', 'Classes', 'A lesson', 'Teaching live', 'Timetable', 'Rooms and calls', 'Files', 'Messages', 'Colleagues', 'Organisation admin', 'Learners’ side', 'Something else'];

function NewTicket({ orgs, owner, onClose, onSend }: { orgs: Org[]; owner: boolean; onClose: () => void; onSend: (t: { title: string; body: string; kind: TicketKind; urgency: TicketUrgency; org: string | null; orgName: string; where: string }, shots: NewShot[]) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<TicketKind>('bug');
  const [urgency, setUrgency] = useState<TicketUrgency>('normal');
  const [where, setWhere] = useState('');
  const [org, setOrg] = useState(orgs[0]?.id ?? '');
  const [shots, setShots] = useState<NewShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const o = orgs.find((x) => x.id === org) ?? null;
  const ok = title.trim() && (body.trim() || shots.length) && (owner || o);
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSend({ title: title.trim().slice(0, 140), body: body.trim().slice(0, 10000), kind, urgency, org: o?.id ?? null, orgName: o?.name ?? '', where }, shots);
    } catch (e) {
      setErr('We couldn’t send the ticket: ' + ((e as Error).message || 'try again.'));
      setBusy(false);
    }
  };
  return (
    <Sheet title="New ticket" onClose={onClose} wide>
      <label className="field">
        <span>In a few words</span>
        <input className="hq-in" name="title" value={title} maxLength={140} autoComplete="off" placeholder="For example: the timetable shows Monday twice" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <Seg label="What is it" value={kind} options={KINDS} onChange={setKind} />
      <label className="field">
        <span>What happened, or what you’d like</span>
        <textarea className="hq-in" name="description" rows={6} maxLength={10000} value={body} placeholder="What you did, what you expected, and what happened instead. Paste screenshots with Ctrl+V or ⌘V." onChange={(e) => setBody(e.target.value)} />
      </label>
      <ShotPicker shots={shots} setShots={setShots} />
      <div className="hq-tk-row">
        <label className="field">
          <span>Where in ELT Suite</span>
          <select className="hq-in" name="where" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="">Not sure</option>
            {WHERE.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        {orgs.length > 1 && (
          <label className="field">
            <span>For</span>
            <select className="hq-in" name="org" value={org} onChange={(e) => setOrg(e.target.value)}>
              {orgs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="field">
        <span>How soon</span>
        <Seg label="How soon" value={urgency} options={URGENCIES} onChange={setUrgency} />
      </div>
      {err && (
        <span className="hint hq-tk-err" role="alert">
          {err}
        </span>
      )}
      <div className="hq-sheet-f">
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ok || busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send the ticket'}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ one ticket
function TicketDrawer({ t, owner, me, onClose }: { t: Ticket; owner: boolean; me: { uid: string; name: string }; onClose: () => void }) {
  const { shots, notes } = useTicketParts(t.id);
  const [text, setText] = useState('');
  const [add, setAdd] = useState<NewShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (status?: TicketStatus) => {
    if (busy || (!text.trim() && !add.length && !status)) return;
    setBusy(true);
    setErr('');
    try {
      await addNote(t, me, text.trim().slice(0, 10000), add, status);
      setText('');
      setAdd([]);
    } catch (e) {
      setErr('We couldn’t send that: ' + ((e as Error).message || 'try again.'));
    }
    setBusy(false);
  };
  const first = (shots ?? []).filter((s) => !s.note);
  // The owner moves a ticket to any state; an admin closes it or opens it again.
  const moves = owner ? STATUSES.filter((s) => s.k !== t.status) : t.status === 'done' ? STATUSES.filter((s) => s.k === 'open') : STATUSES.filter((s) => s.k === 'done');
  return (
    <Drawer
      title={t.title}
      sub={
        <>
          <StatusTag s={t.status} /> {t.byName}
          {t.orgName && `, ${t.orgName}`} · {dateStr(t.at)} · <span className="hq-tk-id">{t.id}</span>
        </>
      }
      onClose={onClose}
      foot={
        <span className="hq-tk-moves">
          {moves.map((s) => (
            <button key={s.k} type="button" className="btn small" disabled={busy} onClick={() => void send(s.k)}>
              {s.k === 'done' ? (owner ? 'Mark done' : 'Close, it’s sorted') : s.k === 'open' ? 'Open again' : 'Working on it'}
            </button>
          ))}
        </span>
      }
    >
      <DrawerPart title={kindLabel(t.kind) + (t.where ? ` · ${t.where}` : '') + (t.urgency === 'urgent' ? ' · Urgent' : t.urgency === 'low' ? ' · When there’s time' : '')}>
        {t.body && <p className="hq-tk-body">{t.body}</p>}
        {shots === null ? <Loader label="Loading screenshots" /> : <Shots list={first} />}
      </DrawerPart>
      <DrawerPart title="Conversation">
        {notes === null ? null : !notes.length ? (
          <span className="hint">No answers yet.</span>
        ) : (
          <ol className="hq-tk-notes">
            {notes.map((n) => (
              <li key={n.id} className={n.by === me.uid ? 'me' : ''}>
                <span className="hq-tk-nh">
                  <b>{n.byName}</b> <span>{ago(n.at)}</span>
                </span>
                {n.status && <span className="hq-tk-move">Moved to {statusLabel(n.status)}</span>}
                {n.text && <p className="hq-tk-body">{n.text}</p>}
                <Shots list={(shots ?? []).filter((s) => s.note === n.id)} />
              </li>
            ))}
          </ol>
        )}
        <div data-paste className="hq-tk-zone">
        <label className="field">
          <span>{owner ? `Answer ${t.byName}` : 'Add to the conversation'}</span>
          <textarea
            className="hq-in"
            name="reply"
            rows={3}
            value={text}
            maxLength={10000}
            placeholder="Write here, and paste screenshots. Ctrl+Enter or ⌘↩ sends."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing(e) && (e.preventDefault(), void send())}
          />
        </label>
        <ShotPicker shots={add} setShots={setAdd} />
        {err && (
          <span className="hint hq-tk-err" role="alert">
            {err}
          </span>
        )}
        <span className="hq-tk-send">
          <button type="button" className="btn primary" disabled={busy || (!text.trim() && !add.length)} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </span>
        </div>
      </DrawerPart>
      {owner && <ClaudePart t={t} me={me} />}
    </Drawer>
  );
}

// For super admins: hand the ticket to Claude, or see how Claude is getting on with it. What Claude
// says stays between Claude and the super admins; the ticket's own conversation is for its admins.
function ClaudePart({ t, me }: { t: Ticket; me: { uid: string; name: string } }) {
  const thread = useThread(t.escalated?.thread);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [add, setAdd] = useState<NewShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await startThread(me, t.title, text.trim() || 'Please look at this ticket and fix it.', add, t);
      setAsking(false);
    } catch (e) {
      setErr('We couldn’t reach Claude: ' + ((e as Error).message || 'try again.'));
    }
    setBusy(false);
  };
  if (t.escalated)
    return (
      <DrawerPart title="With Claude">
        <span className="hq-tk-claude">
          <span>
            {thread ? STATE_LABEL[thread.state] : 'Handed to Claude'} · {t.escalated.byName}, {ago(t.escalated.at)}
          </span>
          <Link className="btn small" to={`/admin?tab=claude&c=${t.escalated.thread}`}>
            Open the conversation
          </Link>
        </span>
      </DrawerPart>
    );
  return (
    <DrawerPart title="Claude">
      {!asking ? (
        <span className="hq-tk-claude">
          <span className="hint">Hand this ticket to Claude: it reads it with its screenshots, makes the change, and leaves it on GitHub for someone to check before it goes live.</span>
          <button type="button" className="btn small" onClick={() => setAsking(true)}>
            Ask Claude
          </button>
        </span>
      ) : (
        <div data-paste className="hq-tk-zone">
          <label className="field">
            <span>What should Claude do?</span>
            <textarea className="hq-in" name="claude" rows={3} value={text} maxLength={20000} placeholder="Anything to add to the ticket: what you found, what the change should be. Paste screenshots here too." onChange={(e) => setText(e.target.value)} />
          </label>
          <ShotPicker shots={add} setShots={setAdd} />
          {err && (
            <span className="hint hq-tk-err" role="alert">
              {err}
            </span>
          )}
          <span className="hq-tk-send">
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void ask()}>
              {busy ? 'Sending…' : 'Send to Claude'}
            </button>
          </span>
        </div>
      )}
    </DrawerPart>
  );
}

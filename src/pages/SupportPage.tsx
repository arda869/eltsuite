import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { isOwnerEmail, useOrgs, type Org } from '../lib/admin';
import { composing } from '../lib/keys';
import { KINDS, MAX_SHOTS, STATUSES, URGENCIES, addNote, kindLabel, openTicket, statusLabel, toShot, useTicketParts, useTickets, type NewShot, type Shot, type Ticket, type TicketKind, type TicketStatus, type TicketUrgency } from '../lib/tickets';
import { Drawer, DrawerPart, Empty, PageHead, Pills, Search, Sheet, ago, dateStr, plural, useNote } from './admin/ui';
import './admin.css';

// Support tickets (/support): an organisation's admins tell the owner what is wrong or what they
// would like, with screenshots pasted straight in. The owner sees every ticket and moves it along.
// Where you are lives in the address (?f=…&t=…), so a ticket can be linked to.

export function SupportPage() {
  const { user, profile } = useAuth();
  const owner = isOwnerEmail(user?.email);
  const orgs = useOrgs(owner, user?.email);
  // The owner sees every organisation, but opens tickets as themselves; an admin, for theirs.
  const mine = orgs && !owner ? orgs : orgs?.filter((o) => o.adminEmails.includes((user?.email ?? '').toLowerCase())) ?? null;
  const tickets = useTickets(owner, owner ? null : orgs?.map((o) => o.id) ?? null);
  const [params, setParams] = useSearchParams();
  const f = params.get('f') || 'active';
  const open = params.get('t') || '';
  const [q, setQ] = useState('');
  const [making, setMaking] = useState(false);
  const [toast, say] = useNote();
  const go = useCallback(
    (to: { f?: string; t?: string }) => {
      const n = new URLSearchParams(params);
      for (const [k, v] of Object.entries(to)) if (v) n.set(k, v); else n.delete(k);
      if (n.get('f') === 'active') n.delete('f');
      setParams(n, { replace: true });
    },
    [params, setParams],
  );

  if (!user || orgs === null) return <Loader full label="Opening Support tickets" />;
  if (!owner && !orgs.length)
    return (
      <Frame>
        <div className="hq-closed">
          <strong>Support tickets are for an organisation's admins</strong>
          <span className="hint">Ask the person who runs your organisation in ELT Suite to add you as an admin, or tell them what you need.</span>
        </div>
      </Frame>
    );

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
    <Frame>
      <div className="hq hq-solo">
        <main className="hq-main">
          <div className="hq-page">
            <PageHead
              title="Support tickets"
              lede={owner ? 'Every ticket from every organisation. Open ones are copied, screenshots and all, to the support-tickets branch to be worked on.' : 'Tell us what is wrong or what you would like changed. Paste screenshots straight in; we answer here.'}
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
                text={list.length ? 'Try another filter.' : 'When something is wrong, or you would like something changed, open a ticket and paste a screenshot of it.'}
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
        </main>
      </div>
      {making && (
        <NewTicket
          orgs={mine ?? []}
          owner={owner}
          onClose={() => setMaking(false)}
          onSend={async (t, shots) => {
            const id = await openTicket({ ...t, by: user.uid, byName: name, byEmail: user.email ?? '' }, shots);
            setMaking(false);
            say('Ticket sent. We will answer here.');
            go({ t: id, f: '' });
          }}
        />
      )}
      {cur && <TicketDrawer key={cur.id} t={cur} owner={owner} me={{ uid: user.uid, name: owner ? 'ELT Suite support' : name }} onClose={() => go({ t: '' })} />}
      {open && tickets !== null && !cur && <MissingTicket onClose={() => go({ t: '' })} />}
      {toast}
    </Frame>
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
    <Sheet title="This ticket is not here" onClose={onClose}>
      <span className="hint">It may have been removed, or it belongs to an organisation you are not an admin of.</span>
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
      setErr('The ticket could not be sent: ' + ((e as Error).message || 'try again.'));
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
        <span>What happened, or what you would like</span>
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

// Screenshots: pasted anywhere while the form is open, dropped on it, or chosen from the computer.
function ShotPicker({ shots, setShots }: { shots: NewShot[]; setShots: (f: (s: NewShot[]) => NewShot[]) => void }) {
  const [working, setWorking] = useState(0);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = MAX_SHOTS - shots.length - working;
  const add = useCallback(
    async (files: File[]) => {
      const pics = files.filter((f) => f.type.startsWith('image/'));
      if (!pics.length) return;
      setErr('');
      const take = pics.slice(0, Math.max(0, room));
      if (take.length < pics.length) setErr(`A ticket can have ${MAX_SHOTS} screenshots.`);
      setWorking((n) => n + take.length);
      for (const f of take) {
        try {
          const s = await toShot(f);
          setShots((list) => [...list, s].slice(0, MAX_SHOTS));
        } catch {
          setErr('One picture could not be read. Try a PNG or JPEG.');
        }
        setWorking((n) => n - 1);
      }
    },
    [room, setShots],
  );
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void add(files);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [add]);
  const [big, setBig] = useState<string | null>(null);
  return (
    <div
      className={'hq-tk-shots' + (over ? ' over' : '')}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (e.preventDefault(), setOver(false), void add([...e.dataTransfer.files]))}
    >
      <div className="hq-tk-thumbs">
        {shots.map((s, i) => (
          <span key={i} className="hq-tk-thumb">
            <button type="button" className="hq-tk-pic" aria-label={`Screenshot ${i + 1}, bigger`} onClick={() => setBig(s.data)}>
              <img src={s.data} alt="" />
            </button>
            <button type="button" className="hq-tk-x" aria-label={`Remove screenshot ${i + 1}`} onClick={() => setShots((list) => list.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        {Array.from({ length: working }, (_, i) => (
          <span key={'w' + i} className="hq-tk-thumb wait" aria-label="Adding a screenshot" />
        ))}
        {room > 0 && (
          <button type="button" className="hq-tk-add" onClick={() => input.current?.click()}>
            <UiIcon name="picture" size={18} />
            <span>{shots.length ? 'Add more' : 'Add screenshots'}</span>
          </button>
        )}
      </div>
      <span className="hint">Paste with Ctrl+V or ⌘V, drop pictures here, or choose them. {plural(MAX_SHOTS, 'screenshot')} at most.</span>
      {err && (
        <span className="hint hq-tk-err" role="alert">
          {err}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  );
}

// One screenshot, as big as the screen allows. Escape closes it and nothing behind it.
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return createPortal(
    <div className="hq-scrim center hq-tk-big" role="dialog" aria-modal="true" aria-label="Screenshot" onMouseDown={onClose}>
      <img src={src} alt="Screenshot" />
      <button type="button" className="hq-drawer-x" aria-label="Close" onClick={onClose} autoFocus>
        ×
      </button>
    </div>,
    document.body,
  );
}

function Shots({ list }: { list: Shot[] }) {
  const [big, setBig] = useState<string | null>(null);
  if (!list.length) return null;
  return (
    <div className="hq-tk-thumbs">
      {list.map((s, i) => (
        <button key={s.id} type="button" className="hq-tk-pic" aria-label={`Screenshot ${i + 1}, bigger`} onClick={() => setBig(s.data)}>
          <img src={s.data} alt="" />
        </button>
      ))}
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
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
      setErr('That could not be sent: ' + ((e as Error).message || 'try again.'));
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
              {s.k === 'done' ? (owner ? 'Mark done' : 'Close, it is sorted') : s.k === 'open' ? 'Open again' : 'Working on it'}
            </button>
          ))}
        </span>
      }
    >
      <DrawerPart title={kindLabel(t.kind) + (t.where ? ` · ${t.where}` : '') + (t.urgency === 'urgent' ? ' · Urgent' : t.urgency === 'low' ? ' · When there is time' : '')}>
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
        <label className="field">
          <span>Add to the conversation</span>
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
      </DrawerPart>
    </Drawer>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { autoFocusOk } from '../lib/keys';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { withShownNames, isSelf, chatTitle, chime, unreadIn, useChats, useUnread, openChat, type Chat, type Person } from '../lib/chat';
import { useDirectory, whoLine, type Directory } from '../lib/directory';
import { isProxyTab } from '../lib/proxy';
import { usePhone } from '../lib/useMedia';
import { publishFace } from '../lib/faces';
import { useOrgColleagues } from '../lib/admin';
import { ChatView, NewChat } from '../pages/MessagesPage';
import { IconLink, UiIcon } from './UiIcon';
import { PersonFace } from './avatars';
import { CallButtons } from './Rooms';

// Messages on every screen, at the bottom right: a Messages tab that is always there, and any
// number of chat windows beside it. Each window can be minimised to a tab, made large, or closed;
// all of them can be minimised or closed at once. They stay as you move between apps.

const KEY = 'll.dock2';
export type DockWin = { id: string; min?: boolean; max?: boolean; at?: number }; // id: a chat, or 'list'; at: when it was opened
type DockState = { wins: DockWin[] };
const read = (): DockState => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || '{}') as DockState;
    return { wins: Array.isArray(v.wins) ? v.wins : [] };
  } catch {
    return { wins: [] };
  }
};
function save(v: DockState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* fine */
  }
  window.dispatchEvent(new Event('ll-dock'));
}
// As many windows side by side as fit on the screen, beside the Messages tab, never on top of
// each other; the oldest fold into tabs.
const WIN_W = 372;
const maxOpen = () => Math.max(1, Math.min(3, Math.floor(((typeof window === 'undefined' ? 1400 : window.innerWidth) - 300) / WIN_W)));
export function fitDock() {
  const st = read();
  const open = st.wins.filter((w) => !w.min && !w.max);
  const extra = open.length - maxOpen();
  if (extra <= 0) return;
  const fold = open.slice(0, extra).map((w) => w.id);
  save({ wins: st.wins.map((w) => (fold.includes(w.id) ? { ...w, min: true } : w)) });
}
// Open a chat (or the list) in a window; `min` puts it straight in a tab.
export function dockOpen(id: string, min = false) {
  const st = read();
  const rest = st.wins.filter((w) => w.id !== id).map((w) => (min || w.min ? w : { ...w, max: false }));
  // At most a few open side by side: older ones fold into tabs.
  const open = rest.filter((w) => !w.min);
  const fold = min ? [] : open.slice(0, Math.max(0, open.length - (maxOpen() - 1))).map((w) => w.id);
  save({ wins: [...rest.map((w) => (fold.includes(w.id) ? { ...w, min: true } : w)), { id, min, at: Date.now() }] });
}
// Kept for older callers: open the window with this chat.
export function setDock(v: { open?: boolean; chat?: string; min?: boolean }) {
  if (v.open) dockOpen(v.chat || 'list', !!v.min);
}
// A window shows another chat in its place (picking from the list, or starting a new chat).
const replaceWin = (from: string, to: string) => {
  const wins = read().wins.filter((w) => w.id !== to);
  const at = wins.findIndex((w) => w.id === from);
  if (at < 0) return dockOpen(to);
  wins[at] = { ...wins[at], id: to, min: false, at: Date.now() };
  save({ wins });
};
// Larger and smaller: the window moves from where it was to where it goes (no pop-in).
const flipFrom: Record<string, DOMRect> = {};
const toggleMax = (id: string, max: boolean) => {
  const el = document.querySelector<HTMLElement>(`.dock-win[data-win="${CSS.escape(id)}"]`);
  if (el) flipFrom[id] = el.getBoundingClientRect();
  patch(id, { max });
};
const patch = (id: string, p: Partial<DockWin>) => save({ wins: read().wins.map((w) => (w.id === id ? { ...w, ...p } : p.max ? { ...w, max: false } : w)) });
const closeWin = (id: string) => save({ wins: read().wins.filter((w) => w.id !== id) });
function useDock() {
  const [st, setSt] = useState(read);
  useEffect(() => {
    const on = () => setSt(read());
    window.addEventListener('ll-dock', on);
    return () => window.removeEventListener('ll-dock', on);
  }, []);
  return st;
}

export function ChatDock() {
  const { user, profile } = useAuth();
  const loc = useLocation();
  const phone = usePhone();
  const me = profile?.role === 'learner' ? profile.learnerId : profile?.role === 'teacher' ? user?.uid : undefined;
  const rawChats = useChats(isProxyTab() ? undefined : me);
  const dirAll = useDirectory();
  const chats = useMemo(() => withShownNames(rawChats, dirAll?.nameFor), [rawChats, dirAll]);
  const st = useDock();
  useOrgColleagues();
  useEffect(() => {
    fitDock();
    window.addEventListener('resize', fitDock);
    return () => window.removeEventListener('resize', fitDock);
  }, []);
  const [creating, setCreating] = useState<string | false>(false); // the window it was started from
  const [grouping, setGrouping] = useState(false);
  // The Messages tab can be dragged narrower (just its icon) or wider.
  const [launchW, setLaunchW] = useState(() => {
    try {
      return Number(localStorage.getItem('ll.dockLaunch')) || 230;
    } catch {
      return 230;
    }
  });
  const growTab = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = launchW;
    let w = w0;
    const mv = (ev: PointerEvent) => setLaunchW((w = Math.max(58, Math.min(320, w0 - (ev.clientX - x0)))));
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem('ll.dockLaunch', String(Math.round(w)));
      } catch {
        /* fine */
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // Everyone's picture where others can see it.
  useEffect(() => {
    if (me && user && profile?.avatar) publishFace(me, user.uid, profile.avatar);
  }, [me, user, profile?.avatar]);

  // A chime for each new message from someone else (not for the ones already there).
  const seen = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!chats || !me) return;
    const prev = seen.current;
    seen.current = Object.fromEntries(chats.map((c) => [c.id, c.lastAt]));
    if (!prev) return;
    const fresh = chats.filter((c) => c.last && c.last.by !== me && c.lastAt > (prev[c.id] ?? 0));
    if (!fresh.length) return;
    chime('in');
    // On a phone, away from Messages: a banner at the top with the message.
    const c = fresh.sort((a, b) => b.lastAt - a.lastAt)[0];
    if (phoneRef.current && !location.pathname.startsWith('/messages') && !isProxyTab()) setBanner({ id: c.id, at: c.lastAt, title: chatTitle(c, me), name: c.kind === 'group' ? (c.last?.name ?? '').split(' ')[0] : '', text: c.last?.text ?? '' });
  }, [chats, me]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const bannerEl = banner && phone && !loc.pathname.startsWith('/messages') ? <MsgBanner key={banner.at} b={banner} onDone={() => setBanner(null)} /> : null;

  const hidden = !me || isProxyTab() || phone || loc.pathname.startsWith('/messages') || loc.pathname.startsWith('/play/') || loc.pathname.startsWith('/r/') || loc.pathname.startsWith('/studio') || loc.pathname.startsWith('/call/') || document.body.classList.contains('presenting');
  if (hidden) return bannerEl;
  const list = chats ?? [];
  const unread = list.filter((c) => unreadIn(c, me!)).length;
  const wins = st.wins.filter((w) => w.id === 'list' || list.some((c) => c.id === w.id) || !chats || Date.now() - (w.at ?? 0) < 20000);
  const big = wins.find((w) => w.max && !w.min);
  const anyOpen = wins.some((w) => !w.min);
  return (
    <>
      <div className="dock-bar" role="region" aria-label="Messages">
        <span className={'dock-tab dock-launch' + (unread ? ' has-new' : '') + (launchW < 130 ? ' slim' : '')} style={{ width: launchW }}>
          <span className="dock-grip" onPointerDown={growTab} title="Drag to make it wider or narrower" aria-hidden="true" />
          <button type="button" className="dock-tab-main" onClick={() => (wins.some((w) => w.id === 'list' && !w.min) ? patch('list', { min: true }) : dockOpen('list'))} aria-label={unread ? `Messages, ${unread} new` : 'Messages'}>
            <UiIcon name="message" size={14} />
            <b>Messages</b>
            {unread > 0 && <span className="dock-tab-n">{unread}</span>}
          </button>
          <button type="button" className="dock-tab-ic" onClick={() => setCreating('')} aria-label="New message" data-tip="New message">
            <WinIcon d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z" size={13} />
          </button>
          {anyOpen && (
            <button type="button" className="dock-tab-ic" onClick={() => save({ wins: read().wins.map((w) => ({ ...w, min: true, max: false })) })} aria-label="Minimise all" data-tip="Minimise all">
              <WinIcon d="M5 12h14" size={13} />
            </button>
          )}
          {wins.length > 0 && (
            <button type="button" className="dock-tab-ic" onClick={() => save({ wins: [] })} aria-label="Close all" data-tip="Close all">
              <WinIcon d="M6 6l12 12M18 6L6 18" size={13} />
            </button>
          )}
        </span>
        {[...wins].reverse().map((w) =>
          w.min ? (
            <DockTab key={w.id} me={me!} c={list.find((c) => c.id === w.id)} id={w.id} />
          ) : w.max ? null : (
            <DockWindow key={w.id} me={me!} w={w} chats={list} onNew={() => setCreating(w.id)} onGroup={() => (setGrouping(true), setCreating(w.id))} />
          ),
        )}
      </div>
      {big && (
        <div className="dock-max-scrim" onMouseDown={(e) => e.target === e.currentTarget && toggleMax(big.id, false)}>
          <DockWindow me={me!} w={big} chats={list} onNew={() => setCreating(big.id)} onGroup={() => (setGrouping(true), setCreating(big.id))} />
        </div>
      )}
      {creating !== false && dirAll && <NewChat dir={dirAll} group={grouping} onClose={() => (setCreating(false), setGrouping(false))} onOpen={(id) => (setCreating(false), setGrouping(false), creating ? replaceWin(creating, id) : read().wins.some((x) => x.id === 'list' && !x.min) ? replaceWin('list', id) : dockOpen(id))} />}
    </>
  );
}

// A minimised chat: a slim tab on the bottom edge. A click opens it again.
function DockTab({ me, c, id }: { me: string; c?: Chat; id: string }) {
  const title = id === 'list' ? 'All chats' : c ? chatTitle(c, me) : 'Chat';
  const un = c ? unreadIn(c, me) : false;
  return (
    <span className={'dock-tab' + (un ? ' has-new' : '')}>
      <button type="button" className="dock-tab-main" onClick={() => patch(id, { min: false })} aria-label={`Open ${title}`}>
        {c && c.kind !== 'group' && !isSelf(c) ? <PersonFace id={c.members.find((k) => k !== me)} name={title} size={20} /> : <UiIcon name={id === 'list' ? 'message' : 'groups'} size={14} />}
        <b>{title}</b>
        {un && <i className="msg-dot" />}
      </button>
      <button type="button" className="dock-tab-ic" aria-label="Close" onClick={() => closeWin(id)}>
        <WinIcon d="M6 6l12 12M18 6L6 18" size={12} />
      </button>
    </span>
  );
}

// Chat windows: one size for all, set by dragging the top left corner of any of them, remembered.
const SIZE_KEY = 'll.dockSize';
function applySize(w: number, h: number) {
  document.documentElement.style.setProperty('--dock-w', w + 'px');
  document.documentElement.style.setProperty('--dock-h', h + 'px');
}
try {
  const v = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null') as { w: number; h: number } | null;
  if (v) applySize(v.w, v.h);
} catch {
  /* fine */
}
function sizeWins(e: React.PointerEvent) {
  e.preventDefault();
  const win = (e.currentTarget as HTMLElement).closest('.dock-win') as HTMLElement | null;
  if (!win) return;
  const r = win.getBoundingClientRect();
  const x0 = e.clientX;
  const y0 = e.clientY;
  let size = { w: r.width, h: r.height };
  const move = (ev: PointerEvent) => {
    size = { w: Math.round(Math.max(300, Math.min(window.innerWidth - 40, r.width + (x0 - ev.clientX)))), h: Math.round(Math.max(320, Math.min(window.innerHeight - 90, r.height + (y0 - ev.clientY)))) };
    applySize(size.w, size.h);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify(size));
    } catch {
      /* fine */
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function DockWindow({ me, w, chats, onNew }: { me: string; w: DockWin; chats: Chat[]; onNew: () => void; onGroup: () => void }) {
  const dir = useDirectory();
  const { profile } = useAuth();
  const cur = chats.find((c) => c.id === w.id);
  const [leaving, setLeaving] = useState<'' | 'min' | 'close'>('');
  const title = cur ? chatTitle(cur, me) : 'Messages';
  // Folding away: the window shrinks down into its tab, then becomes the tab.
  const go = (what: 'min' | 'close') => {
    setLeaving(what);
    window.setTimeout(() => (what === 'min' ? patch(w.id, { min: true, max: false }) : closeWin(w.id)), 170);
  };
  const other = cur && cur.kind !== 'group' && !isSelf(cur) ? cur.members.find((k) => k !== me) : undefined;
  const [q, setQ] = useState('');
  const winRef = useRef<HTMLDivElement>(null);
  const [flipping, setFlipping] = useState(() => !!flipFrom[w.id]);
  useLayoutEffect(() => {
    const from = flipFrom[w.id];
    const el = winRef.current;
    delete flipFrom[w.id];
    if (!from || !el) return;
    const to = el.getBoundingClientRect();
    const a = el.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, transformOrigin: 'top left' },
        { transform: 'none', transformOrigin: 'top left' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2, .8, .25, 1)' },
    );
    a.onfinish = () => setFlipping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.max]);
  return (
    <div ref={winRef} onKeyDown={(e) => e.key === 'Escape' && !(e.target as HTMLElement).closest('[role=menu]') && go('min')} data-win={w.id} className={'dock-win' + (w.max ? ' max' : '') + (flipping ? ' flipping' : '') + (leaving ? ' leaving-' + leaving : '')} role="dialog" aria-label={title}>
      {!w.max && <span className="dock-size" onPointerDown={sizeWins} title="Drag to make the windows larger or smaller" aria-hidden="true" />}
      <div className="dock-head">
        {cur ? (
          <span className={'dock-face' + (cur.kind === 'group' ? ' group' : '')}>
            {other ? <PersonFace id={other} name={title} size={28} status /> : <UiIcon name={cur.kind === 'group' ? 'groups' : 'pen'} size={15} />}
          </span>
        ) : null}
        <span className="dock-title">
          <b>{title}</b>
          {other && cur && <span className="dock-who">{whoLine(dir, other, cur.roles[other] === 'teacher' ? 'teacher' : 'learner')}</span>}
        </span>
        <span style={{ flex: 1 }} />
        {!cur && dir && (
          <button type="button" className="icon-btn dock-ic" onClick={onNew} aria-label="New message" data-tip="New message">
            <WinIcon d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z" />
          </button>
        )}
        {cur && dir && !isSelf(cur) && <CallButtons c={cur} me={dir.me} compact />}
        <span className="dock-sep" aria-hidden="true" />
        <button type="button" className="icon-btn dock-ic" onClick={() => go('min')} aria-label="Minimise" data-tip="Minimise">
          <WinIcon d="M5 12h14" />
        </button>
        {/* No "larger": the full Messages page (open in a new tab, next) is the big view. A window
            left large from before can still go back. */}
        {w.max && (
          <button type="button" className="icon-btn dock-ic" onClick={() => toggleMax(w.id, false)} aria-label="Smaller" data-tip="Smaller">
            <WinIcon d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
          </button>
        )}
        <Link to={cur ? `/messages?c=${cur.id}` : '/messages'} className="icon-btn dock-ic" aria-label="Open in Messages" data-tip="Open in Messages" onClick={() => closeWin(w.id)}>
          <WinIcon d="M14 4h6v6M20 4l-8 8M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
        </Link>
        <button type="button" className="icon-btn dock-ic" onClick={() => go('close')} aria-label="Close" data-tip="Close">
          <WinIcon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
      {cur && dir ? (
        <div className="dock-chat">
          <ChatView key={cur.id} c={cur} me={dir.me} dir={dir} teacher={profile?.role === 'teacher'} onBack={() => closeWin(w.id)} />
        </div>
      ) : (
        <div className="dock-list">
          {dir && <DockFind me={me} dir={dir} chats={chats} onOpen={(id) => replaceWin(w.id, id)} q={q} setQ={setQ} />}
          {!q.trim() && chats.length === 0 && <span className="hint dock-none">No messages yet. Search for someone above.</span>}
          {!q.trim() && chats.map((c) => {
            const un = unreadIn(c, me);
            const t = chatTitle(c, me);
            const o = c.kind !== 'group' && !isSelf(c) ? c.members.find((k) => k !== me) : undefined;
            return (
              <button key={c.id} type="button" className={'msg-row' + (un ? ' unread' : '')} onClick={() => replaceWin(w.id, c.id)}>
                <span className={'msg-av' + (c.kind === 'group' ? ' group' : '') + (isSelf(c) ? ' self' : '')}>{o ? <PersonFace id={o} name={t} size={34} status /> : c.kind === 'group' ? <UiIcon name="groups" size={15} /> : <UiIcon name="pen" size={14} />}</span>
                <span className="msg-row-t">
                  <span className="msg-row-top">
                    <b>{t}</b>
                  </span>
                  <span className="msg-row-last">{c.last ? `${c.last.by === me ? 'You' : c.last.name.split(' ')[0]}: ${c.last.text}` : 'No messages yet'}</span>
                </span>
                {un && <i className="msg-dot" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// On a phone: Messages in the top bar opens the messages page. On a computer the Messages tab at
// the bottom right does this, so nothing shows here.
export function PhoneMessagesLink() {
  const { user, profile } = useAuth();
  const phone = usePhone();
  const loc = useLocation();
  const me = profile?.role === 'learner' ? profile.learnerId : profile?.role === 'teacher' ? user?.uid : undefined;
  const unread = useUnread(!isProxyTab() ? me : undefined);
  if (!me || isProxyTab() || loc.pathname.startsWith('/messages') || !phone) return null;
  const label = unread ? `Messages · ${unread} new` : 'Messages';
  const badge = unread ? <span className="icon-badge">{unread}</span> : null;
  return (
    <span className="pml">
      <IconLink icon="message" label={label} to="/messages" badge={badge} />
    </span>
  );
}

const WinIcon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// At the top of the chats: find anyone to write to. Picking someone turns this window into that chat.
function DockFind({ me, dir, chats, onOpen, q, setQ }: { me: string; dir: Directory; chats: Chat[]; onOpen: (id: string) => void; q: string; setQ: (v: string) => void }) {
  const [busy, setBusy] = useState('');
  const words = q.trim().toLowerCase();
  const seen = new Set<string>();
  const people = words
    ? dir.groups
        .flatMap((g) => g.people.map((p) => ({ p, where: g.label })))
        .filter(({ p }) => p.key !== me && !seen.has(p.key) && seen.add(p.key) && p.name.toLowerCase().includes(words))
        .slice(0, 12)
    : [];
  const groups = words ? chats.filter((c) => c.kind === 'group' && chatTitle(c, me).toLowerCase().includes(words)) : [];
  const open = async (p: Person) => {
    const have = chats.find((c) => c.kind === 'dm' && c.members.length === 2 && c.members.includes(p.key));
    if (have) return onOpen(have.id);
    setBusy(p.key);
    try {
      onOpen(await openChat(dir.me, [p]));
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <span className="dock-find">
        <UiIcon name="search" size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Message someone…" aria-label="Find someone to message" type="search" enterKeyHint="go" autoComplete="off" autoFocus={autoFocusOk} onKeyDown={(e) => e.key === 'Enter' && people[0] && void open(people[0].p)} />
      </span>
      {words && (
        <>
          {groups.map((c) => (
            <button key={c.id} type="button" className="msg-row" onClick={() => onOpen(c.id)}>
              <span className="msg-av group"><UiIcon name="groups" size={15} /></span>
              <span className="msg-row-t">
                <b>{chatTitle(c, me)}</b>
                <span className="msg-row-last">Group</span>
              </span>
            </button>
          ))}
          {people.map(({ p, where }) => (
            <button key={p.key} type="button" className="msg-row" disabled={busy === p.key} onClick={() => void open(p)}>
              <span className="msg-av"><PersonFace id={p.key} name={p.name} size={34} status /></span>
              <span className="msg-row-t">
                <b>{p.name}</b>
                <span className="msg-row-last">{p.role === 'teacher' ? 'Teacher' : where}</span>
              </span>
            </button>
          ))}
          {!people.length && !groups.length && <span className="hint dock-none">No one called that.</span>}
        </>
      )}
    </>
  );
}

// A new message on a phone, away from Messages: a banner at the top with who and what. A tap opens
// the chat; a swipe to the right (or a few seconds) sends it away.
type Banner = { id: string; at: number; title: string; name: string; text: string };
function MsgBanner({ b, onDone }: { b: Banner; onDone: () => void }) {
  const navigate = useNavigate();
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const leave = () => (setGone(true), window.setTimeout(onDone, 220));
  useEffect(() => {
    const t = window.setTimeout(leave, 6000);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={'msg-banner' + (gone ? ' gone' : '') + (start.current?.moved ? ' dragging' : '')}
      role="status"
      aria-live="polite"
      style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 - dx / 260) } : undefined}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        const d = e.clientX - s0.x;
        if (Math.abs(d) > 6) s0.moved = true;
        setDx(Math.max(0, d));
      }}
      onPointerUp={() => {
        const s0 = start.current;
        start.current = null;
        if (s0?.moved) return dx > 70 ? leave() : setDx(0);
        onDone();
        navigate(`/messages?c=${b.id}`);
      }}
      onPointerCancel={() => ((start.current = null), setDx(0))}
    >
      <span className="msg-banner-ic" aria-hidden="true">
        <UiIcon name="message" size={18} />
      </span>
      <span className="msg-banner-t">
        <b>{b.title}</b>
        <span>
          {b.name ? `${b.name}: ` : ''}
          {b.text}
        </span>
      </span>
      <span className="msg-banner-hint" aria-hidden="true">
        now
      </span>
    </div>
  );
}

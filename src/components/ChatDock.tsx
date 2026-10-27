import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { withShownNames, isSelf, chatTitle, chime, unreadIn, useChats, useUnread, type Chat } from '../lib/chat';
import { useDirectory } from '../lib/directory';
import { isProxyTab } from '../lib/proxy';
import { usePhone } from '../lib/useMedia';
import { publishFace } from '../lib/faces';
import { ChatView, NewChat } from '../pages/MessagesPage';
import { IconLink, UiIcon } from './UiIcon';
import { PersonFace } from './avatars';

// Messages on every screen, at the bottom right: a Messages tab that is always there, and any
// number of chat windows beside it. Each window can be minimised to a tab, made large, or closed;
// all of them can be minimised or closed at once. They stay as you move between apps.

const KEY = 'll.dock2';
export type DockWin = { id: string; min?: boolean; max?: boolean; x?: number; y?: number }; // id: a chat, or 'list'; x, y: where it floats, once moved
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
const MAX_OPEN = 3;
// Open a chat (or the list) in a window; `min` puts it straight in a tab.
export function dockOpen(id: string, min = false) {
  const st = read();
  const rest = st.wins.filter((w) => w.id !== id).map((w) => (min || w.min ? w : { ...w, max: false }));
  // At most a few open side by side: older ones fold into tabs.
  const open = rest.filter((w) => !w.min);
  const fold = min ? [] : open.slice(0, Math.max(0, open.length - (MAX_OPEN - 1))).map((w) => w.id);
  save({ wins: [...rest.map((w) => (fold.includes(w.id) ? { ...w, min: true } : w)), { id, min }] });
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
  wins[at] = { ...wins[at], id: to, min: false };
  save({ wins });
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
  const [creating, setCreating] = useState<string | false>(false); // the window it was started from
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
    if (chats.some((c) => c.last && c.last.by !== me && c.lastAt > (prev[c.id] ?? 0))) chime('in');
  }, [chats, me]);

  const hidden = !me || isProxyTab() || phone || loc.pathname.startsWith('/messages') || loc.pathname.startsWith('/play/') || loc.pathname.startsWith('/r/') || loc.pathname.startsWith('/studio') || document.body.classList.contains('presenting');
  if (hidden) return null;
  const list = chats ?? [];
  const unread = list.filter((c) => unreadIn(c, me!)).length;
  const wins = st.wins.filter((w) => w.id === 'list' || list.some((c) => c.id === w.id) || !chats);
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
          ) : w.max || w.x !== undefined ? null : (
            <DockWindow key={w.id} me={me!} w={w} chats={list} onNew={() => setCreating(w.id)} />
          ),
        )}
      </div>
      {wins
        .filter((w) => !w.min && !w.max && w.x !== undefined)
        .map((w) => (
          <DockWindow key={w.id} me={me!} w={w} chats={list} onNew={() => setCreating(w.id)} />
        ))}
      {big && (
        <div className="dock-max-scrim" onMouseDown={(e) => e.target === e.currentTarget && patch(big.id, { max: false })}>
          <DockWindow me={me!} w={big} chats={list} onNew={() => setCreating(big.id)} />
        </div>
      )}
      {creating !== false && dirAll && <NewChat dir={dirAll} onClose={() => setCreating(false)} onOpen={(id) => (setCreating(false), creating ? replaceWin(creating, id) : read().wins.some((x) => x.id === 'list' && !x.min) ? replaceWin('list', id) : dockOpen(id))} />}
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

function DockWindow({ me, w, chats, onNew }: { me: string; w: DockWin; chats: Chat[]; onNew: () => void }) {
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
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  // Drag the top bar to float the window anywhere; drop it back near the bottom right to dock it.
  const down = (e: React.PointerEvent) => {
    if (w.max || (e.target as HTMLElement).closest('button, a, input')) return;
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let p = { x: r.left, y: r.top };
    let moved = false;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      moved = true;
      p = { x: Math.max(60 - r.width, Math.min(window.innerWidth - 60, ev.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) };
      setDrag(p);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      setDrag(null);
      const home = window.innerWidth - (p.x + r.width) < 120 && window.innerHeight - (p.y + r.height) < 80;
      patch(w.id, home ? { x: undefined, y: undefined } : { x: Math.round(p.x), y: Math.round(p.y) });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const at = drag ?? (w.x !== undefined && !w.max ? { x: w.x, y: w.y ?? 80 } : null);
  return (
    <div ref={box} className={'dock-win' + (w.max ? ' max' : '') + (at ? ' floating' : '') + (drag ? ' dragging' : '') + (leaving ? ' leaving-' + leaving : '')} role="dialog" aria-label={title} style={at ? { position: 'fixed', left: at.x, top: at.y, right: 'auto', bottom: 'auto', margin: 0 } : undefined}>
      <div className="dock-head" onPointerDown={down} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button, a') && patch(w.id, { max: !w.max })}>
        {cur ? (
          <span className={'dock-face' + (cur.kind === 'group' ? ' group' : '')}>
            {other ? <PersonFace id={other} name={title} size={28} /> : <UiIcon name={cur.kind === 'group' ? 'groups' : 'pen'} size={15} />}
          </span>
        ) : null}
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        {!cur && dir && (
          <button type="button" className="icon-btn dock-ic" onClick={onNew} aria-label="New message" data-tip="New message">
            <WinIcon d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z" />
          </button>
        )}
        <span className="dock-sep" aria-hidden="true" />
        <button type="button" className="icon-btn dock-ic" onClick={() => go('min')} aria-label="Minimise" data-tip="Minimise">
          <WinIcon d="M5 12h14" />
        </button>
        <button type="button" className="icon-btn dock-ic" onClick={() => patch(w.id, { max: !w.max })} aria-label={w.max ? 'Smaller' : 'Larger'} data-tip={w.max ? 'Smaller' : 'Larger'}>
          <WinIcon d={w.max ? 'M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5' : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5'} />
        </button>
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
          {chats.length === 0 && <span className="hint dock-none">No messages yet.</span>}
          {chats.map((c) => {
            const un = unreadIn(c, me);
            const t = chatTitle(c, me);
            const o = c.kind !== 'group' && !isSelf(c) ? c.members.find((k) => k !== me) : undefined;
            return (
              <button key={c.id} type="button" className={'msg-row' + (un ? ' unread' : '')} onClick={() => replaceWin(w.id, c.id)}>
                <span className={'msg-av' + (c.kind === 'group' ? ' group' : '') + (isSelf(c) ? ' self' : '')}>{o ? <PersonFace id={o} name={t} size={34} /> : c.kind === 'group' ? <UiIcon name="groups" size={15} /> : <UiIcon name="pen" size={14} />}</span>
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
          <button type="button" className="btn small-btn dock-new" onClick={onNew}>
            + New message
          </button>
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

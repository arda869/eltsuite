import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { chatTitle, chime, unreadIn, useChats, type Chat } from '../lib/chat';
import { useDirectory } from '../lib/directory';
import { isProxyTab } from '../lib/proxy';
import { usePhone } from '../lib/useMedia';
import { ChatView } from '../pages/MessagesPage';
import { UiIcon } from './UiIcon';

// Messages on every screen: a small button at the lower right that opens a chat window there,
// to write without leaving the lesson. A soft chime when a message comes in.

const KEY = 'll.dock';
const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as { open?: boolean; chat?: string };
  } catch {
    return {};
  }
};

export function ChatDock() {
  const { user, profile } = useAuth();
  const loc = useLocation();
  const phone = usePhone();
  const me = profile?.role === 'learner' ? profile.learnerId : profile?.role === 'teacher' ? user?.uid : undefined;
  const chats = useChats(isProxyTab() ? undefined : me);
  const [st, setSt] = useState(read);
  const save = (v: { open?: boolean; chat?: string }) => {
    setSt(v);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* fine */
    }
  };

  // A chime for each new message from someone else (not for the ones already there).
  const seen = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!chats || !me) return;
    const prev = seen.current;
    seen.current = Object.fromEntries(chats.map((c) => [c.id, c.lastAt]));
    if (!prev) return;
    if (chats.some((c) => c.last && c.last.by !== me && c.lastAt > (prev[c.id] ?? 0))) chime('in');
  }, [chats, me]);

  const hidden = !me || isProxyTab() || loc.pathname.startsWith('/messages') || loc.pathname.startsWith('/s/') || loc.pathname.startsWith('/play/') || loc.pathname.startsWith('/r/') || document.body.classList.contains('presenting');
  if (hidden) return null;
  const unread = (chats ?? []).filter((c) => unreadIn(c, me!)).length;
  // Lessons have their own buttons at the bottom right; the messages button sits above them.
  const lift = /\/lesson\/|^\/learn\/|^\/recap\//.test(loc.pathname) ? ' lift' : '';
  if (phone)
    return (
      <Link to="/messages" className={'dock-btn' + lift} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
        <UiIcon name="message" size={20} />
        {unread > 0 && <span className="dock-badge">{unread}</span>}
      </Link>
    );
  if (!st.open)
    return (
      <button type="button" className={'dock-btn' + lift} onClick={() => save({ open: true, chat: st.chat })} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} data-tip="Messages">
        <UiIcon name="message" size={20} />
        {unread > 0 && <span className="dock-badge">{unread}</span>}
      </button>
    );
  return <DockWindow me={me!} chats={chats ?? []} chatId={st.chat} onChat={(id) => save({ open: true, chat: id })} onClose={() => save({ open: false, chat: st.chat })} />;
}

function DockWindow({ me, chats, chatId, onChat, onClose }: { me: string; chats: Chat[]; chatId?: string; onChat: (id?: string) => void; onClose: () => void }) {
  const dir = useDirectory();
  const { profile } = useAuth();
  const cur = chats.find((c) => c.id === chatId);
  return (
    <div className="dock-win" role="dialog" aria-label="Messages">
      <div className="dock-head">
        {cur ? (
          <button type="button" className="icon-btn" onClick={() => onChat(undefined)} aria-label="All chats">
            <UiIcon name="prev" size={15} />
          </button>
        ) : null}
        <b>{cur ? chatTitle(cur, me) : 'Messages'}</b>
        <span style={{ flex: 1 }} />
        <Link to={cur ? `/messages?c=${cur.id}` : '/messages'} className="icon-btn" aria-label="Open in full" data-tip="Open in full">
          <UiIcon name="fullscreen" size={15} />
        </Link>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Minimise" data-tip="Minimise">
          <span className="dock-min" />
        </button>
      </div>
      {cur && dir ? (
        <div className="dock-chat">
          <ChatView key={cur.id} c={cur} me={dir.me} dir={dir} teacher={profile?.role === 'teacher'} onBack={() => onChat(undefined)} />
        </div>
      ) : (
        <div className="dock-list">
          {chats.length === 0 && <span className="hint dock-none">No messages yet.</span>}
          {chats.map((c) => {
            const un = unreadIn(c, me);
            const title = chatTitle(c, me);
            return (
              <button key={c.id} type="button" className={'msg-row' + (un ? ' unread' : '')} onClick={() => onChat(c.id)}>
                <span className={'msg-av' + (c.kind === 'group' ? ' group' : '')}>{c.kind === 'group' ? <UiIcon name="groups" size={15} /> : title.trim().slice(0, 1).toUpperCase()}</span>
                <span className="msg-row-t">
                  <span className="msg-row-top">
                    <b>{title}</b>
                  </span>
                  <span className="msg-row-last">{c.last ? `${c.last.by === me ? 'You' : c.last.name.split(' ')[0]}: ${c.last.text}` : 'No messages yet'}</span>
                </span>
                {un && <i className="msg-dot" />}
              </button>
            );
          })}
          <Link to="/messages" className="btn small-btn dock-new">
            New message…
          </Link>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/avatars';
import { CallButtons } from '../../components/Rooms';
import { FileIcon, FolderIcon } from '../../components/FileIcon';
import { UiIcon } from '../../components/UiIcon';
import { ask, tell } from '../../lib/ask';
import { openChat, type Chat, type Person } from '../../lib/chat';
import { useFace } from '../../lib/faces';
import { StatusDot, type Status } from '../../lib/status';
import { theme } from '../../lib/themes';
import { when, type Mate, type Thing } from './book';

// A colleague's picture, with the dot for online, away, in class or on a call.
export function Face({ m, size, st, dot = true }: { m: Pick<Mate, 'id' | 'name' | 'pic'>; size: number; st?: Status; dot?: boolean }) {
  const face = useFace(m.pic ? undefined : m.id);
  return (
    <span className={'pz-host clg-face' + (size >= 64 ? ' big' : size >= 46 ? ' mid' : '')}>
      <span aria-hidden="true" className="clg-face-pic">
        <Avatar k={m.pic || face || undefined} name={m.name} size={size} />
      </span>
      {dot && <StatusDot p={st} />}
    </span>
  );
}

// Message, audio call and video call, one click each. A call needs the chat with them, so the
// first call makes the chat and then presses the call button for it.
export function Reach({ m, me, chat, look }: { m: Mate; me: Person; chat?: Chat; look: 'row' | 'tiles' }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<'audio' | 'video' | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const them: Person = { key: m.id, name: m.name, role: 'teacher' };
  const message = async () => {
    if (busy) return;
    setBusy(true);
    try {
      nav(`/messages?c=${encodeURIComponent(chat?.id ?? (await openChat(me, [them])))}`);
    } catch {
      setBusy(false);
      void tell('The chat could not be opened. Please try again.');
    }
  };
  const call = async (kind: 'audio' | 'video') => {
    if (pending) return;
    setPending(kind);
    try {
      await openChat(me, [them]);
    } catch {
      setPending(null);
      void tell('The call could not be started. Please try again.');
    }
  };
  useEffect(() => {
    if (!chat || !pending) return;
    const label = pending === 'audio' ? 'Audio call' : 'Video call';
    const b = box.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? box.current?.querySelectorAll('button')[pending === 'audio' ? 0 : 1];
    setPending(null);
    b?.click();
  }, [chat, pending]);
  // If the chat does not come, the buttons do not stay waiting.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 10_000);
    return () => window.clearTimeout(t);
  }, [pending]);
  const row = look === 'row';
  const cls = row ? 'icon-btn dock-ic' : 'icon-btn call-ic';
  return (
    <span className={row ? 'clg-reach' : 'clg-tiles'}>
      <button type="button" className={row ? 'icon-btn dock-ic' : 'clg-tile clg-tile-msg'} disabled={busy} onClick={() => void message()} aria-label={`Message ${m.name}`} data-tip="Message">
        <UiIcon name="message" size={row ? 15 : 19} />
        {!row && <span>Message</span>}
      </button>
      <span ref={box} className="clg-calls">
        {chat ? (
          <CallButtons c={chat} me={me} compact={row} />
        ) : (
          <>
            <button type="button" className={cls} disabled={!!pending} onClick={() => void call('audio')} aria-label="Audio call" data-tip="Audio call">
              <UiIcon name="phone" size={row ? 14 : 16} />
            </button>
            <button type="button" className={cls} disabled={!!pending} onClick={() => void call('video')} aria-label="Video call" data-tip="Video call">
              <UiIcon name="video" size={row ? 15 : 17} />
            </button>
          </>
        )}
      </span>
    </span>
  );
}

// A thing shared, or a class taught together: its icon, title, what it is and when.
export function ThingIcon({ t }: { t: Thing }) {
  if ('folder' in t.icon) return <FolderIcon size={22} />;
  if ('cls' in t.icon)
    return (
      <span className="clg-cls" style={{ ['--cc' as string]: theme(t.icon.cls).accent }} aria-hidden="true">
        <UiIcon name="classes" size={16} />
      </span>
    );
  return <FileIcon kind={t.icon.file} sub={t.icon.sub} size={26} label={false} />;
}
export function ThingRow({ t, face }: { t: Thing; face?: ReactNode }) {
  const [gone, setGone] = useState(false);
  const stop = async () => {
    if (!t.stop || !(await ask(`Stop sharing “${t.title}”? They will no longer see it.`, { ok: 'Stop sharing' }))) return;
    setGone(true);
    try {
      await t.stop();
    } catch {
      setGone(false);
      void tell('Sharing could not be stopped. Please try again.');
    }
  };
  if (gone) return null;
  return (
    <li className="clg-thing">
      <Link to={t.to} className="clg-thing-main">
        <span className="clg-thing-ic">
          <ThingIcon t={t} />
          {face}
        </span>
        <span className="clg-thing-t">
          <b>{t.title}</b>
          <span className="clg-thing-meta">
            {t.meta}
            {t.at ? ` · ${when(t.at)}` : ''}
          </span>
        </span>
      </Link>
      {t.stop && (
        <button type="button" className="btn link small clg-thing-stop" onClick={() => void stop()}>
          Stop sharing
        </button>
      )}
    </li>
  );
}

// The words someone searched for, marked.
export function Marked({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="clg-mark">{p}</mark> : p))}</>;
}

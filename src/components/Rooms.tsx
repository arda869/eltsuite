import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth';
import { chatTitle, useChats, type Chat, type Person } from '../lib/chat';
import { callOn, declineCall, endChatCall, NoRoomError, openCall, ringing, startChatCall, useOpenCall, type CallKind, type OpenCall } from '../lib/calls';
import { setActivity, quietNow } from '../lib/status';
import { tell } from '../lib/ask';
import { setSessionLive, useTeacherSessions, type Session } from '../lib/sessions';
import { UiIcon } from './UiIcon';
import { PersonFace } from './avatars';

// Rooms: the call window (beside the work, or the whole screen), the ringing card for a call
// coming in, and the call buttons in a chat.

type Size = 'side' | 'full' | 'small';
type Frame = { destroy: () => Promise<void>; on: (e: string, f: (ev?: unknown) => void) => void; join: (o: object) => Promise<unknown>; participantCounts?: () => { present: number } };

export function CallWindow({ call, onLeave, onAlone }: { call: OpenCall; onLeave: () => void; onAlone?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>(() => (window.innerWidth < 700 ? 'full' : 'side'));
  const [err, setErr] = useState('');
  const others = useRef(0);
  const leave = useRef(onLeave);
  leave.current = onLeave;
  const alone = useRef(onAlone);
  alone.current = onAlone;
  useEffect(() => {
    let frame: Frame | null = null;
    let dead = false;
    setActivity({ call: true });
    void (async () => {
      try {
        const Daily = (await import('@daily-co/daily-js')).default;
        if (dead || !box.current) return;
        frame = Daily.createFrame(box.current, { showLeaveButton: true, showFullscreenButton: false, iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '14px' } }) as unknown as Frame;
        frame.on('participant-counts-updated', (ev) => (others.current = Math.max(0, ((ev as { participantCounts?: { present?: number } })?.participantCounts?.present ?? 1) - 1)));
        frame.on('left-meeting', () => {
          if (others.current === 0) alone.current?.();
          leave.current();
        });
        await frame.join({ url: call.url, userName: auth0Name(), ...(call.token ? { token: call.token } : {}), startVideoOff: call.kind === 'audio', startAudioOff: false });
      } catch (e) {
        console.error(e);
        setErr('The call could not be opened. Check your connection and allow the microphone, then try again.');
      }
    })();
    return () => {
      setActivity({ call: null });
      dead = true;
      void frame?.destroy();
    };
  }, [call.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const next: Record<Size, Size> = { side: 'full', full: 'small', small: 'side' };
  return createPortal(
    <div className={'vc vc-' + size} role="dialog" aria-label={`Call: ${call.title}`}>
      <header className="vc-bar">
        <span className="vc-live" aria-hidden="true" />
        <span className="vc-t">
          <b>{call.title}</b>
          {call.sub && <span className="hint">{call.sub}</span>}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="dp-ib" onClick={() => setSize(size === 'small' ? 'side' : 'small')} aria-label={size === 'small' ? 'Larger' : 'Smaller'} data-tip={size === 'small' ? 'Larger' : 'Smaller, in the corner'}>
          <UiIcon name={size === 'small' ? 'fullscreen' : 'fullscreenOff'} size={15} />
        </button>
        {size !== 'small' && (
          <button type="button" className="dp-ib" onClick={() => setSize(next[size])} aria-label={size === 'full' ? 'Beside your work' : 'Whole screen'} data-tip={size === 'full' ? 'Beside your work' : 'Whole screen'}>
            <UiIcon name="present" size={15} />
          </button>
        )}
        <button type="button" className="vc-hang" onClick={() => (others.current === 0 && alone.current?.(), leave.current())} aria-label="Leave the call" data-tip="Leave the call">
          <UiIcon name="phone" size={15} />
        </button>
      </header>
      {err ? <p className="hint vc-err">{err}</p> : <div className="vc-frame" ref={box} />}
    </div>,
    document.body,
  );
}
let nameNow = '';
const auth0Name = () => nameNow || 'Guest';

// Everywhere in the app: the call you have open, and calls coming in to you.
export function CallHost() {
  const { user, profile } = useAuth();
  const me = profile?.role === 'learner' ? profile.learnerId : user?.uid;
  nameNow = (profile?.role === 'learner' ? profile.displayName : user?.displayName) || user?.email?.split('@')[0] || 'Guest';
  const chats = useChats(me);
  const open = useOpenCall();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);
  const incoming = me ? (chats ?? []).filter((c) => ringing(c, me) && open?.chatId !== c.id) : [];
  // Meetings in the timetable: when someone starts one, the others invited are called.
  const sessions = useTeacherSessions(profile?.role === 'teacher' ? user?.uid : undefined);
  const [waved, setWaved] = useState<string[]>([]);
  const meetings = sessions.filter((x) => x.live && x.live.by !== user?.uid && Date.now() - x.live.at < 60_000 && open?.sessionId !== x.id && !waved.includes(x.id + x.live.at));
  useRing(incoming.length > 0 || meetings.length > 0);
  // A call for a chat that has ended closes for everyone still in it.
  const openChat = open?.chatId ? chats?.find((c) => c.id === open.chatId) : undefined;
  useEffect(() => {
    if (open?.chatId && openChat && !callOn(openChat)) openCall(null);
  }, [open?.chatId, openChat]);
  // Seen from another tab or with the app in the background: a notification, if allowed.
  const first = incoming[0];
  useEffect(() => {
    if (!first || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted' || quietNow()) return;
    const k = callOn(first)!;
    try {
      const n = new Notification(`${k.byName} is calling`, { body: k.kind === 'video' ? 'Video call' : 'Audio call', tag: 'call-' + first.id });
      n.onclick = () => (window.focus(), n.close());
    } catch {
      /* not allowed here */
    }
  }, [first?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {open && <CallWindow call={open} onLeave={() => openCall(null)} onAlone={openChat ? () => void endChatCall(openChat) : open.sessionId ? () => endMeeting(sessions, open.sessionId!) : undefined} />}
      {meetings.slice(0, 1).map((x) =>
        createPortal(
          <div key={x.id} className="ring" role="alertdialog" aria-label={`${x.title} has started`}>
            <span className="ring-face">
              <PersonFace id={x.live!.by} name={x.live!.byName} size={44} />
              <i />
            </span>
            <span className="ring-t">
              <b>{x.title}</b>
              <span className="hint">{x.live!.byName} started the meeting</span>
            </span>
            <button type="button" className="ring-no" onClick={() => setWaved((w) => [...w, x.id + x.live!.at])} aria-label="Not now" data-tip="Not now">
              <UiIcon name="phone" size={17} />
            </button>
            <button type="button" className="ring-yes" onClick={() => openCall({ url: x.live!.url, title: x.title, kind: 'video', sessionId: x.id, sub: 'Meeting' })} aria-label="Join" data-tip="Join">
              <UiIcon name="video" size={17} />
            </button>
          </div>,
          document.body,
        ),
      )}
      {me &&
        incoming.slice(0, 2).map((c) => {
          const k = callOn(c)!;
          return createPortal(
            <div key={c.id} className="ring" role="alertdialog" aria-label={`${k.byName} is calling`}>
              <span className="ring-face">
                <PersonFace id={k.by} name={k.byName} size={44} />
                <i />
              </span>
              <span className="ring-t">
                <b>{c.kind === 'group' ? chatTitle(c, me) : k.byName}</b>
                <span className="hint">{c.kind === 'group' ? `${k.byName} started a ${k.kind} call` : k.kind === 'video' ? 'Video call' : 'Audio call'}</span>
              </span>
              <button type="button" className="ring-no" onClick={() => void declineCall(c, me)} aria-label="Decline" data-tip="Decline">
                <UiIcon name="phone" size={17} />
              </button>
              <button type="button" className="ring-yes" onClick={() => openCall({ url: k.url, title: chatTitle(c, me), kind: k.kind, chatId: c.id })} aria-label="Answer" data-tip="Answer">
                <UiIcon name={k.kind === 'video' ? 'video' : 'phone'} size={17} />
              </button>
            </div>,
            document.body,
          );
        })}
    </>
  );
}

const endMeeting = (list: Session[], id: string) => {
  const x = list.find((m) => m.id === id);
  if (x) void setSessionLive(x, null).catch(() => {});
};

// A soft two-note ring while a call comes in; silent while teaching or not to be disturbed.
function useRing(on: boolean) {
  useEffect(() => {
    if (!on || quietNow()) return;
    let ctx: AudioContext | null = null;
    const ring = () => {
      try {
        ctx ??= new AudioContext();
        const t = ctx.currentTime;
        [0, 0.22].forEach((d, i) => {
          const o = ctx!.createOscillator();
          const g = ctx!.createGain();
          o.frequency.value = i ? 660 : 880;
          g.gain.setValueAtTime(0.0001, t + d);
          g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
          o.connect(g).connect(ctx!.destination);
          o.start(t + d);
          o.stop(t + d + 0.22);
        });
      } catch {
        /* no sound here */
      }
    };
    ring();
    const id = window.setInterval(ring, 2400);
    return () => (window.clearInterval(id), void ctx?.close());
  }, [on]);
}

// Audio and video call buttons, for a chat's header.
export function CallButtons({ c, me, compact }: { c: Chat; me: Person; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = useOpenCall();
  const on = callOn(c);
  const go = async (kind: CallKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const k = await startChatCall(c, me, kind);
      openCall({ url: k.url, title: chatTitle(c, me.key), kind: k.kind, chatId: c.id });
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
    } catch (e) {
      void tell(e instanceof NoRoomError ? e.message : 'The call could not be started. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  if (on && open?.chatId !== c.id)
    return (
      <button type="button" className={'btn small-btn call-join' + (compact ? ' compact' : '')} onClick={() => openCall({ url: on.url, title: chatTitle(c, me.key), kind: on.kind, chatId: c.id })} data-tip={`${on.byName} started a call`}>
        <span className="vc-live" aria-hidden="true" /> Join
      </button>
    );
  if (on) return null;
  const cls = compact ? 'icon-btn dock-ic' : 'icon-btn call-ic';
  return (
    <>
      <button type="button" className={cls} disabled={busy} onClick={() => void go('audio')} aria-label="Audio call" data-tip="Audio call">
        <UiIcon name="phone" size={compact ? 14 : 16} />
      </button>
      <button type="button" className={cls} disabled={busy} onClick={() => void go('video')} aria-label="Video call" data-tip="Video call">
        <UiIcon name="video" size={compact ? 15 : 17} />
      </button>
    </>
  );
}

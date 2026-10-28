import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth';
import { chatTitle, useChats, type Chat, type Person } from '../lib/chat';
import { callOn, clearRing, declineCall, callStartError, openCall, RING_MS, ringing, startChatCall, useCallElsewhere, useMyRing, useOpenCall, type CallKind } from '../lib/calls';
import { setCallMe } from '../lib/callEngine';
import { CallScreen } from './CallScreen';
import { useLocation } from 'react-router-dom';
import { quietNow } from '../lib/status';
import { tell } from '../lib/ask';
import { useTeacherSessions } from '../lib/sessions';
import { UiIcon } from './UiIcon';
import { PersonFace } from './avatars';

// Rooms: the call window (beside the work, or the whole screen), the ringing card for a call
// coming in, and the call buttons in a chat.

// Everywhere in the app: the call you have open, and calls coming in to you.
export function CallHost() {
  const { user, profile } = useAuth();
  const loc = useLocation();
  const me = profile?.role === 'learner' ? profile.learnerId : user?.uid;
  // In a call, everyone shows by their name and picture as they are in ELT Suite.
  useEffect(() => {
    if (!user) return;
    const learner = profile?.role === 'learner';
    setCallMe({ name: (learner ? profile?.displayName : user.displayName) || user.email?.split('@')[0] || 'Guest', key: me, role: learner ? 'learner' : 'teacher', avatar: profile?.avatar, photo: user.photoURL ?? undefined });
  }, [user, profile, me]);
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
  // Called into a class's video room by a teacher.
  const ring = useMyRing(me);
  const rung = ring && Date.now() - ring.at < RING_MS && open?.url !== ring.url ? ring : null;
  useRing(incoming.length > 0 || meetings.length > 0 || !!rung);
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
      {open && !loc.pathname.startsWith('/call/') && <CallScreen />}
      {!open && <CallElsewhere />}
      {rung &&
        me &&
        createPortal(
          <div className="ring" role="alertdialog" aria-label={`${rung.byName} is calling you to ${rung.title}`}>
            <span className="ring-face">
              <PersonFace id={rung.by} name={rung.byName} size={44} />
              <i />
            </span>
            <span className="ring-t">
              <b>{rung.title}</b>
              <span className="hint">{rung.byName} is calling you to join</span>
            </span>
            <button type="button" className="ring-no" onClick={() => void clearRing(me)} aria-label="Not now" data-tip="Not now">
              <UiIcon name="phone" size={17} />
            </button>
            <button type="button" className="ring-yes" onClick={() => (void clearRing(me), openCall({ url: rung.url, title: rung.title, kind: rung.kind, classId: rung.classId ?? undefined, code: rung.code ?? undefined, sub: rung.classId ? 'Class video room' : undefined }))} aria-label="Join" data-tip="Join">
              <UiIcon name={rung.kind === 'video' ? 'video' : 'phone'} size={17} />
            </button>
          </div>,
          document.body,
        )}
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
            <button type="button" className="ring-yes" onClick={() => openCall({ url: x.live!.url, title: x.title, kind: 'video', sessionId: x.id, sub: 'Meeting', code: (x.live as { code?: string }).code })} aria-label="Join" data-tip="Join">
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
              <button type="button" className="ring-yes" onClick={() => openCall({ url: k.url, title: chatTitle(c, me), kind: k.kind, chatId: c.id, code: k.code })} aria-label="Answer" data-tip="Answer">
                <UiIcon name={k.kind === 'video' ? 'video' : 'phone'} size={17} />
              </button>
            </div>,
            document.body,
          );
        })}
    </>
  );
}

// In another tab of ELT Suite while the call is open here or there: a handle at the right edge
// brings the call over (it leaves the other tab and joins here).
function CallElsewhere() {
  const r = useCallElsewhere();
  if (!r) return null;
  return createPortal(
    <button type="button" className="ks-edge" onClick={() => openCall(r)} aria-label={`Bring the call “${r.title}” to this tab`}>
      <span className="ks-live" aria-hidden="true" />
      <UiIcon name={r.kind === 'video' ? 'video' : 'phone'} size={17} />
      <span className="ks-edge-t">
        <b>{r.title}</b>
        <span>Bring the call here</span>
      </span>
    </button>,
    document.body,
  );
}

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
      openCall({ url: k.url, title: chatTitle(c, me.key), kind: k.kind, chatId: c.id, code: k.code });
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
    } catch (e) {
      void tell(callStartError(e, 'We couldn’t start the call. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  if (on && open?.chatId !== c.id)
    return (
      <button type="button" className={'btn small-btn call-join' + (compact ? ' compact' : '')} onClick={() => openCall({ url: on.url, title: chatTitle(c, me.key), kind: on.kind, chatId: c.id, code: on.code })} data-tip={`${on.byName} started a call`}>
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

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { isLive, liveRef, setLive, type LiveState } from '../lib/live';
import { callStartError, NoRoomError, takeRoom, useOpenCall } from '../lib/calls';
import { isNow, occurrences, useClassSessions } from '../lib/sessions';
import { joinClassVideo, VideoButton } from './VideoCall';
import { quietNow } from '../lib/status';
import { tell } from '../lib/ask';
import { UiIcon } from './UiIcon';
import type { ClassDoc, Item } from '../lib/classes';
import type { GroupSet } from '../lib/groups';

// Video with live teaching. The teacher's video room is the class's; with a group set in use,
// each group can have its own room, and learners move there and back with the teacher.

// Teacher: the video button in the lesson, and the group rooms.
export function TeacherLiveVideo({ c, live, teachingHere, groupSets, itemId }: { c: ClassDoc; live: LiveState | null; teachingHere: boolean; groupSets: GroupSet[]; itemId: string }) {
  const open = useOpenCall();
  const inVideo = open?.classId === c.id;
  const sessions = useClassSessions(c.id);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  // An online class in the timetable: going live opens the video room too.
  const opened = useRef(false);
  useEffect(() => {
    if (!teachingHere || opened.current || !c.video?.url) return;
    const now = occurrences(sessions, Date.now() - 6 * 3600e3, Date.now() + 3600e3).find((o) => isNow(o, 20) && o.s.online && (!o.s.itemId || o.s.itemId === itemId));
    if (now && !open) {
      opened.current = true;
      void joinClassVideo(c, true);
    }
  }, [teachingHere, sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Learners are asked to join while the teacher is in the room.
  useEffect(() => {
    if (!teachingHere) return;
    if (!!live?.video !== inVideo) void setLive(c.id, { video: inVideo }).catch(() => {});
  }, [teachingHere, inVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = groupSets.find((g) => g.id === live?.groupSetId);
  const rooms = live?.videoRooms ?? null;
  const openRooms = async () => {
    if (!set) return;
    setBusy(true);
    try {
      const out: Record<string, { url: string; name: string }> = {};
      for (const g of set.groups.filter((x) => x.members.length)) out[g.id] = { url: (await takeRoom(`breakout:${c.id}:${g.id}`)).url, name: g.name };
      await setLive(c.id, { videoRooms: out });
      setMenu(false);
    } catch (e) {
      void tell(e instanceof NoRoomError ? 'There are not enough free video rooms for every group right now. Try again in a few minutes.' : callStartError(e, 'The group rooms could not be opened.'));
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    await setLive(c.id, { videoRooms: null });
    void joinClassVideo(c, true);
    setMenu(false);
  };
  return (
    <>
      <VideoButton c={c} teacher />
      {teachingHere && inVideo && set && (
        <span className="menu-anchor">
          <button type="button" className={'btn small-btn lv-rooms' + (rooms ? ' on' : '')} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
            <UiIcon name="groups" size={15} /> {rooms ? 'Group rooms open' : 'Group rooms'}
          </button>
          {menu && (
            <div className="menu lv-menu" role="menu">
              <span className="lv-menu-h">{set.name}</span>
              {!rooms ? (
                <button role="menuitem" disabled={busy} onClick={() => void openRooms()}>
                  {busy ? 'Opening…' : `Send each group to its own room (${set.groups.filter((g) => g.members.length).length})`}
                </button>
              ) : (
                <>
                  {Object.entries(rooms).map(([gid, r]) => (
                    <button key={gid} role="menuitem" className={open?.url === r.url ? 'on' : ''} onClick={() => (void joinClassVideo(c, true, { url: r.url, title: r.name }), setMenu(false))}>
                      Visit {r.name}
                    </button>
                  ))}
                  <button role="menuitem" onClick={() => (void joinClassVideo(c, true), setMenu(false))}>
                    Back to the main room, alone
                  </button>
                  <button role="menuitem" onClick={() => void close()}>
                    <b>Bring everyone back</b>
                  </button>
                </>
              )}
            </div>
          )}
        </span>
      )}
    </>
  );
}

// Learner, in the lesson: join the video, and move to the group's room and back with the teacher.
export function LearnerLiveVideo({ c, live, myRoomId, itemId }: { c: ClassDoc | null; live: LiveState | null; myRoomId?: string; itemId: string }) {
  const open = useOpenCall();
  const on = !!c && isLive(live) && live?.itemId === itemId && !!live?.video && !!c.video?.url;
  const target = on && myRoomId && live?.videoRooms?.[myRoomId] ? live.videoRooms[myRoomId] : null;
  const inClassVideo = !!c && open?.classId === c.id;
  // Already in the video: follow the teacher to the group's room, and back.
  useEffect(() => {
    if (!c || !inClassVideo || !on) return;
    const want = target?.url ?? c.video!.url;
    if (open!.url !== want) void joinClassVideo(c, false, target ? { url: target.url, title: target.name } : undefined);
  }, [target?.url, on, inClassVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on || inClassVideo) return null;
  return (
    <div className="lv-bar" role="status">
      <span className="vc-live" aria-hidden="true" />
      <span>
        <b>{live?.teacherName ?? 'Your teacher'} is in the video room</b>
        {target && <span className="hint"> · your group: {target.name}</span>}
      </span>
      <button type="button" className="btn small-btn primary" onClick={() => void joinClassVideo(c!, false, target ? { url: target.url, title: target.name } : undefined)}>
        <UiIcon name="video" size={14} /> Join the video
      </button>
    </div>
  );
}

// Learner, anywhere in the app: the moment the teacher goes live, a card to join.
export function LiveStartWatch() {
  const { profile } = useAuth();
  const classId = profile?.role === 'learner' ? profile.classId : '';
  const loc = useLocation();
  const navigate = useNavigate();
  const [live, setLiveS] = useState<LiveState | null>(null);
  const [item, setItem] = useState<Pick<Item, 'id' | 'title'> | null>(null);
  const [c, setC] = useState<ClassDoc | null>(null);
  const [shown, setShown] = useState('');
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!classId) return;
    void getDoc(doc(db, 'classes', classId)).then((s) => s.exists() && setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }), () => {});
    return onSnapshot(liveRef(classId), (s) => setLiveS(s.exists() ? (s.data() as LiveState) : null), () => {});
  }, [classId]);
  const key = isLive(live) ? `${live!.itemId}:${live!.startedAt?.toMillis?.() ?? ''}` : '';
  useEffect(() => {
    // The first look only learns what is on; a change after that is news.
    if (seen.current === null) return void (seen.current = key);
    if (!key || key === seen.current) return void (seen.current = key);
    seen.current = key;
    if (loc.pathname.startsWith('/learn/' + live!.itemId)) return;
    void getDoc(doc(db, 'classes', classId, 'items', live!.itemId)).then((s) => setItem({ id: s.id, title: String(s.data()?.title ?? 'The lesson') }), () => setItem({ id: live!.itemId, title: 'The lesson' }));
    setShown(key);
    if (!quietNow()) chimeOnce();
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`${live!.teacherName || 'Your teacher'} started the lesson`, { body: 'Open ELT Suite to join.', tag: 'live-' + classId });
      } catch {
        /* not here */
      }
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown || shown !== key || !item || loc.pathname.startsWith('/learn/' + item.id)) return null;
  return createPortal(
    <div className="ring lv-start" role="alertdialog" aria-label="The lesson has started">
      <span className="lv-start-dot" aria-hidden="true" />
      <span className="ring-t">
        <b>{item.title}</b>
        <span className="hint">{live?.teacherName || 'Your teacher'} started the lesson</span>
      </span>
      <button type="button" className="btn small-btn" onClick={() => setShown('')}>
        Later
      </button>
      <button
        type="button"
        className="btn small-btn primary"
        onClick={() => {
          setShown('');
          navigate(`/learn/${item.id}`);
          if (c && live?.video) void joinClassVideo(c, false);
        }}
      >
        Join
      </button>
    </div>,
    document.body,
  );
}

function chimeOnce() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    [523, 659, 784].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.1, t + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.14);
      o.stop(t + i * 0.14 + 0.42);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no sound */
  }
}

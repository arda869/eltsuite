import { copyText } from '../lib/copyText';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { typingIn } from '../lib/keys';
import { createPortal } from 'react-dom';
import { callLinkUrl, leaveCall, popOutCall, ringPerson, useOpenCall, type OpenCall } from '../lib/calls';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BACKGROUNDS, callMe, clearAsk, clearError, host, raiseHand, removeOther, setBackground, setNoise, toggleCam, toggleMic, toggleShare, turnOn, useDevice, useEngine, type EngineState, type HostCmd, type Tile } from '../lib/callEngine';
import { Avatar } from './avatars';
import { useDismiss } from '../lib/useDismiss';
import './call.css';

// Rooms: our own call screen. A window you can move and size anywhere, a small strip in the
// corner, the whole screen, or a page of its own. Video tiles, names and pictures as in ELT Suite,
// and the controls a class needs: hands, and for teachers, everyone's microphone and camera.

type Mode = 'float' | 'mini' | 'full';
type Rect = { x: number; y: number; w: number; h: number };
const RECT_KEY = 'll.callRect';
const MIN_W = 320;
const MIN_H = 240;
const phoneNow = () => window.innerWidth < 700;
const clampRect = (r: Rect): Rect => {
  const w = Math.min(Math.max(MIN_W, r.w), window.innerWidth - 16);
  const h = Math.min(Math.max(MIN_H, r.h), window.innerHeight - 16);
  return { w, h, x: Math.min(Math.max(8, r.x), window.innerWidth - w - 8), y: Math.min(Math.max(8, r.y), window.innerHeight - h - 8) };
};
const savedRect = (): Rect => {
  try {
    const r = JSON.parse(localStorage.getItem(RECT_KEY) || 'null') as Rect | null;
    if (r && r.w) return clampRect(r);
  } catch {
    /* first time */
  }
  const w = Math.min(460, window.innerWidth - 32);
  const h = Math.min(360, window.innerHeight - 120);
  return clampRect({ w, h, x: window.innerWidth - w - 24, y: window.innerHeight - h - 24 });
};

// Icons for the call, drawn in the app's line style.
const P: Record<string, ReactNode> = {
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  micOff: <><path d="M15 10V6.5a3 3 0 0 0-5.6-1.5M9 9v2.5a3 3 0 0 0 4.6 2.5M5.5 11.5a6.5 6.5 0 0 0 10.4 5.2M18.5 11.5a6.4 6.4 0 0 1-.5 2.4M12 18v2.5M4 4l16 16" /></>,
  cam: <><rect x="3.5" y="6.5" width="12.5" height="11" rx="2.2" /><path d="M16 10.5l4.5-3v9l-4.5-3" /></>,
  camOff: <><path d="M9 6.5h4.8a2.2 2.2 0 0 1 2.2 2.2v4M16 10.5l4.5-3v9l-3.2-2.1M16 16a2.2 2.2 0 0 1-2.2 1.5H5.7a2.2 2.2 0 0 1-2.2-2.2V8.7c0-.8.4-1.5 1-1.9M4 4l16 16" /></>,
  share: <><rect x="3" y="4.5" width="18" height="12.5" rx="2" /><path d="M8.5 20.5h7M12 13.5v-6M9 10l3-3 3 3" /></>,
  hand: <><path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7.5c0 3.9-2.7 7-6.3 7-2.6 0-4-1.3-5.4-3.4L3.8 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.6c1.8.6 2.8 2.2 3 4.9" /></>,
  more: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  leave: <path d="M3.6 13.6c4.6-4.4 12.2-4.4 16.8 0 .5.5.5 1.3 0 1.8l-1.8 1.7a1 1 0 0 1-1.3.1l-2.3-1.6a1 1 0 0 1-.4-.9l.1-1.6c-2.2-.8-4.6-.8-6.8 0l.1 1.6a1 1 0 0 1-.4.9l-2.3 1.6a1 1 0 0 1-1.3-.1l-1.8-1.7a1.3 1.3 0 0 1 0-1.8z" />,
  float: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><rect x="11.5" y="11" width="7" height="6" rx="1" /></>,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  mini: <><path d="M5 19h14" /><path d="M8 15l4-4 4 4" transform="rotate(180 12 13)" /></>,
  tab: <><path d="M14 4h6v6M20 4l-8 8M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  chev: <path d="M7 10l5 5 5-5" />,
  blur: <><circle cx="12" cy="9" r="3.5" /><path d="M5.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" /><path d="M2.5 6v2M2.5 12v2M21.5 6v2M21.5 12v2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};
const I = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {P[n]}
  </svg>
);

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`;
};

// A video track, drawn. Our own camera is mirrored, as in a mirror; a shared screen is not.
function Video({ track, mirror, fit = 'cover' }: { track?: MediaStreamTrack; mirror?: boolean; fit?: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = track ? new MediaStream([track]) : null;
    if (track) void v.play().catch(() => {});
  }, [track]);
  return <video ref={ref} className={'ks-v' + (mirror ? ' mirror' : '')} style={{ objectFit: fit }} autoPlay playsInline muted />;
}
// The others' voices: a call object leaves playing them to us.
function Voices({ tiles }: { tiles: Tile[] }) {
  return (
    <>
      {tiles
        .filter((t) => !t.local)
        .flatMap((t) => [t.audioTrack && <Voice key={t.id + 'a'} track={t.audioTrack} />, t.screenAudioTrack && <Voice key={t.id + 's'} track={t.screenAudioTrack} />])}
    </>
  );
}
function Voice({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = new MediaStream([track]);
    void a.play().catch(() => {});
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

// One person: their video, or their picture; their name as it is in ELT Suite.
function TileView({ t, s, big, teacher, small }: { t: Tile; s: EngineState; big?: boolean; teacher: boolean; small?: boolean }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLSpanElement>(menu, () => setMenu(false));
  const hand = !!s.hands[t.id];
  const speaking = s.speaker === t.id && t.audio && !t.local;
  return (
    <div className={'ks-tile' + (speaking ? ' speaking' : '') + (big ? ' big' : '') + (t.video ? '' : ' novideo')}>
      {t.video && t.videoTrack ? <Video track={t.videoTrack} mirror={t.local} /> : <Face t={t} big={big} />}
      <span className="ks-name">
        {!t.audio && (
          <span className="ks-muted" aria-label="Microphone off">
            <I n="micOff" s={13} />
          </span>
        )}
        <b>{t.local ? (small ? 'You' : `${t.name} (you)`) : t.name}</b>
        {t.role === 'teacher' && !small && <i className="ks-role">Teacher</i>}
        {t.role === 'guest' && <i className="ks-role">Guest</i>}
      </span>
      {hand && (
        <span className="ks-hand" aria-label="Hand raised">
          <I n="hand" s={15} />
        </span>
      )}
      {t.network === 'bad' && <span className="ks-net" data-tip="Weak connection" aria-label="Weak connection" />}
      {teacher && !t.local && (
        <span className="ks-tmenu" ref={menuRef}>
          <button type="button" className="ks-tbtn" aria-label={`Options for ${t.name}`} onClick={() => setMenu((m) => !m)}>
            <I n="more" s={16} />
          </button>
          {menu && <HostMenu t={t} close={() => setMenu(false)} />}
        </span>
      )}
    </div>
  );
}
function Face({ t, big }: { t: Tile; big?: boolean }) {
  const size = big ? 96 : 64;
  return (
    <span className="ks-face">
      {t.photo && !t.avatar ? <img src={t.photo} alt="" referrerPolicy="no-referrer" width={size} height={size} /> : <Avatar k={t.avatar} name={t.name} size={size} />}
    </span>
  );
}
function HostMenu({ t, close }: { t: Tile; close: () => void }) {
  const go = (cmd: HostCmd) => (host(cmd, t.id), close());
  return (
    <span className="ks-menu" role="menu">
      {t.audio ? (
        <button role="menuitem" onClick={() => go('mute')}>
          <I n="micOff" s={16} /> Turn off their microphone
        </button>
      ) : (
        <button role="menuitem" onClick={() => go('askMic')}>
          <I n="mic" s={16} /> Ask them to turn on their microphone
        </button>
      )}
      {t.video ? (
        <button role="menuitem" onClick={() => go('camOff')}>
          <I n="camOff" s={16} /> Turn off their camera
        </button>
      ) : (
        <button role="menuitem" onClick={() => go('askCam')}>
          <I n="cam" s={16} /> Ask them to turn on their camera
        </button>
      )}
      {callMeIsOwner() && (
        <button role="menuitem" onClick={() => (removeOther(t.id), close())}>
          <I n="leave" s={16} /> Remove from the call
        </button>
      )}
    </span>
  );
}
let ownerNow = false;
const callMeIsOwner = () => ownerNow;

// The tiles, laid out for the space: a shared screen large with the cameras beside it; two people
// with yourself small in the corner; more in the grid that fits them best.
function Stage({ s, teacher, compact }: { s: EngineState; teacher: boolean; compact?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tiles = s.tiles;
  const sharer = tiles.find((t) => t.screen && t.screenTrack);
  const remote = tiles.filter((t) => !t.local);
  const me = tiles.find((t) => t.local);
  let body: ReactNode;
  if (!tiles.length) body = <div className="ks-wait">{s.status === 'error' ? s.error : 'Joining…'}</div>;
  else if (sharer) {
    const wide = size.w > size.h * 1.2;
    body = (
      <div className={'ks-share' + (wide ? ' wide' : '')}>
        <div className="ks-screen">
          <Video track={sharer.screenTrack} fit="contain" />
          <span className="ks-name">
            <b>{sharer.local ? 'You’re sharing your screen' : `${sharer.name}’s screen`}</b>
          </span>
        </div>
        {!compact && (
          <div className="ks-strip">
            {tiles.map((t) => (
              <TileView key={t.id} t={t} s={s} teacher={teacher} />
            ))}
          </div>
        )}
      </div>
    );
  } else if (remote.length === 0 && me) {
    body = (
      <div className="ks-solo">
        <TileView t={me} s={s} big teacher={teacher} />
        <div className="ks-alone">Waiting for others to join</div>
      </div>
    );
  } else if (remote.length === 1 && me) {
    body = (
      <div className="ks-pair">
        <TileView t={remote[0]} s={s} big teacher={teacher} />
        <div className="ks-pip">
          <TileView t={me} s={s} teacher={teacher} small />
        </div>
      </div>
    );
  } else {
    // The number of columns that gives each tile the most room at 16:9.
    const n = tiles.length;
    let best = { cols: 1, area: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const w = Math.min(size.w / cols, ((size.h / rows) * 16) / 9);
      if (w * w > best.area) best = { cols, area: w * w };
    }
    body = (
      <div className="ks-grid" style={{ ['--cols' as string]: best.cols, ['--rows' as string]: Math.ceil(n / best.cols) }}>
        {tiles.map((t) => (
          <TileView key={t.id} t={t} s={s} teacher={teacher} />
        ))}
      </div>
    );
  }
  return (
    <div className="ks-stage" ref={box}>
      {body}
    </div>
  );
}

// The people in the call, hands first; for teachers, everyone's microphone and camera.
// A class's people who are not in the call yet, for teachers: call them in (their device rings).
type Member = { key: string; name: string; role: 'teacher' | 'learner' };
function useClassMembers(classId?: string, on = true) {
  const [list, setList] = useState<Member[]>([]);
  useEffect(() => {
    if (!classId || !on) return;
    let dead = false;
    void (async () => {
      const c = (await getDoc(doc(db, 'classes', classId)).catch(() => null))?.data() ?? {};
      const ls = await getDocs(collection(db, 'classes', classId, 'learners')).catch(() => null);
      const teachers: Member[] = [
        ...(c.teacherId ? [{ key: String(c.teacherId), name: String(c.teacherName ?? 'Class teacher'), role: 'teacher' as const }] : []),
        ...Object.entries((c.coTeachers ?? {}) as Record<string, { name?: string; role?: string }>).filter(([, t]) => t.role === 'co').map(([k, t]) => ({ key: k, name: t.name || 'Co-teacher', role: 'teacher' as const })),
      ];
      const learners: Member[] = (ls?.docs ?? []).map((d) => ({ key: d.id, name: String(d.data().displayName ?? 'Learner'), role: 'learner' as const })).sort((a, b) => a.name.localeCompare(b.name));
      if (!dead) setList([...teachers, ...learners]);
    })();
    return () => void (dead = true);
  }, [classId, on]);
  return list;
}
function NotHere({ s, call }: { s: EngineState; call: OpenCall }) {
  const members = useClassMembers(call.classId);
  const [rang, setRang] = useState<Record<string, number>>({});
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);
  const here = new Set(s.tiles.map((t) => t.key).filter(Boolean));
  const missing = members.filter((m) => !here.has(m.key) && m.key !== callMe().key);
  if (!missing.length) return null;
  const ring = (list: Member[]) => {
    const at = Date.now();
    setRang((r) => ({ ...r, ...Object.fromEntries(list.map((m) => [m.key, at])) }));
    list.forEach((m) => void ringPerson(m.key, { url: call.url, title: call.title, kind: call.kind, classId: call.classId ?? null, code: call.code ?? null, byName: callMe().name }).catch(() => {}));
  };
  const calling = (k: string) => Date.now() - (rang[k] ?? 0) < 45_000;
  return (
    <div className="ks-nothere">
      <span className="ks-nh-h">
        <span className="ks-k">Not here yet · {missing.length}</span>
        <button type="button" className="ks-nh-all" onClick={() => ring(missing.filter((m) => !calling(m.key)))}>
          Call everyone
        </button>
      </span>
      <ul>
        {missing.map((m) => (
          <li key={m.key}>
            <span className="ks-p-face">
              <Avatar name={m.name} size={32} />
            </span>
            <span className="ks-p-t">
              <b>{m.name}</b>
              <span className="hint">{m.role === 'teacher' ? 'Teacher' : 'Learner'}</span>
            </span>
            <button type="button" className={'ks-nh-call' + (calling(m.key) ? ' on' : '')} onClick={() => ring([m])} aria-label={`Call ${m.name}`}>
              {calling(m.key) ? 'Calling…' : 'Call'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function People({ s, teacher, onClose, call }: { s: EngineState; teacher: boolean; onClose: () => void; call: OpenCall }) {
  const list = [...s.tiles].sort((a, b) => (s.hands[b.id] ? 1 : 0) - (s.hands[a.id] ? 1 : 0) || Number(b.local) - Number(a.local));
  return (
    <aside className="ks-people" aria-label="People in the call">
      <header>
        <b>People</b>
        <span className="ks-count">{s.tiles.length}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ks-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {teacher && s.tiles.length > 1 && (
        <div className="ks-everyone">
          <span className="ks-k">Everyone</span>
          <span className="ks-ev-row">
            <button type="button" onClick={() => host('mute')}>
              <I n="micOff" s={15} /> Microphones off
            </button>
            <button type="button" onClick={() => host('camOff')}>
              <I n="camOff" s={15} /> Cameras off
            </button>
          </span>
          <span className="ks-ev-row">
            <button type="button" onClick={() => host('askMic')}>
              <I n="mic" s={15} /> Ask to turn on microphones
            </button>
            <button type="button" onClick={() => host('askCam')}>
              <I n="cam" s={15} /> Ask to turn on cameras
            </button>
          </span>
        </div>
      )}
      <ul>
        {list.map((t) => (
          <li key={t.id}>
            <span className="ks-p-face">{t.photo && !t.avatar ? <img src={t.photo} alt="" referrerPolicy="no-referrer" width={32} height={32} /> : <Avatar k={t.avatar} name={t.name} size={32} />}</span>
            <span className="ks-p-t">
              <b>{t.local ? `${t.name} (you)` : t.name}</b>
              <span className="hint">{t.role === 'teacher' ? 'Teacher' : t.role === 'learner' ? 'Learner' : 'Guest'}</span>
            </span>
            {s.hands[t.id] && (
              <span className="ks-p-hand" aria-label="Hand raised">
                <I n="hand" s={16} />
              </span>
            )}
            <span className={'ks-p-st' + (t.audio ? '' : ' off')} aria-label={t.audio ? 'Microphone on' : 'Microphone off'}>
              <I n={t.audio ? 'mic' : 'micOff'} s={16} />
            </span>
            <span className={'ks-p-st' + (t.video ? '' : ' off')} aria-label={t.video ? 'Camera on' : 'Camera off'}>
              <I n={t.video ? 'cam' : 'camOff'} s={16} />
            </span>
            {teacher && !t.local && (
              <span className="ks-p-acts">
                {t.audio ? (
                  <button type="button" onClick={() => host('mute', t.id)} data-tip="Turn off their microphone" aria-label={`Turn off ${t.name}’s microphone`}>
                    <I n="micOff" s={15} />
                  </button>
                ) : (
                  <button type="button" onClick={() => host('askMic', t.id)} data-tip="Ask them to turn on their microphone" aria-label={`Ask ${t.name} to turn on their microphone`}>
                    <I n="mic" s={15} />
                  </button>
                )}
                {t.video ? (
                  <button type="button" onClick={() => host('camOff', t.id)} data-tip="Turn off their camera" aria-label={`Turn off ${t.name}’s camera`}>
                    <I n="camOff" s={15} />
                  </button>
                ) : (
                  <button type="button" onClick={() => host('askCam', t.id)} data-tip="Ask them to turn on their camera" aria-label={`Ask ${t.name} to turn on their camera`}>
                    <I n="cam" s={15} />
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {teacher && call.classId && <NotHere s={s} call={call} />}
    </aside>
  );
}

function Controls({ s, call, people, setPeople, compact }: { s: EngineState; call: OpenCall; people: boolean; setPeople: (v: boolean) => void; compact?: boolean }) {
  const [more, setMore] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const moreRef = useDismiss<HTMLSpanElement>(more, () => setMore(false));
  const me = s.tiles.find((t) => t.local);
  const hand = !!(me && s.hands[me.id]);
  const mics = s.devices.filter((d) => d.kind === 'audioinput');
  const cams = s.devices.filter((d) => d.kind === 'videoinput');
  const canShare = !!navigator.mediaDevices?.getDisplayMedia && !phoneNow();
  return (
    <div className="ks-ctrl" role="toolbar" aria-label="Call controls">
      <button type="button" className={'ks-b' + (s.mic ? '' : ' off')} onClick={toggleMic} aria-pressed={!s.mic} aria-label={s.mic ? 'Turn off your microphone' : 'Turn on your microphone'} data-tip={s.mic ? 'Microphone off (Ctrl D)' : 'Microphone on (Ctrl D)'}>
        <I n={s.mic ? 'mic' : 'micOff'} />
      </button>
      <button type="button" className={'ks-b' + (s.cam ? '' : ' off')} onClick={toggleCam} aria-pressed={!s.cam} aria-label={s.cam ? 'Turn off your camera' : 'Turn on your camera'} data-tip={s.cam ? 'Camera off (Ctrl E)' : 'Camera on (Ctrl E)'}>
        <I n={s.cam ? 'cam' : 'camOff'} />
      </button>
      {!compact && canShare && (
        <button type="button" className={'ks-b' + (s.sharing ? ' on' : '')} onClick={toggleShare} aria-pressed={s.sharing} aria-label={s.sharing ? 'Stop sharing your screen' : 'Share your screen'} data-tip={s.sharing ? 'Stop sharing' : 'Share your screen'}>
          <I n="share" />
        </button>
      )}
      {!compact && (
        <button type="button" className={'ks-b' + (hand ? ' on' : '')} onClick={() => raiseHand(!hand)} aria-pressed={hand} aria-label={hand ? 'Lower your hand' : 'Raise your hand'} data-tip={hand ? 'Lower your hand' : 'Raise your hand'}>
          <I n="hand" />
        </button>
      )}
      {!compact && (
        <button type="button" className={'ks-b' + (people ? ' on' : '')} onClick={() => setPeople(!people)} aria-pressed={people} aria-label="People" data-tip="People">
          <I n="people" />
          {Object.keys(s.hands).length > 0 && <i className="ks-dot" />}
        </button>
      )}
      {!compact && (
        <span className="ks-moreanchor" ref={moreRef}>
          <button type="button" className={'ks-b' + (more ? ' on' : '')} onClick={() => setMore((m) => !m)} aria-haspopup="menu" aria-expanded={more} aria-label="More" data-tip="More">
            <I n="more" />
          </button>
          {more && (
            <span className="ks-menu up" role="menu">
              {mics.length > 0 && <span className="ks-k">Microphone</span>}
              {mics.map((d) => (
                <button key={d.id} role="menuitemradio" aria-checked={s.mics === d.id} onClick={() => void useDevice('audioinput', d.id)}>
                  <span className="ks-tick">{s.mics === d.id && <I n="check" s={14} />}</span>
                  {d.label}
                </button>
              ))}
              {cams.length > 0 && <span className="ks-k">Camera</span>}
              {cams.map((d) => (
                <button key={d.id} role="menuitemradio" aria-checked={s.cams === d.id} onClick={() => void useDevice('videoinput', d.id)}>
                  <span className="ks-tick">{s.cams === d.id && <I n="check" s={14} />}</span>
                  {d.label}
                </button>
              ))}
              <span className="ks-k">Sound</span>
              <button role="menuitemcheckbox" aria-checked={s.noise} onClick={() => void setNoise(!s.noise)}>
                <span className="ks-tick">{s.noise && <I n="check" s={14} />}</span>
                Reduce background noise
              </button>
              <span className="ks-k">Background</span>
              <div className="ks-bgs" role="radiogroup" aria-label="Background">
                <button type="button" role="radio" aria-checked={s.bg === 'none'} className={'ks-bg none' + (s.bg === 'none' ? ' on' : '')} onClick={() => void setBackground('none')} data-tip="No background">
                  <span>None</span>
                </button>
                <button type="button" role="radio" aria-checked={s.bg === 'blur'} className={'ks-bg blur' + (s.bg === 'blur' ? ' on' : '')} onClick={() => void setBackground('blur')} data-tip="Blur">
                  <span>Blur</span>
                </button>
                {BACKGROUNDS.map((b) => (
                  <button key={b.k} type="button" role="radio" aria-checked={s.bg === b.k} aria-label={b.label} data-tip={b.label} className={'ks-bg' + (s.bg === b.k ? ' on' : '')} style={{ backgroundImage: `url(/backgrounds/${b.k}.jpg)` }} onClick={() => void setBackground(b.k)} />
                ))}
                <button type="button" role="radio" aria-checked={s.bg === 'own'} className={'ks-bg own' + (s.bg === 'own' ? ' on' : '')} onClick={() => ownRef.current?.click()} data-tip="A picture of your own">
                  <span>+</span>
                </button>
                <input
                  ref={ownRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void f.arrayBuffer().then((buf) => setBackground('own', buf));
                  }}
                />
              </div>
              {!s.cam && <span className="ks-bg-hint">Turn on your camera to see it.</span>}
              {call.code && (
                <>
                  <span className="ks-k">Link</span>
                  <button role="menuitem" onClick={() => (void copyText(callLinkUrl(call.code!)), setMore(false))}>
                    <span className="ks-tick">
                      <I n="link" s={14} />
                    </span>
                    Copy the call’s link
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      )}
      <button type="button" className="ks-b ks-leave" onClick={() => leaveCall()} aria-label="Leave the call" data-tip="Leave the call">
        <I n="leave" />
        {!compact && <span>Leave</span>}
      </button>
    </div>
  );
}

// The whole call screen. In the app it floats; on its own page (mode 'page') it fills the page.
export function CallScreen({ page }: { page?: boolean }) {
  const call = useOpenCall();
  const s = useEngine();
  const teacher = callMe().role === 'teacher';
  ownerNow = !!s.tiles.find((t) => t.local)?.owner;
  const [mode, setMode] = useState<Mode>(() => (phoneNow() ? 'full' : 'float'));
  const [rect, setRect] = useState<Rect>(savedRect);
  // A teacher opening a class's room sees who is not there yet, to call them in.
  const [people, setPeople] = useState(() => teacher && !!call?.classId && !phoneNow());
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RECT_KEY, JSON.stringify(rect));
    } catch {
      /* fine */
    }
  }, [rect]);
  useEffect(() => {
    const fit = () => setRect((r) => clampRect(r));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  // Ctrl or Cmd + D: microphone; + E: camera (as in Google Meet), except while typing.
  useEffect(() => {
    if (!call) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      // Not while typing (a chat message, a note): the keys then belong to the text and the browser.
      if (typingIn(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'd') (e.preventDefault(), toggleMic());
      if (k === 'e') (e.preventDefault(), toggleCam());
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [call]);
  const note = s.note;
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => clearAsk(), 4500);
    return () => window.clearTimeout(t);
  }, [note]);
  const dragFrom = (e: React.PointerEvent, how: string) => {
    if (mode !== 'float' || e.button !== 0) return;
    if (how === 'move' && (e.target as HTMLElement).closest('button, a, input')) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const r0 = rect;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (how === 'move') return setRect(clampRect({ ...r0, x: r0.x + dx, y: r0.y + dy }));
      let { x, y, w, h } = r0;
      if (how.includes('e')) w = r0.w + dx;
      if (how.includes('s')) h = r0.h + dy;
      if (how.includes('w')) (w = r0.w - dx), (x = r0.x + Math.min(dx, r0.w - MIN_W));
      if (how.includes('n')) (h = r0.h - dy), (y = r0.y + Math.min(dy, r0.h - MIN_H));
      setRect(clampRect({ x, y, w, h }));
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('ks-dragging');
    };
    document.body.classList.add('ks-dragging');
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const people_ = useMemo(() => s.tiles.length, [s.tiles.length]);
  if (!call) return null;
  const sub = s.status === 'joining' ? 'Joining…' : s.status === 'error' ? 'Not connected' : `${people_} ${people_ === 1 ? 'person' : 'people'}${s.startedAt ? ' · ' + clock(now - s.startedAt) : ''}`;
  const copy = () => {
    if (!call.code) return;
    void copyText(callLinkUrl(call.code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const m: Mode | 'page' = page ? 'page' : mode;
  const style = m === 'float' ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined;
  const speaker = s.tiles.find((t) => t.id === s.speaker && !t.local);
  const ui = (
    <div className={'ks ks-' + m + (people && m !== 'mini' ? ' with-people' : '')} style={style} role="dialog" aria-label={`Call: ${call.title}`}>
      <Voices tiles={s.tiles} />
      {m === 'mini' ? (
        <div className="ks-minibar" onDoubleClick={() => setMode('float')}>
          <span className="ks-live" aria-hidden="true" />
          <span className="ks-mini-t">
            <b>{call.title}</b>
            <span>{speaker ? `${speaker.name} is speaking` : sub}</span>
          </span>
          <Controls s={s} call={call} people={false} setPeople={() => {}} compact />
          <button type="button" className="ks-h" onClick={() => setMode(phoneNow() ? 'full' : 'float')} aria-label="Larger" data-tip="Larger">
            <I n="float" s={17} />
          </button>
        </div>
      ) : (
        <>
          <header className="ks-head" onPointerDown={(e) => dragFrom(e, 'move')} onDoubleClick={(e) => !page && !(e.target as HTMLElement).closest('button') && setMode(mode === 'full' ? 'float' : 'full')}>
            <span className="ks-live" aria-hidden="true" />
            <span className="ks-title">
              <b>{call.title}</b>
              <span>
                {call.sub ? `${call.sub} · ` : ''}
                {sub}
              </span>
            </span>
            <span style={{ flex: 1 }} />
            {call.code && (
              <button type="button" className="ks-h" onClick={copy} aria-label="Copy the call’s link" data-tip={copied ? 'Copied' : 'Copy the call’s link'}>
                <I n={copied ? 'check' : 'link'} s={17} />
              </button>
            )}
            {!page && (
              <>
                <button type="button" className="ks-h" onClick={() => popOutCall()} aria-label="Open in a tab of its own" data-tip="Open in a tab of its own">
                  <I n="tab" s={17} />
                </button>
                <button type="button" className="ks-h" onClick={() => setMode(mode === 'full' ? 'float' : 'full')} aria-label={mode === 'full' ? 'Smaller window' : 'Whole screen'} data-tip={mode === 'full' ? 'Smaller window' : 'Whole screen'}>
                  <I n={mode === 'full' ? 'float' : 'full'} s={17} />
                </button>
                <button type="button" className="ks-h" onClick={() => setMode('mini')} aria-label="Shrink to the corner" data-tip="Shrink to the corner">
                  <I n="mini" s={17} />
                </button>
              </>
            )}
          </header>
          <div className="ks-body">
            <Stage s={s} teacher={teacher} />
            {people && <People s={s} teacher={teacher} call={call} onClose={() => setPeople(false)} />}
          </div>
          {s.ask && (
            <div className="ks-ask" role="alertdialog" aria-label="A request from your teacher">
              <span>
                <b>{s.ask.by}</b> asks you to turn on your {s.ask.what === 'mic' ? 'microphone' : 'camera'}
              </span>
              <button type="button" className="ks-pill" onClick={() => clearAsk()}>
                Not now
              </button>
              <button type="button" className="ks-pill primary" onClick={() => turnOn(s.ask!.what)}>
                Turn it on
              </button>
            </div>
          )}
          {(note || (s.error && s.status === 'joined')) && (
            <div className="ks-note" role="status" onClick={() => (clearAsk(), clearError())}>
              {note || s.error}
            </div>
          )}
          <Controls s={s} call={call} people={people} setPeople={setPeople} />
          <span className="ks-rec">This call keeps an attendance record.</span>
          {m === 'float' && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => <span key={d} className={'ks-rz ks-rz-' + d} onPointerDown={(e) => dragFrom(e, d)} aria-hidden="true" />)}
        </>
      )}
    </div>
  );
  return page ? ui : createPortal(ui, document.body);
}

import { copyText } from '../lib/copyText';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { Wordmark } from '../components/Wordmark';
import { connectAudio, DEFAULT_STUDIO_MINUTES, endSession, joinSession, LIVE_RATE, loadTake, saveLive, sessionLink, setSession, uploadTake, watchLive, watchPeers, watchSession, watchStudioLimit, watchTakes, type Live, type Peer, type Session, type Take } from '../lib/studio';
import { decodeSound } from '../lib/sound';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { openChat, sendMsg, type Chat, type Person } from '../lib/chat';
import { createSession } from '../lib/studio';
import { useDirectory } from '../lib/directory';

const ChatView = lazy(() => import('./MessagesPage').then((m) => ({ default: m.ChatView })));

// The recording studio: a video call with the colleagues invited, each on their own device. The
// host records; everyone records their own voice at full quality and sees every track grow live.
// When it stops, everyone can open all the tracks in the Recording editor and save their own copy.
// The session has its own group chat. A recording stops at the limit a super admin sets.

const levelOf = (an: AnalyserNode, buf: Float32Array) => {
  an.getFloatTimeDomainData(buf);
  let pk = 0;
  for (const v of buf) pk = Math.max(pk, Math.abs(v));
  return pk;
};

export function StudioSession() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const me = useMemo(() => (user ? { uid: user.uid, name: user.displayName || user.email?.split('@')[0] || 'Teacher' } : null), [user]);
  const [s, setS] = useState<Session | null | undefined>(undefined);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [takes, setTakes] = useState<Take[]>([]);
  const [live, setLive] = useState<Live[]>([]);
  const [limitMin, setLimitMin] = useState(DEFAULT_STUDIO_MINUTES);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState('');
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState('');
  const [phones, setPhones] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const offset = useRef(0);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<SoundSource | null>(null);
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(Date.now());
  const host = !!s && !!me && s.host === me.uid;

  useEffect(() => watchSession(id, setS), [id]);
  useEffect(() => watchPeers(id, setPeers), [id]);
  useEffect(() => watchTakes(id, setTakes), [id]);
  useEffect(() => watchLive(id, setLive), [id]);
  useEffect(() => watchStudioLimit(setLimitMin), []);
  useEffect(() => {
    document.title = 'Recording studio · ELT Suite';
  }, []);

  // The microphone (echo cancelling helps if someone has no headphones).
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } })
      .then((st) => (alive ? setMic(st) : st.getTracks().forEach((t) => t.stop())))
      .catch((e: Error) => setMicError(e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the address bar, then reload.' : 'We couldn’t find a microphone.'));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => () => mic?.getTracks().forEach((t) => t.stop()), [mic]);
  useEffect(() => () => cam?.getTracks().forEach((t) => t.stop()), [cam]);

  // Being here, and the shared clock.
  const micRef = useRef(false);
  micRef.current = !!mic;
  const camRef = useRef(false);
  camRef.current = !!cam;
  useEffect(() => {
    if (!me || !s) return;
    return joinSession(id, me, () => micRef.current, (ms) => (offset.current = ms), () => camRef.current);
  }, [id, me, !!s]); // eslint-disable-line react-hooks/exhaustive-deps

  // The call: hearing (and seeing) the others who are here.
  const here = peers.filter((p) => p.uid !== me?.uid && Date.now() - p.seen < 15000).map((p) => p.uid);
  const audio = useRef<ReturnType<typeof connectAudio> | null>(null);
  const hereRef = useRef(here);
  hereRef.current = here;
  useEffect(() => {
    if (!mic || !me) return;
    audio.current = connectAudio(id, me.uid, () => hereRef.current, mic, (uid, st) => setRemote((r) => {
      const n = { ...r };
      if (st) n[uid] = st;
      else delete n[uid];
      return n;
    }));
    audio.current.setVideo(cam?.getVideoTracks()[0] ?? null);
    return () => audio.current?.stop();
  }, [mic, me, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => audio.current?.sync(), [here.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCam = async () => {
    setCamError('');
    if (cam) {
      cam.getTracks().forEach((t) => t.stop());
      setCam(null);
      audio.current?.setVideo(null);
      camRef.current = false;
    } else {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } });
        setCam(st);
        camRef.current = true;
        audio.current?.setVideo(st.getVideoTracks()[0] ?? null);
      } catch (e) {
        setCamError((e as Error).name === 'NotAllowedError' ? 'The camera is blocked. Allow it in the address bar.' : 'We couldn’t find a camera.');
      }
    }
    window.dispatchEvent(new Event('studio-video'));
  };

  // Levels: mine and theirs, so everyone sees who is speaking.
  const myAn = useRef<AnalyserNode | null>(null);
  useEffect(() => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const ans: [string, AnalyserNode][] = [];
    if (mic && me) {
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(mic).connect(an);
      ans.push([me.uid, an]);
      myAn.current = an;
    }
    for (const [uid, st] of Object.entries(remote)) {
      if (!st.getAudioTracks().length) continue;
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(st).connect(an);
      ans.push([uid, an]);
    }
    const buf = new Float32Array(1024);
    const t = window.setInterval(() => setLevels(Object.fromEntries(ans.map(([u, an]) => [u, levelOf(an, buf)]))), 80);
    return () => (window.clearInterval(t), (myAn.current = null), void ctx.close());
  }, [mic, remote, me]);

  // ------------------------------------------------------------ recording a round
  const rec = useRef<{ r: MediaRecorder; chunks: Blob[]; start: number; round: number } | null>(null);
  const [count, setCount] = useState(0);
  const round = s?.round ?? 0;
  const recording = s?.state === 'recording';
  const limitMs = limitMin * 60000;
  const elapsed = recording && s?.startAt ? Math.max(0, now + offset.current - s.startAt) : 0;
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [recording]);
  // The time limit: the recording stops itself (anyone's device may stop it, in case the host left).
  useEffect(() => {
    if (recording && elapsed > limitMs + (host ? 0 : 3000)) {
      void setSession(id, { state: 'stopped' });
      setStatus(`The recording stopped at the ${limitMin}-minute limit.`);
    }
  }, [recording, elapsed > limitMs + (host ? 0 : 3000)]); // eslint-disable-line react-hooks/exhaustive-deps
  // My level, ten times a second, for everyone's live view of the tracks.
  useEffect(() => {
    if (!recording || !s?.startAt || !me || count > 0) return;
    const peaks: number[] = [];
    const buf = new Float32Array(1024);
    const startAt = s.startAt;
    const rd = s.round;
    const sample = window.setInterval(() => { const an = myAn.current; peaks.push(an ? Math.min(255, Math.round(levelOf(an, buf) * 255 * 1.6)) : 0); }, 1000 / LIVE_RATE);
    const send = window.setInterval(() => void saveLive(id, me, rd, startAt, peaks.slice(-LIVE_RATE * 60 * 180)), 1000);
    return () => { window.clearInterval(sample); window.clearInterval(send); void saveLive(id, me, rd, startAt, peaks); };
  }, [recording, s?.round, s?.startAt, me, count > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s || !mic || !me) return;
    if (s.state === 'recording' && s.startAt && rec.current?.round !== s.round) {
      const localStart = s.startAt - offset.current;
      const begin = () => {
        const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
        const r = new MediaRecorder(mic, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
        const chunks: Blob[] = [];
        r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        r.start(500);
        rec.current = { r, chunks, start: Date.now() + offset.current, round: s.round };
        setCount(0);
      };
      const wait = localStart - Date.now();
      if (wait <= 0) begin();
      else {
        rec.current = { r: null as unknown as MediaRecorder, chunks: [], start: 0, round: s.round };
        const tick = window.setInterval(() => setCount(Math.max(0, Math.ceil((localStart - Date.now()) / 1000))), 100);
        const t = window.setTimeout(() => (window.clearInterval(tick), begin()), wait);
        return () => (window.clearTimeout(t), window.clearInterval(tick));
      }
    }
    if (s.state === 'stopped' && rec.current && rec.current.round === s.round && rec.current.r) {
      const { r, chunks, start, round: rd } = rec.current;
      rec.current = { ...rec.current, r: null as unknown as MediaRecorder };
      r.onstop = async () => {
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
        setStatus('Sending your track…');
        try {
          await uploadTake(id, me, rd, blob, start, (Date.now() + offset.current - start) / 1000, (p) => setStatus(`Sending your track… ${Math.round(p * 100)}%`));
          setStatus('Your track is in. Everyone in the session can open it.');
        } catch {
          setStatus('We couldn’t send your track. Check your connection and try again.');
        }
      };
      r.stop();
    }
  }, [s?.state, s?.round, s?.startAt, mic, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = async () => {
    // Everyone starts at the same moment, three seconds from now on the shared clock.
    await setSession(id, { state: 'recording', round: round + 1, startAt: Date.now() + offset.current + 3200 });
    setStatus('');
  };
  const stopRound = () => setSession(id, { state: 'stopped' });
  const roundTakes = takes.filter((t) => t.round === round);
  const expected = (s?.members ?? []).filter((u) => peers.some((p) => p.uid === u) || roundTakes.some((t) => t.uid === u));
  const openEditor = async () => {
    setStatus('Opening everyone’s tracks…');
    try {
      const list = await Promise.all(roundTakes.map(async (t) => ({ t, buffer: await decodeSound(await loadTake(id, t)) })));
      if (!list.length) return setStatus('No tracks yet.');
      const t0 = Math.min(...list.map((x) => x.t.start));
      const mine = list.find((x) => x.t.uid === me?.uid) ?? list[0];
      const rest = list.filter((x) => x !== mine);
      setEditing({ buffer: mine.buffer, name: mine.t.name, at: (mine.t.start - t0) / 1000, extra: rest.map((x) => ({ name: x.t.name, buffer: x.buffer, at: (x.t.start - t0) / 1000 })) });
      setStatus('');
    } catch {
      setStatus('We couldn’t open the tracks. Try again.');
    }
  };

  // The session's group chat: everyone invited. Made here for older sessions without one.
  const dir = useDirectory();
  useEffect(() => {
    if (!s || !host || s.chatId || !dir) return;
    const others = s.members.filter((u) => u !== me?.uid).map((u) => ({ key: u, name: s.names[u] ?? 'Colleague', role: 'teacher' as const }));
    void openChat(dir.me, others, s.title || 'Recording session').then((chatId) => setSession(id, { chatId })).catch(() => {});
  }, [s?.chatId, host, !!dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chat, setChat] = useState<Chat | null>(null);
  useEffect(() => {
    if (!s?.chatId) return;
    return onSnapshot(doc(db, 'chats', s.chatId), (d) => setChat(d.exists() ? ({ id: d.id, ...(d.data() as Omit<Chat, 'id'>) }) : null), () => setChat(null));
  }, [s?.chatId]);

  if (s === undefined || !me) return <Loader label="Opening the studio" />;
  if (s === null)
    return (
      <div className="studio">
        <header className="studio-bar">
          <Wordmark />
          <span className="studio-app">Recording studio</span>
        </header>
        <p className="hint studio-missing">This recording session has ended, or you’re not invited to it.</p>
      </div>
    );
  if (editing)
    return (
      <div className="studio studio-dark">
        <main className="studio-sound">
          {saved ? (
            <div className="studio-done">
              <strong>Saved in My Files</strong>
              <span className="hint">Each person’s voice is on its own track, and stays that way when you open it again. Everyone in the session can open the same tracks and save their own copy.</span>
              <span className="pe-actions">
                <button type="button" className="btn" onClick={() => (setEditing(null), setSaved(false))}>
                  Back to the studio
                </button>
                {host && (
                  <button type="button" className="btn primary" onClick={() => void endSession(id).then(() => (window.location.href = '/recordings'))}>
                    Finish the session
                  </button>
                )}
              </span>
            </div>
          ) : (
            <SoundEditor source={editing} classId={'user:' + me.uid} backLabel="Back to the studio" onBack={() => setEditing(null)} onSaved={() => setSaved(true)} />
          )}
        </main>
      </div>
    );

  const mmss = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const left = limitMs - elapsed;
  const lanes = s.members.map((u) => ({ u, l: live.find((x) => x.uid === u && x.round === round) }));
  const laneLen = Math.max(LIVE_RATE * 30, ...lanes.map((x) => x.l?.peaks.length ?? 0), recording ? Math.ceil((elapsed / 1000) * LIVE_RATE) : 0);
  return (
    <div className={'studio ss2' + (chatOpen && s.chatId ? ' with-chat' : '')}>
      <header className="studio-bar">
        <Wordmark />
        <span className="studio-app">Recording studio</span>
        <span className="studio-where">{s.title || 'Recording session'}</span>
        <span style={{ flex: 1 }} />
        {recording && !count && <span className="ss-live">● Recording {mmss(elapsed)}</span>}
        <button type="button" className="btn small-btn" onClick={() => void copyText(sessionLink(id)).then(() => setStatus('The link is copied.'))}>
          <UiIcon name="link" size={13} /> Copy the link
        </button>
        {s.chatId && (
          <button type="button" className={'btn small-btn' + (chatOpen ? ' on' : '')} aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)}>
            <UiIcon name="message" size={13} /> Chat
          </button>
        )}
      </header>
      <div className="ss2-body">
        <main className="ss">
          {!phones && (
            <div className="ss-phones" role="note">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
                <rect x="3" y="14" width="4" height="7" rx="1.5" />
                <rect x="17" y="14" width="4" height="7" rx="1.5" />
              </svg>
              <span>
                <b>Put on headphones</b>
                <span className="hint">Everyone records their own voice. With headphones, your microphone doesn’t pick up the others, so each track stays clean.</span>
              </span>
              <button type="button" className="btn primary small-btn" onClick={() => setPhones(true)}>
                I’m wearing headphones
              </button>
            </div>
          )}
          {micError && <p className="hint warn">{micError}</p>}
          <div className="ss-people ss-tiles">
            {s.members.map((u) => {
              const p = peers.find((x) => x.uid === u);
              const mine = u === me.uid;
              const on = mine || (!!p && Date.now() - p.seen < 15000);
              const st = mine ? cam : remote[u];
              const showVideo = mine ? !!cam : !!p?.video && !!st?.getVideoTracks().some((t) => t.readyState === 'live');
              const take = roundTakes.find((t) => t.uid === u);
              const lv = levels[u] ?? 0;
              return (
                <div key={u} className={'ss-person' + (on ? ' on' : '') + (lv > 0.06 ? ' speaking' : '') + (showVideo ? ' has-video' : '')}>
                  {showVideo && st ? (
                    <video className={'ss-video' + (mine ? ' mirror' : '')} autoPlay playsInline muted ref={(el) => { if (el && el.srcObject !== st) el.srcObject = st; }} />
                  ) : (
                    <span className="ss-av" style={{ boxShadow: `0 0 0 ${2 + Math.min(10, lv * 40)}px color-mix(in srgb, var(--accent) ${on ? 35 : 0}%, transparent)` }}>
                      {(s.names[u] ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="ss-name">
                    <b>{s.names[u] ?? 'Colleague'}{mine ? ' (you)' : ''}</b>
                    <span className="hint">{u === s.host ? 'Host · ' : ''}{mine ? (mic ? 'Microphone on' : 'No microphone') : on ? (remote[u] ? 'In the call' : 'Connecting…') : 'Not here yet'}</span>
                  </span>
                  {round > 0 && <span className={'ss-take' + (take ? ' in' : '')}>{take ? `Round ${round}: track in` : s.state === 'stopped' && on ? 'Sending…' : ''}</span>}
                </div>
              );
            })}
          </div>
          {Object.entries(remote).map(([u, st]) => (
            <audio key={u} autoPlay ref={(el) => el && el.srcObject !== st && (el.srcObject = st)} />
          ))}

          {round > 0 && (
            <section className="ss-lanes" aria-label={`Round ${round}, as it records`}>
              <header>
                <b>Round {round}</b>
                <span className="hint">{recording ? `${mmss(elapsed)} recorded · ${mmss(left)} left` : `${mmss((laneLen / LIVE_RATE) * 1000)}`}</span>
              </header>
              {lanes.map(({ u, l }) => (
                <div key={u} className="ss-lane">
                  <span className="ss-lane-name">{s.names[u] ?? 'Colleague'}</span>
                  <svg viewBox={`0 0 ${laneLen} 100`} preserveAspectRatio="none" aria-hidden="true">
                    {(l?.peaks ?? []).map((v, i) => v > 6 && <rect key={i} x={i} y={50 - (v / 255) * 48} width="0.8" height={Math.max(1, (v / 255) * 96)} />)}
                    {recording && <line x1={(elapsed / 1000) * LIVE_RATE} x2={(elapsed / 1000) * LIVE_RATE} y1="0" y2="100" className="ss-head" vectorEffect="non-scaling-stroke" />}
                  </svg>
                </div>
              ))}
            </section>
          )}

          <div className="ss-stage">
            {count > 0 ? (
              <span className="ss-count">{count}</span>
            ) : recording ? (
              <span className="ss-rec">
                <i /> Recording · round {round} · {mmss(left)} left
              </span>
            ) : (
              <span className="hint">{s.state === 'stopped' ? `Round ${round} is done. Open it to edit everyone’s tracks.` : host ? `When everyone is here, start recording. Everyone starts together after a three-second count. A recording can last up to ${limitMin} minutes.` : 'Waiting for the host to start recording.'}</span>
            )}
            {status && <span className="hint">{status}</span>}
          </div>
          <div className="ss-controls" role="toolbar" aria-label="Call and recording">
            <button type="button" className={'ss-ctl' + (cam ? ' on' : '')} aria-pressed={!!cam} onClick={() => void toggleCam()}>
              <UiIcon name="video" size={18} /> {cam ? 'Turn off camera' : 'Turn on camera'}
            </button>
            {host && (recording ? (
              <button type="button" className="ss-ctl rec on" onClick={() => void stopRound()}>
                <span className="ss-stop" aria-hidden="true" /> Stop recording
              </button>
            ) : (
              <button type="button" className="ss-ctl rec" onClick={() => void startRound()} disabled={!mic}>
                <span className="sx-dot" /> {round ? 'Record another round' : 'Start recording'}
              </button>
            ))}
            {s.state === 'stopped' && round > 0 && (
              <button type="button" className="ss-ctl" onClick={() => void openEditor()} disabled={!roundTakes.length}>
                <UiIcon name="edit" size={18} /> Open the tracks{roundTakes.length < expected.length ? ` (${roundTakes.length} of ${expected.length} in)` : ''}
              </button>
            )}
          </div>
          {camError && <p className="hint warn">{camError}</p>}
        </main>
        {chatOpen && s.chatId && (
          <aside className="ss-chat" aria-label="Session chat">
            {chat && dir ? <Suspense fallback={<Loader label="Opening the chat" />}><ChatView c={chat} me={dir.me} dir={dir} teacher onBack={() => setChatOpen(false)} /></Suspense> : <Loader label="Opening the chat" />}
          </aside>
        )}
      </div>
    </div>
  );
}

// Starting a session: pick colleagues; a chat is opened with them and the link is sent there.
export async function startSessionWith(me: Person, guests: Person[], title: string, inChat?: Chat) {
  const id = await createSession({ uid: me.key, name: me.name }, guests.map((g) => ({ uid: g.key, name: g.name })), title);
  const link = sessionLink(id);
  const chatId = inChat?.id ?? (await openChat(me, guests, title || 'Recording session'));
  await setSession(id, { chatId }).catch(() => {});
  const c = inChat ?? ({ id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat);
  const text = `Join me in the recording studio${title ? `: ${title}` : ''}. Open the link, put on headphones, and we’ll meet in a call and record together.`;
  await sendMsg(c, me, {
    text: `${text} ${link}`,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: text + ' ' }, { type: 'text', text: 'Join the recording', marks: [{ type: 'link', attrs: { href: link } }] }] }] },
    blocks: 0,
    mentions: guests.map((g) => g.key),
  });
  window.open(`/studio/session/${id}`, '_blank');
  return id;
}

// Choosing who records with you.
export function RecordTogether({ onClose }: { onClose: () => void }) {
  const dir = useDirectory();
  const [picked, setPicked] = useState<Person[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const colleagues = dir?.groups.find((g) => g.id === 'colleagues')?.people ?? [];
  const others = (dir?.groups ?? []).filter((g) => g.id !== 'colleagues').flatMap((g) => g.people.filter((p) => p.role === 'teacher'));
  const list = [...new Map([...colleagues, ...others].map((p) => [p.key, p])).values()];
  const go = async () => {
    if (!dir) return;
    setBusy(true);
    try {
      await startSessionWith(dir.me, picked, title.trim());
      onClose();
    } catch (e) {
      console.error(e);
      setErr('We couldn’t start the session. Try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ss-invite" role="dialog" aria-label="Record together">
        <h2 style={{ margin: 0 }}>Record together</h2>
        <span className="hint">Choose colleagues to record with, for a dialogue or an interview. You meet in a video call with its own chat, and they get the link there. Each of you records your own voice. Everyone sees the tracks as they record, and can open them all afterwards.</span>
        <label className="field">
          <span>What are you recording? (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Unit 4 dialogue, at the hotel" />
        </label>
        <div className="lp-list">
          {!dir ? (
            <span className="hint">Finding your colleagues…</span>
          ) : list.length === 0 ? (
            <span className="hint lp-none">No colleagues yet. Invite one from Colleagues first.</span>
          ) : (
            list.map((p) => {
              const on = picked.some((x) => x.key === p.key);
              return (
                <label key={p.key} className={'sh-person' + (on ? ' on' : '')}>
                  <input type="checkbox" checked={on} onChange={() => setPicked((x) => (on ? x.filter((y) => y.key !== p.key) : [...x, p]))} />
                  <span className="sh-av">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="sh-pt">
                    <b>{p.name}</b>
                    <span className="hint">Teacher</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        {err && <span className="error">{err}</span>}
        <span className="pe-actions">
          <span className="hint">Everyone needs headphones.</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!picked.length || busy} onClick={() => void go()}>
            {busy ? 'Starting…' : 'Start and send the link'}
          </button>
        </span>
      </div>
    </div>
  );
}

import { copyText } from '../lib/copyText';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { Wordmark } from '../components/Wordmark';
import { AppLogo } from '../components/AppGrid';
import { connectAudio, DEFAULT_STUDIO_MINUTES, endSession, joinSession, LIVE_RATE, loadTake, saveLive, sessionLink, setSession, uploadTake, watchLive, watchPeers, watchSession, watchStudioLimit, watchTakes, type Live, type Peer, type Session, type Take } from '../lib/studio';
import { decodeSound } from '../lib/sound';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { openChat, sendMsg, setQuiet, type Chat, type Person } from '../lib/chat';
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
  // Quiet while recording: messages arrive without sounds or notifications on this person's devices.
  useEffect(() => {
    if (!me) return;
    if (recording && s?.startAt) void setQuiet(me.uid, s.startAt - offset.current + limitMs + 15000);
    else void setQuiet(me.uid, 0);
  }, [recording, s?.startAt, limitMs, me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void setQuiet(me?.uid, 0), [me?.uid]);
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
              <span className="hint">Each person’s voice is on its own track, and stays that way when you open it again. Everyone in the session can open the same tracks and save their own copy. The session’s chat carries on in Messages.</span>
              <span className="pe-actions">
                <button type="button" className="btn" onClick={() => (setEditing(null), setSaved(false))}>
                  Back to the studio
                </button>
                {host && (
                  <button type="button" className="btn primary" onClick={() => void endSession(id).then(() => (window.location.href = s.chatId ? `/messages?c=${encodeURIComponent(s.chatId)}` : '/recordings'))}>
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
  const lcd = (ms: number) => { const t = Math.max(0, ms / 1000); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`; };
  const left = limitMs - elapsed;
  const lanes = s.members.map((u) => ({ u, l: live.find((x) => x.uid === u && x.round === round) }));
  const span = Math.max(LIVE_RATE * 30, ...lanes.map((x) => x.l?.peaks.length ?? 0), recording ? Math.ceil((elapsed / 1000) * LIVE_RATE) + LIVE_RATE * 5 : 0);
  const ticks = Array.from({ length: Math.floor(span / LIVE_RATE / 5) + 1 }, (_, k) => k * 5);
  const hereCount = s.members.filter((u) => u === me.uid || peers.some((p) => p.uid === u && Date.now() - p.seen < 15000)).length;
  const myLevel = levels[me.uid] ?? 0;
  return (
    <div className={'rt' + (chatOpen && s.chatId ? ' with-chat' : '')}>
      <header className="sx-bar rt-bar">
        <span className="rt-mark"><AppLogo k="recordings" size={30} /><span><span className="rt-k">ELT Suite</span><b>Record together</b></span></span>
        <span className="sx-sep" aria-hidden="true" />
        <span className="rt-title">{s.title || 'Recording session'}</span>
        {recording && !count && <span className="rt-onair" role="status"><i aria-hidden="true" /> Recording</span>}
        <span className="sx-acts">
          <button type="button" className={'sx-act' + (cam ? ' on' : '')} aria-pressed={!!cam} onClick={() => void toggleCam()}><UiIcon name="video" size={18} /><span>{cam ? 'Camera on' : 'Camera off'}</span></button>
          <button type="button" className="sx-act" onClick={() => void copyText(sessionLink(id)).then(() => setStatus('The link is copied. Send it to anyone invited.'))}><UiIcon name="link" size={18} /><span>Copy link</span></button>
          {s.chatId && <button type="button" className={'sx-act' + (chatOpen ? ' on' : '')} aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)}><UiIcon name="message" size={18} /><span>Chat</span></button>}
          {s.state === 'stopped' && round > 0 && <button type="button" className="sx-act primary" onClick={() => void openEditor()} disabled={!roundTakes.length}><UiIcon name="edit" size={18} /><span>{roundTakes.length < expected.length ? `Open the tracks (${roundTakes.length} of ${expected.length})` : 'Open the tracks'}</span></button>}
        </span>
      </header>

      <div className="daw-transport rt-transport">
        {host ? (
          recording ? (
            <button type="button" className="rt-recbtn on" onClick={() => void stopRound()} aria-label="Stop recording"><span className="rt-stop" aria-hidden="true" /></button>
          ) : (
            <button type="button" className="rt-recbtn" onClick={() => void startRound()} disabled={!mic} aria-label={round ? 'Record another round' : 'Start recording'}><span className="rt-dot" aria-hidden="true" /></button>
          )
        ) : <span className={'rt-recbtn ghost' + (recording ? ' on' : '')} aria-hidden="true"><span className={recording ? 'rt-stop' : 'rt-dot'} /></span>}
        <span className="daw-lcd rt-lcd" aria-label="Time recorded"><b>{count > 0 ? `−0:0${count}` : lcd(elapsed)}</b><span>/ {mmss(limitMs)}</span></span>
        <span className="rt-say">
          {count > 0 ? <b>Starting in {count}…</b> : recording ? <b>{mmss(left)} left · round {round}</b> : s.state === 'stopped' ? <b>Round {round} is done</b> : <b>{host ? 'Press record when everyone is here' : 'The host starts the recording'}</b>}
          <span>{status || (recording ? 'Each voice is recording on its own device, at full quality.' : s.state === 'stopped' ? 'Open the tracks to edit them. Everyone in the session can.' : `Everyone starts together after a three-second count. Up to ${limitMin} minutes.`)}</span>
        </span>
        <span className="rt-meter" title="Your microphone"><UiIcon name="mic" size={15} /><span className="daw-meter"><i style={{ width: `${Math.min(100, myLevel * 160)}%` }} /></span></span>
        <span className="rt-here">{hereCount} of {s.members.length} here</span>
      </div>

      <div className="rt-body">
        <main className="rt-main">
          {(!phones || micError || camError) && (
            <div className="rt-notes">
              {!phones && <div className="rt-note"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" /></svg><span><b>Put on headphones.</b> Each of you records on your own device, so with headphones every track keeps only its own voice.</span><button type="button" className="rt-pill" onClick={() => setPhones(true)}>I’m wearing them</button></div>}
              {micError && <div className="rt-note warn"><UiIcon name="mic" size={18} /><span>{micError}</span></div>}
              {camError && <div className="rt-note warn"><UiIcon name="video" size={18} /><span>{camError}</span></div>}
            </div>
          )}

          <section className="rt-call" aria-label="The call">
            {s.members.map((u, i) => {
              const p = peers.find((x) => x.uid === u);
              const mine = u === me.uid;
              const on = mine || (!!p && Date.now() - p.seen < 15000);
              const st = mine ? cam : remote[u];
              const showVideo = mine ? !!cam : !!p?.video && !!st?.getVideoTracks().some((t) => t.readyState === 'live');
              const lv = levels[u] ?? 0;
              return (
                <div key={u} className={'rt-tile c' + (i % 4) + (on ? ' on' : '') + (lv > 0.06 ? ' speaking' : '')}>
                  {showVideo && st ? (
                    <video className={mine ? 'mirror' : ''} autoPlay playsInline muted ref={(el) => { if (el && el.srcObject !== st) el.srcObject = st; }} />
                  ) : (
                    <span className="rt-face" style={{ ['--lv' as string]: Math.min(1, lv * 6) }}>{(s.names[u] ?? '?').slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="rt-tag">
                    <span className="rt-tag-lv" aria-hidden="true"><i style={{ height: `${20 + Math.min(80, lv * 300)}%` }} /><i style={{ height: `${20 + Math.min(80, lv * 220)}%` }} /><i style={{ height: `${20 + Math.min(80, lv * 260)}%` }} /></span>
                    <b>{s.names[u] ?? 'Colleague'}{mine ? ' (you)' : ''}</b>
                    <span>{u === s.host ? 'Host' : ''}{u === s.host && !on ? ' · ' : ''}{!on ? 'not here yet' : !mine && !remote[u] ? (u === s.host ? ' · ' : '') + 'connecting…' : ''}</span>
                  </span>
                </div>
              );
            })}
          </section>
          {Object.entries(remote).map(([u, st]) => (
            <audio key={u} autoPlay ref={(el) => el && el.srcObject !== st && (el.srcObject = st)} />
          ))}

          <section className="rt-tracks" aria-label={round ? `Round ${round}, as it records` : 'Tracks'}>
            <div className="rt-ruler"><span className="rt-hcell">Tracks{round ? ` · round ${round}` : ''}</span><span className="rt-ticks">{ticks.map((t) => <span key={t} style={{ left: `${(t * LIVE_RATE / span) * 100}%` }}>{mmss(t * 1000)}</span>)}</span></div>
            {lanes.map(({ u, l }, i) => {
              const take = roundTakes.find((t) => t.uid === u);
              const peaks = l?.peaks ?? [];
              return (
                <div key={u} className={'rt-lane c' + (i % 4)}>
                  <span className="rt-hcell">
                    <b>{s.names[u] ?? 'Colleague'}</b>
                    <span className={'rt-state' + (take ? ' in' : recording && peaks.length ? ' live' : '')}>{take ? 'Track in · full quality' : recording && peaks.length ? (u === me.uid ? 'Recording on this device' : 'Recording on their device') : recording ? 'Waiting…' : s.state === 'stopped' && round ? 'Sending…' : 'Own device · full quality'}</span>
                  </span>
                  <span className="rt-lane-area">
                    {peaks.length > 0 && (
                      <span className="rt-clip" style={{ width: `${(peaks.length / span) * 100}%` }}>
                        <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" aria-hidden="true">
                          <path d={'M0 50 ' + peaks.map((v, k) => `L${k} ${50 - (v / 255) * 46}`).join(' ') + ` L${peaks.length} 50 ` + peaks.map((_, k) => `L${peaks.length - 1 - k} ${50 + (peaks[peaks.length - 1 - k] / 255) * 46}`).join(' ') + ' Z'} />
                        </svg>
                        <span className="rt-clip-name">{s.names[u] ?? 'Colleague'}</span>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            {recording && <span className="rt-head" style={{ left: `calc(var(--rt-hw) + (100% - var(--rt-hw)) * ${Math.min(1, (elapsed / 1000) * LIVE_RATE / span)})` }} aria-hidden="true" />}
            {!round && <p className="rt-empty">Each person’s track appears here as you record, live, for everyone in the session.</p>}
          </section>
        </main>
        {chatOpen && s.chatId && (
          <aside className="rt-chat" aria-label="Session chat">
            <header><span><b>Chat</b><span>{recording ? 'Quiet while you record: no sounds or notifications' : `${s.members.length} people · it stays in Messages afterwards`}</span></span><a className="rt-pill ghost" href={`/messages?c=${encodeURIComponent(s.chatId)}`} target="_blank" rel="noopener">Open in Messages</a></header>
            <div className="rt-chat-body">{chat && dir ? <Suspense fallback={<Loader label="Opening the chat" />}><ChatView c={chat} me={dir.me} dir={dir} teacher onBack={() => setChatOpen(false)} /></Suspense> : <Loader label="Opening the chat" />}</div>
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

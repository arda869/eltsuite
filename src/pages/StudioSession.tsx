import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { Wordmark } from '../components/Wordmark';
import { connectAudio, endSession, joinSession, loadTake, sessionLink, setSession, uploadTake, watchPeers, watchSession, watchTakes, type Peer, type Session, type Take } from '../lib/studio';
import { decodeSound } from '../lib/sound';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { openChat, sendMsg, type Chat, type Person } from '../lib/chat';
import { createSession } from '../lib/studio';
import { useDirectory } from '../lib/directory';

// The recording studio: the host and invited colleagues, each on their own device, hear each
// other and record their own voice. The host opens everyone's takes in the Sound editor.

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
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState('');
  const [phones, setPhones] = useState(false);
  const offset = useRef(0);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<SoundSource | null>(null);
  const [saved, setSaved] = useState(false);
  const host = !!s && !!me && s.host === me.uid;

  useEffect(() => watchSession(id, setS), [id]);
  useEffect(() => watchPeers(id, setPeers), [id]);
  useEffect(() => watchTakes(id, setTakes), [id]);
  useEffect(() => {
    document.title = 'Recording studio · Lesson Lit';
  }, []);

  // The microphone (echo cancelling helps if someone has no headphones).
  useEffect(() => {
    let live = true;
    navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } })
      .then((st) => (live ? setMic(st) : st.getTracks().forEach((t) => t.stop())))
      .catch((e: Error) => setMicError(e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in the address bar, then reload.' : 'No microphone was found.'));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => () => mic?.getTracks().forEach((t) => t.stop()), [mic]);

  // Being here, and the shared clock.
  const micRef = useRef(false);
  micRef.current = !!mic;
  useEffect(() => {
    if (!me || !s) return;
    return joinSession(id, me, () => micRef.current, (ms) => (offset.current = ms));
  }, [id, me, !!s]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hearing the others who are here.
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
    return () => audio.current?.stop();
  }, [mic, me, id]);
  useEffect(() => audio.current?.sync(), [here.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Levels: mine and theirs, so everyone sees who is speaking.
  useEffect(() => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const ans: [string, AnalyserNode][] = [];
    if (mic && me) {
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(mic).connect(an);
      ans.push([me.uid, an]);
    }
    for (const [uid, st] of Object.entries(remote)) {
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(st).connect(an);
      ans.push([uid, an]);
    }
    const buf = new Float32Array(1024);
    const t = window.setInterval(() => setLevels(Object.fromEntries(ans.map(([u, an]) => [u, levelOf(an, buf)]))), 80);
    return () => (window.clearInterval(t), void ctx.close());
  }, [mic, remote, me]);

  // ------------------------------------------------------------ recording a round
  const rec = useRef<{ r: MediaRecorder; chunks: Blob[]; start: number; round: number } | null>(null);
  const [count, setCount] = useState(0);
  const round = s?.round ?? 0;
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
        setStatus('Sending your recording…');
        try {
          await uploadTake(id, me, rd, blob, start, (Date.now() + offset.current - start) / 1000, (p) => setStatus(`Sending your recording… ${Math.round(p * 100)}%`));
          setStatus('Your recording is with the host.');
        } catch {
          setStatus('Your recording could not be sent. Check your connection.');
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
    setStatus('Opening everyone’s recordings…');
    try {
      const list = await Promise.all(roundTakes.map(async (t) => ({ t, buffer: await decodeSound(await loadTake(id, t)) })));
      if (!list.length) return setStatus('No recordings yet.');
      const t0 = Math.min(...list.map((x) => x.t.start));
      const mine = list.find((x) => x.t.uid === me?.uid) ?? list[0];
      const rest = list.filter((x) => x !== mine);
      setEditing({ buffer: mine.buffer, name: mine.t.name, at: (mine.t.start - t0) / 1000, extra: rest.map((x) => ({ name: x.t.name, buffer: x.buffer, at: (x.t.start - t0) / 1000 })) });
      setStatus('');
    } catch {
      setStatus('The recordings could not be opened.');
    }
  };

  if (s === undefined || !me) return <Loader label="Opening the studio" />;
  if (s === null)
    return (
      <div className="studio">
        <header className="studio-bar">
          <Wordmark />
          <span className="studio-app">Recording studio</span>
        </header>
        <p className="hint studio-missing">This recording session has ended, or you are not invited to it.</p>
      </div>
    );
  if (editing && host)
    return (
      <div className="studio studio-dark">
        <header className="studio-bar">
          <Wordmark />
          <span className="studio-app">Sound editor</span>
          <span className="studio-where">{s.title || 'Recording session'} · round {round}</span>
        </header>
        <main className="studio-sound">
          {saved ? (
            <div className="studio-done">
              <strong>Saved in your resources library</strong>
              <span className="hint">Each person’s voice was on its own track. You can record another round, or finish the session.</span>
              <span className="pe-actions">
                <button type="button" className="btn" onClick={() => (setEditing(null), setSaved(false))}>
                  Back to the studio
                </button>
                <button type="button" className="btn primary" onClick={() => void endSession(id).then(() => (window.location.href = '/archive'))}>
                  Finish the session
                </button>
              </span>
            </div>
          ) : (
            <SoundEditor source={editing} classId={'user:' + me.uid} backLabel="Back to the studio" onBack={() => setEditing(null)} onSaved={() => setSaved(true)} />
          )}
        </main>
      </div>
    );

  const recording = s.state === 'recording';
  return (
    <div className="studio">
      <header className="studio-bar">
        <Wordmark />
        <span className="studio-app">Recording studio</span>
        <span className="studio-where">{s.title || 'Recording session'}</span>
        <span style={{ flex: 1 }} />
        {recording && !count && <span className="ss-live">● Recording</span>}
        <button type="button" className="btn small-btn" onClick={() => void navigator.clipboard?.writeText(sessionLink(id)).then(() => setStatus('The link is copied.'))}>
          <UiIcon name="link" size={13} /> Copy the link
        </button>
      </header>
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
              <span className="hint">Everyone records their own voice. With headphones, the others’ voices are not picked up by your microphone, so each track stays clean.</span>
            </span>
            <button type="button" className="btn primary small-btn" onClick={() => setPhones(true)}>
              I’m wearing headphones
            </button>
          </div>
        )}
        {micError && <p className="hint warn">{micError}</p>}
        <div className="ss-people">
          {s.members.map((u) => {
            const p = peers.find((x) => x.uid === u);
            const on = u === me.uid || (!!p && Date.now() - p.seen < 15000);
            const take = roundTakes.find((t) => t.uid === u);
            const lv = levels[u] ?? 0;
            return (
              <div key={u} className={'ss-person' + (on ? ' on' : '') + (lv > 0.06 ? ' speaking' : '')}>
                <span className="ss-av" style={{ boxShadow: `0 0 0 ${2 + Math.min(10, lv * 40)}px color-mix(in srgb, var(--accent) ${on ? 35 : 0}%, transparent)` }}>
                  {(s.names[u] ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <b>{s.names[u] ?? 'Colleague'}</b>
                <span className="hint">
                  {u === s.host ? 'Host · ' : ''}
                  {u === me.uid ? 'You' : on ? (remote[u] ? 'Here, you can hear them' : 'Here, connecting…') : 'Not here yet'}
                </span>
                {round > 0 && <span className={'ss-take' + (take ? ' in' : '')}>{take ? `Round ${round}: recording received` : s.state === 'stopped' && on ? 'Sending…' : ''}</span>}
              </div>
            );
          })}
        </div>
        {Object.entries(remote).map(([u, st]) => (
          <audio key={u} autoPlay ref={(el) => el && el.srcObject !== st && (el.srcObject = st)} />
        ))}
        <div className="ss-stage">
          {count > 0 ? (
            <span className="ss-count">{count}</span>
          ) : recording ? (
            <span className="ss-rec">
              <i /> Recording · round {round}
            </span>
          ) : (
            <span className="hint">{s.state === 'stopped' ? `Round ${round} is done.` : host ? 'When everyone is here, start recording. Everyone starts together after a three-second count.' : 'Waiting for the host to start recording.'}</span>
          )}
          {host && (
            <span className="pe-actions">
              {recording ? (
                <button type="button" className="btn primary ss-big" onClick={() => void stopRound()}>
                  Stop
                </button>
              ) : (
                <button type="button" className="btn primary ss-big" onClick={() => void startRound()} disabled={!mic}>
                  <span className="sx-dot" /> {round ? 'Record another round' : 'Start recording'}
                </button>
              )}
              {s.state === 'stopped' && round > 0 && (
                <button type="button" className="btn ss-big" onClick={() => void openEditor()} disabled={!roundTakes.length}>
                  Open in the Sound editor{roundTakes.length < expected.length ? ` (${roundTakes.length} of ${expected.length} in)` : ''}
                </button>
              )}
            </span>
          )}
          {status && <span className="hint">{status}</span>}
        </div>
      </main>
    </div>
  );
}

// Starting a session: pick colleagues; a chat is opened with them and the link is sent there.
export async function startSessionWith(me: Person, guests: Person[], title: string, inChat?: Chat) {
  const id = await createSession({ uid: me.key, name: me.name }, guests.map((g) => ({ uid: g.key, name: g.name })), title);
  const link = sessionLink(id);
  const chatId = inChat?.id ?? (await openChat(me, guests, title || 'Recording session'));
  const c = inChat ?? ({ id: chatId, ...((await getDoc(doc(db, 'chats', chatId))).data() as Omit<Chat, 'id'>) } as Chat);
  const text = `Join me in the recording studio${title ? `: ${title}` : ''}. Open the link, put on headphones, and we record together.`;
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
      setErr('The session could not be started. Try again.');
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ss-invite" role="dialog" aria-label="Record together">
        <h2 style={{ margin: 0 }}>Record together</h2>
        <span className="hint">Choose colleagues to record with, for a dialogue or an interview. They get a link in a chat. Each of you records your own voice, and you edit everyone’s tracks together.</span>
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

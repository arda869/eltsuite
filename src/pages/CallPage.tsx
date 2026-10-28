import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { openCall, readCallLink, takeHandoff, useOpenCall, type CallLink, type OpenCall } from '../lib/calls';
import { callMe, setCallMe } from '../lib/callEngine';
import { CallScreen } from '../components/CallScreen';
import { Mark } from '../components/Wordmark';

// A call on a page of its own: eltsuite.com/call/<code> for anyone with the link (people without
// an account give their name first), and /call/here for a call moved over from another tab.

const ENDED_AFTER = 9 * 3600e3;
export function CallPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const { user, profile, ready } = useAuth();
  const open = useOpenCall();
  const [link, setLink] = useState<CallLink | null | undefined>(undefined);
  const [left, setLeft] = useState<OpenCall | null>(null);
  const was = useRef<OpenCall | null>(null);
  // Moved here from another tab: it takes the call over straight away.
  useEffect(() => {
    const h = takeHandoff();
    if (h && (code === 'here' || h.code === code || params.get('go'))) openCall(h);
    if (code !== 'here') void readCallLink(code).then(setLink, () => setLink(null));
    else setLink(null);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) was.current = open;
    else if (was.current) setLeft(was.current);
  }, [open]);
  useEffect(() => {
    document.title = open ? `${open.title} · ELT Suite` : 'Call · ELT Suite';
  }, [open]);
  if (open) return <div className="kp kp-in"><CallScreen page /></div>;
  const shell = (body: React.ReactNode) => (
    <div className="kp">
      <header className="kp-top">
        <Link to="/" className="kp-brand" aria-label="ELT Suite">
          <Mark size={28} />
          <span>ELT Suite</span>
        </Link>
      </header>
      <main className="kp-main">{body}</main>
    </div>
  );
  if (left)
    return shell(
      <div className="kp-card">
        <h1>You left the call</h1>
        <p className="hint">{left.title}</p>
        <div className="kp-acts">
          <button type="button" className="btn primary" onClick={() => (setLeft(null), openCall(left))}>
            Join again
          </button>
          {user && (
            <Link className="btn" to="/">
              Go to ELT Suite
            </Link>
          )}
        </div>
      </div>,
    );
  if (link === undefined || !ready) return shell(<div className="kp-card"><p className="hint">Opening the call…</p></div>);
  // A meeting's invitation, before the meeting has started: this page lets them in when it does.
  if (link && link.sessionId && (!link.url || Date.now() - link.at > ENDED_AFTER) && Date.now() - link.at < 120 * 86400e3)
    return shell(<Waiting code={code} title={link.title} by={link.byName} onReady={setLink} />);
  if (!link || Date.now() - link.at > ENDED_AFTER)
    return shell(
      <div className="kp-card">
        <h1>{link ? 'This call has ended' : 'This link does not open a call'}</h1>
        <p className="hint">{link ? 'Ask the person who sent it for a new link.' : 'Check that the whole link was copied.'}</p>
        {user && (
          <Link className="btn" to="/">
            Go to ELT Suite
          </Link>
        )}
      </div>,
    );
  return shell(
    <Lobby
      link={link}
      name={user ? (profile?.role === 'learner' ? profile.displayName : user.displayName) || user.email?.split('@')[0] || '' : ''}
      signedIn={!!user}
      onJoin={(name, mic, cam) => {
        if (!user) setCallMe({ name, role: 'guest' });
        else if (!callMe().key) setCallMe({ name, key: profile?.role === 'learner' ? profile.learnerId : user.uid, role: profile?.role === 'learner' ? 'learner' : 'teacher', avatar: profile?.avatar, photo: user.photoURL ?? undefined });
        openCall({ url: link.url, title: link.title, kind: link.kind, code, chatId: link.chatId ?? undefined, sessionId: link.sessionId ?? undefined, micOff: !mic, camOff: !cam });
      }}
    />,
  );
}

// Waiting for a meeting to start: the link is checked every few seconds.
function Waiting({ code, title, by, onReady }: { code: string; title: string; by: string; onReady: (l: CallLink) => void }) {
  useEffect(() => {
    const t = window.setInterval(() => {
      void readCallLink(code).then((l) => {
        if (l?.url && Date.now() - l.at < ENDED_AFTER) onReady(l);
      }, () => {});
    }, 8000);
    return () => window.clearInterval(t);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="kp-card">
      <h1>{title}</h1>
      <p>The meeting has not started yet.</p>
      <p className="hint">Keep this page open: it lets you in as soon as {by.split(' ')[0] || 'the organiser'} starts it. You do not need an ELT Suite account.</p>
    </div>
  );
}

// Before joining: your camera and microphone, and your name.
function Lobby({ link, name: known, signedIn, onJoin }: { link: CallLink; name: string; signedIn: boolean; onJoin: (name: string, mic: boolean, cam: boolean) => void }) {
  const [name, setName] = useState(() => {
    try {
      return known || localStorage.getItem('ll.guestName') || '';
    } catch {
      return known;
    }
  });
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(link.kind === 'video');
  const [err, setErr] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => {
    let dead = false;
    if (!cam) return;
    void navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (dead) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setErr('');
      })
      .catch(() => (setErr('Your camera is blocked or in use. You can still join, and turn it on later.'), setCam(false)));
    return () => {
      dead = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [cam]);
  const join = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      if (!signedIn) localStorage.setItem('ll.guestName', name.trim());
    } catch {
      /* fine */
    }
    onJoin(name.trim(), mic, cam);
  };
  return (
    <div className="kp-lobby">
      <div className={'kp-preview' + (cam ? '' : ' off')}>
        {cam ? <video ref={video} autoPlay playsInline muted /> : <span className="kp-initial">{(name.trim() || '?').slice(0, 1).toUpperCase()}</span>}
        <span className="kp-toggles">
          <button type="button" className={'ks-b' + (mic ? '' : ' off')} onClick={() => setMic(!mic)} aria-pressed={!mic} aria-label={mic ? 'Join with the microphone off' : 'Join with the microphone on'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3.5" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
              {!mic && <path d="M4 4l16 16" />}
            </svg>
          </button>
          <button type="button" className={'ks-b' + (cam ? '' : ' off')} onClick={() => setCam(!cam)} aria-pressed={!cam} aria-label={cam ? 'Join with the camera off' : 'Join with the camera on'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="6.5" width="12.5" height="11" rx="2.2" />
              <path d="M16 10.5l4.5-3v9l-4.5-3" />
              {!cam && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </span>
      </div>
      <form className="kp-join" onSubmit={(e) => (e.preventDefault(), name.trim() && join())}>
        <span className="kp-k">{link.kind === 'video' ? 'Video call' : 'Audio call'}</span>
        <h1>{link.title}</h1>
        <p className="hint">{link.byName} invited you</p>
        {signedIn ? (
          <p className="kp-as">
            You join as <b>{name}</b>
          </p>
        ) : (
          <label className="field">
            <span>Your name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="As the others should see it" autoComplete="name" />
          </label>
        )}
        {err && <p className="hint">{err}</p>}
        <button type="submit" className="btn primary kp-go" disabled={!name.trim()}>
          Join the call
        </button>
        <p className="kp-rec">This call keeps an attendance record.</p>
      </form>
    </div>
  );
}

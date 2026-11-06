// Super Admin → Sounds for everyone → Quiz show music. ELT Suite's own tracks play unless a super admin
// uploads one for a moment; then everyone hears the upload, until it's removed.
import { useEffect, useRef, useState } from 'react';
import { encodeMp3 } from '../../lib/audioEncode';
import { MOMENTS, musicInfo, playMusic, removeMusic, stopMusic, unlockMusic, uploadMusic, type Moment } from '../../quiz/music';

export function QuizMusic() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof musicInfo>> | null>(null);
  const [busy, setBusy] = useState<Moment | ''>('');
  const [playing, setPlaying] = useState<Moment | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pick = useRef<Moment>('lobby');
  const input = useRef<HTMLInputElement>(null);
  const load = () => void musicInfo().then(setInfo).catch(() => setError('We couldn’t load the quiz music. Try again.'));
  useEffect(() => {
    load();
    return () => stopMusic(0.2);
  }, []);
  const listen = (m: Moment) => {
    unlockMusic();
    if (playing === m) {
      stopMusic(0.3);
      setPlaying('');
    } else {
      void playMusic(m, 0.2);
      setPlaying(m);
    }
  };
  const upload = async (file: File) => {
    const m = pick.current;
    setBusy(m);
    setError('');
    setMessage('');
    stopMusic(0.1);
    setPlaying('');
    try {
      await uploadMusic(m, file, (mono, rate) => encodeMp3(mono, rate, 'clear'));
      setMessage(`${MOMENTS.find((x) => x.id === m)!.name}: your track is now playing for everyone.`);
      load();
    } catch (e) {
      setError((e as Error).message || 'We couldn’t upload that track. Try another file.');
    } finally {
      setBusy('');
    }
  };
  const remove = async (m: Moment) => {
    if (!confirm('Go back to ELT Suite’s own track for this moment? Your upload is deleted.')) return;
    setBusy(m);
    try {
      await removeMusic(m);
      load();
    } catch {
      setError('We couldn’t remove that track. Try again.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div>
      <p>The big screen plays music during a live quiz. ELT Suite’s own tracks play unless you upload one here. Loops repeat until the moment ends, so a track that loops cleanly sounds best.</p>
      <p className="hint">MP3, WAV, M4A or OGG, from 2 seconds to 5 minutes. Make sure you have the right to use the music.</p>
      <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 12 }}>
        {MOMENTS.map((m) => {
          const own = info?.[m.id];
          return (
            <section key={m.id} style={{ border: '1px solid var(--hair-strong)', borderRadius: 14, padding: 16, display: 'grid', gap: 8 }}>
              <strong>{m.name}</strong>
              <span className="hint">{m.about}</span>
              <span>{info === null ? 'One moment…' : own ? `Your upload: ${own.name} (${Math.round(own.duration)} s)` : 'ELT Suite’s own track'}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn small-btn" onClick={() => listen(m.id)}>
                  {playing === m.id ? 'Stop' : 'Listen'}
                </button>
                <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => ((pick.current = m.id), input.current?.click())}>
                  {busy === m.id ? 'Uploading…' : own ? 'Replace' : 'Upload a track'}
                </button>
                {own && (
                  <button type="button" className="btn small-btn" disabled={!!busy} onClick={() => void remove(m.id)}>
                    Use ELT Suite’s track
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

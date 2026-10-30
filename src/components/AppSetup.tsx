import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { disablePush, enablePush, isStandalone, lastPushDiagnostic, pushErrorText, pushState, type PushState } from '../lib/push';

// "ELT Suite on this device": put it on the home screen like an app, and turn on notifications.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
  });

const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function AppSetupDialog({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuth();
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    pushState(user?.uid).then(setSt);
    const on = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, [user?.uid]);
  const key = profile?.role === 'learner' ? profile.learnerId : user?.uid ?? '';
  const turnOn = async () => {
    if (!user) return;
    setBusy(true);
    setErr('');
    try {
      const ok = await enablePush(user.uid, key, profile?.role ?? 'teacher', profile?.role === 'learner' ? profile.classId ?? '' : '');
      if (!ok) setErr('Notifications aren’t allowed yet. You can allow them in the settings for this site or app.');
    } catch (e) {
      setErr(pushErrorText(e));
    } finally {
      setBusy(false);
      setSt(await pushState(user?.uid));
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setErr('');
    try { await disablePush(); }
    catch { setErr('We couldn’t turn off notifications. Check your connection and try again.'); }
    finally { setBusy(false); setSt(await pushState(user?.uid)); }
  };
  const diagnostic = lastPushDiagnostic();
  const installed = isStandalone();
  return (
    <div className="scrim ask-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog app-setup" role="dialog" aria-label="ELT Suite on this device">
        <span className="as-icon" aria-hidden="true">
          <img src="/icons/icon-192.png" alt="" />
        </span>
        <h2 className="ask-head">ELT Suite on this device</h2>
        <p className="ask-rest">Open it from your home screen like an app, and get a notification when a message or an announcement comes in.</p>

        <div className="as-step">
          <span className={'as-n' + (installed ? ' done' : '')}>{installed ? '✓' : '1'}</span>
          <div>
            <b>Add it to your home screen</b>
            {installed ? (
              <span className="hint">Done: you opened ELT Suite from your home screen.</span>
            ) : ios() ? (
              <span className="hint">
                In Safari, tap <span className="as-key">Share</span>, then <span className="as-key">Add to Home Screen</span>. Then open ELT Suite from its new icon and come back here.
              </span>
            ) : canInstall ? (
              <button type="button" className="btn small-btn" onClick={() => deferred?.prompt().then(() => (deferred = null, setCanInstall(false)))}>
                Install ELT Suite
              </button>
            ) : (
              <span className="hint">In your browser’s menu, choose “Install app” or “Add to Home screen”. On a computer this step is optional.</span>
            )}
          </div>
        </div>

        <div className="as-step">
          <span className={'as-n' + (st === 'on' ? ' done' : '')}>{st === 'on' ? '✓' : '2'}</span>
          <div>
            <b>Notifications</b>
            {st === null ? (
              <span className="hint">Checking…</span>
            ) : st === 'install-first' ? (
              <span className="hint">On an iPhone or iPad, add ELT Suite to your home screen first, then open it from there.</span>
            ) : st === 'unsupported' ? (
              <span className="hint">This browser can’t show notifications. On an iPhone or iPad, use iOS 16.4 or later and open the app from its home-screen icon.</span>
            ) : st === 'not-ready' ? (
              <span className="hint">Notifications are being set up and will be ready soon.</span>
            ) : st === 'denied' ? (
              <span className="hint">Notifications are blocked for ELT Suite. Allow them in this device’s settings, then come back.</span>
            ) : st === 'on' ? (
              <span className="as-row">
                <span className="hint">On for this device: messages and announcements.</span>
                <button type="button" className="btn link small" disabled={busy} onClick={() => void turnOff()}>
                  Turn off
                </button>
              </span>
            ) : (
              <button type="button" className="btn primary small-btn" disabled={busy} onClick={() => void turnOn()}>
                {busy ? 'One moment…' : st === 'repair' || st === 'unavailable' ? 'Repair notifications' : 'Turn on notifications'}
              </button>
            )}
            {st === 'repair' && <span className="hint">Permission is allowed, but this device’s registration needs to be repaired.</span>}
            {st === 'unavailable' && <span className="hint">We couldn’t check this device’s registration. Check your connection, then try Repair notifications.</span>}
            {(st === 'repair' || st === 'unavailable') && <button type="button" className="btn link small" disabled={busy} onClick={() => void turnOff()}>Turn off</button>}
            {err && <span className="error" role="alert">{err}</span>}
            {diagnostic && diagnostic.step !== 'saved' && <span className="hint">Setup code: {diagnostic.step} · {diagnostic.code || 'unknown'}</span>}
          </div>
        </div>

        <span className="ask-acts">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </span>
      </div>
    </div>
  );
}

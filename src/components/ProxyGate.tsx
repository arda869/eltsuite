import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { readProxy, writeProxy } from '../lib/proxy';
import { useAuth } from '../lib/auth';

// In a "view as a learner" tab: sign in as the learner, then show a bar saying so.
export function ProxyGate({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState(readProxy);
  const [error, setError] = useState('');
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  // The bar takes room at the top, so lesson screens shrink by its height and still fit the window.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--proxy-h', el.offsetHeight + 'px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--proxy-h');
    };
  });
  useEffect(() => {
    if (!info || info.signedIn || !ready) return;
    if (!info.token && (!info.email || !info.password)) return setError('The sign-in details are missing. Close this tab and try again.');
    (info.token ? signInWithCustomToken(auth, info.token) : signInWithEmailAndPassword(auth, info.email!, info.password!))
      .then(() => {
        const next = { name: info.name, classId: info.classId, path: info.path, signedIn: true };
        writeProxy(next); // the password or pass is not kept
        setInfo(next);
        navigate(info.path || '/', { replace: true });
      })
      .catch(() => setError(info.token ? 'We couldn’t sign in as them. The pass is good for an hour: close this tab and try again.' : 'We couldn’t open this learner’s view. Their PIN may have changed. Refresh the Learners list and try again.'));
  }, [info, ready, navigate]);
  if (!info) return <>{children}</>;
  const close = async () => {
    await signOut(auth).catch(() => {});
    writeProxy(null);
    window.close();
    setInfo(null);
  };
  if (!info.signedIn || !user)
    return (
      <div className="signin">
        <div className="card">
          <h1>Opening {info.name.split(' ')[0]}’s view…</h1>
          {error && <span className="error">{error}</span>}
          {error && (
            <button className="btn" onClick={close}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  return (
    <>
      <div className="proxy-bar" role="status" ref={bar}>
        <span>
          Viewing as <strong>{info.name}</strong>. Anything you do here is done as {info.name.split(' ')[0]}{info.classId ? ': answers, posts and attendance' : ''}.
        </span>
        <button type="button" className="btn small-btn" onClick={close}>
          Close this view
        </button>
      </div>
      {children}
    </>
  );
}

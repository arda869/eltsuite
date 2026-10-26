import { useEffect, useState } from 'react';

declare const __BUILD__: string;

// Shows a small banner when a newer version of the app has been published.
export function UpdateBanner() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (location.hostname === 'localhost') return;
    // Opened from the home screen, the app can stay in memory for days: when it comes back to the
    // front (or starts) and a newer version is out, it simply loads the new one.
    const app = document.documentElement.hasAttribute('data-standalone');
    const check = (opening = false) =>
      fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then((r) => r.json())
        .then((v: { build: string }) => {
          if (!v.build || v.build === __BUILD__) return;
          if (app && opening) window.location.reload();
          else setFresh(true);
        })
        .catch(() => {});
    check(true);
    const t = window.setInterval(() => check(), 60000);
    const vis = () => document.visibilityState === 'visible' && check(true);
    document.addEventListener('visibilitychange', vis);
    return () => (window.clearInterval(t), document.removeEventListener('visibilitychange', vis));
  }, []);
  if (!fresh) return null;
  return (
    <div className="update-banner" role="status">
      A new version of ELT Suite is ready.
      <button type="button" className="btn small-btn primary" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';

declare const __BUILD__: string;

// Shows a small banner when a newer version of the app has been published.
export function UpdateBanner() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (location.hostname === 'localhost') return;
    const check = () =>
      fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then((r) => r.json())
        .then((v: { build: string }) => v.build && v.build !== __BUILD__ && setFresh(true))
        .catch(() => {});
    const t = window.setInterval(check, 60000);
    const vis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', vis);
    return () => (window.clearInterval(t), document.removeEventListener('visibilitychange', vis));
  }, []);
  if (!fresh) return null;
  return (
    <div className="update-banner" role="status">
      A new version of Lesson Lit is ready.
      <button type="button" className="btn small-btn primary" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';

// "Reconnecting…" while the device is offline; work is kept and sent later.
export function ConnectionBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [back, setBack] = useState(false);
  useEffect(() => {
    const on = () => {
      setOnline(true);
      setBack(true);
      window.setTimeout(() => setBack(false), 2500);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online && !back) return null;
  return (
    <div className={'conn-banner' + (online ? ' ok' : '')} role="status">
      <span className="conn-dot" aria-hidden="true" />
      {online ? 'Back online. Everything is saved.' : 'Reconnecting… Your work is kept on this device and will be saved.'}
    </div>
  );
}

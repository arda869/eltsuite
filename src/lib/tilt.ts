// The flame in "Lit" stays upright like a real flame: tilt the phone and it leans the other
// way on the screen. Phones only; iPhones ask once for permission on the first tap.
export function startTilt() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window) || !matchMedia('(hover: none)').matches) return;
  const root = document.documentElement;
  let last = 0;
  const on = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    const now = performance.now();
    if (now - last < 40) return;
    last = now;
    const a = (screen.orientation?.angle ?? 0) % 360;
    const roll = a === 90 ? -e.beta : a === 270 ? e.beta : a === 180 ? -e.gamma : e.gamma;
    const deg = Math.max(-38, Math.min(38, -roll * 0.75));
    root.style.setProperty('--tilt', `${deg.toFixed(1)}deg`);
  };
  const listen = () => window.addEventListener('deviceorientation', on);
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof D.requestPermission === 'function') {
    const ask = () => {
      D.requestPermission!()
        .then((r) => r === 'granted' && listen())
        .catch(() => {});
    };
    window.addEventListener('touchend', ask, { once: true });
  } else listen();
}

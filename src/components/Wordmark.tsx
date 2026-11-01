import { AppLogo } from './AppGrid';

// ELT Suite: a rounded tile with an E drawn from lines (like the lines of a lesson),
// then the name. The suite keeps the app's colours and type.
export const MARK = (fill = '#d98f63') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${fill}"/><rect x="14" y="12" width="5.5" height="24" rx="2.75" fill="#fff"/><rect x="14" y="12" width="21" height="5.5" rx="2.75" fill="#fff"/><rect x="14" y="21.25" width="15" height="5.5" rx="2.75" fill="#fff"/><rect x="14" y="30.5" width="21" height="5.5" rx="2.75" fill="#fff"/></svg>`;

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg className="wm-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#d98f63" style={{ fill: 'var(--brand, #d98f63)' }} />
      <rect x="14" y="12" width="5.5" height="24" rx="2.75" fill="#fff" />
      <rect x="14" y="12" width="21" height="5.5" rx="2.75" fill="#fff" />
      <rect x="14" y="21.25" width="15" height="5.5" rx="2.75" fill="#fff" />
      <rect x="14" y="30.5" width="21" height="5.5" rx="2.75" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={'wordmark' + (big ? ' big' : '')} role="img" aria-label="ELT Suite">
      <Mark size={big ? 64 : 26} />
      <span aria-hidden="true" className="wm-name">
        <b>ELT</b> Suite
      </span>
    </span>
  );
}

// The suite's mark with the app's name under "ELT Suite", for pages that open in their own tab.
export function SuiteMark({ app, color = '#d98f63', dark = false, iconKey }: { app: string; color?: string; dark?: boolean; iconKey?: string }) {
  return (
    <span className={'suite-mark' + (dark ? ' dark' : '')} style={{ ['--app' as string]: color }}>
      {iconKey ? <AppLogo k={iconKey} size={28} /> : <Mark size={28} />}
      <span>
        <span className="suite-k">ELT Suite</span>
        <b>{app}</b>
      </span>
    </span>
  );
}

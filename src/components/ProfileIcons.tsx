import type { ReactNode } from 'react';

// Icons for the fields of a teacher's profile. The organisation's admins pick one for each field.
const P: Record<string, ReactNode> = {
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.8 3.6-5.8 7-5.8s6.2 2 7 5.8" /></>,
  quote: <path d="M9.5 7.5C7 8 5.5 10 5.5 13v3.5h4V12h-2.4c0-1.5 1-2.6 2.4-2.9zM18.5 7.5C16 8 14.5 10 14.5 13v3.5h4V12h-2.4c0-1.5 1-2.6 2.4-2.9z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.5 8.8 8.5 12s1.1 6.1 3.5 8.5" /></>,
  speech: <path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 4v-4h0a2 2 0 0 1-2-2z" />,
  heart: <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z" />,
  star: <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  cap: <><path d="M2.5 9.5 12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5V16c1.5 1.4 3.4 2 5.5 2s4-.6 5.5-2v-4.5M21.5 9.5V14" /></>,
  award: <><circle cx="12" cy="9" r="5" /><path d="M9 13.2 7.5 20l4.5-2.3 4.5 2.3-1.5-6.8" /></>,
  book: <path d="M4.5 5.5c2.7-1 5.2-.8 7.5.8v13c-2.3-1.6-4.8-1.8-7.5-.8zM19.5 5.5c-2.7-1-5.2-.8-7.5.8v13c2.3-1.6 4.8-1.8 7.5-.8z" />,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  pin: <><path d="M12 20.5s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="9.5" r="2.3" /></>,
  plane: <path d="M10.5 13.5 4 11l1.5-1.5 7 .8 4-4c.8-.8 2.2-.9 2.8-.3.6.6.5 2-.3 2.8l-4 4 .8 7L14.3 21l-2.5-6.5-3.3 3.3.3 2.2-1.3 1.3-1.3-2.7L3.5 17.3l1.3-1.3 2.2.3z" />,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.5" r="3.3" /></>,
  music: <><path d="M9 17.5V6l10-2v11.5" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>,
  coffee: <><path d="M5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8.5 3.5v3M12 3.5v3" /></>,
  leaf: <path d="M5 19c0-8 5-13.5 14.5-14 .3 9.5-5 14.5-12 14.5M5 19c2.5-4 5.5-6.5 9-8" />,
  sport: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17M6 6c2 1.8 3 3.8 3 6s-1 4.2-3 6M18 6c-2 1.8-3 3.8-3 6s1 4.2 3 6" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H16a4.5 4.5 0 0 0 4.5-4.5c0-3.7-3.8-6.4-8.5-6.4z" /><circle cx="8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.8" r="1" /></>,
  lightbulb: <><path d="M9 16.5h6M10 19.5h4M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.1v.9h4v-.9c0-.8.5-1.6 1.2-2.1A5.5 5.5 0 0 0 12 3.5z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  link: <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  chat: <><path d="M4 6.5A2 2 0 0 1 6 4.5h8a2 2 0 0 1 2 2V11a2 2 0 0 1-2 2H9.5l-3.5 3v-3A2 2 0 0 1 4 11z" /><path d="M16 8.5h2a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2v2.5L15 17h-3.5a2 2 0 0 1-1.7-1" /></>,
  flag: <path d="M5.5 20.5V4.5M5.5 5c4-2 7 2 13 0v8.5c-6 2-9-2-13 0" />,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  film: <><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M8 4.5v15M16 4.5v15M4 9h4M4 15h4M16 9h4M16 15h4" /></>,
  pen: <path d="M14.5 5.5l4 4L9 19H5v-4zM12.5 7.5l4 4" />,
};
export const PROFILE_ICONS = Object.keys(P);

export function ProfileIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] ?? P.star}
    </svg>
  );
}

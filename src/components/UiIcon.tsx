import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Interface icons for the lesson toolbars: thin strokes, rounded ends, in the text colour.
const P: Record<string, ReactNode> = {
  videoPlay: <path d="M8 5l11 7-11 7z" strokeLinejoin="round" />,
  videoPause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
  videoStop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  videoSave: <><path d="M5 4h12l3 3v13H4V4z" strokeLinejoin="round" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
  videoSplit: <><path d="M12 3v18M4 8h5M4 16h5M15 8h5M15 16h5" /><path d="M7 6l2 2-2 2M17 14l-2 2 2 2" /></>,
  videoUndo: <><path d="M8 6L4 10l4 4M4 10h10a6 6 0 0 1 6 6v2" /></>,
  videoRedo: <><path d="M16 6l4 4-4 4M20 10H10a6 6 0 0 0-6 6v2" /></>,
  videoCaptions: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 10a2.5 2.5 0 1 0 0 4M18 10a2.5 2.5 0 1 0 0 4" /></>,
  videoRipple: <><path d="M3 6h5v12H3M21 6h-5v12h5M9 12h6M10 10l-2 2 2 2M14 10l2 2-2 2" /></>,
  videoDetach: <><path d="M3 5h18v8H3zM3 17h7v4H3zM14 17h7v4h-7zM12 13v8" /></>,
  videoSparkles: <><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 3v4M18 5h4" strokeLinejoin="round" /></>,
  videoClose: <path d="M6 6l12 12M18 6L6 18" />,
  videoKeyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h1M10 9h1M14 9h1M18 9h1M6 13h1M10 13h1M14 13h1M18 13h1M8 16h8" /></>,
  videoEye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  videoUp: <path d="M6 14l6-6 6 6" />,
  videoAction: <><circle cx="12" cy="12" r="8" /><path d="M8 12h8M12 8v8" /></>,
  alignLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCenter: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  plus: <path d="M12 6v12M6 12h12" />,
  textSize: <><path d="M3.5 6.5h10M8.5 6.5V19" /><path d="M13.5 11.5h7M17 11.5V19" /></>,
  export: <><path d="M12 4v11" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></>,
  classes: <><path d="M3.5 6c2.8-1.2 5.6-1.2 8.5.8 2.9-2 5.7-2 8.5-.8v12.5c-2.8-1.2-5.6-1.2-8.5.8-2.9-2-5.7-2-8.5-.8z" strokeLinejoin="round" /><path d="M12 6.8v12.5" /></>,
  home: <><path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z" strokeLinejoin="round" /></>,
  notebook: <><path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" /><path d="M9 3.5v17" /><path d="M12 8h4M12 11.5h4" /></>,
  board: <><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" /><path d="M8.5 20l3.5-4 3.5 4" /><path d="M7 12.5c1.4-2.6 2.6-3.6 3.6-2.3s1.8 1.4 3.4-1.6 2.5-1.8 3 .2" /></>,
  task: <><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></>,
  groups: <><circle cx="9" cy="8" r="2.7" /><circle cx="16.5" cy="9" r="2.2" /><path d="M3.8 18.5a5.2 5.2 0 0 1 10.4 0" /><path d="M14 13.6a4.4 4.4 0 0 1 6.2 4.4" /></>,
  present: <><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" /><path d="M12 16.5V20M8.5 20h7" /><path d="M10.5 8.3v4.4l3.8-2.2z" strokeLinejoin="round" /></>,
  presentOff: <><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" /><path d="M12 16.5V20M8.5 20h7" /><path d="M9.5 8l5 5M14.5 8l-5 5" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.6" /><circle cx="12" cy="16.8" r=".6" fill="currentColor" /></>,
  pointer: <><path d="M5.5 4l13 6.2-5.6 1.7-1.8 5.7z" strokeLinejoin="round" /><circle cx="17.5" cy="17.5" r="2" fill="currentColor" stroke="none" /></>,
  timer: <><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M10 3.5h4M18.3 7.2l1.4-1.4" /></>,
  pick: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" /></>,
  poll: <><path d="M5 20V13M10 20V8M15 20v-5M20 20V5" /></>,
  quiz: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 13v3.5M8.5 20h7l-1-3.5h-5z" strokeLinejoin="round" /></>,
  annotate: <><path d="M15 4.5l4 4L9.5 18l-4.5 1 1-4.5z" strokeLinejoin="round" /><path d="M13 6.5l4 4" /><path d="M13.5 20h6" /></>,
  pen: <><path d="M15 4.5l4 4L8.5 19l-4.5 1 1-4.5z" strokeLinejoin="round" /><path d="M13 6.5l4 4" /></>,
  highlight: <><path d="M14 4l5 5-7.5 7.5h-5v-5z" strokeLinejoin="round" /><path d="M6.5 16.5 4 19h5l1-1" strokeLinejoin="round" /><path d="M11 20.5h9" strokeWidth="2.6" opacity=".45" /></>,
  eraser: <><path d="M9 19.5h10" /><path d="M4.8 14.6l8.8-8.8a1.6 1.6 0 0 1 2.3 0l2.6 2.6a1.6 1.6 0 0 1 0 2.3L11 18.2a2 2 0 0 1-1.4.6H8.4a2 2 0 0 1-1.4-.6l-2.2-2.2a1 1 0 0 1 0-1.4z" strokeLinejoin="round" /><path d="M9.5 9.9l4.4 4.4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  announce: <><path d="M4 10v4a1 1 0 0 0 1 1h2.5l6 4.5v-15l-6 4.5H5a1 1 0 0 0-1 1z" strokeLinejoin="round" /><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  answers: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  fullscreen: <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />,
  fullscreenOff: <path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" />,
  more: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" /></>,
  prev: <path d="M14.5 6l-6 6 6 6" strokeWidth="2" strokeLinejoin="round" />,
  next: <path d="M9.5 6l6 6-6 6" strokeWidth="2" strokeLinejoin="round" />,
  edit: <><path d="M14.5 5.5l4 4L9 19l-4.5 1 1-4.5z" strokeLinejoin="round" /><path d="M12.5 7.5l4 4" /></>,
  revealOne: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.6" /><path d="M19 3.5v4M17 5.5h4" /></>,
  revealAll: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.6" /></>,
  hideAnswers: <><path d="M4 4l16 16" /><path d="M9.9 6.3A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.8 3.4M6.6 7.6A15.6 15.6 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 4.2-1" strokeLinejoin="round" /></>,
  import: <><path d="M12 15V4" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></>,
  copyall: <><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /><path d="M14 11v6M11 14h6" /></>,
  call: <><rect x="3.5" y="6.5" width="12" height="11" rx="2" /><path d="M15.5 10.5l5-3v9l-5-3z" strokeLinejoin="round" /></>,
  discuss: <><path d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 15 14.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z" strokeLinejoin="round" /><path d="M19 9h1a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18h-1v2.5L16 18h-4.5" strokeLinejoin="round" /></>,
  message: <><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" /></>,
  hand: <><path d="M8 12.5V6.8a1.3 1.3 0 0 1 2.6 0V11M10.6 10.5V5.3a1.3 1.3 0 0 1 2.6 0v5.2M13.2 10.5V6.3a1.3 1.3 0 0 1 2.6 0v6" /><path d="M15.8 9.5a1.3 1.3 0 0 1 2.6 0V14a6.5 6.5 0 0 1-6.5 6.5h-.4a6 6 0 0 1-4.6-2.2L4.3 15a1.4 1.4 0 0 1 2.1-1.8L8 14.8" strokeLinejoin="round" /></>,
  stuck: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.6" /><circle cx="12" cy="16.8" r=".6" fill="currentColor" /></>,
  react: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 13.5c.9 1.4 2.1 2.1 3.5 2.1s2.6-.7 3.5-2.1" /><circle cx="9.2" cy="9.8" r=".7" fill="currentColor" /><circle cx="14.8" cy="9.8" r=".7" fill="currentColor" /></>,
  sync: <><path d="M19.2 13.2A7.5 7.5 0 0 1 6.4 17.3" /><path d="M4.8 10.8A7.5 7.5 0 0 1 17.6 6.7" /><path d="M18 3.6v3.6h-3.6" /><path d="M6 20.4v-3.6h3.6" /><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  music: <><path d="M9 17.5V6l10-2v11.5" strokeLinejoin="round" /><circle cx="6.8" cy="17.5" r="2.2" /><circle cx="16.8" cy="15.5" r="2.2" /></>,
  video: <><rect x="3.5" y="6" width="12.5" height="12" rx="2" /><path d="M16 10.5l4.5-3v9l-4.5-3" strokeLinejoin="round" /></>,
  phone: <path d="M7.2 3.8 9.4 4.4a1 1 0 0 1 .7.8l.6 3a1 1 0 0 1-.4 1l-1.6 1.2a11 11 0 0 0 5 5l1.2-1.6a1 1 0 0 1 1-.4l3 .6a1 1 0 0 1 .8.7l.6 2.2a1.5 1.5 0 0 1-1.2 1.9C11 20.4 3.6 13 4.1 5a1.5 1.5 0 0 1 1.9-1.2z" strokeLinejoin="round" />,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" strokeLinejoin="round" /><path d="M10 20.5h4" /></>,
  beep: <><circle cx="12" cy="12" r="2" /><path d="M8 8.5a5 5 0 0 0 0 7M16 8.5a5 5 0 0 1 0 7" /></>,
  silence: <path d="M9.5 7v10M14.5 7v10" />,
  upload: <><path d="M12 16V5" /><path d="M7.5 9.5 12 5l4.5 4.5" /><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  archive: <><rect x="3.5" y="4.5" width="17" height="4.5" rx="1" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  script: <path d="M6 5.5h12M6 10h12M6 14.5h8M6 19h5" />,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" strokeLinejoin="round" />,
  tag: <><path d="M4 11.5V5a1 1 0 0 1 1-1h6.5l8.5 8.5-7.5 7.5z" strokeLinejoin="round" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  trash: <path d="M5 7h14M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5" strokeLinejoin="round" />,
  design: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2a3.9 3.9 0 0 0 3.9-3.9C20.5 6.9 16.7 3.5 12 3.5z" strokeLinejoin="round" /><circle cx="7.6" cy="11.4" r="1.1" /><circle cx="10.2" cy="7.6" r="1.1" /><circle cx="14.8" cy="7.6" r="1.1" /></>,
  picture: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" strokeLinejoin="round" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinejoin="round" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4.5 4.5" /></>,
  reply: <><path d="M9.5 7 5 11.5 9.5 16" strokeLinejoin="round" /><path d="M5.5 11.5h8a5 5 0 0 1 5 5V18" /></>,
  storyboard: <><rect x="3.5" y="8" width="7.5" height="6.5" rx="1" /><rect x="13" y="8" width="7.5" height="6.5" rx="1" /><path d="M5 18h4M14.5 18h4" /><path d="M14 3.5h5.5a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-3.5l-2 1.5z" strokeLinejoin="round" /></>,
  person: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>,
  unlock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 6.8-1.2" /></>,
};

export function UiIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

// An icon-only button with a quick tooltip. The label is also read by screen readers.
export function IconBtn({ icon, label, active, className = '', badge, ...rest }: { icon: string; label: string; active?: boolean; badge?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} aria-label={label} data-tip={label} aria-pressed={active ?? undefined} className={'icon-tool' + (active ? ' on' : '') + (className ? ' ' + className : '')}>
      <UiIcon name={icon} />
      {badge}
    </button>
  );
}

// The same look for a link (to another page) or an outside address.
export function IconLink({ icon, label, to, href, badge, active }: { icon: string; label: string; to?: string; href?: string; badge?: ReactNode; active?: boolean }) {
  const cls = 'icon-tool' + (active ? ' on' : '');
  const inner = (
    <>
      <UiIcon name={icon} />
      {badge}
    </>
  );
  return href ? (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} data-tip={label}>
      {inner}
    </a>
  ) : (
    <Link className={cls} to={to ?? '/'} aria-label={label} data-tip={label}>
      {inner}
    </Link>
  );
}

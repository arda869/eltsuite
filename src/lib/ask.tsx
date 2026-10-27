import { useEffect, useRef, useState, type ReactNode } from 'react';
import { installImeGuard } from './keys';
import { ShortcutsHost } from '../components/Shortcuts';

// Every page loads this file: the keys typed with an input method never act half-way through a word.
installImeGuard();

// The app's own "are you sure?", notice and question boxes, in place of the browser's grey ones.
// ask() resolves true or false, tell() when it is closed, askText() with the text or null.

type Req = { kind: 'ask' | 'tell' | 'text'; message: string; ok: string; cancel: string; danger: boolean; value: string; resolve: (v: unknown) => void };
type Opts = { ok?: string; cancel?: string; danger?: boolean; title?: string };

let push: ((r: Req) => void) | null = null;
const queue: Req[] = [];

const VERBS: [RegExp, string][] = [
  [/^delete\b/i, 'Delete'],
  [/^remove\b/i, 'Remove'],
  [/^clear\b/i, 'Clear'],
  [/^leave\b/i, 'Leave'],
  [/^archive\b/i, 'Archive'],
  [/^stop sharing\b/i, 'Stop sharing'],
  [/^stop being colleagues\b/i, 'Stop'],
  [/^submit\b/i, 'Submit'],
  [/^give\b/i, 'Give a new PIN'],
  [/^replace\b/i, 'Replace'],
];
const DANGER = /^(delete|remove|clear|leave|stop)\b/i;

function open(r: Omit<Req, 'resolve'>) {
  return new Promise<unknown>((resolve) => {
    const req = { ...r, resolve };
    if (push) push(req);
    else queue.push(req);
  });
}

export function ask(message: string, o: Opts = {}) {
  const verb = VERBS.find(([re]) => re.test(message))?.[1];
  return open({ kind: 'ask', message, ok: o.ok ?? verb ?? 'OK', cancel: o.cancel ?? 'Cancel', danger: o.danger ?? DANGER.test(message), value: '' }) as Promise<boolean>;
}
export function tell(message: string) {
  return open({ kind: 'tell', message, ok: 'OK', cancel: '', danger: false, value: '' }) as Promise<void>;
}
// Closing a window by a click outside it or Escape: if something was typed, ask first.
export async function closeUnlessTyped(typed: boolean, close: () => void) {
  if (!typed || (await ask('Discard what you typed?', { ok: 'Discard', cancel: 'Keep writing', danger: true }))) close();
}
// A click on the dark backdrop itself, not a text selection that ended there.
export function onBackdrop(close: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent) => ((e.currentTarget as HTMLElement).dataset.down = e.target === e.currentTarget ? '1' : ''),
    onClick: (e: React.MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      // Escape (components/EscapeToClose) sends a click with no mouse down first: that counts too.
      if (e.target === el && (el.dataset.down === '1' || e.detail === 0)) close();
      el.dataset.down = '';
    },
  };
}
export function askText(message: string, value = '', o: Opts = {}) {
  return open({ kind: 'text', message, ok: o.ok ?? 'OK', cancel: o.cancel ?? 'Cancel', danger: false, value }) as Promise<string | null>;
}

export function AskHost() {
  const [list, setList] = useState<Req[]>([]);
  useEffect(() => {
    push = (r) => setList((l) => [...l, r]);
    if (queue.length) setList((l) => [...l, ...queue.splice(0)]);
    return () => void (push = null);
  }, []);
  const cur = list[0];
  // Where the cursor was before the box opened: it goes back there when the box closes.
  const back = useRef<HTMLElement | null>(null);
  if (cur && !back.current) back.current = document.activeElement as HTMLElement | null;
  const done = (v: unknown) => {
    cur.resolve(v);
    setList((l) => {
      const next = l.slice(1);
      if (!next.length) {
        const el = back.current;
        back.current = null;
        window.setTimeout(() => el?.isConnected && el.focus({ preventScroll: true }), 0);
      }
      return next;
    });
  };
  return (
    <>
      <ShortcutsHost />
      {cur && <AskBox key={list.length + cur.message} r={cur} done={done} />}
    </>
  );
}

// A small drawing for what the box is about.
const ICONS: Record<string, ReactNode> = {
  trash: <path d="M4 7h16M9 7V4.8h6V7M6.5 7l.8 12.2h9.4L17.5 7M10 11v5M14 11v5" />,
  leave: <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10" />,
  archive: <path d="M4 5h16v4H4zM5.5 9v9.5h13V9M10 13h4" />,
  send: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.1" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  question: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.5M12 17v.1" />,
};
function iconFor(r: Req) {
  if (r.kind === 'tell') return 'info';
  if (r.kind === 'text') return 'pen';
  if (/^(delete|remove|clear)\b/i.test(r.message)) return 'trash';
  if (/^(leave|stop)\b/i.test(r.message)) return 'leave';
  if (/^archive\b/i.test(r.message)) return 'archive';
  if (/^submit\b/i.test(r.message)) return 'send';
  return 'question';
}

function AskBox({ r, done }: { r: Req; done: (v: unknown) => void }) {
  const [text, setText] = useState(r.value);
  const okRef = useRef<HTMLButtonElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const no = () => done(r.kind === 'ask' ? false : r.kind === 'text' ? null : undefined);
  const yes = () => done(r.kind === 'ask' ? true : r.kind === 'text' ? text : undefined);
  // Focus once, when it opens (not on every key typed).
  useEffect(() => {
    if (r.kind === 'text') inRef.current?.select();
    else okRef.current?.focus();
  }, [r]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault(), e.stopPropagation(), no();
    };
    // Capture: the box is on top of everything, so Escape closes it and nothing underneath.
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // A question in the message (before the first "?") is the heading; the rest explains.
  const m = /^(.*?[?.!])\s+(.+)$/s.exec(r.message);
  const head = m && m[1].length < 90 ? m[1] : r.message;
  const rest = m && m[1].length < 90 ? m[2] : /^delete\b/i.test(r.message) ? 'You can’t undo this.' : '';
  return (
    <div className="scrim ask-scrim" onMouseDown={(e) => e.target === e.currentTarget && no()}>
      <div className={'dialog ask' + (r.danger ? ' danger' : '')} role={r.kind === 'tell' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={head}>
        <span className={'ask-ic ic-' + iconFor(r)} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[iconFor(r)]}
          </svg>
        </span>
        <p className="ask-head">{head}</p>
        {rest && <p className="ask-rest">{rest}</p>}
        {r.kind === 'text' && <input ref={inRef} className="ask-input" aria-label={head} enterKeyHint="done" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), yes())} />}
        <span className="ask-acts">
          {r.kind !== 'tell' && (
            <button type="button" className="btn" onClick={no}>
              {r.cancel}
            </button>
          )}
          <button ref={okRef} type="button" className={'btn primary' + (r.danger ? ' danger-btn' : '')} onClick={yes}>
            {r.ok}
          </button>
        </span>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { keyLabel, typingIn } from '../lib/keys';

// One "Keyboard shortcuts" panel for the whole app: ? (when not typing) or Ctrl+/ (⌘/ on a Mac)
// anywhere. It lists what works where, with the keys of this computer, and opens on the place
// you are in. Mounted once, by AskHost. openShortcuts() opens it from a menu.

type Row = [keys: string[], what: string];
type Place = { id: string; title: string; note?: string; rows: Row[] };

const PLACES: Place[] = [
  {
    id: 'writing',
    title: 'Writing',
    note: 'Lessons, documents, notes, PD reading notes and messages.',
    rows: [
      [['Mod+B'], 'Bold'],
      [['Mod+I'], 'Italic'],
      [['Mod+U'], 'Underline'],
      [['Mod+Shift+S'], 'Strikethrough'],
      [['Mod+Shift+8'], 'Bulleted list'],
      [['Mod+Shift+7'], 'Numbered list'],
      [['Tab', 'Shift+Tab'], 'Indent or outdent a list item'],
      [['Shift+Enter'], 'New line in the same paragraph'],
      [['Mod+Z'], 'Undo'],
      [['Mod+Shift+Z', 'Mod+Y'], 'Redo'],
      [['Mod+Shift+V'], 'Paste as plain text'],
      [['Mod+K'], 'Link the selected words (lessons and documents)'],
      [['Alt+Up', 'Alt+Down'], 'Move the paragraph or box up or down (lessons and documents)'],
    ],
  },
  {
    id: 'insert',
    title: 'Adding and tagging',
    rows: [
      [['/'], 'Add a question, list, picture or box, then type to find it'],
      [['@'], 'Tag someone'],
      [['Up', 'Down'], 'Move in the list'],
      [['Enter'], 'Choose'],
      [['Esc'], 'Close the list'],
    ],
  },
  {
    id: 'messages',
    title: 'Messages and comments',
    rows: [
      [['Enter'], 'Send or post: messages, discussions, boards and comments (in Messages unless you turned it off in Settings)'],
      [['Shift+Enter'], 'New line'],
      [['Mod+Enter'], 'Send a message with formatting on'],
    ],
  },
  {
    id: 'teaching',
    title: 'Teaching a lesson',
    note: 'While teaching, when you are not typing.',
    rows: [
      [['Left', 'Right'], 'Previous or next task (moves the class when synced)'],
      [['S'], 'Sync the class to you, or stop'],
      [['R'], 'Reveal the next answer (again at the end to hide)'],
      [['Shift+R'], 'Reveal all answers, or hide them'],
      [['H'], 'Hide or show this task'],
      [['L'], 'Lock or unlock this task'],
      [['C'], 'Show or hide the class panel'],
      [['N'], 'Teacher notes'],
      [['T'], 'Start a timer, or stop it'],
      [['A'], 'New announcement'],
      [['F'], 'Full screen, or back'],
      [['Mod+Shift+P'], 'Preview as a learner'],
    ],
  },
  {
    id: 'menus',
    title: 'Menus and drop-downs',
    rows: [
      [['Up', 'Down'], 'Move'],
      [['Home', 'End'], 'First or last'],
      [['Enter'], 'Choose'],
      [['Esc'], 'Close, and go back to where you were'],
      [['A–Z'], 'Jump to an item, or type to find in long lists'],
    ],
  },
  {
    id: 'calls',
    title: 'Calls',
    note: 'When you are not typing.',
    rows: [
      [['Mod+D'], 'Microphone on or off'],
      [['Mod+E'], 'Camera on or off'],
    ],
  },
  {
    id: 'sound',
    title: 'Sound editor',
    note: 'Press ? in the sound editor for all of its keys.',
    rows: [
      [['Space'], 'Play or pause'],
      [['Mod+Z'], 'Undo'],
      [['Mod+B'], 'Split at the playhead'],
      [['Mod+S'], 'Save'],
    ],
  },
  {
    id: 'everywhere',
    title: 'Everywhere',
    rows: [
      [['?', 'Mod+/'], 'Show these shortcuts'],
      [['Esc'], 'Close the menu or window on top'],
    ],
  },
];

// A page can say which place to open on: <html data-keys="teaching">.
function hereFirst(): string {
  const set = document.documentElement.dataset.keys;
  if (set && PLACES.some((x) => x.id === set)) return set;
  const p = window.location.pathname;
  if (p.includes('/lesson/')) return 'writing';
  if (p.startsWith('/messages')) return 'messages';
  return 'writing';
}

let opener: ((place?: string) => void) | null = null;
export function openShortcuts(place?: string) {
  opener?.(place);
}

export function ShortcutsHost() {
  const [open, setOpen] = useState<string | null>(null);
  const back = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    opener = (place) => {
      back.current = document.activeElement as HTMLElement | null;
      setOpen(place ?? hereFirst());
    };
    const key = (e: KeyboardEvent) => {
      // A place with keys of its own (the sound editor) answers first.
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const slash = mod && !e.altKey && (e.key === '/' || e.code === 'Slash');
      const question = e.key === '?' && !mod && !e.altKey && !typingIn(e.target);
      if (!slash && !question) return;
      e.preventDefault();
      setOpen((o) => {
        if (o) return null;
        back.current = document.activeElement as HTMLElement | null;
        return hereFirst();
      });
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      opener = null;
    };
  }, []);
  const close = () => {
    setOpen(null);
    const el = back.current;
    back.current = null;
    window.setTimeout(() => el?.isConnected && el.focus({ preventScroll: true }), 0);
  };
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('.sc-close')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab' && box.current) {
        // Keep Tab inside the panel.
        const f = Array.from(box.current.querySelectorAll<HTMLElement>('button, [tabindex="0"]'));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
        else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const first = PLACES.find((p) => p.id === open);
  const order = first ? [first, ...PLACES.filter((p) => p !== first)] : PLACES;
  return (
    <div className="scrim sc-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className="dialog sc-panel" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <div className="sc-head">
          <h2 id="sc-title">Keyboard shortcuts</h2>
          <button type="button" className="btn sc-close" onClick={close}>
            Close
          </button>
        </div>
        <div className="sc-cols" tabIndex={0} aria-label="Shortcuts by place">
          {order.map((p) => (
            <section key={p.id} className="sc-place" aria-labelledby={'sc-' + p.id}>
              <h3 id={'sc-' + p.id}>{p.title}</h3>
              {p.note && <p className="hint">{p.note}</p>}
              <dl>
                {p.rows.map(([keys, what]) => (
                  <div key={what} className="sc-row">
                    <dt>
                      {keys.map((k, i) => (
                        <span key={k} className="sc-keys">
                          {i > 0 && <span className="sc-or">or</span>}
                          <kbd>{keyLabel(k)}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

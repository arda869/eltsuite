import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UiIcon } from '../../components/UiIcon';
import { MAX_SHOTS, toShot, type NewShot } from '../../lib/tickets';
import { plural } from './ui';

// Screenshots: pasted while the form is open, dropped on it, or chosen from the computer. Where two
// forms are open at once, each sits in its own [data-paste] area and takes only what is pasted there.
export function ShotPicker({ shots, setShots }: { shots: NewShot[]; setShots: (f: (s: NewShot[]) => NewShot[]) => void }) {
  const [working, setWorking] = useState(0);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const room = MAX_SHOTS - shots.length - working;
  const add = useCallback(
    async (files: File[]) => {
      const pics = files.filter((f) => f.type.startsWith('image/'));
      if (!pics.length) return;
      setErr('');
      const take = pics.slice(0, Math.max(0, room));
      if (take.length < pics.length) setErr(`A ticket can have ${MAX_SHOTS} screenshots.`);
      setWorking((n) => n + take.length);
      for (const f of take) {
        try {
          const s = await toShot(f);
          setShots((list) => [...list, s].slice(0, MAX_SHOTS));
        } catch {
          setErr('We couldn’t read one picture. Try a PNG or JPEG.');
        }
        setWorking((n) => n - 1);
      }
    },
    [room, setShots],
  );
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      const zone = root.current?.closest('[data-paste]') ?? null;
      const target = e.target instanceof Element ? e.target.closest('[data-paste]') : null;
      if (zone ? target !== zone : target) return;
      e.preventDefault();
      void add(files);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [add]);
  const [big, setBig] = useState<string | null>(null);
  return (
    <div
      ref={root}
      className={'hq-tk-shots' + (over ? ' over' : '')}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => (e.preventDefault(), setOver(false), void add([...e.dataTransfer.files]))}
    >
      <div className="hq-tk-thumbs">
        {shots.map((s, i) => (
          <span key={i} className="hq-tk-thumb">
            <button type="button" className="hq-tk-pic" aria-label={`Screenshot ${i + 1}, bigger`} onClick={() => setBig(s.data)}>
              <img src={s.data} alt="" />
            </button>
            <button type="button" className="hq-tk-x" aria-label={`Remove screenshot ${i + 1}`} onClick={() => setShots((list) => list.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        {Array.from({ length: working }, (_, i) => (
          <span key={'w' + i} className="hq-tk-thumb wait" aria-label="Adding a screenshot" />
        ))}
        {room > 0 && (
          <button type="button" className="hq-tk-add" onClick={() => input.current?.click()}>
            <UiIcon name="picture" size={18} />
            <span>{shots.length ? 'Add more' : 'Add screenshots'}</span>
          </button>
        )}
      </div>
      <span className="hint">Paste with Ctrl+V or ⌘V, drop pictures here, or choose them. {plural(MAX_SHOTS, 'screenshot')} at most.</span>
      {err && (
        <span className="hint hq-tk-err" role="alert">
          {err}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  );
}

// One screenshot, as big as the screen allows. Escape closes it and nothing behind it.
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return createPortal(
    <div className="hq-scrim center hq-tk-big" role="dialog" aria-modal="true" aria-label="Screenshot" onMouseDown={onClose}>
      <img src={src} alt="Screenshot" />
      <button type="button" className="hq-drawer-x" aria-label="Close" onClick={onClose} autoFocus>
        ×
      </button>
    </div>,
    document.body,
  );
}

export function Shots({ list }: { list: { id: string; data: string }[] }) {
  const [big, setBig] = useState<string | null>(null);
  if (!list.length) return null;
  return (
    <div className="hq-tk-thumbs">
      {list.map((s, i) => (
        <button key={s.id} type="button" className="hq-tk-pic" aria-label={`Screenshot ${i + 1}, bigger`} onClick={() => setBig(s.data)}>
          <img src={s.data} alt="" />
        </button>
      ))}
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  );
}

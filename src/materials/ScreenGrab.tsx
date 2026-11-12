import { useEffect, useRef, useState } from 'react';
import { UiIcon } from '../components/UiIcon';

// "Take a screenshot", on a computer: the teacher chooses a screen or window to share, has three
// seconds to bring the material into view, and then drags a rectangle over the picture taken. The
// part they choose comes back as a PNG file, as if they had pasted it.

export const canGrabScreen = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

type Rect = { x: number; y: number; w: number; h: number };

export function ScreenGrabButton({ onGrab, disabled }: { onGrab: (file: File) => void; disabled?: boolean }) {
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  if (!canGrabScreen()) return null;
  const start = async () => {
    setError('');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return; // the teacher closed the browser's sharing window: nothing to say
    }
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      // Three seconds to switch to the window with the material in it.
      for (let n = 3; n > 0; n--) {
        setCount(n);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCount(0);
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      setShot(c);
    } catch {
      setCount(0);
      setError('We couldn’t take that screenshot. Try again, or paste one instead.');
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  };
  return (
    <>
      <button type="button" className="btn" disabled={disabled || count > 0} onClick={() => void start()}>
        <UiIcon name="fullscreen" size={17} /> {count > 0 ? `Taking it in ${count}…` : 'Take a screenshot'}
      </button>
      {error && <span className="hint">{error}</span>}
      {count > 0 && (
        <div className="sg-count" role="status" aria-live="assertive">
          <span>{count}</span>
          <small>Bring the material into view</small>
        </div>
      )}
      {shot && (
        <CropShot
          shot={shot}
          onCancel={() => setShot(null)}
          onDone={(file) => {
            setShot(null);
            onGrab(file);
          }}
        />
      )}
    </>
  );
}

// The picture taken, full size: drag a rectangle round the part to import.
function CropShot({ shot, onCancel, onDone }: { shot: HTMLCanvasElement; onCancel: () => void; onDone: (file: File) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [url] = useState(() => shot.toDataURL('image/png'));
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onCancel());
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onCancel]);
  const at = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const use = (whole: boolean) => {
    const el = img.current!;
    const k = shot.width / el.clientWidth;
    const r = whole || !rect || rect.w < 8 || rect.h < 8 ? { x: 0, y: 0, w: el.clientWidth, h: el.clientHeight } : rect;
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * k);
    c.height = Math.round(r.h * k);
    c.getContext('2d')!.drawImage(shot, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onDone(new File([b], 'Screenshot.png', { type: 'image/png' })), 'image/png');
  };
  return (
    <div className="sg-scrim" role="dialog" aria-modal="true" aria-label="Choose the part to import">
      <div className="sg-bar">
        <strong>Drag a rectangle round the part to import</strong>
        <span className="sg-acts">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={() => use(true)}>Use all of it</button>
          <button type="button" className="btn primary" disabled={!rect || rect.w < 8 || rect.h < 8} onClick={() => use(false)}>Use this part</button>
        </span>
      </div>
      <div className="sg-stage">
        <div
          className="sg-pic"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = at(e);
            setRect({ ...drag.current, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const p = at(e);
            const s = drag.current;
            setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <img ref={img} src={url} alt="The screenshot you took" draggable={false} />
          {rect && rect.w > 0 && <span className="sg-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
        </div>
      </div>
    </div>
  );
}

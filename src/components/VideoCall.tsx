import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UiIcon } from './UiIcon';
import type { ClassDoc } from '../lib/classes';
import { setActivity } from '../lib/status';

// The class's video room, inside ELT Suite: a panel beside the lesson, or the whole screen.
// Teachers join as hosts (mute, remove, share the screen); learners join by name.
type Size = 'side' | 'full';
export function VideoCall({ c, name, teacher, onClose }: { c: ClassDoc; name: string; teacher?: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>('side');
  const [err, setErr] = useState('');
  useEffect(() => {
    let frame: { destroy: () => Promise<void>; on: (e: string, f: () => void) => void } | null = null;
    let dead = false;
    setActivity({ call: true });
    void (async () => {
      try {
        const token = teacher ? ((await getDoc(doc(db, 'classes', c.id, 'video', 'host')).catch(() => null))?.data()?.token as string | undefined) : undefined;
        const Daily = (await import('@daily-co/daily-js')).default;
        if (dead || !box.current || !c.video?.url) return;
        frame = Daily.createFrame(box.current, { showLeaveButton: true, showFullscreenButton: false, iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '14px' } }) as unknown as typeof frame;
        frame!.on('left-meeting', () => onClose());
        await (frame as unknown as { join: (o: object) => Promise<unknown> }).join({ url: c.video.url, userName: name, ...(token ? { token } : {}) });
      } catch (e) {
        console.error(e);
        setErr('The video room could not be opened. Check your connection, then try again.');
      }
    })();
    return () => {
      setActivity({ call: null });
      dead = true;
      void frame?.destroy();
    };
  }, [c.id, c.video?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className={'vc vc-' + size} role="dialog" aria-label={`Video: ${c.name}`}>
      <header className="vc-bar">
        <span className="vc-live" aria-hidden="true" />
        <b>{c.name}</b>
        <span style={{ flex: 1 }} />
        <button type="button" className="dp-ib" onClick={() => setSize(size === 'side' ? 'full' : 'side')} aria-label={size === 'side' ? 'Whole screen' : 'Beside the lesson'} data-tip={size === 'side' ? 'Whole screen' : 'Beside the lesson'}>
          <UiIcon name={size === 'side' ? 'fullscreen' : 'fullscreenOff'} size={15} />
        </button>
        <button type="button" className="dp-ib" onClick={onClose} aria-label="Leave the call" data-tip="Leave the call">
          ×
        </button>
      </header>
      {err ? <p className="hint vc-err">{err}</p> : <div className="vc-frame" ref={box} />}
    </div>,
    document.body,
  );
}

// The button that opens it: shown once the class has its room.
export function VideoButton({ c, name, teacher }: { c: ClassDoc; name: string; teacher?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!c.video?.url) return teacher ? <span className="hint vc-soon" data-tip="Each class gets its own video room within a few minutes of being created.">Video room on its way</span> : null;
  return (
    <>
      <button type="button" className="btn small-btn vc-join" onClick={() => setOpen(true)}>
        <UiIcon name="video" size={15} /> {teacher ? 'Start video' : 'Join video'}
      </button>
      {open && <VideoCall c={c} name={name} teacher={teacher} onClose={() => setOpen(false)} />}
    </>
  );
}

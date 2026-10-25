import { useEffect, useState, type RefObject } from 'react';
import type { Pointer } from '../lib/session';

// The teacher's laser pointer, shown on the same word at any text size.
export function PointerDot({ pointer, taskId, container }: { pointer: Pointer | null; taskId: string; container: RefObject<HTMLElement> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      const root = container.current;
      if (pointer?.on && pointer.taskId === taskId && root) {
        const el = root.querySelector(`[data-bk="${CSS.escape(pointer.bk)}"]`) as HTMLElement | null;
        if (el) {
          const r = el.getBoundingClientRect();
          setPos({ x: r.left + pointer.x * r.width, y: r.top + pointer.y * r.height });
        } else setPos(null);
      } else setPos(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pointer, taskId, container]);
  if (!pos || !pointer) return null;
  const idle = now - pointer.t;
  const opacity = idle < 2000 ? 1 : Math.max(0, 1 - (idle - 2000) / 600);
  if (opacity <= 0) return null;
  return <span className="laser" style={{ left: pos.x, top: pos.y, opacity }} aria-hidden="true" />;
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// One tooltip for every element with data-tip. It floats above everything (so boxes with
// hidden overflow never cut it off), appears after a short pause, and stays on screen.
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number>();
  const current = useRef<Element | null>(null);
  useEffect(() => {
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 48;
      setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 12), window.innerWidth - 12), y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tip], button[title], a[title], [role="tab"][title], label[title], select[title]') as HTMLElement | null;
      // Buttons with a plain title get the same tooltip (and no slow browser one on top).
      if (el && el.title) {
        el.dataset.tip = el.title;
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', el.title);
        el.removeAttribute('title');
      }
      if (el === current.current) return;
      current.current = el;
      window.clearTimeout(timer.current);
      setTip(null);
      if (el) timer.current = window.setTimeout(() => show(el), 280);
    };
    const hide = () => {
      current.current = null;
      window.clearTimeout(timer.current);
      setTip(null);
    };
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el && (el as HTMLElement).matches(':focus-visible')) show(el);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
    };
  }, []);
  // Keep the whole tooltip on screen: a button at the edge of the window gets its tooltip moved inwards.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const half = el.offsetWidth / 2;
    el.style.left = Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8) + 'px';
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={box} className={'tip-float' + (tip.below ? ' below' : '')} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}

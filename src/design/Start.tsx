import { useEffect, useRef } from 'react';
import { ensureFont, SIZES, type El } from './model';
import { drawPage } from './render';
import { TEMPLATES, type Tpl } from './templates';

// A new design: what to start with.
function Thumb({ t }: { t: Tpl }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const p = { id: 'p', order: 0, ...t.pages[0].p };
    const s = 220 / Math.max(p.w, p.h);
    c.width = Math.round(p.w * s * 2);
    c.height = Math.round(p.h * s * 2);
    const els = t.pages[0].els.map((e, i) => ({ ...e, id: 'e' + i, page: 'p', z: i }) as El);
    void Promise.all([...new Set(els.map((e) => e.font).filter(Boolean) as string[])].map(ensureFont)).then(() => drawPage(c.getContext('2d')!, p, els, { imgs: new Map(), view: 'A', accent: '#c8764a', editing: true }, s * 2));
  }, [t]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export function StartScreen({ onPick }: { onPick: (t: Tpl) => void }) {
  return (
    <div className="dz-start">
      <div className="dz-start-in">
        <p className="dz-kicker">Designer</p>
        <h1>Choose your image canvas</h1>
        <p className="dz-start-sub">Upload a picture or create one with AI after choosing a canvas.</p>
        <div className="dz-start-grid">
          {TEMPLATES.map((t) => (
            <button key={t.k} type="button" className="dz-start-card" onClick={() => onPick(t)}>
              <span className="dz-start-f">
                <Thumb t={t} />
              </span>
              <strong>{t.name}</strong>
              <span>{t.about}</span>
            </button>
          ))}
        </div>
        <h2>Or a blank page</h2>
        <div className="dz-start-sizes">
          {SIZES.filter(s=>['square','slide','story','banner'].includes(s.k)).map((s) => (
            <button key={s.k} type="button" onClick={() => onPick({ k: s.k, name: s.name, about: '', pages: [{ p: { w: s.w, h: s.h, bg: '#ffffff' }, els: [] }] })}>
              <span className="dz-size-sh" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
              <strong>{s.name}</strong>
              <em>{s.about}</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

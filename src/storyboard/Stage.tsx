import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BUBBLES, PersonArt, Sketch, THINGS } from './art';

// A storyboard scene: pictures, speech bubbles and labels placed on a stage of 960 × 540, each one
// moved, sized, turned, tilted, flipped and rotated to fit the scene.

export const STAGE = { w: 960, h: 540 };
export type SbKind = 'person' | 'thing' | 'bubble';
export type SbItem = {
  id: string;
  scene: string;
  t: SbKind;
  ref: string; // the person, the thing or the kind of bubble
  pose?: string;
  face?: string;
  x: number;
  y: number;
  w: number;
  h?: number; // bubbles only: people and things keep their own shape
  rot?: number; // degrees, flat on the page
  turn?: number; // degrees, turned away from you (left or right), for perspective
  tilt?: number; // degrees, tipped back or forward
  flip?: boolean;
  z?: number;
  text?: string;
};
export type SbScene = { id: string; order: number; caption?: string; bg?: 'white' | 'grey' | 'tint' | 'floor' };

export const heightOf = (i: SbItem) => (i.t === 'person' ? i.w * 1.5 : i.t === 'thing' ? i.w : i.h ?? i.w * 0.56);

export function ItemArt({ i }: { i: SbItem }) {
  const h = heightOf(i);
  if (i.t === 'person')
    return (
      <svg viewBox="0 0 200 300" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
        <Sketch id={'sbp' + i.id}>
          <PersonArt who={i.ref} p={i.pose} face={i.face} />
        </Sketch>
      </svg>
    );
  if (i.t === 'thing')
    return (
      <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
        <Sketch id={'sbt' + i.id}>{(THINGS[i.ref] ?? THINGS.table).draw()}</Sketch>
      </svg>
    );
  const b = BUBBLES[i.ref] ?? BUBBLES.speech;
  const tail = i.ref === 'speech' || i.ref === 'whisper' || i.ref === 'thought' || i.ref === 'label' ? 26 : 0;
  return (
    <svg viewBox={`-6 -6 ${i.w + 12} ${h + 12}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <Sketch id={'sbb' + i.id}>{b.draw(i.w, h - tail)}</Sketch>
    </svg>
  );
}

// Where an item sits and how it is turned.
export function itemStyle(i: SbItem): { outer: CSSProperties; art: CSSProperties } {
  const h = heightOf(i);
  return {
    outer: { left: i.x, top: i.y, width: i.w, height: h, zIndex: i.z ?? 1, transform: i.rot ? `rotate(${i.rot}deg)` : undefined },
    art: { transform: `perspective(900px) rotateY(${i.turn ?? 0}deg) rotateX(${i.tilt ?? 0}deg)${i.flip ? ' scaleX(-1)' : ''}` },
  };
}

const BG: Record<string, string> = { white: '#fff', grey: '#f1efeb', tint: 'color-mix(in srgb, var(--sb-accent, #d98f63) 10%, white)', floor: '#fff' };

// A scene, at any size: the stage is drawn at 960 × 540 and scaled to the width it is given.
export function SceneView({ scene, items, width, children, onBackground }: { scene: SbScene; items: SbItem[]; width: number; children?: (i: SbItem) => ReactNode; onBackground?: () => void }) {
  const k = width / STAGE.w;
  return (
    <div className="sb-scene" style={{ width, height: STAGE.h * k }}>
      <div className="sb-stage" style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${k})`, background: BG[scene.bg ?? 'white'] }} onPointerDown={(e) => e.target === e.currentTarget && onBackground?.()}>
        {scene.bg === 'floor' && <div className="sb-floor" aria-hidden="true" />}
        {[...items]
          .sort((a, b) => (a.z ?? 1) - (b.z ?? 1))
          .map((i) =>
            children ? (
              children(i)
            ) : (
              <div key={i.id} className={'sb-item t-' + i.t} style={itemStyle(i).outer}>
                <div className="sb-art" style={itemStyle(i).art}>
                  <ItemArt i={i} />
                </div>
                {i.t === 'bubble' && <div className="sb-text">{i.text}</div>}
              </div>
            ),
          )}
      </div>
    </div>
  );
}

// A scene drawn with its own inline styles only, so it looks the same in a lesson, a message, a
// Collab document and on the printed worksheet (where the app's stylesheet is not loaded).
const TEXT: Record<string, CSSProperties> = {
  speech: {},
  thought: {},
  whisper: { fontStyle: 'italic' },
  shout: { fontWeight: 700, fontSize: 20, textTransform: 'uppercase', left: 30, right: 30, top: 22, bottom: 22 },
  caption: { font: '600 18px/1.3 Karla, var(--sans, sans-serif)' },
  label: { font: '600 18px Karla, var(--sans, sans-serif)' },
};
export function SceneStill({ scene, items, width }: { scene: SbScene; items: SbItem[]; width: number | 'fluid' }) {
  const stage = (inner: CSSProperties) => (
      <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, overflow: 'hidden', background: BG[scene.bg ?? 'white'], ...inner }}>
        {scene.bg === 'floor' && <div style={{ position: 'absolute', left: 0, right: 0, top: 470, bottom: 0, background: 'linear-gradient(#f1efeb, #e9e6e1)', borderTop: '2.5px solid #3b3833' }} />}
        {[...items]
          .sort((a, b) => (a.z ?? 1) - (b.z ?? 1))
          .map((i) => {
            const st = itemStyle(i);
            const tail = i.ref === 'caption' || i.ref === 'shout' ? 0 : 26;
            return (
              <div key={i.id} style={{ position: 'absolute', transformOrigin: '50% 50%', ...st.outer }}>
                <div style={{ width: '100%', height: '100%', transformOrigin: i.t === 'bubble' ? '50% 50%' : '50% 100%', ...st.art }}>
                  <ItemArt i={i} />
                </div>
                {i.t === 'bubble' && (
                  <div style={{ position: 'absolute', left: 14, right: 14, top: 10, bottom: tail, display: 'grid', placeItems: 'center', textAlign: 'center', font: '500 22px/1.25 Fraunces, WsFraunces, var(--serif, Georgia), serif', color: '#2b2a28', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...TEXT[i.ref] }}>{i.text}</div>
                )}
              </div>
            );
          })}
      </div>
  );
  // On paper the scene scales with the width it is given (a column, A5…), as a picture does.
  if (width === 'fluid')
    return (
      <div style={{ border: '0.6pt solid #d6d3cd', borderRadius: '1.2mm', overflow: 'hidden', background: '#fff' }}>
        <svg viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width="100%" style={{ display: 'block', height: 'auto' }}>
          <foreignObject x="0" y="0" width={STAGE.w} height={STAGE.h}>
            <div style={{ position: 'relative', width: STAGE.w, height: STAGE.h }}>{stage({})}</div>
          </foreignObject>
        </svg>
      </div>
    );
  const k = width / STAGE.w;
  return (
    <div style={{ position: 'relative', width, height: STAGE.h * k, overflow: 'hidden', borderRadius: 4, boxShadow: '0 0 0 1px #d6d3cd', background: '#fff' }}>
      {stage({ transform: `scale(${k})`, transformOrigin: '0 0' })}
    </div>
  );
}

// A storyboard as it is put into a lesson, a message or a document: its scenes, numbered, in rows,
// each with its caption. `cols` scenes a row; `width` is the whole width in px.
export type SbSnap = { scenes: SbScene[]; items: SbItem[] };
export function StoryStrip({ snap, cols = 2, width, title }: { snap: SbSnap; cols?: number; width: number | 'fluid'; title?: string }) {
  const gap = 12;
  const w = width === 'fluid' ? 'fluid' : Math.floor((width - gap * (cols - 1)) / cols);
  const scenes = [...(snap.scenes ?? [])].sort((a, b) => a.order - b.order);
  return (
    <figure className="sbw" style={{ margin: 0 }}>
      {title && <figcaption className="sbw-t">{title}</figcaption>}
      <div className="sbw-g" style={{ display: 'grid', gridTemplateColumns: w === 'fluid' ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(${cols}, ${w}px)`, gap: w === 'fluid' ? '3mm 4mm' : gap }}>
        {scenes.map((s, n) => (
          <div key={s.id} className="sbw-s" style={{ breakInside: 'avoid' }}>
            <div style={{ position: 'relative' }}>
              <SceneStill scene={s} items={(snap.items ?? []).filter((i) => i.scene === s.id)} width={w} />
              {scenes.length > 1 && <span className="sbw-n">{n + 1}</span>}
            </div>
            {s.caption && <p className="sbw-c">{s.caption}</p>}
          </div>
        ))}
      </div>
    </figure>
  );
}

// The same, as wide as the space it is in.
export function StoryStripFit(p: { snap: SbSnap; cols?: number; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setW(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // On a phone, one scene a row.
  const cols = w && w < 520 ? 1 : p.cols ?? 2;
  return <div ref={ref} className="sbw-fit" style={{ ['--sb-accent' as string]: 'var(--accent, #d98f63)' }}>{w > 0 && <StoryStrip {...p} cols={cols} width={w} />}</div>;
}

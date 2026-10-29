import type { CSSProperties, ReactNode } from 'react';
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

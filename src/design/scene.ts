import { PEOPLE, THINGS } from '../storyboard/art';
import { drawnOf } from '../storyboard/bounds';
import { sceneBox, sceneHorizon } from '../storyboard/scenes';
import type { DPage, El } from './model';

// A scene has a floor. Where something's feet are on that floor says how far away it is: nearer the
// bottom of the page is nearer to us, so it is drawn bigger, stands in front of things behind it and
// casts a small shadow where it meets the ground. Sizes come from real life (an adult is about
// 1.7 m; a chair 0.9 m), so a person, a table and a bus keep believable proportions without the
// teacher measuring anything. These rules only apply to things that stand on the ground (`ground`),
// and only until the teacher sizes one by hand (`fit`).

export const PERSON_M = 1.72; // an adult, in metres; children in the library are drawn smaller inside the same box
export const FOOT = { person: 286 / 300, picture: 0.985 }; // where the feet are, as a part of the box's height
export const PERSON_FILL = 216 / 300; // an adult's drawing, hair to shoes, as a part of the box's height

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// The backdrop is drawn to cover the page from the bottom (render.ts), so its floor line lands where
// this says on pages of any shape.
export function horizonY(page: Pick<DPage, 'w' | 'h' | 'horizon' | 'scene'>) {
  if (page.horizon != null) return page.h * page.horizon;
  const hz = sceneHorizon(page.scene);
  if (!page.scene || page.scene === 'plain') return page.h * hz;
  const s = Math.max(page.w / sceneBox.w, page.h / sceneBox.h);
  return page.h - (1 - hz) * sceneBox.h * s;
}

// Pixels for one metre at a foot position: a person at the very front is about 62% of the page's
// height; one standing right at the horizon about 26%.
export function metre(page: Pick<DPage, 'w' | 'h' | 'horizon' | 'scene'>, footY: number) {
  const hz = horizonY(page);
  const t = clamp((footY - hz) / Math.max(1, page.h - hz), 0, 1.2);
  const near = (page.h * 0.62) / PERSON_M;
  const far = (page.h * 0.26) / PERSON_M;
  return far + (near - far) * t;
}

// How tall something is in real life, in metres; the part of its box its feet are at; how much of the
// box's height its drawing fills; and the box's width to height.
export function realSize(e: Pick<El, 't' | 'art' | 'ref' | 'char' | 'iw' | 'ih'>): { m: number; foot: number; drawn: number; ratio: number } {
  if (e.t === 'art' && e.art === 'person') return { m: PERSON_M, foot: FOOT.person, drawn: PERSON_FILL, ratio: 200 / 300 };
  if (e.t === 'art') {
    const th = THINGS[e.ref ?? ''];
    const [, top, , bottom] = drawnOf(e.ref);
    return { m: th?.h ?? 0.8, foot: bottom, drawn: Math.max(0.2, bottom - top), ratio: 1 };
  }
  // A character from the library, or any picture with its feet at the bottom.
  return { m: PERSON_M, foot: FOOT.picture, drawn: FOOT.picture, ratio: e.iw && e.ih ? e.iw / e.ih : 2 / 3 };
}

export const footOf = (e: El) => e.y + e.h * realSize(e).foot;

// The box for something standing with its feet at footY, in page pixels.
export function sizeAt(e: Pick<El, 't' | 'art' | 'ref' | 'char' | 'iw' | 'ih'>, page: Pick<DPage, 'w' | 'h' | 'horizon' | 'scene'>, footY: number) {
  const { m, drawn, ratio } = realSize(e);
  let h = (m * metre(page, footY)) / drawn;
  h = clamp(h, 24, page.h * 1.6);
  const w = h * ratio;
  return { w: Math.round(w), h: Math.round(h) };
}

// Stands something at a point: the point is where its feet go. Things that float (a sun, a clock on
// the wall) are centred on the point instead and keep a sensible size.
export function standAt(e: Pick<El, 't' | 'art' | 'ref' | 'char' | 'iw' | 'ih'>, page: DPage, x: number, y: number, ground: boolean) {
  if (!ground) {
    const base = e.t === 'art' && e.art === 'person' ? { w: Math.round(page.h * 0.4 * (2 / 3)), h: Math.round(page.h * 0.4) } : { w: Math.round(page.h * 0.24), h: Math.round(page.h * 0.24) };
    return { x: Math.round(x - base.w / 2), y: Math.round(y - base.h / 2), w: base.w, h: base.h };
  }
  const footY = clamp(y, horizonY(page) + 6, page.h + 40);
  const s = sizeAt(e, page, footY);
  const { foot } = realSize(e);
  return { x: Math.round(x - s.w / 2), y: Math.round(footY - s.h * foot), w: s.w, h: s.h };
}

// Whether the library draws this thing standing on the ground.
export function standsOnGround(e: Pick<El, 't' | 'art' | 'ref' | 'char'>) {
  if (e.t === 'art' && e.art === 'person') return true;
  if (e.t === 'art') return !THINGS[e.ref ?? '']?.floats;
  return !!e.char;
}

// After a move: a grounded thing keeps its real size for its new distance (unless sized by hand),
// and things nearer the front come in front. Returns the changes to make.
export function settle(moved: El[], here: El[], page: DPage): Record<string, Partial<El>> {
  const out: Record<string, Partial<El>> = {};
  const next = new Map(here.map((e) => [e.id, e]));
  for (const e of moved) {
    if (!e.ground || e.fit || e.locked) continue;
    const footY = footOf(e);
    if (footY < horizonY(page) - 2) continue; // lifted off the floor: left alone
    const s = sizeAt(e, page, footY);
    if (Math.abs(s.h - e.h) < 2) continue;
    const { foot } = realSize(e);
    const cx = e.x + e.w / 2;
    const p = { w: s.w, h: s.h, x: Math.round(cx - s.w / 2), y: Math.round(footY - s.h * foot) };
    out[e.id] = p;
    next.set(e.id, { ...e, ...p });
  }
  // Depth order among the grounded things, keeping the z slots they already use between them.
  const grounded = [...next.values()].filter((e) => e.ground && !e.hidden).sort((a, b) => a.z - b.z);
  if (grounded.length > 1) {
    const slots = grounded.map((e) => e.z);
    const byDepth = [...grounded].sort((a, b) => footOf(a) - footOf(b) || a.z - b.z);
    byDepth.forEach((e, i) => {
      if (e.z !== slots[i]) out[e.id] = { ...(out[e.id] ?? {}), z: slots[i] };
    });
  }
  return out;
}

// A speech bubble for someone: above and to one side of their head, its tail towards them, sized to
// its words. The tail is on the bubble's left, so it flips when the bubble sits to the speaker's left.
export function bubbleFor(speaker: El, page: DPage, text = 'Hello.'): Partial<El> {
  // A library person's head starts about a quarter of the way down their box (children lower still);
  // a character picture's near the top.
  const drawnPerson = speaker.t === 'art' && speaker.art === 'person';
  const headX = speaker.x + speaker.w / 2;
  const headY = speaker.y + speaker.h * (drawnPerson ? 0.26 + (1 - personScale(speaker.ref)) * 0.7 : 0.08);
  const w = clamp(Math.round(page.w * 0.2 + Math.min(text.length, 60) * 3), 180, page.w * 0.42);
  const h = Math.round(w * 0.62);
  const right = headX + speaker.w * 0.4 + w < page.w - 16;
  const x = right ? Math.round(headX + speaker.w * 0.25) : Math.round(headX - speaker.w * 0.25 - w);
  const y = Math.round(clamp(headY - h, 12, page.h - h - 12));
  return { t: 'shape', shape: 'speech', x, y, w, h, fill: '#ffffff', stroke: '#262420', sw: 2.2, radius: 26, text, font: 'Fraunces', size: Math.round(clamp(page.h * 0.034, 16, 30)), align: 'center', valign: 'middle', color: '#262420', flipX: !right, name: 'Speech bubble' };
}

// The library's people, for sizing a new one before it exists.
export const personScale = (ref?: string) => PEOPLE[ref ?? '']?.scale ?? 1;

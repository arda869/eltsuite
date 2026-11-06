import { PEOPLE, THINGS } from '../storyboard/art';
import type { ArtView, DPage, El } from './model';
import { bubbleFor, footOf, horizonY, realSize, standAt } from './scene';
import type { Tpl, TplEl } from './templates';

// Ready-made scenes for speaking and storytelling: each is a 16:9 panel with a backdrop and people
// and things standing in it, sized and layered by where they stand (see scene.ts). They are also
// how the scene engine is checked: a café, a classroom, a family dinner, a bus stop and a story.

const W = 1280;
const H = 720;
type P = Omit<DPage, 'id' | 'order'>;
const panel = (scene: string, name: string, caption?: string): P => ({ w: W, h: H, bg: '#ffffff', scene, name, caption });
const pageOf = (p: P): DPage => ({ id: 'tpl', order: 0, ...p });

// Someone standing with their feet at (x, footY), as a part of the panel's width and height.
function person(p: P, who: string, fx: number, fy: number, o: { pose?: string; face?: string; view?: ArtView } = {}): TplEl {
  const el: Partial<El> & Pick<El, 't'> = { t: 'art', art: 'person', ref: who, pose: o.pose ?? 'stand', face: o.face ?? 'happy', view: o.view ?? 'front', name: PEOPLE[who]?.name ?? who, ground: true };
  return { ...el, ...standAt(el, pageOf(p), W * fx, H * fy, true) } as TplEl;
}
function thing(p: P, key: string, fx: number, fy: number, o: { view?: ArtView; scale?: number; stretch?: number; float?: boolean } = {}): TplEl {
  const th = THINGS[key];
  const ground = !o.float && !th?.floats;
  const el: Partial<El> & Pick<El, 't'> = { t: 'art', art: 'thing', ref: key, name: th?.name ?? key, ground, ...(o.view ? { view: o.view } : th?.views?.length ? { view: th.views[0] } : {}) };
  const box = standAt(el, pageOf(p), W * fx, H * fy, ground);
  // Some drawings fill less of their box than most (a table is low and wide), so a scene can scale
  // one, or stretch it sideways, and it then keeps that size when moved.
  if ((o.scale && o.scale !== 1) || (o.stretch && o.stretch !== 1)) {
    const w = Math.round(box.w * (o.scale ?? 1) * (o.stretch ?? 1));
    const h = Math.round(box.h * (o.scale ?? 1));
    const { foot } = realSize(el);
    return { ...el, x: Math.round(box.x + box.w / 2 - w / 2), y: ground ? Math.round(box.y + box.h * foot - h * foot) : Math.round(box.y + box.h / 2 - h / 2), w, h, fit: true } as TplEl;
  }
  return { ...el, ...box } as TplEl;
}
// Something resting on a surface whose top is at y, centred at x: sized for the surface's distance.
function onTable(p: P, key: string, x: number, y: number, m: number, tableFootY: number): TplEl {
  const el: Partial<El> & Pick<El, 't'> = { t: 'art', art: 'thing', ref: key, name: THINGS[key]?.name ?? key, ground: false };
  const stand = standAt({ t: 'art', art: 'thing', ref: key }, pageOf(p), x, tableFootY, true);
  const h = Math.round((stand.h * m) / (THINGS[key]?.h ?? 0.5)) || 24;
  const { foot } = realSize(el);
  return { ...el, x: Math.round(x - h / 2), y: Math.round(y - h * foot), w: h, h } as TplEl;
}
// The top surface of a table-like drawing, as a page y, and a point along its width.
const topOf = (t: TplEl, part: number) => t.y + t.h * part;
const along = (t: TplEl, part: number) => t.x + t.w * part;
function bubble(p: P, speaker: TplEl, text: string, kind: 'speech' | 'thought' = 'speech'): TplEl {
  const b = bubbleFor({ id: 'tpl', page: 'tpl', z: 0, ...speaker } as El, pageOf(p), text);
  return { ...b, shape: kind } as TplEl;
}
function caption(p: P, text: string): TplEl {
  const h = Math.round(p.h * 0.11);
  return { t: 'shape', shape: 'rect', x: Math.round(p.w * 0.04), y: p.h - h - Math.round(p.h * 0.03), w: Math.round(p.w * 0.92), h, fill: '#ffffff', stroke: '#262420', sw: 2, radius: 8, text, font: 'Fraunces', size: Math.round(p.h * 0.036), align: 'left', valign: 'middle', color: '#262420', name: 'Caption' };
}
// Standing things nearer the front come in front; words on top of everything.
function layered(list: TplEl[]): TplEl[] {
  const foot = (e: TplEl) => (e.ground ? footOf({ id: '', page: '', z: 0, ...e } as El) : e.t === 'shape' ? 1e6 : e.y + e.h);
  return [...list].sort((a, b) => foot(a) - foot(b));
}
// Rows of the floor: 0 is at the horizon, 1 at the bottom of the panel.
const rows = (p: P) => {
  const hz = horizonY(pageOf(p)) / H;
  return { hz, row: (fy: number) => hz + (1 - hz) * fy };
};

// A: a café. Two people at a table, facing each other, drinks between them.
const cafe = (): Tpl['pages'][number] => {
  const p = panel('cafe', 'At the café');
  const { row } = rows(p);
  const table = thing(p, 'cafetable', 0.5, row(0.6));
  const a = person(p, 'maya', 0.3, row(0.68), { view: 'tqr', pose: 'talk', face: 'happy' });
  const b = person(p, 'leo', 0.7, row(0.68), { view: 'tql', pose: 'hold', face: 'laugh' });
  const top = topOf(table, 0.3);
  const drinks = [onTable(p, 'coffee', along(table, 0.36), top, 0.13, H * row(0.6)), onTable(p, 'glass', along(table, 0.64), top, 0.15, H * row(0.6))];
  return { p, els: [...layered([thing(p, 'menu', 0.09, row(0.3)), thing(p, 'plant', 0.93, row(0.4)), a, b, table]), ...drinks, bubble(p, a, 'Would you like another coffee?')] };
};

// B: a classroom. The teacher by the board, learners at their desks.
const classroom = (): Tpl['pages'][number] => {
  const p = panel('classroom', 'In the classroom');
  const { row } = rows(p);
  const teacher = person(p, 'grace', 0.17, row(0.5), { view: 'tqr', pose: 'point', face: 'happy' });
  const desks = [thing(p, 'desk', 0.5, row(0.62)), thing(p, 'desk', 0.8, row(0.62)), thing(p, 'desk', 0.65, row(1.0))];
  const kids = [person(p, 'zoe', 0.5, row(0.56), { pose: 'sit', face: 'happy', view: 'tql' }), person(p, 'milo', 0.8, row(0.56), { pose: 'sit', face: 'surprised', view: 'tql' }), person(p, 'ivy', 0.65, row(0.94), { pose: 'sit', face: 'neutral', view: 'back' })];
  return { p, els: [...layered([teacher, ...desks, ...kids]), bubble(p, teacher, 'What day is it today?')] };
};

// C: a family dinner. Four people round a table with food on it: two behind it, two with their
// backs to us on chairs.
const dinner = (): Tpl['pages'][number] => {
  const p = panel('dining', 'Family dinner');
  const { row } = rows(p);
  const table = thing(p, 'table', 0.5, row(0.72), { stretch: 1.9 });
  const back = [person(p, 'omar', 0.38, row(0.58), { pose: 'sit', face: 'happy', view: 'front' }), person(p, 'elena', 0.62, row(0.58), { pose: 'sit', face: 'laugh', view: 'front' })].map((e) => ({ ...e, y: e.y + Math.round(e.h * 0.08) }));
  const front = [person(p, 'ivy', 0.28, row(0.86), { pose: 'sit', face: 'happy', view: 'back' }), person(p, 'tom', 0.72, row(0.84), { pose: 'sit', face: 'neutral', view: 'back' })];
  const chairs = [thing(p, 'chair', 0.28, row(0.92)), thing(p, 'chair', 0.72, row(0.9))];
  const top = topOf(table, 0.47);
  const at = H * row(0.72);
  const food = [onTable(p, 'bowl', along(table, 0.42), top + 2, 0.09, at), onTable(p, 'plate', along(table, 0.55), top + 4, 0.04, at), onTable(p, 'bottle', along(table, 0.66), top, 0.3, at), onTable(p, 'glass', along(table, 0.74), top + 2, 0.13, at), onTable(p, 'glass', along(table, 0.3), top + 2, 0.13, at)];
  return { p, els: [...layered([...back, table]), ...food, ...layered([...front, ...chairs]), bubble(p, back[1], 'Pass the bread, please.')] };
};

// D: a bus stop. Someone waiting on the pavement; the bus arriving along the road.
const busstop = (): Tpl['pages'][number] => {
  const p = panel('busstop', 'At the bus stop');
  const { row } = rows(p);
  const waiting = person(p, 'sam', 0.74, row(0.44), { view: 'tql', pose: 'phone', face: 'neutral' });
  const sign = thing(p, 'busstop', 0.92, row(0.3));
  const bus = thing(p, 'bus', 0.15, row(0.6), { view: 'right' });
  return { p, els: [...layered([sign, waiting, bus]), bubble(p, waiting, 'Here comes the bus.', 'thought')] };
};

// E: a story in four panels, the same character seen from different sides doing different things.
const story = (): Tpl['pages'] => {
  const who = 'leo';
  const mk = (scene: string, name: string, cap: string, fx: number, o: { pose: string; face: string; view: ArtView }, extras: (p: P, row: (fy: number) => number, hz: number) => TplEl[]) => {
    const p = panel(scene, name, cap);
    const { hz, row } = rows(p);
    const me = person(p, who, fx, row(0.72), o);
    // Things resting on a surface (not on the floor, not floating) go in front of what they rest on.
    const all = extras(p, row, hz);
    const resting = all.filter((e) => e.t === 'art' && e.art === 'thing' && !e.ground && !THINGS[e.ref ?? '']?.floats);
    return { p, els: [...layered([...all.filter((e) => !resting.includes(e)), me]), ...resting, caption(p, cap)] };
  };
  return [
    mk('room', '1', 'Leo wakes up late.', 0.64, { pose: 'shrug', face: 'surprised', view: 'front' }, (p, row, hz) => [thing(p, 'clock', 0.48, hz * 0.4, { float: true, scale: 0.8 }), thing(p, 'sofa', 0.26, row(0.6))]),
    mk('street', '2', 'He runs to the bus stop.', 0.4, { pose: 'run', face: 'neutral', view: 'right' }, (p, row) => [thing(p, 'busstop', 0.86, row(0.35)), thing(p, 'bin', 0.1, row(0.6))]),
    mk('cafe', '3', 'He buys a coffee on the way.', 0.36, { pose: 'hold', face: 'happy', view: 'tqr' }, (p, row) => [thing(p, 'counter', 0.72, row(0.5), { stretch: 1.3 }), person(p, 'amira', 0.76, row(0.3), { view: 'tql', pose: 'talk', face: 'happy' })]),
    mk('office', '4', 'He gets to work just in time.', 0.28, { pose: 'wave', face: 'laugh', view: 'tqr' }, (p, row) => {
      const desk = thing(p, 'desk', 0.76, row(0.55), { stretch: 1.3 });
      return [desk, onTable(p, 'monitor', along(desk, 0.5), topOf(desk, 0.43), 0.45, H * row(0.55)), person(p, 'kwame', 0.78, row(0.42), { view: 'tql', pose: 'sit', face: 'neutral' })];
    }),
  ];
};

export const SCENE_TEMPLATES: Tpl[] = [
  { k: 'scene-cafe', name: 'A café', about: 'Two people and their drinks. Order, chat, pay.', story: true, pages: [cafe()] },
  { k: 'scene-classroom', name: 'A classroom', about: 'A teacher at the board and learners at desks.', story: true, pages: [classroom()] },
  { k: 'scene-dinner', name: 'A family dinner', about: 'Four people round a table with food.', story: true, pages: [dinner()] },
  { k: 'scene-busstop', name: 'A bus stop', about: 'Someone waiting as the bus arrives.', story: true, pages: [busstop()] },
  { k: 'scene-story', name: 'A story in four panels', about: 'One character, four moments, with captions.', story: true, pages: story() },
];

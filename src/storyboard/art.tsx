import type { ReactNode } from 'react';

// The storyboard library: people and things drawn as sketches, in shades of grey and one accent colour.
// The accent is the CSS variable --sb-accent (the class or organisation colour), so when the colour
// changes every picture changes with it. People are the same characters in many poses, each with a face
// that can change. Everything is drawn in code, so it stays sharp at any size and prints well.

// ------------------------------------------------------------------ colours

// The house style for pictures is a loose pen line: white paper, the greys drawn as hatching, and a
// light wash of the accent colour. Each grey is a CSS variable that Sketch sets to a hatching pattern;
// outside a Sketch the plain grey is used.
export const INK = '#262420';
const G0 = '#ffffff';
const G1 = '#ffffff';
const G2 = 'var(--sb-g2, #e4e1dc)';
const G3 = 'var(--sb-g3, #c9c5be)';
const G4 = 'var(--sb-g4, #9a958e)';
const G5 = 'var(--sb-g5, #4a4641)';
const A = 'color-mix(in srgb, var(--sb-accent, #d98f63) 52%, white)';
const A_LIGHT = 'color-mix(in srgb, var(--sb-accent, #d98f63) 26%, white)';
const A_DARK = 'var(--sb-ad, color-mix(in srgb, var(--sb-accent, #d98f63) 72%, black))';
const C = { G0, G1, G2, G3, G4, G5, A, A_LIGHT, A_DARK };
type Col = keyof typeof C;

// A pen line: slightly uneven, gone over twice, as if drawn by hand; greys as hatching.
export function Sketch({ id = 'sbr', children }: { id?: string; children: ReactNode }) {
  const pat = (k: string, gap: number, rot: number, bg: string, line: string, w: number) => (
    <pattern id={`${id}-${k}`} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${rot})`}>
      <rect width={gap} height={gap} fill={bg} />
      <line x1={0} y1={0} x2={0} y2={gap} stroke={line} strokeWidth={w} />
    </pattern>
  );
  const vars = { ['--sb-g2' as string]: `url(#${id}-g2)`, ['--sb-g3' as string]: `url(#${id}-g3)`, ['--sb-g4' as string]: `url(#${id}-g4)`, ['--sb-g5' as string]: `url(#${id}-g5)`, ['--sb-ad' as string]: `url(#${id}-ad)` };
  return (
    <>
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        <filter id={id + '-2'} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
        </filter>
        {pat('g2', 6, 40, '#fff', INK, 0.6)}
        {pat('g3', 4.2, 40, '#fff', INK, 0.75)}
        {pat('g4', 3, -35, '#b4afa8', INK, 0.85)}
        {pat('g5', 2.4, 55, '#55504a', '#141210', 0.9)}
        {pat('ad', 3.6, 40, 'color-mix(in srgb, var(--sb-accent, #d98f63) 55%, white)', 'color-mix(in srgb, var(--sb-accent, #d98f63) 60%, black)', 0.8)}
      </defs>
      <g style={vars}>
        <g filter={`url(#${id})`}>{children}</g>
        <g filter={`url(#${id}-2)`} opacity={0.3} transform="translate(0.9 -0.7)">
          {children}
        </g>
      </g>
    </>
  );
}

// ------------------------------------------------------------------ people

type P = [number, number];
// A pose: where the neck and the middle of the hips are, and the elbows, hands, knees and feet
// (left and right as you look at the picture). Everything is in a 200 × 300 box; feet touch y = 286.
export type Pose = { neck: P; hip: P; arms: [P, P, P, P]; legs: [P, P, P, P]; tilt?: number };
const pose = (neck: P, hip: P, arms: [P, P, P, P], legs: [P, P, P, P], tilt = 0): Pose => ({ neck, hip, arms, legs, tilt });

const STAND_LEGS: [P, P, P, P] = [[92, 232], [90, 282], [108, 232], [110, 282]];
export const POSES: Record<string, { name: string; p: Pose }> = {
  stand: { name: 'Standing', p: pose([100, 100], [100, 180], [[80, 142], [79, 178], [120, 142], [121, 178]], STAND_LEGS) },
  wave: { name: 'Waving', p: pose([100, 100], [100, 180], [[80, 142], [79, 178], [134, 100], [138, 66]], STAND_LEGS) },
  point: { name: 'Pointing', p: pose([100, 100], [100, 180], [[80, 142], [79, 178], [140, 114], [170, 104]], STAND_LEGS) },
  hips: { name: 'Hands on hips', p: pose([100, 100], [100, 180], [[66, 138], [86, 170], [134, 138], [114, 170]], STAND_LEGS) },
  crossed: { name: 'Arms crossed', p: pose([100, 100], [100, 180], [[82, 146], [116, 134], [118, 146], [84, 132]], STAND_LEGS) },
  think: { name: 'Thinking', p: pose([100, 100], [100, 180], [[86, 146], [120, 148], [128, 144], [108, 96]], STAND_LEGS, -4) },
  shrug: { name: 'Shrugging', p: pose([100, 102], [100, 180], [[70, 132], [58, 112], [130, 132], [142, 112]], STAND_LEGS, 5) },
  talk: { name: 'Talking', p: pose([100, 100], [100, 180], [[80, 142], [79, 178], [128, 138], [148, 122]], STAND_LEGS) },
  phone: { name: 'On the phone', p: pose([100, 100], [100, 180], [[80, 142], [79, 178], [138, 120], [122, 80]], STAND_LEGS, 4) },
  hold: { name: 'Holding something', p: pose([100, 100], [100, 180], [[82, 146], [94, 152], [118, 146], [106, 152]], STAND_LEGS) },
  walk: { name: 'Walking', p: pose([102, 100], [100, 180], [[88, 142], [96, 172], [116, 140], [126, 168]], [[88, 230], [72, 280], [112, 228], [124, 280]]) },
  run: { name: 'Running', p: pose([106, 102], [100, 180], [[78, 128], [88, 108], [130, 140], [124, 164]], [[82, 222], [60, 262], [120, 214], [130, 256]], -6) },
  sit: { name: 'Sitting', p: pose([96, 126], [96, 204], [[82, 168], [112, 196], [116, 166], [128, 196]], [[136, 206], [138, 282], [142, 210], [148, 282]]) },
  cheer: { name: 'Cheering', p: pose([100, 100], [100, 180], [[72, 78], [66, 46], [128, 78], [134, 46]], STAND_LEGS) },
};

// Faces: eyes, eyebrows and mouth, drawn around the middle of the face.
export const FACES: Record<string, { name: string; draw: (x: number, y: number) => ReactNode }> = {
  happy: { name: 'Happy', draw: (x, y) => (<><Eye x={x - 8} y={y} /><Eye x={x + 8} y={y} /><Brows x={x} y={y} /><path d={`M${x - 7} ${y + 11}q7 6 14 0`} /></>) },
  neutral: { name: 'Calm', draw: (x, y) => (<><Eye x={x - 8} y={y} /><Eye x={x + 8} y={y} /><Brows x={x} y={y} /><path d={`M${x - 5} ${y + 13}h10`} /></>) },
  laugh: { name: 'Laughing', draw: (x, y) => (<><path d={`M${x - 12} ${y + 1}q4 -5 8 0M${x + 4} ${y + 1}q4 -5 8 0`} /><Brows x={x} y={y - 2} /><path d={`M${x - 9} ${y + 9}h18q-2 11 -9 11t-9 -11z`} fill={INK} /></>) },
  sad: { name: 'Sad', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 13} ${y - 5}l8 -3M${x + 13} ${y - 5}l-8 -3`} /><path d={`M${x - 7} ${y + 15}q7 -6 14 0`} /></>) },
  surprised: { name: 'Surprised', draw: (x, y) => (<><circle cx={x - 8} cy={y} r={3} fill="#fff" /><circle cx={x + 8} cy={y} r={3} fill="#fff" /><circle cx={x - 8} cy={y} r={1.4} fill={INK} /><circle cx={x + 8} cy={y} r={1.4} fill={INK} /><path d={`M${x - 12} ${y - 9}q4 -3 8 0M${x + 4} ${y - 9}q4 -3 8 0`} /><ellipse cx={x} cy={y + 13} rx={3.4} ry={4.4} fill={INK} /></>) },
  angry: { name: 'Angry', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 13} ${y - 7}l9 4M${x + 13} ${y - 7}l-9 4`} /><path d={`M${x - 6} ${y + 14}q6 -4 12 0`} /></>) },
  thinking: { name: 'Thinking', draw: (x, y) => (<><Eye x={x - 6} y={y - 1} /><Eye x={x + 10} y={y - 1} /><path d={`M${x - 11} ${y - 6}l7 -1M${x + 5} ${y - 9}q5 -3 10 0`} /><path d={`M${x - 1} ${y + 12}h8`} /></>) },
  worried: { name: 'Worried', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 12} ${y - 6}l7 2M${x + 12} ${y - 6}l-7 2`} /><path d={`M${x - 7} ${y + 13}q3.5 -3 7 0t7 0`} /></>) },
  wink: { name: 'Winking', draw: (x, y) => (<><path d={`M${x - 12} ${y}q4 3 8 0`} /><Eye x={x + 8} y={y} /><Brows x={x} y={y} /><path d={`M${x - 7} ${y + 11}q7 6 14 0`} /></>) },
  bored: { name: 'Bored', draw: (x, y) => (<><path d={`M${x - 11} ${y}h6M${x + 5} ${y}h6`} /><path d={`M${x - 11} ${y - 2}q3 -2 6 0M${x + 5} ${y - 2}q3 -2 6 0`} opacity={0.6} /><path d={`M${x - 5} ${y + 13}h10`} /></>) },
};
function Eye({ x, y }: { x: number; y: number }) {
  return (
    <>
      <path d={`M${x - 3.6} ${y}q3.6 -3.4 7.2 0q-3.6 2.6 -7.2 0z`} fill="#fff" strokeWidth={1.6} />
      <circle cx={x + 0.3} cy={y - 0.2} r={1.7} fill={INK} stroke="none" />
    </>
  );
}
function Brows({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 12} ${y - 6}q4 -3 8 -1M${x + 4} ${y - 7}q4 -2 8 1`} />;
}

// Smooth outlines through points (Catmull-Rom), closed.
function smooth(pts: P[]) {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const unit = (v: P): P => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
// A limb as a tapered outline along its joints (widths at each joint).
function tube(pts: P[], ws: number[]) {
  const n = pts.length;
  const dirs = pts.map((_, i) => unit(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  const L: P[] = [];
  const R: P[] = [];
  pts.forEach((p, i) => {
    const [dx, dy] = dirs[i];
    L.push([p[0] - dy * ws[i] / 2, p[1] + dx * ws[i] / 2]);
    R.push([p[0] + dy * ws[i] / 2, p[1] - dx * ws[i] / 2]);
  });
  const e = pts[n - 1];
  const s = pts[0];
  const de = dirs[n - 1];
  const ds = dirs[0];
  return smooth([...L, [e[0] + de[0] * ws[n - 1] * 0.35, e[1] + de[1] * ws[n - 1] * 0.35], ...R.reverse(), [s[0] - ds[0] * ws[0] * 0.3, s[1] - ds[1] * ws[0] * 0.3]]);
}
// Points given along (u) and across (v) a direction, from an origin.
const frame = (o: P, d: P, k = 1) => (a: number, b: number): P => [o[0] + d[0] * a * k - d[1] * b * k, o[1] + d[1] * a * k + d[0] * b * k];

function Hand({ at, from, side }: { at: P; from: P; side: 1 | -1 }) {
  const f = frame(at, unit(sub(at, from)));
  const s = side;
  const pts: [number, number][] = [[-2, -3.4 * s], [3, -4 * s], [7.6, -2.6 * s], [8.6, 0.4 * s], [6.8, 3.4 * s], [3, 3.8 * s], [3.6, 6.6 * s], [0.6, 6.4 * s], [-2, 3.4 * s]];
  return <path d={smooth(pts.map(([a, b]) => f(a, b)))} fill={G0} />;
}
function Shoe({ at, dir, fill }: { at: P; dir: 1 | -1; fill: string }) {
  const [x, y] = at;
  const s = dir;
  return (
    <>
      <path d={smooth([[x - 6 * s, y - 4], [x + 2 * s, y - 6], [x + 11 * s, y - 2.5], [x + 15 * s, y + 1.5], [x + 13 * s, y + 4.5], [x - 6.5 * s, y + 4.5]])} fill={fill} />
      <path d={`M${x - 6 * s} ${y + 2.6}H${x + 13.5 * s}`} strokeWidth={1.2} />
    </>
  );
}

// The characters: the same people in every pose.
type Hair = (x: number, y: number, fill: string) => { back?: ReactNode; front?: ReactNode };
export type Person = { name: string; hair: Hair; hairCol: Col; top: Col; bottom: Col; shoes: Col; skirt?: boolean; glasses?: boolean; beard?: boolean; scale?: number; collar?: Col };
const strands = (x: number, y: number, list: string) => <path d={list.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${x + Number(a)} ${y + Number(b)}`)} fill="none" strokeWidth={0.9} opacity={0.75} />;
const HAIR: Record<string, Hair> = {
  long: (x, y, fill) => ({
    back: <path d={smooth([[x - 15, y - 8], [x - 19, y + 10], [x - 19, y + 28], [x - 14, y + 38], [x, y + 36], [x + 14, y + 38], [x + 19, y + 28], [x + 19, y + 10], [x + 15, y - 8]])} fill={fill} />,
    front: (
      <>
        <path d={smooth([[x - 16, y + 4], [x - 17, y - 10], [x - 9, y - 20], [x, y - 21], [x + 9, y - 20], [x + 17, y - 10], [x + 16, y + 4], [x + 11, y - 8], [x + 2, y - 13], [x - 6, y - 9]])} fill={fill} />
        {strands(x, y, 'M-12,0 Q-12,-12 -2,-16 M-7,-4 Q-6,-13 0,-17 M12,-2 Q11,-12 3,-16 M7,-6 Q6,-12 2,-15')}
      </>
    ),
  }),
  short: (x, y, fill) => ({
    front: (
      <>
        <path d={smooth([[x - 15, y - 1], [x - 16, y - 13], [x - 8, y - 21], [x + 2, y - 22], [x + 11, y - 19], [x + 16, y - 11], [x + 15, y - 1], [x + 12, y - 9], [x + 4, y - 12], [x - 5, y - 11], [x - 11, y - 7]])} fill={fill} />
        {strands(x, y, 'M-12,-4 L-9,-14 M-7,-9 L-4,-18 M-1,-11 L1,-19 M5,-11 L6,-19 M10,-8 L12,-15')}
      </>
    ),
  }),
  curly: (x, y, fill) => ({
    front: (
      <>
        <path
          d={`M${x - 16} ${y - 1}c-5 -4 -4 -12 1 -13c-1 -7 6 -11 11 -8c3 -6 11 -6 14 -1c5 -3 12 1 11 7c5 2 6 9 2 13c-3 -6 -10 -8 -16 -7c-6 -4 -13 -1 -17 4c-2 1 -4 3 -6 5z`}
          fill={fill}
        />
        {strands(x, y, 'M-11,-9 Q-8,-11 -6,-8 M-3,-15 Q0,-17 2,-14 M6,-13 Q9,-15 11,-12 M-8,-3 Q-5,-5 -3,-2 M4,-6 Q7,-8 9,-5')}
      </>
    ),
  }),
  bun: (x, y, fill) => ({
    back: <path d={smooth([[x - 7, y - 22], [x - 6, y - 31], [x + 2, y - 35], [x + 9, y - 30], [x + 8, y - 22]])} fill={fill} />,
    front: (
      <>
        <path d={smooth([[x - 15, y + 1], [x - 16, y - 12], [x - 8, y - 20], [x + 1, y - 21], [x + 10, y - 19], [x + 16, y - 11], [x + 15, y + 1], [x + 10, y - 10], [x, y - 13], [x - 9, y - 10]])} fill={fill} />
        {strands(x, y, 'M-12,-2 Q-11,-13 -1,-18 M12,-2 Q11,-13 2,-18 M-5,-10 Q-3,-16 1,-19')}
      </>
    ),
  }),
  cap: (x, y) => ({
    front: (
      <>
        <path d={smooth([[x - 15, y - 6], [x - 13, y - 17], [x - 3, y - 23], [x + 8, y - 22], [x + 15, y - 14], [x + 15, y - 6]])} fill={A} />
        <path d={smooth([[x + 4, y - 8], [x + 18, y - 10], [x + 29, y - 7], [x + 26, y - 4], [x + 6, y - 4]])} fill={A_DARK} />
        {strands(x, y, 'M0,-23 Q1,-14 0,-6')}
      </>
    ),
  }),
  ponytail: (x, y, fill) => ({
    back: <path d={smooth([[x + 12, y - 14], [x + 24, y - 12], [x + 28, y + 2], [x + 26, y + 20], [x + 21, y + 26], [x + 20, y + 10], [x + 15, y - 2]])} fill={fill} />,
    front: (
      <>
        <path d={smooth([[x - 15, y], [x - 16, y - 12], [x - 8, y - 20], [x + 1, y - 21], [x + 10, y - 19], [x + 16, y - 11], [x + 15, y], [x + 9, y - 10], [x - 2, y - 12], [x - 10, y - 8]])} fill={fill} />
        {strands(x, y, 'M-11,-4 Q-9,-14 0,-18 M-5,-9 Q-2,-15 4,-18 M18,-8 Q24,2 23,16')}
      </>
    ),
  }),
};
export const PEOPLE: Record<string, Person> = {
  maya: { name: 'Maya', hair: HAIR.long, hairCol: 'G5', top: 'A', bottom: 'G4', shoes: 'G5' },
  leo: { name: 'Leo', hair: HAIR.curly, hairCol: 'G5', top: 'G2', bottom: 'A_DARK', shoes: 'G5', collar: 'A' },
  sam: { name: 'Sam', hair: HAIR.short, hairCol: 'G4', top: 'A_LIGHT', bottom: 'G5', shoes: 'G4', glasses: true },
  grace: { name: 'Grace', hair: HAIR.bun, hairCol: 'G2', top: 'A', bottom: 'G3', shoes: 'G5', skirt: true, glasses: true },
  omar: { name: 'Omar', hair: HAIR.short, hairCol: 'G5', top: 'G3', bottom: 'G5', shoes: 'G5', beard: true, collar: 'A' },
  zoe: { name: 'Zoe', hair: HAIR.ponytail, hairCol: 'G4', top: 'A_LIGHT', bottom: 'A_DARK', shoes: 'G5', scale: 0.78 },
  ben: { name: 'Ben', hair: HAIR.cap, hairCol: 'G4', top: 'G2', bottom: 'G4', shoes: 'A_DARK', scale: 0.74 },
};

// A few pen strokes of shadow.
function Hatch({ x, y, n = 3, len = 9 }: { x: number; y: number; n?: number; len?: number }) {
  return <path d={Array.from({ length: n }, (_, i) => `M${x + i * 3.2} ${y}l${-len * 0.45} ${len}`).join('')} stroke={INK} strokeWidth={0.9} opacity={0.7} />;
}

// The viewBox that shows just a person's head and shoulders (children are drawn smaller, lower down).
export function faceBox(who: string) {
  const k = PEOPLE[who]?.scale ?? 1;
  return `${100 * (1 - k) + 64 * k} ${286 * (1 - k) + 46 * k} ${72 * k} ${72 * k}`;
}

export function PersonArt({ who = 'maya', p = 'stand', face = 'happy' }: { who?: string; p?: string; face?: string }) {
  const c = PEOPLE[who] ?? PEOPLE.maya;
  const ps = (POSES[p] ?? POSES.stand).p;
  const f = FACES[face] ?? FACES.happy;
  const N = ps.neck;
  const H = ps.hip;
  const len = Math.hypot(H[0] - N[0], H[1] - N[1]);
  const v = unit(sub(H, N));
  // across the body, to the right as you look at it
  const T = (a: number, b: number): P => [N[0] + v[1] * a + v[0] * b, N[1] - v[0] * a + v[1] * b];
  const sL = T(-16, 9);
  const sR = T(16, 9);
  const hL = T(-8, len);
  const hR = T(8, len);
  const tilt = ps.tilt ?? 0;
  const head: P = [N[0] + Math.sin((tilt * Math.PI) / 180) * 24, N[1] - 24];
  const hairCol = C[c.hairCol];
  const hair = c.hair(head[0], head[1], hairCol);
  const [ae1, ah1, ae2, ah2] = ps.arms;
  const [lk1, lf1, lk2, lf2] = ps.legs;
  const top = C[c.top];
  const bottom = C[c.bottom];
  const s = c.scale ?? 1;
  const footDir = (foot: P, d: 1 | -1): 1 | -1 => (Math.abs(foot[0] - H[0]) > 18 ? (foot[0] > H[0] ? 1 : -1) : d);
  // the wrist, a little before the hand
  const wrist = (e: P, h: P): P => [h[0] - (h[0] - e[0]) * 0.12, h[1] - (h[1] - e[1]) * 0.12];
  const torso = smooth([T(-5, -2), T(-14, 3), T(-19, 9), T(-19, 22), T(-15, len * 0.62), T(-15, len + 3), T(0, len + 5), T(15, len + 3), T(15, len * 0.62), T(19, 22), T(19, 9), T(14, 3), T(5, -2), T(0, 3)]);
  const shade = smooth([T(11, 14), T(18, 14), T(18, 26), T(14, len * 0.62), T(14, len + 2), T(9, len + 2), T(10, len * 0.6), T(12, 26)]);
  const t = `translate(${100 * (1 - s)} ${286 * (1 - s)}) scale(${s})`;
  return (
    <g transform={t}>
      <g stroke={INK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* legs and shoes */}
        <path d={tube([hL, lk1, lf1], [15, 11, 8.5])} fill={bottom} />
        <path d={tube([hR, lk2, lf2], [15, 11, 8.5])} fill={bottom} />
        <path d={`M${lk1[0] - 3} ${lk1[1] - 1}q3 2 6 0M${lk2[0] - 3} ${lk2[1] - 1}q3 2 6 0`} strokeWidth={1.1} />
        <Shoe at={lf1} dir={footDir(lf1, -1)} fill={C[c.shoes]} />
        <Shoe at={lf2} dir={footDir(lf2, 1)} fill={C[c.shoes]} />
        {c.skirt && <path d={smooth([T(-15, len - 8), T(15, len - 8), T(22, len + 34), T(0, len + 37), T(-22, len + 34)])} fill={bottom} />}
        {c.skirt && <path d={`M${T(-5, len + 4).join(' ')}L${T(-8, len + 34).join(' ')}M${T(6, len + 4).join(' ')}L${T(9, len + 34).join(' ')}`} strokeWidth={1} />}
        {/* body */}
        {hair.back}
        <path d={tube([N, [head[0], head[1] + 12]], [9, 8])} fill={G0} />
        <path d={torso} fill={top} />
        <path d={shade} fill={G3} stroke="none" opacity={0.55} />
        <path d={`M${T(-15, len - 1).join(' ')}Q${T(0, len + 3).join(' ')} ${T(15, len - 1).join(' ')}`} strokeWidth={1.2} />
        <path d={`M${T(-8, 30).join(' ')}q2 8 0 16M${T(6, 40).join(' ')}q3 6 1 12`} strokeWidth={1} />
        {c.collar ? <path d={`M${T(-7, -1).join(' ')}L${T(0, 9).join(' ')}L${T(7, -1).join(' ')}L${T(3, 6).join(' ')}M${T(-7, -1).join(' ')}L${T(-3, 6).join(' ')}`} fill={C[c.collar]} /> : <path d={`M${T(-6, -1).join(' ')}Q${T(0, 6).join(' ')} ${T(6, -1).join(' ')}`} strokeWidth={1.3} />}
        {c.collar && <path d={`M${T(0, 9).join(' ')}L${T(0, len).join(' ')}`} strokeWidth={1} />}
        {/* head */}
        <g transform={`rotate(${tilt} ${head[0]} ${head[1] + 18})`}>
          <path d={`M${head[0] - 14} ${head[1] - 1}q-5 1 -4 6t5 5M${head[0] + 14} ${head[1] - 1}q5 1 4 6t-5 5`} fill={G0} />
          <path d={smooth([[head[0], head[1] - 18], [head[0] + 11, head[1] - 15], [head[0] + 15, head[1] - 4], [head[0] + 14, head[1] + 7], [head[0] + 9, head[1] + 15], [head[0], head[1] + 19], [head[0] - 9, head[1] + 15], [head[0] - 14, head[1] + 7], [head[0] - 15, head[1] - 4], [head[0] - 11, head[1] - 15]])} fill={G0} />
          {hair.front}
          {c.beard && <path d={smooth([[head[0] - 14, head[1] + 3], [head[0] - 8, head[1] + 10], [head[0], head[1] + 11], [head[0] + 8, head[1] + 10], [head[0] + 14, head[1] + 3], [head[0] + 10, head[1] + 15], [head[0], head[1] + 20], [head[0] - 10, head[1] + 15]])} fill={G4} />}
          <g strokeWidth={2.6} transform={`translate(${head[0]} ${head[1] + 2}) scale(0.6) translate(${-head[0]} ${-head[1] - 2})`}>{f.draw(head[0], head[1] + 2)}</g>
          <path d={`M${head[0] + 0.5} ${head[1] + 1.5}q2.4 4 -0.6 5.2`} strokeWidth={1.2} />
          {c.glasses && (
            <g strokeWidth={1.2}>
              <rect x={head[0] - 9.5} y={head[1] - 1} width={8} height={6} rx={2.4} />
              <rect x={head[0] + 1.5} y={head[1] - 1} width={8} height={6} rx={2.4} />
              <path d={`M${head[0] - 1.5} ${head[1] + 1.5}h3`} />
            </g>
          )}
        </g>
        {/* arms and hands, over the body */}
        <path d={tube([sL, ae1, wrist(ae1, ah1)], [11, 9, 7.5])} fill={top} />
        <path d={tube([sR, ae2, wrist(ae2, ah2)], [11, 9, 7.5])} fill={top} />
        <path d={`M${ae1[0] - 2} ${ae1[1] - 2}l3 3M${ae2[0] + 2} ${ae2[1] - 2}l-3 3`} strokeWidth={1} />
        {p === 'phone' && <rect x={ah2[0] - 1} y={ah2[1] - 9} width={6} height={12} rx={1.5} fill={INK} transform={`rotate(-12 ${ah2[0]} ${ah2[1]})`} />}
        <Hand at={ah1} from={ae1} side={-1} />
        <Hand at={ah2} from={ae2} side={1} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ things

// Each thing is drawn in a 200 × 200 box, standing on y = 190 where it stands on the floor.
type Thing = { name: string; group: 'Home' | 'School and work' | 'Food' | 'Outside' | 'Travel'; draw: () => ReactNode };
const S = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const THINGS: Record<string, Thing> = {
  table: { name: 'Table', group: 'Home', draw: () => (<g {...S}><path d="M22 92h156l-10 14H32z" fill={G2} /><path d="M40 106v84M160 106v84M58 106v60M142 106v60" fill="none" /><Hatch x={120} y={96} n={4} len={7} /></g>) },
  chair: { name: 'Chair', group: 'Home', draw: () => (<g {...S}><path d="M64 28h72v74H64z" fill={A_LIGHT} /><path d="M54 102h92l-6 16H60z" fill={A} /><path d="M66 118v72M134 118v72M78 118v50M122 118v50" fill="none" /></g>) },
  sofa: { name: 'Sofa', group: 'Home', draw: () => (<g {...S}><path d="M30 70q0 -16 16 -16h108q16 0 16 16v40H30z" fill={A_LIGHT} /><path d="M14 96q0 -12 12 -12h12v62H14zM186 96q0 -12 -12 -12h-12v62h24z" fill={A} /><path d="M38 110h124v36H38z" fill={A} /><path d="M100 110v36M30 146v40M170 146v40" fill="none" /><path d="M24 146h152" fill="none" /></g>) },
  bed: { name: 'Bed', group: 'Home', draw: () => (<g {...S}><path d="M14 60h26v126H14z" fill={G3} /><path d="M40 118h146v40H40z" fill={G1} /><path d="M40 104q30 -14 60 0q40 -6 86 6v12H40z" fill={A_LIGHT} /><path d="M48 96q14 -10 34 0v14H48z" fill={G0} /><path d="M40 158h146v14H40zM50 172v14M178 172v14" fill={G2} /></g>) },
  lamp: { name: 'Lamp', group: 'Home', draw: () => (<g {...S}><path d="M70 30h60l16 46H54z" fill={A} /><path d="M100 76v100M72 186h56" fill="none" /><path d="M78 176h44v10H78z" fill={G3} /><path d="M86 76l-10 18M114 76l10 18" opacity={0.4} fill="none" /></g>) },
  plant: { name: 'Plant', group: 'Home', draw: () => (<g {...S}><path d="M68 130h64l-8 58H76z" fill={A} /><path d="M100 130q-4 -40 -34 -60q24 0 34 28q8 -44 38 -54q-10 30 -30 50q20 -14 38 -6q-24 4 -42 42" fill={G3} /><path d="M100 130v-40" fill="none" /></g>) },
  door: { name: 'Door', group: 'Home', draw: () => (<g {...S}><path d="M52 16h96v174H52z" fill={A_LIGHT} /><path d="M66 32h68v60H66zM66 106h68v70H66z" fill={G0} opacity={0.6} /><circle cx={136} cy={104} r={5} fill={G5} /></g>) },
  window: { name: 'Window', group: 'Home', draw: () => (<g {...S}><path d="M34 30h132v118H34z" fill={G0} /><path d="M100 30v118M34 89h132" fill="none" /><path d="M48 44l20 -6M118 48l24 -8" opacity={0.4} fill="none" /><path d="M24 148h152v12H24z" fill={G3} /><path d="M34 30q20 40 -6 118h-6V24h12zM166 30q-20 40 6 118h6V24h-12z" fill={A} /></g>) },
  clock: { name: 'Clock', group: 'Home', draw: () => (<g {...S}><circle cx={100} cy={96} r={64} fill={G0} /><circle cx={100} cy={96} r={56} fill="none" stroke={A} strokeWidth={6} /><path d="M100 96V58M100 96l26 14" fill="none" /><circle cx={100} cy={96} r={4} fill={INK} /><path d="M100 46v6M100 140v6M50 96h6M144 96h6" fill="none" /></g>) },
  cup: { name: 'Cup of tea', group: 'Food', draw: () => (<g {...S}><path d="M60 92h76l-8 70q-2 12 -14 12H82q-12 0 -14 -12z" fill={A} /><path d="M136 106q26 0 22 22t-26 18" fill="none" /><path d="M44 178h108" fill="none" /><path d="M86 74q-8 -12 2 -22t0 -22M106 74q-8 -12 2 -22t0 -22" fill="none" opacity={0.5} /><path d="M60 92q38 8 76 0" fill="none" /></g>) },
  cake: { name: 'Cake', group: 'Food', draw: () => (<g {...S}><path d="M40 110h120v70H40z" fill={G1} /><path d="M40 110q10 18 20 0t20 0t20 0t20 0t20 0t20 0" fill={A} /><path d="M40 146h120" fill="none" /><path d="M100 110V80" fill="none" /><path d="M100 80q-8 -10 0 -22q8 12 0 22z" fill={A_LIGHT} /><path d="M30 180h140" fill="none" /></g>) },
  apple: { name: 'Apple', group: 'Food', draw: () => (<g {...S}><path d="M100 70q-30 -18 -48 6q-18 26 2 66q16 32 46 18q30 14 46 -18q20 -40 2 -66q-18 -24 -48 -6z" fill={A} /><path d="M100 70q2 -20 14 -30" fill="none" /><path d="M104 54q18 -14 30 -4q-14 14 -30 4z" fill={G3} /><path d="M70 92q-8 14 -4 30" fill="none" opacity={0.5} stroke={G0} /></g>) },
  pizza: { name: 'Pizza', group: 'Food', draw: () => (<g {...S}><path d="M100 176L34 52q66 -30 132 0z" fill={G1} /><path d="M34 52q66 -30 132 0l-8 16q-58 -24 -116 0z" fill={G3} /><circle cx={86} cy={88} r={9} fill={A} /><circle cx={116} cy={100} r={9} fill={A} /><circle cx={98} cy={130} r={8} fill={A} /></g>) },
  book: { name: 'Book', group: 'School and work', draw: () => (<g {...S}><path d="M40 60q30 -12 60 4q30 -16 60 -4v110q-30 -12 -60 4q-30 -16 -60 -4z" fill={G0} /><path d="M100 64v110" fill="none" /><path d="M40 60q30 -12 60 4v110q-30 -16 -60 -4z" fill={A_LIGHT} /><path d="M112 82h34M112 96h34M112 110h26" fill="none" opacity={0.5} /></g>) },
  laptop: { name: 'Laptop', group: 'School and work', draw: () => (<g {...S}><path d="M46 54h108v84H46z" fill={G5} /><path d="M54 62h92v68H54z" fill={A_LIGHT} /><path d="M26 138h148l-12 22H38z" fill={G3} /><path d="M86 148h28" fill="none" /></g>) },
  phone: { name: 'Phone', group: 'School and work', draw: () => (<g {...S}><rect x={70} y={30} width={60} height={124} rx={12} fill={G5} /><rect x={77} y={44} width={46} height={92} rx={4} fill={A_LIGHT} /><path d="M94 146h12" fill="none" stroke={G0} /></g>) },
  bag: { name: 'School bag', group: 'School and work', draw: () => (<g {...S}><path d="M76 60q0 -28 24 -28t24 28" fill="none" /><path d="M50 62h100q10 0 10 10v98q0 10 -10 10H50q-10 0 -10 -10V72q0 -10 10 -10z" fill={A} /><path d="M58 104h84v44H58z" fill={A_DARK} /><path d="M100 104v14" fill="none" /><Hatch x={124} y={70} n={3} len={10} /></g>) },
  board: { name: 'Whiteboard', group: 'School and work', draw: () => (<g {...S}><path d="M18 28h164v110H18z" fill={G0} /><path d="M18 28h164v110H18z" fill="none" stroke={G4} strokeWidth={6} /><path d="M38 58q20 -10 40 0t40 0M38 84h70M38 106h50" fill="none" stroke={A} /><path d="M70 138l-16 50M130 138l16 50" fill="none" /></g>) },
  pencil: { name: 'Pencil', group: 'School and work', draw: () => (<g {...S}><path d="M44 150L140 54l18 18l-96 96l-26 8z" fill={A} /><path d="M140 54l12 -12q6 -6 12 0l6 6q6 6 0 12l-12 12z" fill={G3} /><path d="M44 150l18 18l-26 8z" fill={G1} /><path d="M30 178l6 -2" fill="none" /></g>) },
  tree: { name: 'Tree', group: 'Outside', draw: () => (<g {...S}><path d="M90 190l4 -70h12l4 70z" fill={G4} /><path d="M100 26q38 0 44 34q30 8 22 40q-4 28 -40 26q-10 14 -26 0q-36 6 -46 -20q-22 -24 4 -46q6 -34 42 -34z" fill={G2} /><path d="M78 72q10 -10 22 -4M118 90q10 -8 18 0" fill="none" opacity={0.5} /><circle cx={130} cy={66} r={6} fill={A} /><circle cx={70} cy={98} r={6} fill={A} /><circle cx={112} cy={110} r={6} fill={A} /></g>) },
  house: { name: 'House', group: 'Outside', draw: () => (<g {...S}><path d="M36 92h128v96H36z" fill={G1} /><path d="M24 96L100 32l76 64z" fill={A} /><path d="M86 140h28v48H86z" fill={A_DARK} /><path d="M50 112h26v24H50zM124 112h26v24h-26z" fill={G0} /><path d="M136 56v-20h16v34" fill={G3} /></g>) },
  shop: { name: 'Shop', group: 'Outside', draw: () => (<g {...S}><path d="M26 70h148v118H26z" fill={G1} /><path d="M20 50h160v20H20z" fill={G3} /><path d="M22 70h156l-6 22q-12 8 -24 0q-12 8 -24 0q-12 8 -24 0q-12 8 -24 0q-12 8 -24 0q-12 8 -24 0z" fill={A} /><path d="M40 110h62v48H40z" fill={G0} /><path d="M120 110h40v78h-40z" fill={A_LIGHT} /></g>) },
  sun: { name: 'Sun', group: 'Outside', draw: () => (<g {...S}><circle cx={100} cy={100} r={34} fill={A} /><path d="M100 40V22M100 178v-18M40 100H22M178 100h-18M58 58L46 46M154 154l-12 -12M58 142l-12 12M154 46l-12 12" fill="none" /></g>) },
  cloud: { name: 'Cloud', group: 'Outside', draw: () => (<g {...S}><path d="M52 130q-26 0 -26 -22t26 -22q4 -30 36 -30q24 0 34 20q30 -8 38 18q24 4 20 24q-2 12 -20 12z" fill={G0} /><path d="M70 150l-6 14M100 150l-6 14M130 150l-6 14" fill="none" stroke={G4} /></g>) },
  car: { name: 'Car', group: 'Travel', draw: () => (<g {...S}><path d="M20 150v-28q0 -10 10 -12l22 -4l24 -30q6 -6 16 -6h44q10 0 16 8l22 28l12 4q10 4 10 14v26z" fill={A} /><path d="M80 82h28v24H62zM118 82h20q4 0 8 4l16 20h-44z" fill={G0} /><circle cx={58} cy={152} r={18} fill={G5} /><circle cx={144} cy={152} r={18} fill={G5} /><circle cx={58} cy={152} r={6} fill={G2} /><circle cx={144} cy={152} r={6} fill={G2} /></g>) },
  bus: { name: 'Bus', group: 'Travel', draw: () => (<g {...S}><path d="M18 44q0 -10 10 -10h144q10 0 10 10v108H18z" fill={A} /><path d="M30 50h28v34H30zM66 50h28v34H66zM102 50h28v34h-28zM138 50h32v34h-32z" fill={G0} /><path d="M18 108h164" fill="none" /><circle cx={54} cy={156} r={16} fill={G5} /><circle cx={146} cy={156} r={16} fill={G5} /></g>) },
  bike: { name: 'Bike', group: 'Travel', draw: () => (<g {...S}><circle cx={52} cy={140} r={32} fill="none" /><circle cx={148} cy={140} r={32} fill="none" /><path d="M52 140l34 -54h50l12 54M86 86l20 54l42 -54M76 74h22M136 86l-6 -22h18" fill="none" stroke={A_DARK} strokeWidth={4} /></g>) },
  plane: { name: 'Plane', group: 'Travel', draw: () => (<g {...S}><path d="M20 108q0 -10 14 -10h112q30 0 40 12q-10 12 -40 12H34q-14 0 -14 -14z" fill={G1} /><path d="M84 98l26 -46h18l-14 46zM84 122l26 40h18l-14 -40z" fill={A} /><path d="M30 98l-8 -24h14l16 24z" fill={A} /><path d="M150 104h16" fill="none" /></g>) },
  suitcase: { name: 'Suitcase', group: 'Travel', draw: () => (<g {...S}><path d="M80 56v-16h40v16" fill="none" /><rect x={46} y={56} width={108} height={120} rx={12} fill={A} /><path d="M76 56v120M124 56v120" fill="none" stroke={A_DARK} strokeWidth={5} /><circle cx={64} cy={182} r={6} fill={G5} /><circle cx={136} cy={182} r={6} fill={G5} /></g>) },
};

// ------------------------------------------------------------------ speech bubbles and labels

export const BUBBLES: Record<string, { name: string; draw: (w: number, h: number) => ReactNode }> = {
  speech: { name: 'Speech', draw: (w, h) => <path d={`M18 4h${w - 36}q14 0 14 14v${h - 46}q0 14 -14 14H${w * 0.36}l-22 20l4 -20H18q-14 0 -14 -14V18q0 -14 14 -14z`} fill="#fff" {...S} /> },
  thought: {
    name: 'Thought',
    draw: (w, h) => (
      <g {...S} fill="#fff">
        <ellipse cx={w / 2} cy={(h - 34) / 2 + 4} rx={w / 2 - 6} ry={(h - 34) / 2} strokeDasharray="0" />
        <circle cx={w * 0.3} cy={h - 22} r={7} />
        <circle cx={w * 0.22} cy={h - 8} r={4} />
      </g>
    ),
  },
  shout: {
    name: 'Shout',
    draw: (w, h) => {
      const n = 14;
      const pts = Array.from({ length: n * 2 }, (_, i) => {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? 0.86 : 1;
        return `${(w / 2 + Math.cos(a) * (w / 2 - 4) * r).toFixed(1)} ${(h / 2 + Math.sin(a) * (h / 2 - 4) * r).toFixed(1)}`;
      });
      return <path d={`M${pts.join('L')}z`} fill={A_LIGHT} {...S} />;
    },
  },
  whisper: { name: 'Whisper', draw: (w, h) => <path d={`M18 4h${w - 36}q14 0 14 14v${h - 46}q0 14 -14 14H${w * 0.36}l-22 20l4 -20H18q-14 0 -14 -14V18q0 -14 14 -14z`} fill="#fff" {...S} strokeDasharray="6 6" /> },
  caption: { name: 'Caption', draw: (w, h) => <rect x={3} y={3} width={w - 6} height={h - 6} fill={A_LIGHT} {...S} /> },
  label: {
    name: 'Label',
    draw: (w, h) => (
      <g {...S}>
        <rect x={3} y={3} width={w - 6} height={h - 6} rx={6} fill="#fff" />
        <circle cx={w / 2} cy={h + 22} r={4} fill={A} stroke="none" />
        <path d={`M${w / 2} ${h - 3}v22`} fill="none" />
      </g>
    ),
  },
};

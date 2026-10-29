import type { ReactNode } from 'react';

// The storyboard library: people and things drawn as sketches, in shades of grey and one accent colour.
// The accent is the CSS variable --sb-accent (the class or organisation colour), so when the colour
// changes every picture changes with it. People are the same characters in many poses, each with a face
// that can change. Everything is drawn in code, so it stays sharp at any size and prints well.

// ------------------------------------------------------------------ colours

export const INK = '#3b3833';
const G0 = '#fbfaf8';
const G1 = '#f1efeb';
const G2 = '#dfdcd6';
const G3 = '#c4bfb7';
const G4 = '#8f8981';
const G5 = '#5f5a54';
const A = 'var(--sb-accent, #d98f63)';
const A_LIGHT = 'color-mix(in srgb, var(--sb-accent, #d98f63) 38%, white)';
const A_DARK = 'color-mix(in srgb, var(--sb-accent, #d98f63) 72%, black)';
const C = { G0, G1, G2, G3, G4, G5, A, A_LIGHT, A_DARK };
type Col = keyof typeof C;

// A pencil line: slightly uneven, as if drawn by hand.
export function Sketch({ id = 'sbr', children }: { id?: string; children: ReactNode }) {
  return (
    <>
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.4" />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </>
  );
}

// ------------------------------------------------------------------ people

type P = [number, number];
// A pose: where the neck and the middle of the hips are, and the elbows, hands, knees and feet
// (left and right as you look at the picture). Everything is in a 200 × 300 box; feet touch y = 286.
export type Pose = { neck: P; hip: P; arms: [P, P, P, P]; legs: [P, P, P, P]; tilt?: number };
const pose = (neck: P, hip: P, arms: [P, P, P, P], legs: [P, P, P, P], tilt = 0): Pose => ({ neck, hip, arms, legs, tilt });

const STAND_LEGS: [P, P, P, P] = [[90, 232], [88, 284], [110, 232], [112, 284]];
export const POSES: Record<string, { name: string; p: Pose }> = {
  stand: { name: 'Standing', p: pose([100, 98], [100, 178], [[76, 140], [73, 174], [124, 140], [127, 174]], STAND_LEGS) },
  wave: { name: 'Waving', p: pose([100, 98], [100, 178], [[76, 140], [73, 174], [140, 86], [148, 50]], STAND_LEGS) },
  point: { name: 'Pointing', p: pose([100, 98], [100, 178], [[76, 140], [73, 174], [146, 108], [176, 102]], STAND_LEGS) },
  hips: { name: 'Hands on hips', p: pose([100, 98], [100, 178], [[60, 136], [86, 168], [140, 136], [114, 168]], STAND_LEGS) },
  crossed: { name: 'Arms crossed', p: pose([100, 98], [100, 178], [[82, 142], [118, 130], [118, 142], [82, 128]], STAND_LEGS) },
  think: { name: 'Thinking', p: pose([100, 98], [100, 178], [[84, 142], [126, 146], [130, 142], [110, 90]], STAND_LEGS, -4) },
  shrug: { name: 'Shrugging', p: pose([100, 100], [100, 178], [[64, 130], [54, 104], [136, 130], [146, 104]], STAND_LEGS, 5) },
  talk: { name: 'Talking', p: pose([100, 98], [100, 178], [[76, 140], [73, 174], [134, 136], [154, 118]], STAND_LEGS) },
  phone: { name: 'On the phone', p: pose([100, 98], [100, 178], [[76, 140], [73, 174], [134, 124], [120, 76]], STAND_LEGS, 4) },
  hold: { name: 'Holding something', p: pose([100, 98], [100, 178], [[80, 144], [92, 150], [120, 144], [108, 150]], STAND_LEGS) },
  walk: { name: 'Walking', p: pose([100, 98], [100, 178], [[84, 140], [96, 168], [120, 138], [126, 166]], [[86, 230], [70, 282], [114, 228], [126, 280]]) },
  run: { name: 'Running', p: pose([102, 100], [100, 180], [[72, 126], [82, 106], [132, 138], [122, 162]], [[80, 222], [58, 266], [120, 214], [130, 254]], -6) },
  sit: { name: 'Sitting', p: pose([96, 124], [96, 204], [[80, 166], [112, 196], [118, 164], [128, 196]], [[134, 206], [136, 284], [140, 210], [146, 284]]) },
  cheer: { name: 'Cheering', p: pose([100, 98], [100, 178], [[66, 74], [60, 40], [134, 74], [140, 40]], STAND_LEGS) },
};

// Faces: eyes, eyebrows and mouth, drawn around the middle of the head.
export const FACES: Record<string, { name: string; draw: (x: number, y: number) => ReactNode }> = {
  happy: { name: 'Happy', draw: (x, y) => (<><Eye x={x - 8} y={y} /><Eye x={x + 8} y={y} /><path d={`M${x - 8} ${y + 9}q8 8 16 0`} /></>) },
  neutral: { name: 'Calm', draw: (x, y) => (<><Eye x={x - 8} y={y} /><Eye x={x + 8} y={y} /><path d={`M${x - 6} ${y + 11}h12`} /></>) },
  laugh: { name: 'Laughing', draw: (x, y) => (<><path d={`M${x - 12} ${y + 1}q4 -5 8 0M${x + 4} ${y + 1}q4 -5 8 0`} /><path d={`M${x - 9} ${y + 8}h18q-2 10 -9 10t-9 -10z`} fill={INK} /></>) },
  sad: { name: 'Sad', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 13} ${y - 5}l7 -3M${x + 13} ${y - 5}l-7 -3`} /><path d={`M${x - 7} ${y + 14}q7 -6 14 0`} /></>) },
  surprised: { name: 'Surprised', draw: (x, y) => (<><circle cx={x - 8} cy={y} r={2.8} /><circle cx={x + 8} cy={y} r={2.8} /><path d={`M${x - 12} ${y - 8}q4 -3 8 0M${x + 4} ${y - 8}q4 -3 8 0`} /><ellipse cx={x} cy={y + 12} rx={3.6} ry={4.6} /></>) },
  angry: { name: 'Angry', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 13} ${y - 7}l8 4M${x + 13} ${y - 7}l-8 4`} /><path d={`M${x - 6} ${y + 13}q6 -4 12 0`} /></>) },
  thinking: { name: 'Thinking', draw: (x, y) => (<><Eye x={x - 6} y={y - 1} /><Eye x={x + 10} y={y - 1} /><path d={`M${x + 5} ${y - 9}q5 -3 10 0`} /><path d={`M${x - 1} ${y + 11}h8`} /></>) },
  worried: { name: 'Worried', draw: (x, y) => (<><Eye x={x - 8} y={y + 1} /><Eye x={x + 8} y={y + 1} /><path d={`M${x - 12} ${y - 6}l7 2M${x + 12} ${y - 6}l-7 2`} /><path d={`M${x - 7} ${y + 12}q3.5 -3 7 0t7 0`} /></>) },
  wink: { name: 'Winking', draw: (x, y) => (<><path d={`M${x - 12} ${y}q4 3 8 0`} /><Eye x={x + 8} y={y} /><path d={`M${x - 8} ${y + 9}q8 8 16 0`} /></>) },
  bored: { name: 'Bored', draw: (x, y) => (<><path d={`M${x - 11} ${y}h6M${x + 5} ${y}h6`} /><path d={`M${x - 11} ${y - 2}q3 -2 6 0M${x + 5} ${y - 2}q3 -2 6 0`} opacity={0.6} /><path d={`M${x - 5} ${y + 12}h10`} /></>) },
};
function Eye({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={2.2} fill={INK} stroke="none" />;
}

// The characters: the same people in every pose.
type Hair = (x: number, y: number) => { back?: ReactNode; front?: ReactNode };
export type Person = { name: string; hair: Hair; top: Col; bottom: Col; shoes: Col; skirt?: boolean; glasses?: boolean; beard?: boolean; scale?: number; collar?: Col };
const HAIR: Record<string, Hair> = {
  long: (x, y) => ({
    back: <path d={`M${x - 25} ${y - 2}q-4 30 2 46l14 -2q-6 -14 -4 -30M${x + 25} ${y - 2}q4 30 -2 46l-14 -2q6 -14 4 -30`} fill={G5} />,
    front: <path d={`M${x - 24} ${y - 2}q2 -26 24 -26t24 26q-14 -14 -30 -10q-8 2 -18 10z`} fill={G5} />,
  }),
  short: (x, y) => ({ front: <path d={`M${x - 23} ${y - 4}q0 -24 23 -24t23 24q-6 -10 -16 -11q-10 6 -30 11z`} fill={G4} /> }),
  curly: (x, y) => ({
    front: (
      <path
        d={`M${x - 23} ${y - 2}c-6 -6 -2 -14 3 -14c-1 -8 8 -12 12 -8c3 -7 13 -7 16 -1c5 -4 14 0 12 7c6 1 8 9 3 14c-6 -6 -14 -8 -24 -8s-18 4 -22 10z`}
        fill={G5}
      />
    ),
  }),
  bun: (x, y) => ({
    back: <circle cx={x + 2} cy={y - 26} r={10} fill={G2} />,
    front: <path d={`M${x - 23} ${y - 1}q0 -23 23 -23t23 23q-8 -12 -23 -12t-23 12z`} fill={G2} />,
  }),
  cap: (x, y) => ({
    front: (
      <>
        <path d={`M${x - 22} ${y - 6}q2 -20 22 -20t22 20z`} fill={A} />
        <path d={`M${x + 4} ${y - 7}h30q-4 6 -30 5z`} fill={A_DARK} />
      </>
    ),
  }),
  ponytail: (x, y) => ({
    back: <path d={`M${x + 18} ${y - 14}q22 2 18 34q-8 -4 -10 -20q-4 -8 -10 -10z`} fill={G4} />,
    front: <path d={`M${x - 23} ${y - 2}q0 -24 23 -24t23 24q-10 -10 -24 -10q-14 0 -22 10z`} fill={G4} />,
  }),
};
export const PEOPLE: Record<string, Person> = {
  maya: { name: 'Maya', hair: HAIR.long, top: 'A', bottom: 'G4', shoes: 'G5' },
  leo: { name: 'Leo', hair: HAIR.curly, top: 'G2', bottom: 'A_DARK', shoes: 'G5', collar: 'A' },
  sam: { name: 'Sam', hair: HAIR.short, top: 'A_LIGHT', bottom: 'G5', shoes: 'G4', glasses: true },
  grace: { name: 'Grace', hair: HAIR.bun, top: 'A', bottom: 'G3', shoes: 'G5', skirt: true, glasses: true },
  omar: { name: 'Omar', hair: HAIR.short, top: 'G3', bottom: 'G5', shoes: 'G5', beard: true, collar: 'A' },
  zoe: { name: 'Zoe', hair: HAIR.ponytail, top: 'A_LIGHT', bottom: 'A_DARK', shoes: 'G5', scale: 0.78 },
  ben: { name: 'Ben', hair: HAIR.cap, top: 'G2', bottom: 'G4', shoes: 'A_DARK', scale: 0.74 },
};

// An outlined limb: an ink line with the colour inside it.
function Limb({ pts, w, fill }: { pts: P[]; w: number; fill: string }) {
  const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
  return (
    <>
      <path d={d} stroke={INK} strokeWidth={w + 3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={fill} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}
// A few pencil strokes of shadow.
function Hatch({ x, y, n = 3, len = 9 }: { x: number; y: number; n?: number; len?: number }) {
  return <path d={Array.from({ length: n }, (_, i) => `M${x + i * 4} ${y}l${-len * 0.45} ${len}`).join('')} stroke={INK} strokeWidth={1.2} opacity={0.35} />;
}

// The viewBox that shows just a person's head and shoulders (children are drawn smaller, lower down).
export function faceBox(who: string) {
  const k = PEOPLE[who]?.scale ?? 1;
  return `${100 * (1 - k) + 40 * k} ${286 * (1 - k)} ${120 * k} ${118 * k}`;
}

export function PersonArt({ who = 'maya', p = 'stand', face = 'happy' }: { who?: string; p?: string; face?: string }) {
  const c = PEOPLE[who] ?? PEOPLE.maya;
  const ps = (POSES[p] ?? POSES.stand).p;
  const f = FACES[face] ?? FACES.happy;
  const [nx, ny] = ps.neck;
  const [hx, hy] = ps.hip;
  const sL: P = [nx - 21, ny + 7];
  const sR: P = [nx + 21, ny + 7];
  const hL: P = [hx - 10, hy];
  const hR: P = [hx + 10, hy];
  const head: P = [nx, ny - 30];
  const hair = c.hair(head[0], head[1]);
  const [ae1, ah1, ae2, ah2] = ps.arms;
  const [lk1, lf1, lk2, lf2] = ps.legs;
  const top = C[c.top];
  const s = c.scale ?? 1;
  // Smaller people (children) stand on the same ground.
  const t = `translate(${100 * (1 - s)} ${286 * (1 - s)}) scale(${s})`;
  return (
    <g transform={t}>
      <g stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* legs and shoes */}
        <Limb pts={[hL, lk1, lf1]} w={15} fill={C[c.bottom]} />
        <Limb pts={[hR, lk2, lf2]} w={15} fill={C[c.bottom]} />
        <ellipse cx={lf1[0] - 4} cy={lf1[1] + 1} rx={11} ry={5.5} fill={C[c.shoes]} />
        <ellipse cx={lf2[0] + 4} cy={lf2[1] + 1} rx={11} ry={5.5} fill={C[c.shoes]} />
        {/* skirt */}
        {c.skirt && <path d={`M${hx - 17} ${hy - 6}h34l10 44h-54z`} fill={C[c.bottom]} />}
        {/* body */}
        <path d={`M${sL[0] - 3} ${sL[1] - 2}Q${nx} ${ny - 4} ${sR[0] + 3} ${sR[1] - 2}L${hx + 17} ${hy + 4}Q${hx} ${hy + 9} ${hx - 17} ${hy + 4}z`} fill={top} />
        <Hatch x={hx + 4} y={hy - 30} n={3} len={12} />
        {c.collar && <path d={`M${nx - 9} ${ny + 1}l9 10l9 -10`} fill={C[c.collar]} />}
        {/* neck and head */}
        <g transform={`translate(${head[0]} ${head[1]}) scale(1.13) translate(${-head[0]} ${-head[1]})`}>{hair.back}</g>
        <path d={`M${nx} ${ny + 2}v-8`} stroke={INK} strokeWidth={12} />
        <path d={`M${nx} ${ny + 2}v-8`} stroke={G1} strokeWidth={8} />
        <g transform={`rotate(${ps.tilt ?? 0} ${head[0]} ${head[1] + 20})`}>
          <circle cx={head[0] - 26} cy={head[1] + 3} r={5} fill={G0} />
          <circle cx={head[0] + 26} cy={head[1] + 3} r={5} fill={G0} />
          <circle cx={head[0]} cy={head[1]} r={26} fill={G0} />
          <g transform={`translate(${head[0]} ${head[1]}) scale(1.13) translate(${-head[0]} ${-head[1]})`}>{hair.front}</g>
          {c.beard && <path d={`M${head[0] - 21} ${head[1] + 9}q21 28 42 0q-2 12 -21 14q-19 -2 -21 -14z`} fill={G4} />}
          <g strokeWidth={2.3} transform={`translate(${head[0]} ${head[1] + 3}) scale(1.12) translate(${-head[0]} ${-head[1] - 3})`}>{f.draw(head[0], head[1] + 3)}</g>
          {c.glasses && (
            <g strokeWidth={1.8}>
              <circle cx={head[0] - 9} cy={head[1] + 3} r={6.6} />
              <circle cx={head[0] + 9} cy={head[1] + 3} r={6.6} />
              <path d={`M${head[0] - 2.4} ${head[1] + 3}h4.8`} />
            </g>
          )}
          <circle cx={head[0] - 16} cy={head[1] + 13} r={3.6} fill={A_LIGHT} stroke="none" opacity={0.7} />
          <circle cx={head[0] + 16} cy={head[1] + 13} r={3.6} fill={A_LIGHT} stroke="none" opacity={0.7} />
        </g>
        {/* arms and hands, over the body */}
        <Limb pts={[sL, ae1, ah1]} w={12} fill={top} />
        <Limb pts={[sR, ae2, ah2]} w={12} fill={top} />
        <circle cx={ah1[0]} cy={ah1[1]} r={5.2} fill={G0} />
        <circle cx={ah2[0]} cy={ah2[1]} r={5.2} fill={G0} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ things

// Each thing is drawn in a 200 × 200 box, standing on y = 190 where it stands on the floor.
type Thing = { name: string; group: 'Home' | 'School and work' | 'Food' | 'Outside' | 'Travel'; draw: () => ReactNode };
const S = { stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
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

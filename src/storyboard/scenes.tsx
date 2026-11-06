import type { ReactNode } from 'react';
import { A, A_DARK, A_LIGHT, G0, G2, G3, G4, G5, INK } from './palette';

// Backdrops for scenes, drawn in the same pen as the people and things but lighter, so they sit
// behind. Each fills a 1280 × 720 box. `horizon` is where the floor meets the wall (or the ground the
// sky), as a part of the height: people standing nearer the bottom are nearer to us and drawn
// bigger (see design/scene.ts).
export type Scene = { name: string; group: 'Inside' | 'Outside'; horizon: number; tags: string[]; draw: () => ReactNode };

const W = 1280;
const H = 720;
const L = { stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
const floorAt = (y: number, fill = G0) => (
  <>
    <rect x={0} y={y} width={W} height={H - y} fill={fill} stroke="none" />
    <path d={`M0 ${y}H${W}`} stroke={INK} strokeWidth={2.2} />
  </>
);
const boards = (y: number) => <path d={Array.from({ length: 9 }, (_, i) => `M0 ${y + ((H - y) * (i + 1)) / 10}H${W}`).join('')} stroke={INK} strokeWidth={0.8} opacity={0.22} />;
const skirting = (y: number) => <rect x={0} y={y - 16} width={W} height={16} fill={G2} stroke={INK} strokeWidth={1.2} />;
const windowAt = (x: number, y: number, w: number, h: number, panes = 2) => (
  <g {...L}>
    <rect x={x} y={y} width={w} height={h} fill={A_LIGHT} />
    <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} />
    {Array.from({ length: panes - 1 }, (_, i) => <path key={i} d={`M${x + ((i + 1) * w) / panes} ${y}V${y + h}`} />)}
    <path d={`M${x} ${y + h / 2}H${x + w}`} />
    <path d={`M${x + 16} ${y + 16}l${w * 0.18} -8`} opacity={0.4} />
  </g>
);
const sky = (y: number) => (
  <>
    <rect x={0} y={0} width={W} height={y} fill={G0} stroke="none" />
    <path d="M150 110q40 -40 90 -10q50 -40 100 0q30 -14 50 10q-60 10 -120 6t-120 -6zM900 150q40 -36 86 -8q46 -36 96 0q-50 12 -100 8t-82 0z" fill={G0} stroke={INK} strokeWidth={1.4} opacity={0.85} />
  </>
);
const tree = (x: number, y: number, s: number) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} {...L}>
    <path d="M-6 0l3 -70h6l3 70z" fill={G4} />
    <path d="M0 -180q46 0 52 40q36 10 26 48q-4 34 -48 32q-12 16 -30 0q-44 6 -56 -24q-26 -28 4 -56q8 -40 52 -40z" fill={G2} />
  </g>
);

export const SCENES: Record<string, Scene> = {
  plain: { name: 'No backdrop', group: 'Inside', horizon: 0.74, tags: ['blank', 'white', 'empty'], draw: () => null },
  room: {
    name: 'Living room', group: 'Inside', horizon: 0.7, tags: ['home', 'sofa', 'family', 'house', 'lounge'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.7} fill={A_LIGHT} stroke="none" opacity={0.55} />
        {windowAt(820, 110, 300, 230, 2)}
        <g {...L}>
          <rect x={180} y={150} width={200} height={150} fill={G0} />
          <path d="M200 280l50 -70l40 46l30 -30l40 54z" fill={G3} />
        </g>
        {skirting(H * 0.7)}
        {floorAt(H * 0.7)}
        {boards(H * 0.7)}
      </g>
    ),
  },
  kitchen: {
    name: 'Kitchen', group: 'Inside', horizon: 0.72, tags: ['home', 'cook', 'food', 'breakfast', 'dinner'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={G0} stroke="none" />
        <path d={Array.from({ length: 12 }, (_, i) => `M${i * 110} 60V${H * 0.44}`).join('') + Array.from({ length: 6 }, (_, i) => `M0 ${60 + i * 50}H${W}`).join('')} stroke={INK} strokeWidth={0.7} opacity={0.18} />
        {windowAt(500, 90, 280, 200, 2)}
        <g {...L}>
          <rect x={0} y={H * 0.44} width={W} height={34} fill={G3} />
          <rect x={0} y={H * 0.44 + 34} width={W} height={H * 0.72 - H * 0.44 - 34} fill={A_LIGHT} />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${i * 190 + 40} ${H * 0.44 + 34}V${H * 0.72}`} opacity={0.6} />)}
          {Array.from({ length: 7 }, (_, i) => <path key={'h' + i} d={`M${i * 190 + 100} ${H * 0.58}h40`} strokeWidth={3} />)}
          <rect x={40} y={40} width={220} height={120} fill={G2} />
          <path d="M150 40v120" />
          <rect x={1010} y={40} width={220} height={120} fill={G2} />
          <path d="M1120 40v120" />
        </g>
        {floorAt(H * 0.72)}
        <path d={Array.from({ length: 10 }, (_, i) => `M${i * 150 - 60} ${H * 0.72}L${i * 150 - 200} ${H}`).join('')} stroke={INK} strokeWidth={0.8} opacity={0.18} />
      </g>
    ),
  },
  dining: {
    name: 'Dining room', group: 'Inside', horizon: 0.7, tags: ['home', 'dinner', 'family', 'meal', 'eat'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.7} fill={A_LIGHT} stroke="none" opacity={0.4} />
        {windowAt(160, 100, 260, 220, 2)}
        <g {...L}>
          <path d="M640 0v70" strokeWidth={2} />
          <path d="M600 70h80l-10 40h-60z" fill={A} />
          <rect x={900} y={140} width={240} height={30} fill={G3} />
          <rect x={920} y={100} width={14} height={40} fill={A_LIGHT} />
          <rect x={960} y={94} width={14} height={46} fill={G2} />
          <rect x={1000} y={104} width={14} height={36} fill={A} />
          <rect x={1060} y={110} width={36} height={30} rx={6} fill={G0} />
        </g>
        {skirting(H * 0.7)}
        {floorAt(H * 0.7)}
        {boards(H * 0.7)}
      </g>
    ),
  },
  bedroom: {
    name: 'Bedroom', group: 'Inside', horizon: 0.72, tags: ['home', 'sleep', 'morning', 'night'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={G0} stroke="none" />
        <path d={Array.from({ length: 16 }, (_, i) => `M${i * 84} 0V${H * 0.72}`).join('')} stroke={A_DARK} strokeWidth={10} opacity={0.08} />
        {windowAt(900, 90, 240, 220, 1)}
        <g {...L}>
          <rect x={200} y={140} width={150} height={110} fill={G0} />
          <circle cx={275} cy={195} r={34} fill={A} />
        </g>
        {skirting(H * 0.72)}
        {floorAt(H * 0.72, G2)}
      </g>
    ),
  },
  classroom: {
    name: 'Classroom', group: 'Inside', horizon: 0.72, tags: ['school', 'teacher', 'lesson', 'board', 'learners'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={G0} stroke="none" />
        <rect x={0} y={0} width={W} height={H * 0.72} fill={A_LIGHT} stroke="none" opacity={0.35} />
        <g {...L}>
          <rect x={300} y={70} width={680} height={330} fill={G0} />
          <rect x={300} y={70} width={680} height={330} stroke={G4} strokeWidth={10} />
          <rect x={300} y={400} width={680} height={14} fill={G3} />
          <path d="M360 140h260M360 190h420M360 240h180M360 290h340" stroke={A} strokeWidth={4} opacity={0.9} />
          <rect x={60} y={120} width={160} height={220} fill={G2} />
          <path d="M80 160h120M80 200h120M80 240h120M80 280h120" opacity={0.5} />
          <circle cx={1150} cy={140} r={46} fill={G0} />
          <path d="M1150 140V110M1150 140l20 12" strokeWidth={2.4} />
        </g>
        {skirting(H * 0.72)}
        {floorAt(H * 0.72)}
        {boards(H * 0.72)}
      </g>
    ),
  },
  office: {
    name: 'Office', group: 'Inside', horizon: 0.72, tags: ['work', 'job', 'desk', 'meeting', 'business'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={G2} stroke="none" />
        <g {...L}>
          {[80, 440, 800].map((x) => (
            <g key={x}>
              <rect x={x} y={60} width={300} height={260} fill={A_LIGHT} />
              {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${x} ${80 + i * 24}h300`} opacity={0.5} />)}
              <rect x={x - 8} y={52} width={316} height={276} />
            </g>
          ))}
          <rect x={1180} y={200} width={60} height={200} fill={G3} />
          <path d="M1180 250h60M1180 300h60M1180 350h60" />
        </g>
        {skirting(H * 0.72)}
        {floorAt(H * 0.72, G2)}
        <path d={Array.from({ length: 10 }, (_, i) => `M${i * 150 - 60} ${H * 0.72}L${i * 150 - 200} ${H}`).join('') + Array.from({ length: 4 }, (_, i) => `M0 ${H * 0.72 + (i + 1) * 46}H${W}`).join('')} stroke={INK} strokeWidth={0.8} opacity={0.15} />
      </g>
    ),
  },
  cafe: {
    name: 'Café', group: 'Inside', horizon: 0.72, tags: ['coffee', 'restaurant', 'drink', 'meet', 'talk', 'date'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={A_LIGHT} stroke="none" opacity={0.5} />
        <g {...L}>
          {[260, 640, 1020].map((x) => (
            <g key={x}>
              <path d={`M${x} 0v80`} strokeWidth={2} />
              <path d={`M${x - 40} 80h80l-12 46h-56z`} fill={A} />
              <path d={`M${x - 22} 126h44`} strokeWidth={2.4} />
            </g>
          ))}
          <rect x={60} y={120} width={340} height={230} fill={G0} />
          <path d="M230 120v230M60 235h340" />
          <rect x={48} y={108} width={364} height={254} />
          <rect x={760} y={100} width={460} height={190} fill={G5} />
          <path d="M800 140h200M800 180h150M800 220h240M1060 140h120M1060 180h80" stroke={G0} strokeWidth={3.5} opacity={0.8} />
          <rect x={700} y={330} width={580} height={30} fill={G3} />
          <rect x={700} y={360} width={580} height={H * 0.72 - 360} fill={A} />
          <path d={`M900 360V${H * 0.72}M1100 360V${H * 0.72}`} opacity={0.6} />
          <rect x={740} y={290} width={60} height={40} fill={G2} />
          <rect x={820} y={300} width={40} height={30} fill={G0} />
          <rect x={880} y={296} width={50} height={34} fill={A_LIGHT} />
        </g>
        {floorAt(H * 0.72)}
        {boards(H * 0.72)}
      </g>
    ),
  },
  shop: {
    name: 'Shop', group: 'Inside', horizon: 0.72, tags: ['supermarket', 'buy', 'shelves', 'market', 'shopping'],
    draw: () => (
      <g>
        <rect x={0} y={0} width={W} height={H * 0.72} fill={G0} stroke="none" />
        <g {...L}>
          {[60, 740].map((x) => (
            <g key={x}>
              <rect x={x} y={60} width={480} height={330} fill={G2} />
              {[140, 230, 320].map((y) => (
                <g key={y}>
                  <path d={`M${x} ${y}h480`} strokeWidth={2.2} />
                  {Array.from({ length: 9 }, (_, i) => <rect key={i} x={x + 20 + i * 50} y={y - 44} width={30} height={44} rx={3} fill={i % 3 === 0 ? A : i % 3 === 1 ? A_LIGHT : G3} />)}
                </g>
              ))}
            </g>
          ))}
          <rect x={560} y={30} width={160} height={60} rx={8} fill={A} />
          <path d="M590 60h100" stroke={G0} strokeWidth={5} />
        </g>
        {floorAt(H * 0.72, G2)}
        <path d={Array.from({ length: 4 }, (_, i) => `M0 ${H * 0.72 + (i + 1) * 46}H${W}`).join('')} stroke={INK} strokeWidth={0.8} opacity={0.15} />
      </g>
    ),
  },
  street: {
    name: 'Street', group: 'Outside', horizon: 0.7, tags: ['town', 'city', 'road', 'shops', 'walk', 'traffic'],
    draw: () => (
      <g>
        {sky(H * 0.7)}
        <g {...L}>
          <rect x={0} y={190} width={330} height={H * 0.7 - 190} fill={G2} />
          <path d="M0 190h330" />
          {[0, 1, 2].map((r) => [40, 130, 220].map((x) => <rect key={r + '-' + x} x={x} y={230 + r * 80} width={60} height={50} fill={A_LIGHT} />))}
          <rect x={330} y={120} width={300} height={H * 0.7 - 120} fill={A_LIGHT} />
          <path d="M330 120h300" />
          {[0, 1, 2, 3].map((r) => [370, 460, 550].map((x) => <rect key={r + '-' + x} x={x} y={160 + r * 76} width={50} height={46} fill={G0} />))}
          <rect x={630} y={230} width={260} height={H * 0.7 - 230} fill={G0} />
          <path d="M630 230h260" />
          <rect x={660} y={270} width={200} height={70} fill={A} />
          <path d="M690 305h140" stroke={G0} strokeWidth={5} />
          <rect x={680} y={370} width={160} height={120} fill={A_LIGHT} />
          <rect x={890} y={160} width={390} height={H * 0.7 - 160} fill={G3} />
          <path d="M890 160h390" />
          {[0, 1, 2].map((r) => [930, 1040, 1150].map((x) => <rect key={r + '-' + x} x={x} y={200 + r * 90} width={70} height={56} fill={G0} />))}
          <rect x={300} y={H * 0.7 - 40} width={980} height={40} fill={G2} />
        </g>
        {floorAt(H * 0.7, G2)}
        <path d={`M0 ${H * 0.86}H${W}`} stroke={INK} strokeWidth={1.4} />
        <rect x={0} y={H * 0.86} width={W} height={H * 0.14} fill={G4} stroke="none" opacity={0.6} />
        <path d={`M0 ${H * 0.93}H${W}`} stroke={G0} strokeWidth={4} strokeDasharray="40 30" />
      </g>
    ),
  },
  busstop: {
    name: 'Bus stop', group: 'Outside', horizon: 0.7, tags: ['bus', 'wait', 'transport', 'street', 'road', 'travel'],
    draw: () => (
      <g>
        {sky(H * 0.7)}
        <g {...L}>
          <rect x={0} y={200} width={420} height={H * 0.7 - 200} fill={G2} />
          <path d="M0 200h420" />
          {[0, 1, 2].map((r) => [40, 150, 260].map((x) => <rect key={r + '-' + x} x={x} y={240 + r * 80} width={64} height={50} fill={A_LIGHT} />))}
          <rect x={420} y={260} width={400} height={H * 0.7 - 260} fill={A_LIGHT} />
          <path d="M420 260h400" />
          {[0, 1].map((r) => [460, 580, 700].map((x) => <rect key={r + '-' + x} x={x} y={300 + r * 90} width={70} height={60} fill={G0} />))}
          {tree(1000, H * 0.7, 1.2)}
          {tree(1180, H * 0.7, 0.9)}
          <path d="M840 150h300v16H840z" fill={G5} />
          <path d="M850 166v190M1130 166v190" strokeWidth={3} />
          <rect x={850} y={166} width={280} height={150} fill={A_LIGHT} opacity={0.6} />
          <rect x={870} y={330} width={240} height={14} fill={G3} />
        </g>
        {floorAt(H * 0.7, G2)}
        <path d={`M0 ${H * 0.84}H${W}`} stroke={INK} strokeWidth={1.4} />
        <rect x={0} y={H * 0.84} width={W} height={H * 0.16} fill={G4} stroke="none" opacity={0.6} />
        <path d={`M0 ${H * 0.92}H${W}`} stroke={G0} strokeWidth={4} strokeDasharray="40 30" />
      </g>
    ),
  },
  park: {
    name: 'Park', group: 'Outside', horizon: 0.66, tags: ['outside', 'nature', 'grass', 'trees', 'picnic', 'walk', 'garden'],
    draw: () => (
      <g>
        {sky(H * 0.66)}
        <path d={`M0 ${H * 0.66}q200 -60 420 -20t400 -30t460 20V${H}H0z`} fill={G2} stroke={INK} strokeWidth={1.6} />
        {tree(160, H * 0.62, 1.1)}
        {tree(420, H * 0.6, 0.7)}
        {tree(980, H * 0.6, 0.8)}
        {tree(1180, H * 0.64, 1.3)}
        <path d={`M560 ${H * 0.64}q-80 100 -260 ${H * 0.36 - 20}h480q-120 -80 -140 -${H * 0.36 - 20}z`} fill={G3} stroke={INK} strokeWidth={1.4} opacity={0.9} />
        <path d="M80 640q6 -12 12 0M110 660q6 -12 12 0M1120 650q6 -12 12 0M1200 680q6 -12 12 0M900 630q6 -12 12 0" stroke={INK} strokeWidth={1.2} fill="none" />
        <circle cx={100} cy={620} r={5} fill={A} stroke={INK} strokeWidth={1} />
        <circle cx={1160} cy={640} r={5} fill={A} stroke={INK} strokeWidth={1} />
        <circle cx={940} cy={660} r={5} fill={A} stroke={INK} strokeWidth={1} />
      </g>
    ),
  },
  countryside: {
    name: 'Countryside', group: 'Outside', horizon: 0.64, tags: ['hills', 'fields', 'farm', 'walk', 'village', 'holiday'],
    draw: () => (
      <g>
        {sky(H * 0.64)}
        <path d={`M0 ${H * 0.64}q200 -120 440 -60t380 -80t460 60V${H}H0z`} fill={G2} stroke={INK} strokeWidth={1.6} />
        <path d={`M0 ${H * 0.76}q300 -60 640 -20t640 -30V${H}H0z`} fill={G0} stroke={INK} strokeWidth={1.4} />
        <path d="M980 300l40 -70l40 70z" fill={A_LIGHT} stroke={INK} strokeWidth={1.4} />
        <rect x={990} y={300} width={60} height={50} fill={G0} stroke={INK} strokeWidth={1.4} />
        {tree(300, H * 0.6, 0.6)}
        {tree(760, H * 0.56, 0.5)}
      </g>
    ),
  },
  beach: {
    name: 'Beach', group: 'Outside', horizon: 0.6, tags: ['sea', 'holiday', 'summer', 'sand', 'swim'],
    draw: () => (
      <g>
        {sky(H * 0.6)}
        <circle cx={1080} cy={120} r={50} fill={A} stroke={INK} strokeWidth={1.4} />
        <rect x={0} y={H * 0.6} width={W} height={H * 0.18} fill={A_LIGHT} stroke="none" />
        <path d={`M0 ${H * 0.6}H${W}`} stroke={INK} strokeWidth={1.6} />
        <path d={`M0 ${H * 0.68}q40 -8 80 0t80 0t80 0M600 ${H * 0.72}q40 -8 80 0t80 0`} stroke={G0} strokeWidth={3} fill="none" />
        <path d={`M0 ${H * 0.78}q320 -30 640 0t640 0V${H}H0z`} fill={G2} stroke={INK} strokeWidth={1.4} />
        <path d="M120 660q4 -8 8 0M160 680q4 -8 8 0M1100 650q4 -8 8 0" stroke={INK} strokeWidth={1.2} fill="none" />
      </g>
    ),
  },
};
export const SCENE_KEYS = Object.keys(SCENES);
export const sceneHorizon = (key?: string) => SCENES[key ?? '']?.horizon ?? 0.74;
export const sceneBox = { w: W, h: H };

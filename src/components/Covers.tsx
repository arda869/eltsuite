import { useRef, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { audioUrl } from '../lib/media';
import { useImageSrc } from '../editor/PackNode';
import { saveImage } from '../lib/media';

// Class covers: ready-made illustrations in greys with the class colour, or an uploaded picture.
// Stored on the class as cover: "preset:<key>" or "media:<id>".

const G1 = '#ecebe7';
const G2 = '#dedbd5';
const G3 = '#c9c5be';
const A = 'var(--accent)';
const AL = 'color-mix(in srgb, var(--accent) 45%, white)';

const PRESETS: { key: string; label: string; art: ReactNode }[] = [
  {
    key: 'waves',
    label: 'Waves',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <path d="M0 120 C100 90 200 150 300 120 S500 90 600 120 V200 H0z" fill={G2} />
        <path d="M0 150 C120 125 220 175 330 148 S520 125 600 150 V200 H0z" fill={AL} />
        <path d="M0 175 C110 160 240 195 360 172 S530 160 600 178 V200 H0z" fill={A} />
        <circle cx="500" cy="55" r="24" fill={A} opacity=".85" />
      </>
    ),
  },
  {
    key: 'books',
    label: 'Books',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <rect x="0" y="170" width="600" height="30" fill={G2} />
        {[
          [60, 70, 34, G3],
          [98, 50, 28, A],
          [130, 85, 40, G2],
          [174, 60, 26, AL],
          [204, 40, 36, G3],
          [400, 75, 30, G2],
          [434, 55, 38, A],
          [476, 90, 26, G3],
          [506, 62, 32, AL],
        ].map(([x, y, w, f], i) => (
          <rect key={i} x={x as number} y={y as number} width={w as number} height={170 - (y as number)} rx="3" fill={f as string} />
        ))}
        <rect x="250" y="118" width="120" height="52" rx="3" transform="rotate(-8 310 144)" fill={A} opacity=".9" />
      </>
    ),
  },
  {
    key: 'bubbles',
    label: 'Speech bubbles',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <path d="M90 40h170a22 22 0 0 1 22 22v46a22 22 0 0 1-22 22H150l-30 26v-26h-30a22 22 0 0 1-22-22V62a22 22 0 0 1 22-22z" fill="#fff" />
        <path d="M320 70h190a22 22 0 0 1 22 22v40a22 22 0 0 1-22 22h-40v26l-30-26H320a22 22 0 0 1-22-22V92a22 22 0 0 1 22-22z" fill={A} />
        {[120, 160, 200].map((x) => (
          <circle key={x} cx={x} cy="85" r="9" fill={G3} />
        ))}
        <rect x="340" y="102" width="150" height="10" rx="5" fill="#fff" opacity=".9" />
        <rect x="340" y="122" width="100" height="10" rx="5" fill="#fff" opacity=".7" />
      </>
    ),
  },
  {
    key: 'dots',
    label: 'Dots',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {Array.from({ length: 13 * 5 }, (_, i) => {
          const x = 30 + (i % 13) * 45;
          const y = 30 + Math.floor(i / 13) * 36;
          const pick = (i * 7) % 11;
          return <circle key={i} cx={x} cy={y} r={pick === 0 ? 11 : 6} fill={pick === 0 ? A : pick < 4 ? G3 : G2} />;
        })}
      </>
    ),
  },
  {
    key: 'mountains',
    label: 'Mountains',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <circle cx="450" cy="60" r="30" fill={AL} />
        <path d="M0 200 L130 80 L230 170 L330 60 L460 200z" fill={G3} />
        <path d="M200 200 L380 95 L520 180 L600 120 V200z" fill={G2} />
        <path d="M330 60 L360 88 L340 84 L320 96 L305 84z" fill="#fff" />
        <path d="M0 200 C150 170 300 190 600 175 V200z" fill={A} />
      </>
    ),
  },
  {
    key: 'city',
    label: 'City',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {[
          [20, 90, 50],
          [76, 60, 40],
          [122, 110, 60],
          [188, 40, 46],
          [240, 80, 54],
          [300, 20, 40],
          [346, 70, 60],
          [412, 50, 44],
          [462, 100, 56],
          [524, 64, 56],
        ].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={200 - y} fill={i % 3 === 1 ? A : i % 2 ? G3 : G2} />
            {Array.from({ length: Math.floor((200 - y) / 26) }, (_, k) => (
              <rect key={k} x={x + 8} y={y + 10 + k * 26} width={w - 16} height="8" rx="2" fill="#fff" opacity={i % 3 === 1 ? 0.6 : 0.5} />
            ))}
          </g>
        ))}
      </>
    ),
  },
  {
    key: 'leaves',
    label: 'Leaves',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {[
          [60, 140, -30, G3],
          [140, 60, 20, A],
          [250, 150, 60, G2],
          [330, 50, -20, AL],
          [440, 130, 35, G3],
          [530, 60, -45, A],
          [200, 30, 80, G2],
          [480, 190, 10, AL],
        ].map(([x, y, r, f], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
            <path d="M0 -40 C30 -20 30 20 0 40 C-30 20 -30 -20 0 -40z" fill={f as string} />
            <path d="M0 -36 V36" stroke="#fff" strokeWidth="2" opacity=".6" />
          </g>
        ))}
      </>
    ),
  },
  {
    key: 'planes',
    label: 'Paper planes',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <path d="M40 160 C160 60 300 170 420 70" fill="none" stroke={G3} strokeWidth="3" strokeDasharray="8 10" />
        <path d="M420 70 l70 -30 -30 70 -12 -26z" fill={A} />
        <path d="M448 84 l42 -44" stroke="#fff" strokeWidth="2" />
        <path d="M90 50 l40 -16 -16 40 -8 -14z" fill={G3} />
        <path d="M250 150 l34 -14 -14 34 -6 -12z" fill={AL} />
      </>
    ),
  },
  {
    key: 'globe',
    label: 'Globe',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        <circle cx="300" cy="100" r="70" fill={AL} />
        <path d="M262 52c18 8 10 30 30 30s24 22 6 34-10 30-28 32c-14-12-36-24-30-48s8-34 22-48z" fill={A} />
        <path d="M330 48c-8 18 12 22 20 34s26 10 22 30" fill="none" stroke={A} strokeWidth="14" strokeLinecap="round" />
        <ellipse cx="300" cy="100" rx="120" ry="26" fill="none" stroke={G3} strokeWidth="3" />
        {[90, 140, 470, 520].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 150 : 50} r="5" fill={G3} />
        ))}
      </>
    ),
  },
  {
    key: 'letters',
    label: 'Letters',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {['A', 'b', 'C', 'd', 'E', 'f', 'G', 'h'].map((ch, i) => (
          <text key={i} x={40 + i * 72} y={i % 2 ? 150 : 120} fontFamily="Fraunces, Georgia, serif" fontSize={i % 3 ? 70 : 96} fontWeight="600" fill={i === 2 || i === 5 ? A : i % 2 ? G3 : G2}>
            {ch}
          </text>
        ))}
      </>
    ),
  },
  {
    key: 'stripes',
    label: 'Stripes',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={-100 + i * 60} y="-40" width="26" height="300" transform="rotate(25 300 100)" fill={i % 4 === 1 ? A : i % 2 ? G3 : G2} />
        ))}
      </>
    ),
  },
  {
    key: 'sunrise',
    label: 'Sunrise',
    art: (
      <>
        <rect width="600" height="200" fill={G1} />
        {[140, 110, 80, 50].map((r, i) => (
          <circle key={r} cx="300" cy="200" r={r} fill={i === 3 ? A : i === 2 ? AL : i === 1 ? G3 : G2} />
        ))}
        {Array.from({ length: 9 }, (_, i) => {
          const a = Math.PI * (0.1 + i * 0.1);
          return <line key={i} x1={300 + Math.cos(a) * 160} y1={200 - Math.sin(a) * 160} x2={300 + Math.cos(a) * 190} y2={200 - Math.sin(a) * 190} stroke={G3} strokeWidth="5" strokeLinecap="round" />;
        })}
      </>
    ),
  },
];

export function CoverArt({ cover, classId, className = '' }: { cover?: string | null; classId: string; className?: string }) {
  const media = cover?.startsWith('media:') ? cover : '';
  const url = useImageSrc(classId, media);
  if (media) return <span className={'cover ' + className} style={url ? { backgroundImage: `url(${url})` } : undefined} />;
  const key = cover?.startsWith('preset:') ? cover.slice(7) : 'waves';
  const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0];
  return (
    <span className={'cover ' + className} aria-hidden="true">
      <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        {p.art}
      </svg>
    </span>
  );
}

// Shrink an uploaded picture to a wide cover (about 1200 × 400) so it stays small.
async function coverFromFile(file: File) {
  const img = await createImageBitmap(file);
  const W = 1200;
  const H = 400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  let q = 0.82;
  let blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  while (blob.size > 500 * 1024 && q > 0.4) {
    q -= 0.12;
    blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  }
  return blob;
}

export function CoverPicker({ classId, value, onChange }: { classId: string; value?: string | null; onChange: (v: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const upload = async (f: File) => {
    setBusy('Uploading…');
    try {
      const id = await saveImage(classId, await coverFromFile(f));
      onChange('media:' + id);
      setBusy('');
    } catch {
      setBusy('That picture could not be used. Try a JPG or PNG.');
    }
  };
  const current = value ?? 'preset:waves';
  return (
    <div className="field">
      <span className="row-between">
        Cover
        <button type="button" className="btn link small" onClick={() => file.current?.click()}>
          Upload a picture…
        </button>
      </span>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {busy && <span className="hint">{busy}</span>}
      <div className="cover-grid" role="radiogroup" aria-label="Cover">
        {current.startsWith('media:') && (
          <button type="button" role="radio" aria-checked className="cover-opt on" title="Your picture">
            <CoverArt cover={current} classId={classId} />
          </button>
        )}
        {PRESETS.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={current === 'preset:' + p.key} className={'cover-opt' + (current === 'preset:' + p.key ? ' on' : '')} title={p.label} onClick={() => onChange('preset:' + p.key)}>
            <CoverArt cover={'preset:' + p.key} classId={classId} />
          </button>
        ))}
      </div>
      <span className="hint">The ready-made covers use your theme colour.</span>
    </div>
  );
}

// The cover as plain HTML, for printed worksheets. Presets keep using var(--accent).
export async function coverMarkup(cover: string | null | undefined, classId: string): Promise<string> {
  if (cover?.startsWith('media:')) {
    const url = await audioUrl(classId, cover.slice(6)).catch(() => '');
    if (url) return `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`;
  }
  const key = cover?.startsWith('preset:') ? cover.slice(7) : 'waves';
  const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0];
  return renderToStaticMarkup(
    <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {p.art}
    </svg>,
  );
}
